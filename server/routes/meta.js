'use strict';

/** Health, config, stats, reputation leaderboard, demo reset. */

const express = require('express');
const { pool, DATABASE_URL } = require('../db');
const { asyncHandler, HttpError } = require('../lib');
const { PLATFORM_FEE_BPS, PLACEMENT_FEE_BPS } = require('../escrow/feeMath');
const { BASE_CHAIN_ID, BASE_USDC_ADDRESS } = require('../escrow/adapters');
const onchain = require('../escrow/onchainBase');
const { SEAT_PRICE_USD } = require('./companies');
const { seed } = require('../seed');

const router = express.Router();

router.get('/health', asyncHandler(async (_req, res) => {
  const r = await pool.query('SELECT 1 AS ok, now() AS ts');
  res.json({ ok: true, db: r.rows[0], database_url_host: new URL(DATABASE_URL).host });
}));

router.get('/config', (_req, res) => {
  res.json({
    platform_fee_bps: PLATFORM_FEE_BPS,
    placement_fee_bps: PLACEMENT_FEE_BPS,
    seat_price_usd: SEAT_PRICE_USD,
    seat_billing: {
      plan: 'workspace_member',
      price_usd: SEAT_PRICE_USD,
      rail: 'custodial_sim',
      simulated: true,
      stripe_live: false,
      note: 'Post-hire company seat invoices persist; mark-paid is custodial-sim until Stripe.',
    },
    placement_billing: {
      fee_bps: PLACEMENT_FEE_BPS,
      rail: 'custodial_sim',
      simulated: true,
      stripe_live: false,
      note: 'Sponsor placement invoices persist at 500 bps; mark-paid is custodial-sim until Stripe.',
    },
    max_depth: 3,
    rails: {
      custodial: { label: 'Card / balance (custodial)', currency: 'USD', simulated: true },
      onchain: { label: 'USDC on Base', currency: 'USDC', chain_id: BASE_CHAIN_ID, token: BASE_USDC_ADDRESS, simulated: !onchain.config().enabled },
    },
    // Real wallet escrow (testnet). enabled=false → the USDC rail stays simulated.
    chain: onchain.config(),
    demo_reset: process.env.DEMO_RESET !== 'off',
    closed_alpha: process.env.CLOSED_ALPHA !== 'off',
  });
});

/**
 * Money + seat stats. "Locked" counts each active escrow's own residual
 * (amount − budget it carved out to sub-jobs) so nested jobs never double count.
 * USD and USDC are summed 1:1 for display.
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const cid = req.query.company_id || null;
  const money = await pool.query(
    `SELECT
       COALESCE(sum(CASE WHEN e.state IN ('funded','in_review') THEN e.amount - COALESCE(c.carved, 0) END), 0) AS locked,
       COALESCE(sum(CASE WHEN e.state = 'paid' THEN e.fee_amount + e.net_to_winner END), 0) AS released,
       COALESCE(sum(CASE WHEN e.state = 'paid' THEN e.fee_amount END), 0) AS fees,
       COALESCE(sum(CASE WHEN e.state = 'paid' THEN e.net_to_winner END), 0) AS paid_to_winners,
       COALESCE(sum(CASE WHEN e.state IN ('expired_refunded','cancelled_refunded') AND j.budget_source <> 'parent_carveout'
                         THEN e.refund_amount END), 0) AS refunded,
       count(*) FILTER (WHERE j.status = 'draft')::int AS jobs_draft,
       count(*) FILTER (WHERE j.status IN ('funded','in_review'))::int AS jobs_open,
       count(*) FILTER (WHERE j.status = 'paid')::int AS jobs_paid,
       count(*) FILTER (WHERE j.status IN ('expired_refunded','cancelled_refunded'))::int AS jobs_refunded,
       count(*)::int AS jobs_total
     FROM jobs j
     JOIN job_escrows e ON e.job_id = j.id
     LEFT JOIN LATERAL (
       SELECT sum(ce.amount) AS carved FROM jobs cj JOIN job_escrows ce ON ce.job_id = cj.id
        WHERE cj.parent_job_id = j.id AND cj.budget_source = 'parent_carveout'
          AND ce.state IN ('funded','in_review','paid')
     ) c ON true
     WHERE ($1::uuid IS NULL OR j.workspace_id = $1)`,
    [cid]
  );
  const seats = await pool.query(
    `SELECT count(*) FILTER (WHERE seat_status = 'pending')::int AS pending,
            count(*) FILTER (WHERE seat_status = 'active')::int AS active,
            count(*) FILTER (WHERE seat_status = 'churned')::int AS churned
       FROM employments WHERE ($1::uuid IS NULL OR workspace_id = $1)`,
    [cid]
  );
  const sponsor = await pool.query(
    `SELECT COALESCE(sum(sc.amount) FILTER (WHERE sc.state IN ('locked','released')), 0) AS committed,
            COALESCE(sum(sc.amount * sc.placement_fee_bps / 10000.0) FILTER (WHERE sc.state IN ('locked','released')), 0) AS placement_fees,
            COALESCE((
              SELECT sum(pi.amount) FROM placement_invoices pi
               JOIN jobs pj ON pj.id = pi.job_id
              WHERE pi.state = 'paid' AND ($1::uuid IS NULL OR pj.workspace_id = $1)
            ), 0) AS placement_fees_paid
       FROM sponsor_contributions sc JOIN jobs j ON j.id = sc.job_id
      WHERE ($1::uuid IS NULL OR j.workspace_id = $1)`,
    [cid]
  );
  const counts = await pool.query(
    `SELECT (SELECT count(*)::int FROM bot_agents WHERE ($1::uuid IS NULL OR workspace_id = $1) AND status = 'active') AS bots_active,
            (SELECT count(*)::int FROM workspace_plugins WHERE ($1::uuid IS NULL OR workspace_id = $1) AND status = 'subscribed') AS plugins,
            (SELECT count(*)::int FROM teams WHERE ($1::uuid IS NULL OR company_id = $1)) AS teams,
            (SELECT count(*)::int FROM roles WHERE ($1::uuid IS NULL OR workspace_id = $1)) AS roles`,
    [cid]
  );
  const s = seats.rows[0];
  res.json({
    ...money.rows[0],
    seats: { ...s, mrr_estimate: s.active * SEAT_PRICE_USD, seat_price_usd: SEAT_PRICE_USD },
    sponsors: sponsor.rows[0],
    ...counts.rows[0],
    fee_bps: PLATFORM_FEE_BPS,
  });
}));

/** Reputation facts (v1): wins + employment retention days. Tiers stay 'open'. */
router.get('/reputation', asyncHandler(async (_req, res) => {
  const r = await pool.query(
    `SELECT wr.*, COALESCE(u.display_name, b.name) AS name, u.handle, b.kind AS bot_kind,
            w.name AS company_name,
            (SELECT count(*)::int FROM submissions s
              WHERE (s.submitter_user_id = wr.user_id OR s.submitter_bot_id = wr.bot_agent_id)) AS entries,
            (SELECT count(*)::int FROM employments em WHERE em.employee_user_id = wr.user_id AND em.seat_status = 'active') AS active_seats,
            -- Retention incl. seats still active (the stored counter only grows on churn).
            wr.employment_days + COALESCE((
              SELECT sum(floor(extract(epoch FROM now() - COALESCE(em.seat_started_at, em.started_at)) / 86400))::int
                FROM employments em WHERE em.employee_user_id = wr.user_id AND em.seat_status = 'active'), 0) AS retention_days
       FROM worker_reputation wr
       LEFT JOIN users u ON u.id = wr.user_id
       LEFT JOIN bot_agents b ON b.id = wr.bot_agent_id
       LEFT JOIN workspaces w ON w.id = b.workspace_id
      ORDER BY retention_days DESC, wr.wins_count DESC, name`
  );
  res.json(r.rows);
}));

/** Wipe and reseed the demo data. Disable in production with DEMO_RESET=off. */
router.post('/demo/seed', asyncHandler(async (_req, res) => {
  if (process.env.DEMO_RESET === 'off') throw new HttpError(403, 'Demo reset is disabled on this deployment.');
  const out = await seed({ reset: true });
  res.json(out);
}));

module.exports = router;
