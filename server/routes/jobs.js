'use strict';

/**
 * Jobs, escrow lifecycle and submissions.
 *
 *   draft → funded → in_review → paid
 *                  ↘ expired_refunded / cancelled_refunded
 *
 * Nested jobs (DESIGN_DIRECTION.md, OPEN_DECISIONS.md — proposed defaults):
 *   D1  fee only on outward release to a winner; carve-outs and refunds 0 bps
 *   D2  refunds bottom-up; a refunded carve-out returns to the parent's budget
 *   D3  the job's employer funds and picks the winner; sponsors never veto
 *   D4  jobs nest at most 3 deep; parents are fixed at creation (no cycles)
 */

const express = require('express');
const { pool, tx } = require('../db');
const { asyncHandler, actorId, required, HttpError } = require('../lib');
const { loadCompany, assertCanPost, assertJobEmployer } = require('../access');
const { adapterFor, carveout } = require('../escrow/adapters');
const { PLATFORM_FEE_BPS, toMinor, fromMinor, releaseBreakdown } = require('../escrow/feeMath');
const onchain = require('../escrow/onchainBase');
const { insertFeedEvent } = require('./feed');

const router = express.Router();

const MAX_JOB_DEPTH = 3;
const ACTIVE = ['funded', 'in_review'];
const TERMINAL = ['paid', 'expired_refunded', 'cancelled_refunded'];

async function lockJob(c, id) {
  const j = await c.query('SELECT * FROM jobs WHERE id = $1 FOR UPDATE', [id]);
  if (!j.rows[0]) throw new HttpError(404, 'job not found');
  const e = await c.query('SELECT * FROM job_escrows WHERE job_id = $1 FOR UPDATE', [id]);
  if (!e.rows[0]) throw new HttpError(400, 'escrow missing');
  return { job: j.rows[0], escrow: e.rows[0] };
}

/**
 * Parent budget still allocatable to new carve-outs:
 * amount − Σ carve-out children that are locked or paid out.
 */
async function parentRemaining(c, parentJobId, parentEscrow) {
  const r = await c.query(
    `SELECT COALESCE(sum(ce.amount), 0)::text AS carved
       FROM jobs cj JOIN job_escrows ce ON ce.job_id = cj.id
      WHERE cj.parent_job_id = $1 AND cj.budget_source = 'parent_carveout'
        AND ce.state IN ('funded', 'in_review', 'paid')`,
    [parentJobId]
  );
  const cur = parentEscrow.currency;
  const carved = toMinor(r.rows[0].carved, cur);
  return { carved, remaining: toMinor(parentEscrow.amount, cur) - carved, currency: cur };
}

/** Σ of carve-out children already paid out (that capital has left through them). */
async function carvedPaid(c, jobId, currency) {
  const r = await c.query(
    `SELECT COALESCE(sum(ce.amount), 0)::text AS paid
       FROM jobs cj JOIN job_escrows ce ON ce.job_id = cj.id
      WHERE cj.parent_job_id = $1 AND cj.budget_source = 'parent_carveout' AND ce.state = 'paid'`,
    [jobId]
  );
  return toMinor(r.rows[0].paid, currency);
}

/**
 * The escrow that actually holds the money for `job`: itself, or (for a
 * carve-out) the nearest ancestor that locked root or expansion capital.
 */
async function fundingOf(db, job) {
  let cur = job;
  while (cur.budget_source === 'parent_carveout' && cur.parent_job_id) {
    cur = (await db.query('SELECT * FROM jobs WHERE id = $1', [cur.parent_job_id])).rows[0];
  }
  const e = (await db.query('SELECT * FROM job_escrows WHERE job_id = $1', [cur.id])).rows[0];
  return { jobId: cur.id, escrow: e, real: Boolean(e && e.meta_json && e.meta_json.mode === 'real') };
}

/** Who receives a winning submission's payout (bots pay their operator). */
async function resolvePayee(db, sub) {
  let payee = sub.submitter_user_id;
  let bot = null;
  if (sub.submitter_type === 'bot') {
    bot = (await db.query('SELECT * FROM bot_agents WHERE id = $1', [sub.submitter_bot_id])).rows[0];
    payee = bot && bot.config_json && bot.config_json.operator_user_id;
    if (!payee) throw new HttpError(400, 'This bot has no operator. Set one on the Bots page so the payout has somewhere to go.');
  }
  const row = (await db.query('SELECT id, display_name, wallet_address FROM users WHERE id = $1', [payee])).rows[0];
  if (!row) throw new HttpError(400, 'payee not found');
  return { payee: row, bot };
}

async function readJob(id) {
  const j = (await pool.query('SELECT * FROM jobs WHERE id = $1', [id])).rows[0];
  if (!j) throw new HttpError(404, 'job not found');
  const e = (await pool.query('SELECT * FROM job_escrows WHERE job_id = $1', [id])).rows[0];
  if (!e) throw new HttpError(400, 'escrow missing');
  return { job: j, escrow: e };
}

function realMeta(proof, extra) {
  const c = onchain.config();
  return {
    sim: false, mode: 'real', chain: 'base', network: c.chain_name, chain_id: c.chain_id,
    escrow_contract: c.escrow, token_address: c.usdc, ...extra,
  };
}

/* ---------- create ---------- */

router.post('/jobs', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const actor = actorId(req);
  const companyId = body.company_id || body.workspace_id;
  if (!companyId) throw new HttpError(400, 'company_id required');
  required(body, ['title', 'requirements', 'amount']);

  const out = await tx(async (c) => {
    const company = await loadCompany(c, companyId);
    const employer = actor || body.employer_user_id || company.employer_user_id;
    await assertCanPost(c, company, employer);

    const deadline = body.deadline_at || new Date(Date.now() + 7 * 864e5).toISOString();
    let parent = null;
    let parentEscrow = null;
    let depth = 1;
    let budgetSource = 'root';
    let rail = body.rail || 'custodial';
    let teamId = body.team_id || null;

    if (body.parent_job_id) {
      ({ job: parent, escrow: parentEscrow } = await lockJob(c, body.parent_job_id));
      if (parent.workspace_id !== company.id) throw new HttpError(400, 'parent job is in another company');
      depth = parent.depth + 1;
      if (depth > MAX_JOB_DEPTH) {
        throw new HttpError(400, `Jobs nest at most ${MAX_JOB_DEPTH} levels deep (D4). This would be level ${depth}.`, { rule: 'depth_cap' });
      }
      budgetSource = body.budget_source || 'parent_carveout';
      if (!['parent_carveout', 'expansion'].includes(budgetSource)) {
        throw new HttpError(400, 'budget_source must be parent_carveout or expansion');
      }
      if (!ACTIVE.includes(parent.status)) {
        throw new HttpError(400, `Sub-jobs need a funded parent. The parent is ${parent.status}.`);
      }
      if (budgetSource === 'parent_carveout') rail = parentEscrow.rail; // same money, same rail
      teamId = teamId || parent.team_id;
    }

    const adapter = adapterFor(rail);
    const currency = budgetSource === 'parent_carveout' ? parentEscrow.currency : adapter.currency;
    let amount;
    try {
      amount = fromMinor(toMinor(body.amount, currency), currency);
    } catch {
      throw new HttpError(400, 'amount must be a positive number');
    }
    if (toMinor(amount, currency) <= 0n) throw new HttpError(400, 'Amount must be greater than zero.');

    if (budgetSource === 'parent_carveout') {
      const { remaining } = await parentRemaining(c, parent.id, parentEscrow);
      if (toMinor(amount, currency) > remaining) {
        throw new HttpError(400,
          `Carve-out exceeds the parent's remaining budget (${fromMinor(remaining, currency)} ${currency}). Use an expansion budget for new capital.`,
          { rule: 'carveout_cap' });
      }
    }

    if (teamId) {
      const t = await c.query('SELECT company_id FROM teams WHERE id = $1', [teamId]);
      if (!t.rows[0] || t.rows[0].company_id !== company.id) throw new HttpError(400, 'sub-team not in this company');
    }

    const j = await c.query(
      `INSERT INTO jobs (workspace_id, employer_user_id, title, requirements, deadline_at, status,
                         parent_job_id, budget_source, budget_parent_escrow_id, root_job_id, team_id, depth)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [company.id, employer, body.title, body.requirements, deadline,
       parent ? parent.id : null, budgetSource,
       budgetSource === 'parent_carveout' ? parentEscrow.id : null,
       parent ? parent.root_job_id : null, teamId, depth]
    );
    let job = j.rows[0];
    if (!parent) {
      job = (await c.query('UPDATE jobs SET root_job_id = id WHERE id = $1 RETURNING *', [job.id])).rows[0];
    }
    const payer = budgetSource === 'parent_carveout' ? parentEscrow.payer_user_id : employer;
    const e = await c.query(
      `INSERT INTO job_escrows (job_id, rail, amount, currency, state, payer_user_id, platform_fee_bps, meta_json)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, jsonb_build_object('budget_source', $7::text))
       RETURNING *`,
      [job.id, rail, amount, currency, payer, PLATFORM_FEE_BPS, budgetSource]
    );
    // Employer reputation is a public, money-free counter. Keep it in the
    // same transaction as the job so profiles never lag the lifecycle.
    await c.query(
      `INSERT INTO employer_reputation (user_id, jobs_posted_count)
       VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE
         SET jobs_posted_count = employer_reputation.jobs_posted_count + 1,
             updated_at = now()`,
      [employer]
    );
    return { job, escrow: e.rows[0] };
  });
  res.status(201).json(out);
}));

/* ---------- read ---------- */

router.get('/jobs', asyncHandler(async (req, res) => {
  const { company_id, workspace_id, status, rail } = req.query;
  const r = await pool.query(
    `SELECT j.*, e.amount, e.currency, e.rail, e.state AS escrow_state, e.fee_amount, e.net_to_winner,
            t.name AS team_name, u.display_name AS employer_name, w.name AS company_name,
            (SELECT count(*)::int FROM submissions s WHERE s.job_id = j.id AND s.status <> 'withdrawn') AS entries,
            (SELECT count(*)::int FROM jobs cj WHERE cj.parent_job_id = j.id) AS children,
            pe.currency AS parent_currency,
            pe.amount - COALESCE(pc.carved, 0) AS parent_remaining
       FROM jobs j
       JOIN workspaces w ON w.id = j.workspace_id
       JOIN users u ON u.id = j.employer_user_id
       LEFT JOIN job_escrows e ON e.job_id = j.id
       LEFT JOIN teams t ON t.id = j.team_id
       LEFT JOIN jobs pj ON pj.id = j.parent_job_id
       LEFT JOIN job_escrows pe ON pe.job_id = pj.id
       LEFT JOIN LATERAL (
         SELECT sum(ce.amount) AS carved
           FROM jobs cj JOIN job_escrows ce ON ce.job_id = cj.id
          WHERE cj.parent_job_id = pj.id AND cj.budget_source = 'parent_carveout'
            AND ce.state IN ('funded', 'in_review', 'paid')
       ) pc ON true
      WHERE ($1::uuid IS NULL OR j.workspace_id = $1)
        AND ($2::text IS NULL OR j.status = $2)
        AND ($3::text IS NULL OR e.rail = $3)
      ORDER BY j.created_at DESC`,
    [company_id || workspace_id || null, status || null, rail || null]
  );
  res.json(r.rows);
}));

async function jobDetail(id) {
  const j = await pool.query(
    `SELECT j.*, w.name AS company_name, w.employer_user_id AS company_owner_id,
            u.display_name AS employer_name, t.name AS team_name
       FROM jobs j JOIN workspaces w ON w.id = j.workspace_id
       JOIN users u ON u.id = j.employer_user_id
       LEFT JOIN teams t ON t.id = j.team_id
      WHERE j.id = $1`,
    [id]
  );
  const job = j.rows[0];
  if (!job) throw new HttpError(404, 'job not found');
  const [escrow, parent, children, subs, employment, sponsors, contributions, bots] = await Promise.all([
    pool.query(
      `SELECT e.*, pu.display_name AS payer_name, wu.display_name AS winner_payee_name
         FROM job_escrows e JOIN users pu ON pu.id = e.payer_user_id
         LEFT JOIN users wu ON wu.id = e.winner_payee_user_id
        WHERE e.job_id = $1`, [id]),
    job.parent_job_id
      ? pool.query(
        `SELECT j.id, j.title, j.status, e.amount, e.currency,
                e.amount - COALESCE(pc.carved, 0) AS remaining
           FROM jobs j
           LEFT JOIN job_escrows e ON e.job_id = j.id
           LEFT JOIN LATERAL (
             SELECT sum(ce.amount) AS carved
               FROM jobs cj JOIN job_escrows ce ON ce.job_id = cj.id
              WHERE cj.parent_job_id = j.id AND cj.budget_source = 'parent_carveout'
                AND ce.state IN ('funded', 'in_review', 'paid')
           ) pc ON true
          WHERE j.id = $1`, [job.parent_job_id])
      : Promise.resolve({ rows: [] }),
    pool.query(
      `SELECT j.id, j.title, j.status, j.budget_source, j.depth, e.amount, e.currency, e.rail
         FROM jobs j LEFT JOIN job_escrows e ON e.job_id = j.id
        WHERE j.parent_job_id = $1 ORDER BY j.created_at`, [id]),
    pool.query(
      `SELECT s.*, u.display_name AS submitter_name, u.handle AS submitter_handle, u.wallet_address AS submitter_wallet,
              op.wallet_address AS bot_operator_wallet,
              b.name AS bot_name, b.kind AS bot_kind, b.config_json->>'operator_user_id' AS bot_operator_id,
              op.display_name AS bot_operator_name,
              COALESCE((SELECT json_agg(a ORDER BY a.created_at) FROM submission_assets a WHERE a.submission_id = s.id), '[]') AS assets
         FROM submissions s
         LEFT JOIN users u ON u.id = s.submitter_user_id
         LEFT JOIN bot_agents b ON b.id = s.submitter_bot_id
         LEFT JOIN users op ON op.id::text = b.config_json->>'operator_user_id'
        WHERE s.job_id = $1 ORDER BY s.created_at`, [id]),
    pool.query(
      `SELECT em.*, u.display_name AS employee_name, ro.name AS role_name
         FROM employments em JOIN users u ON u.id = em.employee_user_id
         LEFT JOIN roles ro ON ro.id = em.role_id
        WHERE em.job_id = $1`, [id]),
    pool.query(
      `SELECT sp.*, u.display_name AS sponsor_person
         FROM sponsors sp LEFT JOIN users u ON u.id = sp.sponsor_user_id
        WHERE sp.job_id = $1 OR sp.workspace_id = $2 ORDER BY sp.created_at`, [id, job.workspace_id]),
    pool.query(
      `SELECT sc.*, sp.name AS sponsor_name,
              (SELECT pi.id FROM placement_invoices pi
                WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC LIMIT 1) AS placement_invoice_id,
              (SELECT pi.amount FROM placement_invoices pi
                WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC LIMIT 1) AS placement_fee_amount,
              (SELECT pi.state FROM placement_invoices pi
                WHERE pi.contribution_id = sc.id AND pi.state IN ('open','paid')
                ORDER BY CASE pi.state WHEN 'paid' THEN 0 ELSE 1 END, pi.created_at DESC LIMIT 1) AS placement_fee_state,
              (SELECT pi.paid_at FROM placement_invoices pi
                WHERE pi.contribution_id = sc.id AND pi.state = 'paid'
                ORDER BY pi.paid_at DESC NULLS LAST LIMIT 1) AS placement_paid_at
         FROM sponsor_contributions sc
         JOIN sponsors sp ON sp.id = sc.sponsor_id WHERE sc.job_id = $1 ORDER BY sc.created_at`, [id]),
    pool.query(
      `SELECT b.*, op.display_name AS operator_name FROM bot_agents b
         LEFT JOIN users op ON op.id::text = b.config_json->>'operator_user_id'
        WHERE b.job_id = $1 ORDER BY b.created_at`, [id]),
  ]);
  const esc = escrow.rows[0] || null;
  let budget = null;
  if (esc) {
    const { carved, remaining } = await parentRemaining(pool, id, esc);
    budget = {
      amount: esc.amount,
      carved_out: fromMinor(carved, esc.currency),
      remaining: fromMinor(remaining, esc.currency),
      currency: esc.currency,
    };
  }
  const f = await fundingOf(pool, job);
  const chain = esc && esc.rail === 'onchain' ? {
    mode: f.real ? 'real' : (f.escrow && f.escrow.state !== 'draft' ? 'sim' : null),
    funding_job_id: f.jobId,
    job_key: onchain.jobKey(f.jobId),
    own_key: onchain.jobKey(job.id),
    // The wallet that locked the funding escrow: the only one that can release/refund it.
    payer_wallet: f.escrow && f.escrow.meta_json ? f.escrow.meta_json.payer_wallet || null : null,
  } : null;
  return {
    job,
    escrow: esc,
    chain,
    budget,
    parent: parent.rows[0] || null,
    children: children.rows,
    submissions: subs.rows,
    employment: employment.rows[0] || null,
    sponsors: sponsors.rows,
    contributions: contributions.rows,
    bots: bots.rows,
    rules: { fee_bps: PLATFORM_FEE_BPS, max_depth: MAX_JOB_DEPTH },
  };
}

router.get('/jobs/:id', asyncHandler(async (req, res) => {
  res.json(await jobDetail(req.params.id));
}));

/* ---------- fund (lock) ---------- */

router.post('/jobs/:id/fund', asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const txHash = req.body && req.body.tx_hash;

  // Real lock: verify the wallet transaction before touching the database.
  let proof = null;
  if (txHash) {
    const { job: pj, escrow: pe } = await readJob(req.params.id);
    if (pe.rail !== 'onchain' || pj.budget_source === 'parent_carveout') {
      throw new HttpError(400, 'Only USDC root or expansion jobs are locked with a wallet transaction.');
    }
    proof = await onchain.verifyEvent(txHash, 'Locked', {
      jobKey: onchain.jobKey(pj.id), amount: toMinor(pe.amount, 'USDC'),
    });
  }

  const out = await tx(async (c) => {
    const { job, escrow } = await lockJob(c, req.params.id);
    await assertJobEmployer(c, job, actor, 'fund');
    if (job.status !== 'draft') throw new HttpError(400, `job status is ${job.status}, expected draft`);

    let lock;
    if (job.budget_source === 'parent_carveout') {
      const { job: parent, escrow: pe } = await lockJob(c, job.parent_job_id);
      if (!ACTIVE.includes(parent.status)) throw new HttpError(400, `Parent job is ${parent.status}. Carve-outs need a funded parent.`);
      const { remaining } = await parentRemaining(c, parent.id, pe);
      if (toMinor(escrow.amount, escrow.currency) > remaining) {
        throw new HttpError(400, `Parent only has ${fromMinor(remaining, pe.currency)} ${pe.currency} left to carve out.`, { rule: 'carveout_cap' });
      }
      lock = carveout.lock(escrow.id, { parentEscrowId: pe.id });
      const f = await fundingOf(c, job);
      lock.meta = { ...lock.meta, mode: f.real ? 'real' : 'sim', funding_job_id: f.jobId };
    } else if (proof) {
      const key = onchain.jobKey(job.id);
      const cfg = onchain.config();
      lock = {
        escrowRef: `${cfg.chain_id}:${cfg.escrow}#${key}`,
        txRef: proof.tx,
        meta: realMeta(proof, { job_key: key, payer_wallet: proof.args.employer, lock_tx: proof.tx, lock_block: proof.block }),
      };
      await onchain.recordTx(c, proof, job.id, 'lock');
      await c.query('UPDATE users SET wallet_address = $2 WHERE id = $1 AND wallet_address IS NULL',
        [escrow.payer_user_id, proof.args.employer]);
    } else {
      const adapter = adapterFor(escrow.rail);
      let wallet = null;
      if (escrow.rail === 'onchain') {
        const payer = await c.query('SELECT wallet_address FROM users WHERE id = $1', [escrow.payer_user_id]);
        wallet = (req.body && req.body.wallet_address) || payer.rows[0].wallet_address;
      }
      lock = adapter.lock(escrow.id, { payerWallet: wallet });
      lock.meta.mode = 'sim';
    }

    const e = await c.query(
      `UPDATE job_escrows
          SET state = 'funded', funded_at = now(), escrow_ref = $2, meta_json = meta_json || $3::jsonb
        WHERE id = $1 RETURNING *`,
      [escrow.id, lock.escrowRef, JSON.stringify({ ...lock.meta, fee_on_lock: '0' })]
    );
    const j = await c.query(`UPDATE jobs SET status = 'funded' WHERE id = $1 RETURNING *`, [job.id]);
    await insertFeedEvent(c, {
      kind: 'job_funded',
      actor_user_id: job.employer_user_id,
      company_id: job.workspace_id,
      job_id: job.id,
      payload: { title: job.title, badge: 'funded', status: 'funded' },
    });
    return { job: j.rows[0], escrow: e.rows[0], tx_ref: lock.txRef || null };
  });
  res.json(out);
}));

/* ---------- review ---------- */

router.post('/jobs/:id/review', asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const out = await tx(async (c) => {
    const { job } = await lockJob(c, req.params.id);
    await assertJobEmployer(c, job, actor, 'review');
    if (job.status !== 'funded') throw new HttpError(400, `expected funded, got ${job.status}`);
    const j = await c.query(`UPDATE jobs SET status = 'in_review' WHERE id = $1 RETURNING *`, [job.id]);
    const e = await c.query(`UPDATE job_escrows SET state = 'in_review' WHERE job_id = $1 RETURNING *`, [job.id]);
    return { job: j.rows[0], escrow: e.rows[0] };
  });
  res.json(out);
}));

/* ---------- pay exactly one winner ---------- */

router.post('/jobs/:id/pay', asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const { submission_id, role_id } = req.body || {};
  if (!submission_id) throw new HttpError(400, 'submission_id required');
  const txHash = req.body && req.body.tx_hash;

  // Real release: the employer's wallet must have called release() for exactly
  // this winner and amount. Verify before opening the DB transaction.
  let proof = null;
  {
    const { job: pj, escrow: pe } = await readJob(req.params.id);
    const f = await fundingOf(pool, pj);
    if (f.real) {
      if (!txHash) throw new HttpError(400, "This payout is locked on-chain. Release it from the employer's wallet.", { rule: 'needs_tx' });
      const sub = (await pool.query('SELECT * FROM submissions WHERE id = $1 AND job_id = $2', [submission_id, pj.id])).rows[0];
      if (!sub) throw new HttpError(404, 'submission not found on this job');
      const { payee } = await resolvePayee(pool, sub);
      if (!payee.wallet_address) throw new HttpError(400, `${payee.display_name} has no wallet address to receive USDC.`);
      const residual = toMinor(pe.amount, 'USDC') - (await carvedPaid(pool, pj.id, 'USDC'));
      proof = await onchain.verifyEvent(txHash, 'Released', {
        jobKey: onchain.jobKey(f.jobId), winner: payee.wallet_address, amount: residual,
      });
    } else if (txHash) {
      throw new HttpError(400, 'This escrow is simulated; no wallet transaction is needed.');
    }
  }

  const out = await tx(async (c) => {
    const { job, escrow } = await lockJob(c, req.params.id);
    await assertJobEmployer(c, job, actor, 'pay');
    if (!ACTIVE.includes(job.status)) throw new HttpError(400, `cannot pay from status ${job.status}`);

    const open = await c.query(
      `SELECT cj.title FROM jobs cj WHERE cj.parent_job_id = $1
          AND cj.budget_source = 'parent_carveout' AND cj.status IN ('funded', 'in_review')`,
      [job.id]
    );
    if (open.rowCount) {
      throw new HttpError(400,
        `Close carve-out sub-jobs first (${open.rows.map((r) => r.title).join(', ')}). Their budget is still part of this escrow.`,
        { rule: 'children_open' });
    }

    const subRes = await c.query('SELECT * FROM submissions WHERE id = $1 AND job_id = $2 FOR UPDATE', [submission_id, job.id]);
    const sub = subRes.rows[0];
    if (!sub) throw new HttpError(404, 'submission not found on this job');
    if (sub.status !== 'submitted') throw new HttpError(400, `submission is ${sub.status}`);

    // Resolve who actually receives the money.
    const { payee: payeeRow, bot } = await resolvePayee(c, sub);
    const payee = payeeRow.id;

    // D1: only the residual that leaves the tree is released (and charged).
    const cur = escrow.currency;
    const carved = await carvedPaid(c, job.id, cur);
    const residual = toMinor(escrow.amount, cur) - carved;
    if (residual <= 0n) throw new HttpError(400, 'The whole budget went to sub-jobs. There is nothing left to release at this level.');
    const bps = Number(escrow.platform_fee_bps ?? PLATFORM_FEE_BPS);
    const fee = releaseBreakdown(fromMinor(residual, cur), cur, bps);

    if (job.status === 'funded') {
      await c.query(`UPDATE jobs SET status = 'in_review' WHERE id = $1`, [job.id]);
      await c.query(`UPDATE job_escrows SET state = 'in_review' WHERE id = $1`, [escrow.id]);
    }

    let release;
    if (proof) {
      // State may have moved while we waited for the chain: re-check the match.
      if (proof.args.amount !== residual) throw new HttpError(409, 'The escrow changed while confirming. Refresh and retry.');
      if (proof.args.fee !== toMinor(fee.fee_amount, cur)) {
        throw new HttpError(400, 'The escrow contract charged a different fee than Lockwork expects (250 bps).');
      }
      release = {
        txRef: proof.tx,
        meta: realMeta(proof, { release_tx: proof.tx, release_block: proof.block, winner_wallet: proof.args.winner }),
      };
      await onchain.recordTx(c, proof, job.id, 'release');
    } else {
      // Carve-out escrows inherit the parent's rail, so they pay out on it too.
      release = adapterFor(escrow.rail).release(escrow.escrow_ref, { winnerWallet: payeeRow.wallet_address });
    }
    if (job.budget_source === 'parent_carveout') release.meta.via_carveout = true;

    await c.query(`UPDATE submissions SET status = 'selected' WHERE id = $1`, [sub.id]);
    await c.query(
      `UPDATE submissions SET status = 'rejected' WHERE job_id = $1 AND id <> $2 AND status = 'submitted'`,
      [job.id, sub.id]
    );
    // Reputation wins_count is bumped by trigger jobs_paid_reputation (migration 017).
    const paidJob = await c.query(
      `UPDATE jobs SET status = 'paid', winner_submission_id = $2 WHERE id = $1 RETURNING *`,
      [job.id, sub.id]
    );
    const paidEscrow = await c.query(
      `UPDATE job_escrows
          SET state = 'paid', winner_payee_user_id = $2, fee_amount = $3, net_to_winner = $4,
              carved_out_amount = $5, released_at = now(),
              meta_json = meta_json || $6::jsonb
        WHERE id = $1 RETURNING *`,
      [escrow.id, payee, fee.fee_amount, fee.net_to_winner, fromMinor(carved, cur),
       JSON.stringify({ ...release.meta, release_tx: release.txRef })]
    );

    // Winner joins the company. Bots don't hold employment; they get promoted into roles instead.
    let employment = null;
    if (sub.submitter_type === 'user') {
      employment = (await c.query(
        `INSERT INTO employments (workspace_id, employer_user_id, employee_user_id, job_id, role_id, seat_status, seat_plan)
         VALUES ($1, $2, $3, $4, $5, 'pending', 'workspace_member')
         RETURNING *`,
        [job.workspace_id, job.employer_user_id, payee, job.id, role_id || null]
      )).rows[0];
      if (role_id) {
        await c.query(
          `INSERT INTO role_assignments (role_id, principal_type, user_id) VALUES ($1, 'user', $2)
           ON CONFLICT DO NOTHING`,
          [role_id, payee]
        );
      }
    }

    // Brief step 7: job-scoped bots shut down once the job is decided (a winning bot stays up).
    const stopped = await c.query(
      `UPDATE bot_agents SET status = 'stopped'
        WHERE job_id = $1 AND kind = 'job_scoped' AND status = 'active' AND id IS DISTINCT FROM $2
        RETURNING id, name`,
      [job.id, bot ? bot.id : null]
    );

    await c.query(
      `INSERT INTO employer_reputation (user_id, jobs_paid_out_count)
       VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE
         SET jobs_paid_out_count = employer_reputation.jobs_paid_out_count + 1,
             updated_at = now()`,
      [job.employer_user_id]
    );
    await insertFeedEvent(c, {
      kind: 'paid_hired',
      actor_user_id: payee,
      company_id: job.workspace_id,
      job_id: job.id,
      payload: {
        title: job.title,
        badge: 'hired',
        status: 'paid',
        winner_type: sub.submitter_type,
      },
    });

    return {
      job: paidJob.rows[0],
      escrow: paidEscrow.rows[0],
      employment,
      winner_submission: sub,
      payee: payeeRow,
      winner_bot: bot,
      bots_stopped: stopped.rows,
      tx_ref: release.txRef,
      fee: {
        platform_fee_bps: bps,
        released: fee.amount,
        fee_amount: fee.fee_amount,
        net_to_winner: fee.net_to_winner,
        carved_out_to_sub_jobs: fromMinor(carved, cur),
        currency: cur,
      },
    };
  });
  res.json(out);
}));

/* ---------- cancel / expire → refund (D2 bottom-up) ---------- */

router.post('/jobs/:id/cancel', asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const reason = (req.body && req.body.reason) || 'cancelled';
  if (!['cancelled', 'expired'].includes(reason)) throw new HttpError(400, 'reason must be cancelled or expired');
  const txHash = req.body && req.body.tx_hash;

  // Real refund of root/expansion capital: verify the wallet's refund() first.
  let proof = null;
  {
    const { job: pj, escrow: pe } = await readJob(req.params.id);
    const f = await fundingOf(pool, pj);
    const ownsFunds = pj.budget_source !== 'parent_carveout';
    if (f.real && ownsFunds && ACTIVE.includes(pj.status)) {
      if (!txHash) throw new HttpError(400, "This escrow is locked on-chain. Refund it from the employer's wallet.", { rule: 'needs_tx' });
      const refund = toMinor(pe.amount, 'USDC') - (await carvedPaid(pool, pj.id, 'USDC'));
      proof = await onchain.verifyEvent(txHash, 'Refunded', { jobKey: onchain.jobKey(pj.id), amount: refund });
    }
  }

  const out = await tx(async (c) => {
    const { job, escrow } = await lockJob(c, req.params.id);
    await assertJobEmployer(c, job, actor, 'cancel');

    const kids = await c.query('SELECT count(*)::int AS n FROM jobs WHERE parent_job_id = $1', [job.id]);
    if (job.status === 'draft') {
      if (kids.rows[0].n) throw new HttpError(400, 'Delete or cancel this draft\'s sub-jobs first.');
      await c.query('DELETE FROM jobs WHERE id = $1', [job.id]);
      return { deleted: true, job_id: job.id };
    }
    if (!ACTIVE.includes(job.status)) throw new HttpError(400, `Job is already ${job.status}.`);
    if (reason === 'expired' && new Date(job.deadline_at) > new Date()) {
      throw new HttpError(400, 'The deadline has not passed yet. Use cancel instead.');
    }

    const openDesc = await c.query(
      `WITH RECURSIVE d AS (
         SELECT id, title, status FROM jobs WHERE parent_job_id = $1
         UNION ALL
         SELECT j.id, j.title, j.status FROM jobs j JOIN d ON j.parent_job_id = d.id
       ) SELECT title, status FROM d WHERE status IN ('funded', 'in_review')`,
      [job.id]
    );
    if (openDesc.rowCount) {
      throw new HttpError(400,
        `Refunds run bottom-up (D2). Close these sub-jobs first: ${openDesc.rows.map((r) => r.title).join(', ')}.`,
        { rule: 'children_open', open: openDesc.rows });
    }

    const cur = escrow.currency;
    const carved = await carvedPaid(c, job.id, cur);
    const refund = fromMinor(toMinor(escrow.amount, cur) - carved, cur);
    let meta;
    if (job.budget_source === 'parent_carveout') {
      meta = { refund_to: 'parent_escrow', parent_job_id: job.parent_job_id, fee_on_refund: '0' };
    } else if (proof) {
      if (proof.args.amount !== toMinor(refund, cur)) throw new HttpError(409, 'The escrow changed while confirming. Refresh and retry.');
      meta = realMeta(proof, { refund_to: 'payer', refund_tx: proof.tx, refund_block: proof.block, fee_on_refund: '0', refund_reason: reason });
      await onchain.recordTx(c, proof, job.id, 'refund');
    } else {
      const r = adapterFor(escrow.rail).refund(escrow.escrow_ref, reason);
      meta = { ...r.meta, refund_to: 'payer', refund_tx: r.txRef, fee_on_refund: '0' };
    }
    const state = reason === 'expired' ? 'expired_refunded' : 'cancelled_refunded';
    const e = await c.query(
      `UPDATE job_escrows SET state = $2, refunded_at = now(), refund_amount = $3, carved_out_amount = $4,
              meta_json = meta_json || $5::jsonb
        WHERE id = $1 RETURNING *`,
      [escrow.id, state, refund, fromMinor(carved, cur), JSON.stringify(meta)]
    );
    const j = await c.query('UPDATE jobs SET status = $2 WHERE id = $1 RETURNING *', [job.id, state]);
    await c.query(
      `UPDATE bot_agents SET status = 'stopped' WHERE job_id = $1 AND kind = 'job_scoped' AND status = 'active'`,
      [job.id]
    );
    return { job: j.rows[0], escrow: e.rows[0], refund: { amount: refund, currency: cur, fee: '0', to: meta.refund_to } };
  });
  res.json(out);
}));

/* ---------- submissions ---------- */

router.post('/jobs/:id/submissions', asyncHandler(async (req, res) => {
  const { submitter_user_id, submitter_bot_id, demo_url, notes, assets } = req.body || {};
  if (!submitter_user_id === !submitter_bot_id) {
    throw new HttpError(400, 'Provide exactly one of submitter_user_id or submitter_bot_id.');
  }
  if (!demo_url) throw new HttpError(400, 'demo_url required. The bid is the work.');

  const out = await tx(async (c) => {
    const job = (await c.query('SELECT * FROM jobs WHERE id = $1', [req.params.id])).rows[0];
    if (!job) throw new HttpError(404, 'job not found');
    if (job.status !== 'funded') {
      const why = job.status === 'draft' ? 'the payout is not locked yet' : `the job is ${job.status}`;
      throw new HttpError(400, `Entries are closed: ${why}.`);
    }
    if (new Date(job.deadline_at) < new Date()) throw new HttpError(400, 'The deadline has passed.');
    if (submitter_user_id && submitter_user_id === job.employer_user_id) {
      throw new HttpError(400, 'The employer cannot enter their own job.');
    }
    let feedActor = submitter_user_id || null;
    let feedActorLabel = null;
    if (submitter_bot_id) {
      const b = (await c.query('SELECT * FROM bot_agents WHERE id = $1', [submitter_bot_id])).rows[0];
      if (!b) throw new HttpError(404, 'bot not found');
      if (b.workspace_id !== job.workspace_id) throw new HttpError(400, 'bot belongs to another company');
      if (b.status !== 'active') throw new HttpError(400, 'bot is stopped');
      feedActor = b.config_json && b.config_json.operator_user_id ? b.config_json.operator_user_id : null;
      feedActorLabel = b.name;
    }
    const s = await c.query(
      `INSERT INTO submissions (job_id, submitter_type, submitter_user_id, submitter_bot_id, demo_url, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted') RETURNING *`,
      [job.id, submitter_bot_id ? 'bot' : 'user', submitter_user_id || null, submitter_bot_id || null, demo_url, notes || null]
    );
    const saved = [];
    for (const a of Array.isArray(assets) ? assets : []) {
      if (!a || !a.url) continue;
      const r = await c.query(
        `INSERT INTO submission_assets (submission_id, kind, url, label) VALUES ($1, $2, $3, $4) RETURNING *`,
        [s.rows[0].id, a.kind === 'file' ? 'file' : 'link', a.url, a.label || null]
      );
      saved.push(r.rows[0]);
    }
    await insertFeedEvent(c, {
      kind: 'submission',
      actor_user_id: feedActor,
      company_id: job.workspace_id,
      job_id: job.id,
      payload: {
        title: job.title,
        badge: 'submitted',
        status: 'submitted',
        ...(feedActorLabel ? { actor_label: feedActorLabel, actor_type: 'bot' } : { actor_type: 'user' }),
      },
    });
    return { ...s.rows[0], assets: saved };
  });
  res.status(201).json(out);
}));

router.post('/submissions/:id/withdraw', asyncHandler(async (req, res) => {
  const out = await tx(async (c) => {
    const s = (await c.query('SELECT * FROM submissions WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!s) throw new HttpError(404, 'submission not found');
    const job = (await c.query('SELECT status FROM jobs WHERE id = $1', [s.job_id])).rows[0];
    if (job.status !== 'funded') throw new HttpError(400, 'Entries are read-only once review starts.');
    if (s.status !== 'submitted') throw new HttpError(400, `submission is ${s.status}`);
    return (await c.query(`UPDATE submissions SET status = 'withdrawn' WHERE id = $1 RETURNING *`, [s.id])).rows[0];
  });
  res.json(out);
}));

router.get('/jobs/:id/employments', asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT * FROM employments WHERE job_id = $1', [req.params.id]);
  res.json(r.rows);
}));

module.exports = router;
module.exports.jobDetail = jobDetail;
module.exports.TERMINAL = TERMINAL;
