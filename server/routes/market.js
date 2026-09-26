'use strict';

/** Plugins (integrations) and sponsors. */

const express = require('express');
const { pool } = require('../db');
const { asyncHandler, required, HttpError } = require('../lib');
const { loadCompany } = require('../access');
const { PLACEMENT_FEE_BPS, toMinor, fromMinor } = require('../escrow/feeMath');

const router = express.Router();

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
                'placement_fee_bps', sc.placement_fee_bps, 'created_at', sc.created_at)
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
  const cur = (await pool.query('SELECT * FROM sponsor_contributions WHERE id = $1', [req.params.id])).rows[0];
  if (!cur) throw new HttpError(404, 'contribution not found');
  if (!(CONTRIB_NEXT[cur.state] || []).includes(state)) {
    throw new HttpError(400, `Cannot move a ${cur.state} contribution to ${state}.`);
  }
  const r = await pool.query('UPDATE sponsor_contributions SET state = $2 WHERE id = $1 RETURNING *', [cur.id, state]);
  res.json(r.rows[0]);
}));

module.exports = router;
