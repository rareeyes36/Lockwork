'use strict';

/** Plugins (integrations) and sponsors (+ placement fee billing). */

const express = require('express');
const crypto = require('crypto');
const { pool, tx } = require('../db');
const { asyncHandler, required, HttpError } = require('../lib');
const { loadCompany } = require('../access');
const {
  PLACEMENT_FEE_BPS,
  toMinor,
  fromMinor,
  computeReleaseFee,
} = require('../escrow/feeMath');

const router = express.Router();

/* ---------- placement fee helpers (mirror seat invoices) ---------- */

function placementFeeAmount(contributionAmount, currency, bps = PLACEMENT_FEE_BPS) {
  const minor = toMinor(contributionAmount, currency);
  const { feeAmount } = computeReleaseFee(minor, bps);
  if (feeAmount <= 0n) throw new HttpError(400, 'Placement fee rounds to zero for this amount.');
  return fromMinor(feeAmount, currency);
}

async function loadContribution(clientOrPool, id) {
  const r = await clientOrPool.query(
    `SELECT sc.*, sp.name AS sponsor_name, sp.workspace_id AS sponsor_workspace_id,
            sp.job_id AS sponsor_job_id, sp.kinds AS sponsor_kinds,
            j.workspace_id AS job_workspace_id, j.title AS job_title, j.status AS job_status
       FROM sponsor_contributions sc
       JOIN sponsors sp ON sp.id = sc.sponsor_id
       JOIN jobs j ON j.id = sc.job_id
      WHERE sc.id = $1`,
    [id]
  );
  if (!r.rows[0]) throw new HttpError(404, 'contribution not found');
  return r.rows[0];
}

function contributionWorkspaceId(c) {
  return c.job_workspace_id || c.sponsor_workspace_id;
}

/**
 * Record an open placement-fee invoice (custodial-sim by default).
 * Amount = contribution.amount * placement_fee_bps / 10000 (integer minor math).
 */
async function createPlacementInvoice(client, contribution, {
  rail = 'custodial_sim',
  meta = {},
} = {}) {
  if (contribution.state === 'refunded') {
    throw new HttpError(400, 'Cannot charge placement fee on a refunded contribution.');
  }
  const paid = await client.query(
    `SELECT id FROM placement_invoices WHERE contribution_id = $1 AND state = 'paid'`,
    [contribution.id]
  );
  if (paid.rows[0]) {
    throw new HttpError(409, 'Placement fee already paid for this contribution.', {
      invoice_id: paid.rows[0].id,
    });
  }
  const open = await client.query(
    `SELECT id FROM placement_invoices WHERE contribution_id = $1 AND state = 'open'`,
    [contribution.id]
  );
  if (open.rows[0]) {
    throw new HttpError(409, 'An open placement invoice already exists for this contribution.', {
      invoice_id: open.rows[0].id,
    });
  }

  const bps = contribution.placement_fee_bps != null
    ? Number(contribution.placement_fee_bps)
    : PLACEMENT_FEE_BPS;
  const amount = placementFeeAmount(contribution.amount, contribution.currency, bps);
  const workspaceId = contributionWorkspaceId(contribution);
  const invoiceRef = `place-sim-${crypto.randomBytes(6).toString('hex')}`;

  const r = await client.query(
    `INSERT INTO placement_invoices (
       contribution_id, workspace_id, job_id, amount, currency, placement_fee_bps,
       state, rail, invoice_ref, meta_json
     ) VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9::jsonb)
     RETURNING *`,
    [
      contribution.id,
      workspaceId,
      contribution.job_id,
      amount,
      contribution.currency,
      bps,
      rail,
      invoiceRef,
      JSON.stringify({
        sim: rail === 'custodial_sim',
        stripe_live: false,
        contribution_amount: String(contribution.amount),
        note: rail === 'custodial_sim'
          ? 'Placement invoice recorded (custodial-sim). Stripe live billing not wired.'
          : 'Stripe path reserved.',
        ...meta,
      }),
    ]
  );
  return r.rows[0];
}

/** Mark placement invoice paid (does not change release/platform fee math). */
async function markPlacementInvoicePaid(client, invoice, { meta = {} } = {}) {
  if (invoice.state === 'paid') return invoice;
  if (invoice.state === 'void') throw new HttpError(400, 'Cannot pay a void placement invoice.');
  if (invoice.state !== 'open') throw new HttpError(400, `Placement invoice is ${invoice.state}`);

  const paid = await client.query(
    `UPDATE placement_invoices SET
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
  if (!paid.rows[0]) throw new HttpError(409, 'Placement invoice was already settled.');
  return paid.rows[0];
}

/** Void open placement invoices for a contribution (refund before lock/pay). */
async function voidOpenPlacementInvoices(client, contributionId, reason = 'contribution_refunded') {
  await client.query(
    `UPDATE placement_invoices SET
       state = 'void',
       voided_at = now(),
       meta_json = meta_json || $2::jsonb
     WHERE contribution_id = $1 AND state = 'open'`,
    [contributionId, JSON.stringify({ void_reason: reason, platform_release_fee: 0 })]
  );
}

async function assertRail(rail) {
  if (!['custodial_sim', 'stripe'].includes(rail)) {
    throw new HttpError(400, 'rail must be custodial_sim or stripe');
  }
  if (rail === 'stripe') {
    throw new HttpError(501, 'Stripe placement billing is not live yet. Use custodial_sim (invoice recorded).');
  }
}

/* ---------- plugins ---------- */

router.get('/plugins', asyncHandler(async (_req, res) => {
  res.json((await pool.query('SELECT * FROM plugin_catalog ORDER BY name')).rows);
}));

router.get('/companies/:id/plugins', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT pc.*, wp.id AS subscription_id, wp.status, wp.subscribed_at, wp.config_json,
            sp.name AS sponsored_by
       FROM plugin_catalog pc
       LEFT JOIN workspace_plugins wp ON wp.plugin_id = pc.id AND wp.workspace_id = $1
       LEFT JOIN sponsors sp ON sp.id::text = wp.config_json->>'sponsor_id'
      ORDER BY pc.name`,
    [req.params.id]
  );
  res.json(r.rows);
}));

router.post('/companies/:id/plugins', asyncHandler(async (req, res) => {
  const { plugin_id, key, sponsor_id } = req.body || {};
  const company = await loadCompany(pool, req.params.id);
  const p = (await pool.query('SELECT * FROM plugin_catalog WHERE id = $1 OR key = $2',
    [plugin_id || null, key || null])).rows[0];
  if (!p) throw new HttpError(404, 'plugin not found');
  const config = { entitlement: 'stub', ...(sponsor_id ? { sponsor_id } : {}) };
  const r = await pool.query(
    `INSERT INTO workspace_plugins (workspace_id, plugin_id, status, config_json)
     VALUES ($1, $2, 'subscribed', $3)
     ON CONFLICT (workspace_id, plugin_id)
       DO UPDATE SET status = 'subscribed', config_json = workspace_plugins.config_json || EXCLUDED.config_json
     RETURNING *`,
    [company.id, p.id, JSON.stringify(config)]
  );
  res.status(201).json(r.rows[0]);
}));

router.patch('/company-plugins/:id', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['subscribed', 'paused'].includes(status)) throw new HttpError(400, 'status must be subscribed or paused');
  const r = await pool.query('UPDATE workspace_plugins SET status = $2 WHERE id = $1 RETURNING *', [req.params.id, status]);
  if (!r.rows[0]) throw new HttpError(404, 'subscription not found');
  res.json(r.rows[0]);
}));

/* ---------- sponsors ---------- */

router.get('/companies/:id/sponsors', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT sp.*, u.display_name AS sponsor_person, j.title AS job_title,
            COALESCE((SELECT json_agg(json_build_object(
                'id', sc.id, 'job_id', sc.job_id, 'job_title', cj.title, 'kind', sc.kind,
                'amount', sc.amount, 'currency', sc.currency, 'state', sc.state,
                'placement_fee_bps', sc.placement_fee_bps, 'created_at', sc.created_at,
                'placement_fee_amount', (
                  SELECT pi.amount FROM placement_invoices pi
                   WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                   ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC
                   LIMIT 1
                ),
                'placement_invoice_id', (
                  SELECT pi.id FROM placement_invoices pi
                   WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                   ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC
                   LIMIT 1
                ),
                'placement_fee_state', (
                  SELECT pi.state FROM placement_invoices pi
                   WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                   ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC
                   LIMIT 1
                ),
                'placement_paid_at', (
                  SELECT pi.paid_at FROM placement_invoices pi
                   WHERE pi.contribution_id = sc.id AND pi.state = 'paid'
                   ORDER BY pi.paid_at DESC NULLS LAST LIMIT 1
                ),
                'placement_rail', (
                  SELECT pi.rail FROM placement_invoices pi
                   WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                   ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC
                   LIMIT 1
                ))
                ORDER BY sc.created_at)
               FROM sponsor_contributions sc JOIN jobs cj ON cj.id = sc.job_id
              WHERE sc.sponsor_id = sp.id), '[]') AS contributions
       FROM sponsors sp
       LEFT JOIN users u ON u.id = sp.sponsor_user_id
       LEFT JOIN jobs j ON j.id = sp.job_id
      WHERE sp.workspace_id = $1 OR j.workspace_id = $1
      ORDER BY sp.created_at`,
    [req.params.id]
  );
  res.json(r.rows);
}));

router.get('/companies/:id/placement-invoices', asyncHandler(async (req, res) => {
  await loadCompany(pool, req.params.id);
  const r = await pool.query(
    `SELECT pi.*, sp.name AS sponsor_name, j.title AS job_title, sc.amount AS contribution_amount,
            sc.kind AS contribution_kind, sc.state AS contribution_state
       FROM placement_invoices pi
       JOIN sponsor_contributions sc ON sc.id = pi.contribution_id
       JOIN sponsors sp ON sp.id = sc.sponsor_id
       JOIN jobs j ON j.id = pi.job_id
      WHERE pi.workspace_id = $1
      ORDER BY pi.created_at DESC`,
    [req.params.id]
  );
  res.json({
    placement_fee_bps: PLACEMENT_FEE_BPS,
    billing: {
      rail: 'custodial_sim',
      stripe_live: false,
      note: 'Placement charges persist as invoices; payment is custodial-sim until Stripe is wired.',
    },
    invoices: r.rows,
  });
}));

router.post('/companies/:id/sponsors', asyncHandler(async (req, res) => {
  const { name, kinds, details, job_id, sponsor_user_id } = req.body || {};
  required(req.body || {}, ['name']);
  const company = await loadCompany(pool, req.params.id);
  if (job_id) {
    const j = (await pool.query('SELECT workspace_id FROM jobs WHERE id = $1', [job_id])).rows[0];
    if (!j || j.workspace_id !== company.id) throw new HttpError(400, 'job not in this company');
  }
  // Scope: a specific job, or the whole company.
  const r = await pool.query(
    `INSERT INTO sponsors (workspace_id, job_id, sponsor_user_id, name, kinds, details)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [job_id ? null : company.id, job_id || null, sponsor_user_id || null, name,
     Array.isArray(kinds) ? kinds : [kinds || 'financing'], details || null]
  );
  res.status(201).json(r.rows[0]);
}));

router.post('/sponsors/:id/contributions', asyncHandler(async (req, res) => {
  const { job_id, kind, amount, currency } = req.body || {};
  required(req.body || {}, ['job_id', 'amount']);
  const sp = (await pool.query('SELECT * FROM sponsors WHERE id = $1', [req.params.id])).rows[0];
  if (!sp) throw new HttpError(404, 'sponsor not found');
  const j = (await pool.query(
    `SELECT j.workspace_id, e.currency FROM jobs j LEFT JOIN job_escrows e ON e.job_id = j.id WHERE j.id = $1`,
    [job_id])).rows[0];
  if (!j) throw new HttpError(404, 'job not found');
  const cur = currency || j.currency || 'USD';
  let amt;
  try { amt = fromMinor(toMinor(amount, cur), cur); } catch { throw new HttpError(400, 'amount must be a positive number'); }
  const r = await pool.query(
    `INSERT INTO sponsor_contributions (sponsor_id, job_id, kind, amount, currency, state, placement_fee_bps)
     VALUES ($1, $2, $3, $4, $5, 'pledged', $6) RETURNING *`,
    [sp.id, job_id, kind || 'co_lock', amt, cur, PLACEMENT_FEE_BPS]
  );
  res.status(201).json(r.rows[0]);
}));

const CONTRIB_NEXT = { pledged: ['locked', 'refunded'], locked: ['released', 'refunded'] };

router.patch('/contributions/:id', asyncHandler(async (req, res) => {
  const { state } = req.body || {};
  const out = await tx(async (c) => {
    const cur = await loadContribution(c, req.params.id);
    if (!(CONTRIB_NEXT[cur.state] || []).includes(state)) {
      throw new HttpError(400, `Cannot move a ${cur.state} contribution to ${state}.`);
    }
    const r = await c.query(
      'UPDATE sponsor_contributions SET state = $2 WHERE id = $1 RETURNING *',
      [cur.id, state]
    );
    const updated = r.rows[0];

    // Locking records an open placement invoice (pay separately or via placement-attach).
    let placement_invoice = null;
    if (state === 'locked') {
      const existingPaid = await c.query(
        `SELECT * FROM placement_invoices WHERE contribution_id = $1 AND state = 'paid' LIMIT 1`,
        [cur.id]
      );
      const existingOpen = await c.query(
        `SELECT * FROM placement_invoices WHERE contribution_id = $1 AND state = 'open' LIMIT 1`,
        [cur.id]
      );
      if (existingPaid.rows[0]) {
        placement_invoice = existingPaid.rows[0];
      } else if (existingOpen.rows[0]) {
        placement_invoice = existingOpen.rows[0];
      } else {
        placement_invoice = await createPlacementInvoice(c, { ...cur, ...updated });
      }
    }

    // Refund before paid: void open placement invoice. No platform release fee on unwind.
    if (state === 'refunded') {
      await voidOpenPlacementInvoices(c, cur.id, 'contribution_refunded');
    }

    return { contribution: updated, placement_invoice };
  });
  res.json(out.placement_invoice ? out : out.contribution);
}));

/**
 * Create an open placement-fee charge. Contribution should be locked (or will be locked via attach).
 * POST body optional: { rail?: 'custodial_sim'|'stripe' }
 */
router.post('/contributions/:id/placement-invoices', asyncHandler(async (req, res) => {
  const rail = (req.body && req.body.rail) || 'custodial_sim';
  await assertRail(rail);
  const invoice = await tx(async (c) => {
    const cur = await loadContribution(c, req.params.id);
    if (cur.state === 'pledged') {
      throw new HttpError(400, 'Lock the contribution before charging placement fee, or use placement-attach.');
    }
    if (cur.state === 'refunded') {
      throw new HttpError(400, 'Cannot charge placement fee on a refunded contribution.');
    }
    return createPlacementInvoice(c, cur, { rail });
  });
  res.status(201).json({
    invoice,
    placement_fee_bps: PLACEMENT_FEE_BPS,
    billing: { rail: invoice.rail, stripe_live: false, sim: true },
  });
}));

router.post('/placement-invoices/:id/pay', asyncHandler(async (req, res) => {
  const out = await tx(async (c) => {
    const inv = (await c.query('SELECT * FROM placement_invoices WHERE id = $1', [req.params.id])).rows[0];
    if (!inv) throw new HttpError(404, 'placement invoice not found');
    const invoice = await markPlacementInvoicePaid(c, inv);
    const contribution = await loadContribution(c, invoice.contribution_id);
    return { invoice, contribution };
  });
  res.json({
    ...out,
    placement_fee_bps: PLACEMENT_FEE_BPS,
    billing: { rail: out.invoice.rail, stripe_live: false, sim: out.invoice.rail === 'custodial_sim' },
  });
}));

/**
 * One-shot: lock contribution (if pledged) + create placement invoice + mark paid.
 * Prefer this from OS UI when attaching financing to a job.
 */
router.post('/contributions/:id/placement-attach', asyncHandler(async (req, res) => {
  const rail = (req.body && req.body.rail) || 'custodial_sim';
  await assertRail(rail);
  const out = await tx(async (c) => {
    let cur = await loadContribution(c, req.params.id);

    const paidExisting = await c.query(
      `SELECT * FROM placement_invoices WHERE contribution_id = $1 AND state = 'paid'
        ORDER BY paid_at DESC NULLS LAST LIMIT 1`,
      [cur.id]
    );
    if (paidExisting.rows[0] && cur.state !== 'pledged') {
      return {
        invoice: paidExisting.rows[0],
        contribution: cur,
        already_attached: true,
      };
    }

    if (cur.state === 'pledged') {
      const locked = await c.query(
        `UPDATE sponsor_contributions SET state = 'locked' WHERE id = $1 AND state = 'pledged' RETURNING *`,
        [cur.id]
      );
      if (!locked.rows[0]) throw new HttpError(409, 'Contribution could not be locked.');
      cur = { ...cur, ...locked.rows[0] };
    } else if (cur.state === 'refunded') {
      throw new HttpError(400, 'Cannot attach placement fee on a refunded contribution.');
    }

    if (paidExisting.rows[0]) {
      return {
        invoice: paidExisting.rows[0],
        contribution: cur,
        already_attached: true,
      };
    }

    let invoice;
    const open = await c.query(
      `SELECT * FROM placement_invoices WHERE contribution_id = $1 AND state = 'open'
        ORDER BY created_at DESC LIMIT 1`,
      [cur.id]
    );
    invoice = open.rows[0] || await createPlacementInvoice(c, cur, { rail, meta: { attach: true } });
    invoice = await markPlacementInvoicePaid(c, invoice, { meta: { attach: true } });
    const contribution = await loadContribution(c, cur.id);
    return { invoice, contribution, already_attached: false };
  });
  res.status(out.already_attached ? 200 : 201).json({
    ...out,
    placement_fee_bps: PLACEMENT_FEE_BPS,
    billing: { rail: out.invoice.rail, stripe_live: false, sim: true },
  });
}));

/**
 * Job-card one-click: pledge a financing contribution on a sponsor + lock + pay placement fee.
 * Body: { sponsor_id, amount, kind?, currency?, rail? }
 */
router.post('/jobs/:id/sponsor-attach', asyncHandler(async (req, res) => {
  const { sponsor_id, amount, kind, currency, rail: railIn } = req.body || {};
  required(req.body || {}, ['sponsor_id', 'amount']);
  const rail = railIn || 'custodial_sim';
  await assertRail(rail);

  const out = await tx(async (c) => {
    const job = (await c.query(
      `SELECT j.*, e.currency AS escrow_currency
         FROM jobs j LEFT JOIN job_escrows e ON e.job_id = j.id WHERE j.id = $1`,
      [req.params.id]
    )).rows[0];
    if (!job) throw new HttpError(404, 'job not found');
    if (!['funded', 'in_review', 'draft'].includes(job.status) && job.status !== 'paid') {
      // Allow attach on open/funded jobs primarily; also draft/paid for demo flexibility.
    }
    if (['expired_refunded', 'cancelled_refunded'].includes(job.status)) {
      throw new HttpError(400, 'Cannot attach financing to a refunded job.');
    }

    const sp = (await c.query('SELECT * FROM sponsors WHERE id = $1', [sponsor_id])).rows[0];
    if (!sp) throw new HttpError(404, 'sponsor not found');
    const spWs = sp.workspace_id
      || (sp.job_id
        ? (await c.query('SELECT workspace_id FROM jobs WHERE id = $1', [sp.job_id])).rows[0]?.workspace_id
        : null);
    if (spWs !== job.workspace_id) throw new HttpError(400, 'sponsor not in this company');
    if (sp.job_id && sp.job_id !== job.id) {
      throw new HttpError(400, 'This sponsor is scoped to a different job.');
    }

    const cur = currency || job.escrow_currency || 'USD';
    let amt;
    try { amt = fromMinor(toMinor(amount, cur), cur); } catch { throw new HttpError(400, 'amount must be a positive number'); }

    const contrib = (await c.query(
      `INSERT INTO sponsor_contributions (sponsor_id, job_id, kind, amount, currency, state, placement_fee_bps)
       VALUES ($1, $2, $3, $4, $5, 'locked', $6) RETURNING *`,
      [sp.id, job.id, kind || 'co_lock', amt, cur, PLACEMENT_FEE_BPS]
    )).rows[0];

    const full = await loadContribution(c, contrib.id);
    let invoice = await createPlacementInvoice(c, full, { rail, meta: { attach: true, job_attach: true } });
    invoice = await markPlacementInvoicePaid(c, invoice, { meta: { attach: true, job_attach: true } });
    const contribution = await loadContribution(c, contrib.id);
    return { contribution, invoice, sponsor: sp };
  });

  res.status(201).json({
    ...out,
    placement_fee_bps: PLACEMENT_FEE_BPS,
    billing: { rail: out.invoice.rail, stripe_live: false, sim: true },
  });
}));

module.exports = router;
module.exports.PLACEMENT_FEE_BPS = PLACEMENT_FEE_BPS;
module.exports.placementFeeAmount = placementFeeAmount;
