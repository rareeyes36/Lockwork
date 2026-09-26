'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool, tx } = require('../db');
const { asyncHandler, actorId, required, slugify, HttpError } = require('../lib');
const { loadCompany } = require('../access');

const router = express.Router();

const MAX_TEAM_DEPTH = 3;
const SEAT_PRICE_USD = 79;

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
            ro.name AS role_name, e.net_to_winner, e.currency
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
  res.json({ seat_price_usd: SEAT_PRICE_USD, employments: r.rows });
}));

/** Seat lifecycle: pending → active → churned (churn feeds reputation via trigger 017). */
router.patch('/employments/:id', asyncHandler(async (req, res) => {
  const { seat_status } = req.body || {};
  if (!['pending', 'active', 'churned'].includes(seat_status)) {
    throw new HttpError(400, 'seat_status must be pending, active or churned');
  }
  const cur = (await pool.query('SELECT seat_status FROM employments WHERE id = $1', [req.params.id])).rows[0];
  if (!cur) throw new HttpError(404, 'employment not found');
  // Churn is final: its retention days were already credited to reputation.
  if (cur.seat_status === 'churned' && seat_status !== 'churned') {
    throw new HttpError(400, 'Churned seats are final. Re-hire through a new job.');
  }
  const r = await pool.query(
    `UPDATE employments SET
       seat_status = $2,
       seat_plan = COALESCE(seat_plan, 'workspace_member'),
       seat_started_at = CASE WHEN $2 = 'active' AND seat_started_at IS NULL THEN now() ELSE seat_started_at END
     WHERE id = $1 RETURNING *`,
    [req.params.id, seat_status]
  );
  if (!r.rows[0]) throw new HttpError(404, 'employment not found');
  res.json(r.rows[0]);
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
