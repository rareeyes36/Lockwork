'use strict';

/** Roles, role assignments and bot agents inside a company. */

const express = require('express');
const { pool, tx } = require('../db');
const { asyncHandler, actorId, required, HttpError } = require('../lib');
const { loadCompany, assertCanMintRoles } = require('../access');

const router = express.Router();

/* ---------- roles ---------- */

router.get('/companies/:id/roles', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT ro.*, cu.display_name AS created_by_name,
            (SELECT json_build_object('id', b.id, 'name', b.name, 'status', b.status)
               FROM bot_agents b WHERE b.kind = 'lead' AND b.managing_role_id = ro.id) AS lead_bot,
            COALESCE((SELECT json_agg(json_build_object(
                'id', ra.id, 'principal_type', ra.principal_type,
                'user_id', ra.user_id, 'bot_agent_id', ra.bot_agent_id,
                'name', COALESCE(u.display_name, b.name), 'assigned_at', ra.assigned_at)
                ORDER BY ra.assigned_at)
               FROM role_assignments ra
               LEFT JOIN users u ON u.id = ra.user_id
               LEFT JOIN bot_agents b ON b.id = ra.bot_agent_id
              WHERE ra.role_id = ro.id), '[]') AS assignments
       FROM roles ro LEFT JOIN users cu ON cu.id = ro.created_by_user_id
      WHERE ro.workspace_id = $1
      ORDER BY ro.created_at`,
    [req.params.id]
  );
  res.json(r.rows);
}));

router.post('/companies/:id/roles', asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const { name, parent_role_id, can_mint_roles } = req.body || {};
  required(req.body || {}, ['name']);
  const role = await tx(async (c) => {
    const company = await loadCompany(c, req.params.id);
    await assertCanMintRoles(c, company, actor);
    if (parent_role_id) {
      const p = await c.query('SELECT workspace_id FROM roles WHERE id = $1', [parent_role_id]);
      if (!p.rows[0] || p.rows[0].workspace_id !== company.id) throw new HttpError(400, 'parent role not in this company');
    }
    const r = await c.query(
      `INSERT INTO roles (workspace_id, name, parent_role_id, can_mint_roles, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [company.id, name, parent_role_id || null, Boolean(can_mint_roles), actor || company.employer_user_id]
    );
    return r.rows[0];
  });
  res.status(201).json(role);
}));

router.post('/roles/:id/assignments', asyncHandler(async (req, res) => {
  const { user_id, bot_agent_id } = req.body || {};
  if (!user_id === !bot_agent_id) throw new HttpError(400, 'Provide exactly one of user_id or bot_agent_id.');
  const role = (await pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id])).rows[0];
  if (!role) throw new HttpError(404, 'role not found');
  if (bot_agent_id) {
    const b = (await pool.query('SELECT workspace_id FROM bot_agents WHERE id = $1', [bot_agent_id])).rows[0];
    if (!b || b.workspace_id !== role.workspace_id) throw new HttpError(400, 'bot not in this company');
  }
  const r = await pool.query(
    `INSERT INTO role_assignments (role_id, principal_type, user_id, bot_agent_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [role.id, user_id ? 'user' : 'bot', user_id || null, bot_agent_id || null]
  );
  res.status(201).json(r.rows[0]);
}));

router.delete('/role-assignments/:id', asyncHandler(async (req, res) => {
  const r = await pool.query('DELETE FROM role_assignments WHERE id = $1 RETURNING *', [req.params.id]);
  if (!r.rows[0]) throw new HttpError(404, 'assignment not found');
  res.json(r.rows[0]);
}));

/* ---------- bots ---------- */

const BOT_SELECT = `
  SELECT b.*, op.display_name AS operator_name, ro.name AS managing_role_name,
         j.title AS job_title, j.status AS job_status, pb.name AS parent_bot_name,
         COALESCE(wr.wins_count, 0) AS wins_count,
         COALESCE((SELECT json_agg(json_build_object('id', r2.id, 'name', r2.name))
            FROM role_assignments ra JOIN roles r2 ON r2.id = ra.role_id
           WHERE ra.bot_agent_id = b.id), '[]') AS roles
    FROM bot_agents b
    LEFT JOIN users op ON op.id::text = b.config_json->>'operator_user_id'
    LEFT JOIN roles ro ON ro.id = b.managing_role_id
    LEFT JOIN jobs j ON j.id = b.job_id
    LEFT JOIN bot_agents pb ON pb.id = b.parent_bot_id
    LEFT JOIN worker_reputation wr ON wr.bot_agent_id = b.id`;

router.get('/companies/:id/bots', asyncHandler(async (req, res) => {
  const r = await pool.query(`${BOT_SELECT} WHERE b.workspace_id = $1 ORDER BY b.created_at`, [req.params.id]);
  res.json(r.rows);
}));

async function createBot(req, res) {
  const body = req.body || {};
  required(body, ['name']);
  const kind = body.kind || (body.job_id ? 'job_scoped' : 'worker');
  if (!['lead', 'worker', 'job_scoped'].includes(kind)) throw new HttpError(400, 'kind must be lead, worker or job_scoped');
  if (kind === 'lead' && !body.managing_role_id) throw new HttpError(400, 'A lead bot needs the role it leads (managing_role_id).');
  if (kind === 'job_scoped' && !body.job_id) throw new HttpError(400, 'A job-scoped bot needs a job_id.');
  const company = await loadCompany(pool, req.params.id);
  if (body.job_id) {
    const j = (await pool.query('SELECT workspace_id FROM jobs WHERE id = $1', [body.job_id])).rows[0];
    if (!j || j.workspace_id !== company.id) throw new HttpError(400, 'job not in this company');
  }
  const config = {
    operator_user_id: body.operator_user_id || actorId(req) || company.employer_user_id,
    model: body.model || 'claude-sonnet-5',
    tools: body.tools || ['repo', 'ide'],
    stub: true,
  };
  const r = await pool.query(
    `INSERT INTO bot_agents (workspace_id, name, kind, managing_role_id, parent_bot_id, job_id, config_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [company.id, body.name, kind, body.managing_role_id || null, body.parent_bot_id || null, body.job_id || null, JSON.stringify(config)]
  );
  res.status(201).json(r.rows[0]);
}
router.post('/companies/:id/bots', asyncHandler(createBot));
router.post('/workspaces/:id/bots', asyncHandler(createBot));

router.patch('/bots/:id', asyncHandler(async (req, res) => {
  const { operator_user_id, name } = req.body || {};
  const r = await pool.query(
    `UPDATE bot_agents SET
       name = COALESCE($2, name),
       config_json = CASE WHEN $3::text IS NULL THEN config_json
                          ELSE config_json || jsonb_build_object('operator_user_id', $3::text) END
     WHERE id = $1 RETURNING *`,
    [req.params.id, name || null, operator_user_id || null]
  );
  if (!r.rows[0]) throw new HttpError(404, 'bot not found');
  res.json(r.rows[0]);
}));

router.post('/bots/:id/stop', asyncHandler(async (req, res) => {
  const r = await pool.query(`UPDATE bot_agents SET status = 'stopped' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!r.rows[0]) throw new HttpError(404, 'bot not found');
  res.json(r.rows[0]);
}));

router.post('/bots/:id/start', asyncHandler(async (req, res) => {
  const r = await pool.query(`UPDATE bot_agents SET status = 'active' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!r.rows[0]) throw new HttpError(404, 'bot not found');
  res.json(r.rows[0]);
}));

/**
 * Promote a (job-scoped) bot into an ongoing role — brief step 7.
 * as_lead = true makes it that role's single lead bot.
 */
router.post('/bots/:id/promote', asyncHandler(async (req, res) => {
  const { role_id, as_lead } = req.body || {};
  if (!role_id) throw new HttpError(400, 'role_id required');
  const out = await tx(async (c) => {
    const b = (await c.query('SELECT * FROM bot_agents WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!b) throw new HttpError(404, 'bot not found');
    const role = (await c.query('SELECT * FROM roles WHERE id = $1', [role_id])).rows[0];
    if (!role || role.workspace_id !== b.workspace_id) throw new HttpError(400, 'role not in this company');
    const kind = as_lead ? 'lead' : 'worker';
    const bot = (await c.query(
      `UPDATE bot_agents SET kind = $2, managing_role_id = $3, status = 'active' WHERE id = $1 RETURNING *`,
      [b.id, kind, as_lead ? role.id : b.managing_role_id]
    )).rows[0];
    await c.query(
      `INSERT INTO role_assignments (role_id, principal_type, bot_agent_id) VALUES ($1, 'bot', $2)
       ON CONFLICT DO NOTHING`,
      [role.id, b.id]
    );
    return bot;
  });
  res.json(out);
}));

module.exports = router;
