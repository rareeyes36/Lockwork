'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool, tx } = require('../db');
const { asyncHandler, actorId, required, slugify, HttpError } = require('../lib');
const { loadCompany } = require('../access');

const router = express.Router();

const MAX_TEAM_DEPTH = 3;
const SEAT_PRICE_USD = 79;

/** Load employment + hire labels for seat billing. */
async function loadEmployment(clientOrPool, id) {
  const r = await clientOrPool.query(
    `SELECT em.*, j.title AS job_title, ee.display_name AS employee_name
       FROM employments em
       JOIN jobs j ON j.id = em.job_id
       JOIN users ee ON ee.id = em.employee_user_id
      WHERE em.id = $1`,
    [id]
  );
  if (!r.rows[0]) throw new HttpError(404, 'employment not found');
  return r.rows[0];
}

/**
 * Record an open company-seat invoice (custodial-sim by default).
 * Amount is snapshotted from SEAT_PRICE_USD so later config changes do not rewrite history.
 */
async function createSeatInvoice(client, employment, {
  amount = SEAT_PRICE_USD,
  currency = 'USD',
  plan = employment.seat_plan || 'workspace_member',
  rail = 'custodial_sim',
  meta = {},
} = {}) {
  if (employment.seat_status === 'churned') {
    throw new HttpError(400, 'Cannot charge a churned company seat. Re-hire through a new job.');
  }
  const open = await client.query(
    `SELECT id FROM seat_invoices WHERE employment_id = $1 AND state = 'open'`,
    [employment.id]
  );
  if (open.rows[0]) {
    throw new HttpError(409, 'An open seat invoice already exists for this hire.', {
      invoice_id: open.rows[0].id,
    });
  }
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const invoiceRef = `seat-sim-${crypto.randomBytes(6).toString('hex')}`;
  const r = await client.query(
    `INSERT INTO seat_invoices (
       employment_id, workspace_id, amount, currency, plan, state, rail,
       invoice_ref, period_start, period_end, meta_json
     ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10::jsonb)
     RETURNING *`,
    [
      employment.id,
      employment.workspace_id,
      amount,
      currency,
      plan,
      rail,
      invoiceRef,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      JSON.stringify({
        sim: rail === 'custodial_sim',
        stripe_live: false,
        note: rail === 'custodial_sim'
          ? 'Invoice recorded (custodial-sim). Stripe live billing not wired.'
          : 'Stripe path reserved.',
        ...meta,
      }),
    ]
  );
  return r.rows[0];
}

/** Mark invoice paid and activate the company seat (sticks on employments). */
async function markSeatInvoicePaid(client, invoice, { meta = {} } = {}) {
  if (invoice.state === 'paid') return invoice;
  if (invoice.state === 'void') throw new HttpError(400, 'Cannot pay a void seat invoice.');
  if (invoice.state !== 'open') throw new HttpError(400, `Seat invoice is ${invoice.state}`);

  const paid = await client.query(
    `UPDATE seat_invoices SET
       state = 'paid',
       paid_at = now(),
       meta_json = meta_json || $2::jsonb
     WHERE id = $1 AND state = 'open'
     RETURNING *`,
    [
      invoice.id,
      JSON.stringify({
        paid_via: invoice.rail,
        paid_sim: invoice.rail === 'custodial_sim',
        ...meta,
      }),
    ]
  );
  if (!paid.rows[0]) throw new HttpError(409, 'Seat invoice was already settled.');

  await client.query(
    `UPDATE employments SET
       seat_status = 'active',
       seat_plan = COALESCE(seat_plan, $2),
       seat_started_at = COALESCE(seat_started_at, now()),
       ended_at = NULL
     WHERE id = $1 AND seat_status <> 'churned'`,
    [invoice.employment_id, paid.rows[0].plan]
  );

  return paid.rows[0];
}

async function createCompany(req, res) {
  const body = req.body || {};
  const owner = body.employer_user_id || actorId(req);
  if (!owner) throw new HttpError(400, 'employer_user_id required');
  required(body, ['name']);
  let slug = body.slug || slugify(body.name);
  const taken = await pool.query('SELECT 1 FROM workspaces WHERE slug = $1', [slug]);
  if (taken.rowCount && !body.slug) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
  const r = await pool.query(
    `INSERT INTO workspaces (employer_user_id, name, slug) VALUES ($1, $2, $3) RETURNING *`,
    [owner, body.name, slug]
  );
  res.status(201).json(r.rows[0]);
}

router.post('/companies', asyncHandler(createCompany));
router.post('/workspaces', asyncHandler(createCompany)); // stub-compatible alias

router.get('/companies', asyncHandler(async (_req, res) => {
  const r = await pool.query(`
    SELECT w.*, u.display_name AS owner_name,
           (SELECT count(*)::int FROM jobs j WHERE j.workspace_id = w.id) AS job_count,
           (SELECT count(*)::int FROM teams t WHERE t.company_id = w.id) AS team_count
      FROM workspaces w JOIN users u ON u.id = w.employer_user_id
     ORDER BY w.created_at`);
  res.json(r.rows);
}));

/** Company + its whole tree (sub-teams, jobs with escrow summary). */
router.get('/companies/:id', asyncHandler(async (req, res) => {
  const company = await loadCompany(pool, req.params.id);
  const owner = await pool.query('SELECT id, display_name, handle FROM users WHERE id = $1', [company.employer_user_id]);
  const teams = await pool.query('SELECT * FROM teams WHERE company_id = $1 ORDER BY created_at', [company.id]);
  const jobs = await pool.query(
    `SELECT j.id, j.title, j.status, j.parent_job_id, j.root_job_id, j.team_id, j.depth,
            j.budget_source, j.deadline_at, j.created_at, j.employer_user_id,
            e.amount, e.currency, e.rail, e.state AS escrow_state,
            (SELECT count(*)::int FROM submissions s WHERE s.job_id = j.id AND s.status <> 'withdrawn') AS entries
       FROM jobs j LEFT JOIN job_escrows e ON e.job_id = j.id
      WHERE j.workspace_id = $1 ORDER BY j.created_at`,
    [company.id]
  );
  res.json({ company: { ...company, owner: owner.rows[0] }, teams: teams.rows, jobs: jobs.rows });
}));

/** Sub-teams live only inside a company; they may nest up to depth 3 (D4). */
router.post('/companies/:id/teams', asyncHandler(async (req, res) => {
  const { name, parent_team_id } = req.body || {};
  required(req.body || {}, ['name']);
  const team = await tx(async (c) => {
    const company = await loadCompany(c, req.params.id);
    let depth = 1;
    if (parent_team_id) {
      // Walk up the parent chain; teams are only ever created under existing
      // teams (no re-parenting), so the chain is acyclic by construction.
      let cur = parent_team_id;
      const seen = new Set();
      while (cur) {
        if (seen.has(cur)) throw new HttpError(400, 'Sub-team cycle detected.');
        seen.add(cur);
        const p = await c.query('SELECT id, parent_team_id, company_id FROM teams WHERE id = $1', [cur]);
        if (!p.rows[0]) throw new HttpError(404, 'parent sub-team not found');
        if (p.rows[0].company_id !== company.id) throw new HttpError(400, 'parent sub-team is in another company');
        depth += 1;
        cur = p.rows[0].parent_team_id;
      }
    }
    if (depth > MAX_TEAM_DEPTH) {
      throw new HttpError(400, `Sub-teams nest at most ${MAX_TEAM_DEPTH} levels under the company (D4).`, { rule: 'depth_cap' });
    }
    const r = await c.query(
      'INSERT INTO teams (company_id, parent_team_id, name) VALUES ($1, $2, $3) RETURNING *',
      [company.id, parent_team_id || null, name]
    );
    return { ...r.rows[0], depth };
  });
  res.status(201).json(team);
}));

/** Everyone, annotated with how they relate to this company. */
router.get('/companies/:id/people', asyncHandler(async (req, res) => {
  const company = await loadCompany(pool, req.params.id);
  const r = await pool.query(
    `SELECT u.id, u.handle, u.display_name, u.email, u.wallet_address, u.created_at,
            (u.id = $2) AS is_owner,
            (SELECT count(*)::int FROM jobs j WHERE j.workspace_id = $1 AND j.employer_user_id = u.id) AS jobs_posted,
            (SELECT json_agg(json_build_object('id', em.id, 'seat_status', em.seat_status, 'job_id', em.job_id))
               FROM employments em WHERE em.workspace_id = $1 AND em.employee_user_id = u.id) AS employments,
            (SELECT json_agg(json_build_object('id', ro.id, 'name', ro.name))
               FROM role_assignments ra JOIN roles ro ON ro.id = ra.role_id
              WHERE ro.workspace_id = $1 AND ra.user_id = u.id) AS roles,
            (SELECT json_agg(json_build_object('id', sp.id, 'name', sp.name, 'kinds', sp.kinds))
               FROM sponsors sp LEFT JOIN jobs sj ON sj.id = sp.job_id
              WHERE sp.sponsor_user_id = u.id AND (sp.workspace_id = $1 OR sj.workspace_id = $1)) AS sponsorships,
            (SELECT count(*)::int FROM submissions s JOIN jobs sj ON sj.id = s.job_id
              WHERE sj.workspace_id = $1 AND s.submitter_user_id = u.id) AS entries,
            (SELECT json_agg(json_build_object('id', b.id, 'name', b.name))
               FROM bot_agents b WHERE b.workspace_id = $1 AND b.config_json->>'operator_user_id' = u.id::text) AS operates,
            COALESCE(wr.wins_count, 0) AS wins_count,
            COALESCE(wr.employment_days, 0) AS employment_days
       FROM users u
       LEFT JOIN worker_reputation wr ON wr.user_id = u.id
      ORDER BY (u.id = $2) DESC, u.created_at`,
    [company.id, company.employer_user_id]
  );
  res.json(r.rows);
}));

router.get('/companies/:id/employments', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT em.*, ee.display_name AS employee_name, ee.handle AS employee_handle,
            er.display_name AS employer_name, j.title AS job_title,
            ro.name AS role_name, e.net_to_winner, e.currency,
            (SELECT si.id FROM seat_invoices si
              WHERE si.employment_id = em.id AND si.state = 'open'
              ORDER BY si.created_at DESC LIMIT 1) AS open_invoice_id,
            (SELECT si.id FROM seat_invoices si
              WHERE si.employment_id = em.id AND si.state = 'paid'
              ORDER BY si.paid_at DESC NULLS LAST LIMIT 1) AS latest_paid_invoice_id,
            (SELECT count(*)::int FROM seat_invoices si WHERE si.employment_id = em.id AND si.state = 'paid') AS paid_invoice_count
       FROM employments em
       JOIN users ee ON ee.id = em.employee_user_id
       JOIN users er ON er.id = em.employer_user_id
       JOIN jobs j ON j.id = em.job_id
       LEFT JOIN job_escrows e ON e.job_id = j.id
       LEFT JOIN roles ro ON ro.id = em.role_id
      WHERE em.workspace_id = $1
      ORDER BY em.started_at DESC`,
    [req.params.id]
  );
  res.json({
    seat_price_usd: SEAT_PRICE_USD,
    seat_billing: {
      rail: 'custodial_sim',
      stripe_live: false,
      note: 'Seat charges persist as invoices; payment is custodial-sim until Stripe is wired.',
    },
    employments: r.rows,
  });
}));

/** Company seat invoices (billed to the company, never a sub-team). */
router.get('/companies/:id/seat-invoices', asyncHandler(async (req, res) => {
  await loadCompany(pool, req.params.id);
  const r = await pool.query(
    `SELECT si.*, ee.display_name AS employee_name, j.title AS job_title
       FROM seat_invoices si
       JOIN employments em ON em.id = si.employment_id
       JOIN users ee ON ee.id = em.employee_user_id
       JOIN jobs j ON j.id = em.job_id
      WHERE si.workspace_id = $1
      ORDER BY si.created_at DESC`,
    [req.params.id]
  );
  res.json({ seat_price_usd: SEAT_PRICE_USD, invoices: r.rows });
}));

router.get('/employments/:id/seat-invoices', asyncHandler(async (req, res) => {
  const em = await loadEmployment(pool, req.params.id);
  const r = await pool.query(
    `SELECT * FROM seat_invoices WHERE employment_id = $1 ORDER BY created_at DESC`,
    [em.id]
  );
  res.json({ employment: em, seat_price_usd: SEAT_PRICE_USD, invoices: r.rows });
}));

/**
 * Create an open seat charge (invoice recorded). Does not activate the seat until paid.
 * POST body optional: { rail?: 'custodial_sim'|'stripe' } — stripe reserved, not live.
 */
router.post('/employments/:id/seat-invoices', asyncHandler(async (req, res) => {
  const rail = (req.body && req.body.rail) || 'custodial_sim';
  if (!['custodial_sim', 'stripe'].includes(rail)) {
    throw new HttpError(400, 'rail must be custodial_sim or stripe');
  }
  if (rail === 'stripe') {
    throw new HttpError(501, 'Stripe seat billing is not live yet. Use custodial_sim (invoice recorded).');
  }
  const invoice = await tx(async (c) => {
    const em = await loadEmployment(c, req.params.id);
    return createSeatInvoice(c, em, { rail });
  });
  res.status(201).json({
    invoice,
    seat_price_usd: SEAT_PRICE_USD,
    billing: { rail: invoice.rail, stripe_live: false, sim: true },
  });
}));

/**
 * Mark a seat invoice paid (custodial-sim). Activates the company seat so it sticks.
 */
router.post('/seat-invoices/:id/pay', asyncHandler(async (req, res) => {
  const out = await tx(async (c) => {
    const inv = (await c.query('SELECT * FROM seat_invoices WHERE id = $1', [req.params.id])).rows[0];
    if (!inv) throw new HttpError(404, 'seat invoice not found');
    const invoice = await markSeatInvoicePaid(c, inv);
    const employment = await loadEmployment(c, invoice.employment_id);
    return { invoice, employment };
  });
  res.json({
    ...out,
    seat_price_usd: SEAT_PRICE_USD,
    billing: { rail: out.invoice.rail, stripe_live: false, sim: out.invoice.rail === 'custodial_sim' },
  });
}));

/**
 * One-shot: create seat charge + mark paid (demo / employer attach after hire).
 * Prefer this from OS UI after pay-one.
 */
router.post('/employments/:id/seat-attach', asyncHandler(async (req, res) => {
  const rail = (req.body && req.body.rail) || 'custodial_sim';
  if (!['custodial_sim', 'stripe'].includes(rail)) {
    throw new HttpError(400, 'rail must be custodial_sim or stripe');
  }
  if (rail === 'stripe') {
    throw new HttpError(501, 'Stripe seat billing is not live yet. Use custodial_sim (invoice recorded).');
  }
  const out = await tx(async (c) => {
    const em = await loadEmployment(c, req.params.id);
    if (em.seat_status === 'active') {
      const paid = await c.query(
        `SELECT * FROM seat_invoices WHERE employment_id = $1 AND state = 'paid'
          ORDER BY paid_at DESC NULLS LAST LIMIT 1`,
        [em.id]
      );
      if (paid.rows[0]) {
        return { invoice: paid.rows[0], employment: em, already_active: true };
      }
    }
    let invoice;
    const open = await c.query(
      `SELECT * FROM seat_invoices WHERE employment_id = $1 AND state = 'open'
        ORDER BY created_at DESC LIMIT 1`,
      [em.id]
    );
    invoice = open.rows[0] || await createSeatInvoice(c, em, { rail });
    invoice = await markSeatInvoicePaid(c, invoice, { meta: { attach: true } });
    const employment = await loadEmployment(c, em.id);
    return { invoice, employment, already_active: false };
  });
  res.status(out.already_active ? 200 : 201).json({
    ...out,
    seat_price_usd: SEAT_PRICE_USD,
    billing: { rail: out.invoice.rail, stripe_live: false, sim: true },
  });
}));

/**
 * Seat lifecycle: pending → active → churned (churn feeds reputation via trigger 017).
 * Setting active without a paid invoice records a custodial-sim paid invoice so billing sticks.
 */
router.patch('/employments/:id', asyncHandler(async (req, res) => {
  const { seat_status } = req.body || {};
  if (!['pending', 'active', 'churned'].includes(seat_status)) {
    throw new HttpError(400, 'seat_status must be pending, active or churned');
  }
  const out = await tx(async (c) => {
    const cur = await loadEmployment(c, req.params.id);
    if (cur.seat_status === 'churned' && seat_status !== 'churned') {
      throw new HttpError(400, 'Churned seats are final. Re-hire through a new job.');
    }

    if (seat_status === 'active' && cur.seat_status !== 'active') {
      const paid = await c.query(
        `SELECT id FROM seat_invoices WHERE employment_id = $1 AND state = 'paid' LIMIT 1`,
        [cur.id]
      );
      if (!paid.rows[0]) {
        const open = await c.query(
          `SELECT * FROM seat_invoices WHERE employment_id = $1 AND state = 'open'
            ORDER BY created_at DESC LIMIT 1`,
          [cur.id]
        );
        const inv = open.rows[0] || await createSeatInvoice(c, cur, {
          meta: { via: 'patch_active' },
        });
        await markSeatInvoicePaid(c, inv, { meta: { via: 'patch_active' } });
      } else {
        await c.query(
          `UPDATE employments SET
             seat_status = 'active',
             seat_plan = COALESCE(seat_plan, 'workspace_member'),
             seat_started_at = COALESCE(seat_started_at, now()),
             ended_at = NULL
           WHERE id = $1`,
          [cur.id]
        );
      }
    } else if (seat_status === 'churned') {
      await c.query(
        `UPDATE seat_invoices SET state = 'void', voided_at = now()
          WHERE employment_id = $1 AND state = 'open'`,
        [cur.id]
      );
      await c.query(
        `UPDATE employments SET
           seat_status = 'churned',
           seat_plan = COALESCE(seat_plan, 'workspace_member')
         WHERE id = $1`,
        [cur.id]
      );
    } else {
      await c.query(
        `UPDATE employments SET
           seat_status = $2,
           seat_plan = COALESCE(seat_plan, 'workspace_member'),
           seat_started_at = CASE WHEN $2 = 'active' AND seat_started_at IS NULL THEN now() ELSE seat_started_at END
         WHERE id = $1`,
        [cur.id, seat_status]
      );
    }

    return loadEmployment(c, cur.id);
  });
  res.json(out);
}));

router.get('/companies/:id/activity', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM (
       SELECT j.created_at AS at, 'job_posted' AS kind, j.id AS job_id, j.title, NULL::text AS who, NULL::numeric AS amount, NULL::text AS currency
         FROM jobs j WHERE j.workspace_id = $1
       UNION ALL
       SELECT e.funded_at, CASE WHEN j.budget_source = 'parent_carveout' THEN 'carved_out' ELSE 'locked' END,
              j.id, j.title, NULL, e.amount, e.currency
         FROM job_escrows e JOIN jobs j ON j.id = e.job_id
        WHERE j.workspace_id = $1 AND e.funded_at IS NOT NULL
       UNION ALL
       SELECT s.created_at, 'entry', j.id, j.title, COALESCE(u.display_name, b.name), NULL, NULL
         FROM submissions s JOIN jobs j ON j.id = s.job_id
         LEFT JOIN users u ON u.id = s.submitter_user_id
         LEFT JOIN bot_agents b ON b.id = s.submitter_bot_id
        WHERE j.workspace_id = $1
       UNION ALL
       SELECT e.released_at, 'paid', j.id, j.title, u.display_name, e.net_to_winner, e.currency
         FROM job_escrows e JOIN jobs j ON j.id = e.job_id
         LEFT JOIN users u ON u.id = e.winner_payee_user_id
        WHERE j.workspace_id = $1 AND e.released_at IS NOT NULL
       UNION ALL
       SELECT e.refunded_at, 'refunded', j.id, j.title, NULL, e.refund_amount, e.currency
         FROM job_escrows e JOIN jobs j ON j.id = e.job_id
        WHERE j.workspace_id = $1 AND e.refunded_at IS NOT NULL
       UNION ALL
       SELECT em.started_at, 'hired', em.job_id, j.title, u.display_name, NULL, NULL
         FROM employments em JOIN users u ON u.id = em.employee_user_id JOIN jobs j ON j.id = em.job_id
        WHERE em.workspace_id = $1
       UNION ALL
       SELECT si.paid_at, 'seat_attached', em.job_id, j.title, u.display_name, si.amount, si.currency
         FROM seat_invoices si
         JOIN employments em ON em.id = si.employment_id
         JOIN users u ON u.id = em.employee_user_id
         JOIN jobs j ON j.id = em.job_id
        WHERE si.workspace_id = $1 AND si.state = 'paid' AND si.paid_at IS NOT NULL
       UNION ALL
       SELECT sc.created_at, 'sponsored', sc.job_id, j.title, sp.name, sc.amount, sc.currency
         FROM sponsor_contributions sc JOIN sponsors sp ON sp.id = sc.sponsor_id JOIN jobs j ON j.id = sc.job_id
        WHERE j.workspace_id = $1
     ) a ORDER BY at DESC LIMIT 25`,
    [req.params.id]
  );
  res.json(r.rows);
}));

module.exports = router;
module.exports.SEAT_PRICE_USD = SEAT_PRICE_USD;
module.exports.createSeatInvoice = createSeatInvoice;
module.exports.markSeatInvoicePaid = markSeatInvoicePaid;
