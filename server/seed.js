'use strict';

/**
 * Demo seed: one fully populated company so every screen has something to show.
 * Goes through the real HTTP API (in-process), then backdates a few timestamps
 * so history, seats and reputation look lived-in.
 *
 * Usage: node seed.js   (wipes demo tables first)
 */

const crypto = require('crypto');
const { pool } = require('./db');

const TABLES = [
  'sponsor_contributions', 'sponsors', 'workspace_plugins', 'employments', 'submission_assets',
  'submissions', 'job_escrows', 'role_assignments', 'bot_agents', 'jobs', 'teams', 'roles',
  'worker_reputation', 'workspaces', 'users',
];

async function withServer(fn) {
  const { app } = require('./server'); // lazy: server.js requires this module
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const api = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`seed ${method} ${path}: ${data.error || r.status}`);
    return data;
  };
  try {
    return await fn(api);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
}

const wallet = (seed) => '0x' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 40);
// Seeded entries point at a built-in read-only preview page so demo links render.
const preview = (kind, title, by) =>
  `/demo-entry.html?${new URLSearchParams({ kind, title, by })}`;
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();

async function seed({ reset = true } = {}) {
  if (reset) await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

  return withServer(async (api) => {
    // People — roles anyone can fill (employer / employee / sponsor).
    const dante = await api('POST', '/people', { handle: 'dante', display_name: 'Dante Final', email: 'dante@lockwork.demo', wallet_address: wallet('dante') });
    const maya = await api('POST', '/people', { handle: 'maya', display_name: 'Maya Chen', wallet_address: wallet('maya') });
    const leo = await api('POST', '/people', { handle: 'leo', display_name: 'Leo Okafor', wallet_address: wallet('leo') });
    const sam = await api('POST', '/people', { handle: 'sam', display_name: 'Sam Rivera', wallet_address: wallet('sam') });
    const priya = await api('POST', '/people', { handle: 'priya', display_name: 'Priya Nair', wallet_address: wallet('priya') });
    const ivy = await api('POST', '/people', { handle: 'ivy', display_name: 'Ivy Park' });

    const co = await api('POST', '/companies', { name: 'Atlas Demo Co', slug: 'atlas-demo', employer_user_id: dante.id });

    // Sub-teams (company → sub-team → sub-team).
    const automation = await api('POST', `/companies/${co.id}/teams`, { name: 'Automation' });
    const growth = await api('POST', `/companies/${co.id}/teams`, { name: 'Growth' });
    await api('POST', `/companies/${co.id}/teams`, { name: 'Onchain Ops', parent_team_id: automation.id });

    // Roles.
    const founder = await api('POST', `/companies/${co.id}/roles`, { name: 'Founder', can_mint_roles: true });
    const engLead = await api('POST', `/companies/${co.id}/roles`, { name: 'Engineering Lead', parent_role_id: founder.id, can_mint_roles: true });
    const autoEng = await api('POST', `/companies/${co.id}/roles`, { name: 'Automation Engineer', parent_role_id: engLead.id });
    const growthDesigner = await api('POST', `/companies/${co.id}/roles`, { name: 'Growth Designer', parent_role_id: founder.id });
    await api('POST', `/roles/${founder.id}/assignments`, { user_id: dante.id });
    await api('POST', `/roles/${engLead.id}/assignments`, { user_id: sam.id });

    // Bots: one lead bot for Engineering Lead, one standing worker.
    const forge = await api('POST', `/companies/${co.id}/bots`, { name: 'Forge', kind: 'lead', managing_role_id: engLead.id, operator_user_id: sam.id, tools: ['repo', 'ide', 'ci'] });
    await api('POST', `/roles/${engLead.id}/assignments`, { bot_agent_id: forge.id });
    const quill = await api('POST', `/companies/${co.id}/bots`, { name: 'Quill', kind: 'worker', parent_bot_id: forge.id, operator_user_id: sam.id, tools: ['repo', 'docs'] });
    await api('POST', `/roles/${autoEng.id}/assignments`, { bot_agent_id: quill.id });

    // Plugins.
    const grants = await api('POST', `/companies/${co.id}/sponsors`, {
      name: 'Builder Grants Fund', kinds: ['financing', 'software'], sponsor_user_id: priya.id,
      details: 'Co-locks escrow on automation jobs and covers Repo seats for winners.',
    });
    await api('POST', `/companies/${co.id}/plugins`, { key: 'ide' });
    await api('POST', `/companies/${co.id}/plugins`, { key: 'repo', sponsor_id: grants.id });
    const video = await api('POST', `/companies/${co.id}/plugins`, { key: 'video_edit' });
    await api('PATCH', `/company-plugins/${video.id}`, { status: 'paused' });

    // --- History: two past contests that already hired someone. ---
    const past1 = await api('POST', '/jobs', {
      company_id: co.id, team_id: automation.id, title: 'Data-pipeline cleanup script',
      requirements: 'Dedupe + normalize the CSV exports; one command; README.', amount: 900, rail: 'custodial', deadline_at: days(3),
    });
    await api('POST', `/jobs/${past1.job.id}/fund`);
    const p1s = await api('POST', `/jobs/${past1.job.id}/submissions`, { submitter_user_id: leo.id, demo_url: preview('bot', 'Pipeline cleanup', 'Leo Okafor'), notes: 'Runs in 4s on the sample export.' });
    await api('POST', `/jobs/${past1.job.id}/pay`, { submission_id: p1s.id, role_id: autoEng.id });

    const past2 = await api('POST', '/jobs', {
      company_id: co.id, team_id: growth.id, title: 'Launch-ready landing page + waitlist',
      requirements: 'One page, mobile-first, waitlist form wired to a sheet. Ship a live URL.', amount: 1500, rail: 'custodial', deadline_at: days(3),
    });
    await api('POST', `/jobs/${past2.job.id}/fund`);
    const p2a = await api('POST', `/jobs/${past2.job.id}/submissions`, {
      submitter_user_id: maya.id, demo_url: preview('landing', 'Launch waitlist', 'Maya Chen'), notes: 'Lighthouse 98 mobile.',
      assets: [{ kind: 'link', url: preview('landing', 'Design source', 'Maya Chen'), label: 'Figma source' }],
    });
    await api('POST', `/jobs/${past2.job.id}/submissions`, { submitter_user_id: ivy.id, demo_url: preview('landing', 'Waitlist page', 'Ivy Park'), notes: 'Framer build.' });
    await api('POST', `/jobs/${past2.job.id}/pay`, { submission_id: p2a.id, role_id: growthDesigner.id });

    // --- Live: $10k USDC root with carve-outs (D1 fee story). ---
    const root = await api('POST', '/jobs', {
      company_id: co.id, team_id: automation.id, title: 'Treasury automation bot: MVP',
      requirements: 'Watch the treasury multisig, alert on policy breaches, propose rebalances. Demo on Base Sepolia.',
      amount: 10000, rail: 'onchain', deadline_at: days(12),
    });
    await api('POST', `/jobs/${root.job.id}/fund`);
    const leafA = await api('POST', '/jobs', {
      company_id: co.id, parent_job_id: root.job.id, budget_source: 'parent_carveout',
      title: 'Wallet-watcher alerts service', requirements: 'Webhook + Telegram alerts for outflows over threshold.', amount: 4000, deadline_at: days(9),
    });
    await api('POST', `/jobs/${leafA.job.id}/fund`);
    const leafB = await api('POST', '/jobs', {
      company_id: co.id, parent_job_id: root.job.id, budget_source: 'parent_carveout',
      title: 'Signer policy & multisig flow', requirements: 'Policy file + 2-of-3 signing flow with a dry-run mode.', amount: 3000, deadline_at: days(9),
    });
    await api('POST', `/jobs/${leafB.job.id}/fund`);
    // Depth 3: an expansion (new capital) sub-job under a carve-out, left in draft.
    await api('POST', '/jobs', {
      company_id: co.id, parent_job_id: leafB.job.id, budget_source: 'expansion',
      title: 'Policy audit checklist', requirements: 'Independent checklist review of the signer policy.', amount: 500, rail: 'onchain', deadline_at: days(8),
    });

    // Job-scoped bot spun up for the alerts leaf.
    const scout = await api('POST', `/companies/${co.id}/bots`, { name: 'Scout-7', kind: 'job_scoped', job_id: leafA.job.id, operator_user_id: sam.id, tools: ['repo', 'ide'] });
    await api('POST', `/jobs/${leafA.job.id}/submissions`, {
      submitter_user_id: leo.id, demo_url: preview('service', 'Wallet watcher', 'Leo Okafor'), notes: 'Alerts in <2s; Telegram + Discord.',
      assets: [{ kind: 'link', url: preview('service', 'Repo README', 'Leo Okafor'), label: 'Repo' }],
    });
    await api('POST', `/jobs/${leafA.job.id}/submissions`, {
      submitter_bot_id: scout.id, demo_url: preview('bot', 'Wallet watcher (auto)', 'Scout-7'), notes: 'Autogenerated by Scout-7; 94% test coverage.',
      assets: [{ kind: 'file', url: preview('bot', 'Test report', 'Scout-7'), label: 'Test report.pdf' }],
    });

    // Signer leaf: a bot won it, so the payout routes to its operator (Sam).
    const quillEntry = await api('POST', `/jobs/${leafB.job.id}/submissions`, { submitter_bot_id: quill.id, demo_url: preview('bot', 'Signer policy flow', 'Quill'), notes: 'Dry-run mode + policy linter.' });
    await api('POST', `/jobs/${leafB.job.id}/submissions`, { submitter_user_id: maya.id, demo_url: preview('service', 'Signer flow', 'Maya Chen') });
    await api('POST', `/jobs/${leafB.job.id}/pay`, { submission_id: quillEntry.id });

    await api('POST', `/jobs/${root.job.id}/submissions`, { submitter_user_id: maya.id, demo_url: preview('service', 'Treasury MVP', 'Maya Chen'), notes: 'Integrates both services end to end.' });

    // --- Live: custodial video job with a sponsor co-lock. ---
    const video1 = await api('POST', '/jobs', {
      company_id: co.id, team_id: growth.id, title: '30-second product explainer video',
      requirements: 'Script + edit. 1080x1920 and 1920x1080. Captions burned in.', amount: 2000, rail: 'custodial', deadline_at: days(10),
    });
    await api('POST', `/jobs/${video1.job.id}/fund`);
    await api('POST', `/jobs/${video1.job.id}/submissions`, { submitter_user_id: ivy.id, demo_url: preview('video', 'Product explainer', 'Ivy Park'), notes: 'Two cuts attached.' });
    await api('POST', `/jobs/${video1.job.id}/submissions`, { submitter_user_id: leo.id, demo_url: preview('video', 'Explainer v2', 'Leo Okafor') });
    const c1 = await api('POST', `/sponsors/${grants.id}/contributions`, { job_id: video1.job.id, kind: 'co_lock', amount: 600 });
    await api('PATCH', `/contributions/${c1.id}`, { state: 'locked' });
    await api('POST', `/sponsors/${grants.id}/contributions`, { job_id: root.job.id, kind: 'top_up', amount: 1000, currency: 'USDC' });
    await api('POST', `/companies/${co.id}/sponsors`, {
      name: 'PrintRun', kinds: ['materials', 'services'], job_id: video1.job.id,
      details: 'Prints and ships launch merch for the winning cut.',
    });

    // --- Refunded: shows refunds are free. ---
    const refunded = await api('POST', '/jobs', {
      company_id: co.id, team_id: growth.id, title: 'Discord onboarding script',
      requirements: 'Welcome flow + role picker.', amount: 800, rail: 'custodial', deadline_at: days(5),
    });
    await api('POST', `/jobs/${refunded.job.id}/fund`);
    await api('POST', `/jobs/${refunded.job.id}/cancel`, { reason: 'cancelled' });

    // --- Draft on USDC: lock it live in the meeting. ---
    await api('POST', '/jobs', {
      company_id: co.id, title: 'Pitch deck polish (10 slides)',
      requirements: 'Tighten story + visuals. Deliver Figma + PDF.', amount: 1200, rail: 'onchain', deadline_at: days(7),
    });

    // Backdate history so seats and reputation look real.
    await pool.query(
      `UPDATE jobs SET created_at = now() - interval '130 days', deadline_at = now() - interval '122 days' WHERE id = $1`, [past1.job.id]);
    await pool.query(
      `UPDATE job_escrows SET funded_at = now() - interval '129 days', released_at = now() - interval '122 days' WHERE job_id = $1`, [past1.job.id]);
    await pool.query(
      `UPDATE submissions SET created_at = now() - interval '124 days' WHERE job_id = $1`, [past1.job.id]);
    await pool.query(
      `UPDATE employments SET started_at = now() - interval '122 days', seat_status = 'active',
              seat_started_at = now() - interval '120 days' WHERE job_id = $1`, [past1.job.id]);
    await pool.query(
      `UPDATE employments SET seat_status = 'churned', ended_at = now() - interval '75 days' WHERE job_id = $1`, [past1.job.id]);

    await pool.query(
      `UPDATE jobs SET created_at = now() - interval '52 days', deadline_at = now() - interval '44 days' WHERE id = $1`, [past2.job.id]);
    await pool.query(
      `UPDATE job_escrows SET funded_at = now() - interval '51 days', released_at = now() - interval '43 days' WHERE job_id = $1`, [past2.job.id]);
    await pool.query(
      `UPDATE submissions SET created_at = now() - interval '46 days' WHERE job_id = $1`, [past2.job.id]);
    await pool.query(
      `UPDATE employments SET started_at = now() - interval '43 days', seat_status = 'active',
              seat_started_at = now() - interval '41 days' WHERE job_id = $1`, [past2.job.id]);

    return { ok: true, company_id: co.id, people: 6 };
  });
}

if (require.main === module) {
  const { migrate } = require('./migrate');
  migrate({ log: () => {} })
    .then(() => seed())
    .then((r) => { console.log('seeded', r); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
