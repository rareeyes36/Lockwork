'use strict';

/**
 * Public social shell: /api/feed, /api/feed/seed, /api/profiles/:handle
 * Money-stripping mirrors make-money stub stripMoney — public JSON never
 * exposes amounts, fees, escrow, rail, or seat prices.
 */

const path = require('path');
const express = require('express');
const { pool, tx, HttpError } = require('../db');
const { asyncHandler } = require('../lib');

const router = express.Router();

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

/** Strip money / escrow / fee / seat-price keys from public feed payloads. */
const MONEY_KEYS = new Set([
  'amount', 'fee', 'fee_amount', 'fee_bps', 'platform_fee_bps', 'placement_fee_bps',
  'placement_fee_amount', 'net_to_winner',
  'currency', 'escrow', 'escrow_ref', 'escrow_tier', 'seat_price', 'seat_prices', 'seat_price_usd',
  'budget', 'payout', 'price', 'usd', 'dollars', 'rail',
  'usdc', 'usd_cents', 'carved_out_amount', 'refund_amount', 'gmv',
]);

function stripMoney(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripMoney);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (MONEY_KEYS.has(k) || /amount|fee|escrow|price|budget|payout|net_to|rail|usdc|\$/i.test(k)) continue;
    out[k] = typeof v === 'object' ? stripMoney(v) : v;
  }
  return out;
}

async function insertFeedEvent(clientOrPool, { kind, actor_user_id, company_id, job_id, payload }) {
  const safe = stripMoney(payload || {});
  await clientOrPool.query(
    `INSERT INTO feed_events (kind, actor_user_id, company_id, job_id, payload_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [kind, actor_user_id || null, company_id || null, job_id || null, JSON.stringify(safe)]
  );
}

function sendFeedPage(_req, res) {
  res.sendFile(path.join(PUBLIC_DIR, 'feed.html'));
}

function sendProfilePage(_req, res) {
  res.sendFile(path.join(PUBLIC_DIR, 'profile.html'));
}

/** Public feed — strip money from payloads. */
router.get('/feed', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const r = await pool.query(
    `SELECT fe.id, fe.kind, fe.job_id, fe.company_id, fe.payload_json, fe.created_at,
            u.handle AS actor_handle, u.display_name AS actor_display_name,
            w.name AS company_name, w.slug AS company_slug,
            j.title AS job_title
     FROM feed_events fe
     LEFT JOIN users u ON u.id = fe.actor_user_id
     LEFT JOIN workspaces w ON w.id = fe.company_id
     LEFT JOIN jobs j ON j.id = fe.job_id
     ORDER BY fe.created_at DESC
     LIMIT $1`,
    [limit]
  );
  const events = r.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    job_id: row.job_id,
    company_id: row.company_id,
    actor_handle: row.actor_handle,
    actor_display_name: row.actor_display_name,
    company_name: row.company_name,
    company_slug: row.company_slug,
    job_title: row.job_title,
    payload: stripMoney(row.payload_json || {}),
    created_at: row.created_at,
  }));
  res.json({ events });
}));

/**
 * Seed demo feed from existing jobs/people — safe non-money payloads only.
 */
router.post('/feed/seed', asyncHandler(async (_req, res) => {
  const jobs = await pool.query(
    `SELECT j.id, j.title, j.status, j.workspace_id, j.employer_user_id,
            u.handle AS employer_handle, w.name AS company_name
     FROM jobs j
     JOIN users u ON u.id = j.employer_user_id
     JOIN workspaces w ON w.id = j.workspace_id
     ORDER BY j.created_at DESC
     LIMIT 8`
  );
  const people = await pool.query(
    `SELECT id, handle FROM users ORDER BY created_at DESC LIMIT 8`
  );
  if (!jobs.rows.length) {
    throw new HttpError(400, 'no jobs to seed from — run Operating OS demo first');
  }
  const inserted = await tx(async (client) => {
    let n = 0;
    for (const job of jobs.rows) {
      const worker = people.rows.find((p) => p.id !== job.employer_user_id) || people.rows[0];
      if (['funded', 'in_review', 'paid', 'draft'].includes(job.status)) {
        await insertFeedEvent(client, {
          kind: 'job_funded',
          actor_user_id: job.employer_user_id,
          company_id: job.workspace_id,
          job_id: job.id,
          payload: {
            title: job.title,
            badge: 'funded',
            actor_handle: job.employer_handle,
            company_name: job.company_name,
          },
        });
        n += 1;
      }
      if (worker) {
        await insertFeedEvent(client, {
          kind: 'submission',
          actor_user_id: worker.id,
          company_id: job.workspace_id,
          job_id: job.id,
          payload: {
            title: job.title,
            badge: 'submitted',
            actor_handle: worker.handle,
            company_name: job.company_name,
          },
        });
        n += 1;
      }
      if (job.status === 'paid' && worker) {
        await insertFeedEvent(client, {
          kind: 'paid_hired',
          actor_user_id: worker.id,
          company_id: job.workspace_id,
          job_id: job.id,
          payload: {
            title: job.title,
            badge: 'hired',
            employer_handle: job.employer_handle,
            worker_handle: worker.handle,
            company_name: job.company_name,
          },
        });
        n += 1;
      }
    }
    const first = jobs.rows[0];
    await insertFeedEvent(client, {
      kind: 'company_pulse',
      actor_user_id: first.employer_user_id,
      company_id: first.workspace_id,
      job_id: null,
      payload: {
        title: first.company_name,
        badge: 'pulse',
        note: 'company active',
        company_name: first.company_name,
        actor_handle: first.employer_handle,
      },
    });
    n += 1;
    return n;
  });
  res.status(201).json({ inserted });
}));

/** Public profile — jobs completed + demerits only; no escrow fields. */
router.get('/profiles/:handle', asyncHandler(async (req, res) => {
  const handle = req.params.handle;
  const userRes = await pool.query(
    `SELECT id, handle, display_name, created_at FROM users WHERE handle = $1`,
    [handle]
  );
  const person = userRes.rows[0];
  if (!person) throw new HttpError(404, 'profile not found');

  const wr = await pool.query(
    `SELECT wins_count FROM worker_reputation WHERE user_id = $1`,
    [person.id]
  );
  const er = await pool.query(
    `SELECT jobs_paid_out_count, demerit_count, jobs_posted_count
     FROM employer_reputation WHERE user_id = $1`,
    [person.id]
  );
  const wins = wr.rows[0]?.wins_count ?? 0;
  const emp = er.rows[0] || {};
  res.json({
    handle: person.handle,
    display_name: person.display_name,
    jobs_completed: wins,
    jobs_paid_out_count: emp.jobs_paid_out_count ?? 0,
    demerit_count: emp.demerit_count ?? 0,
    jobs_posted_count: emp.jobs_posted_count ?? 0,
    created_at: person.created_at,
  });
}));

module.exports = {
  router,
  stripMoney,
  insertFeedEvent,
  MONEY_KEYS,
  sendFeedPage,
  sendProfilePage,
};
