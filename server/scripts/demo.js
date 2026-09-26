'use strict';

/**
 * End-to-end API smoke test against a running server.
 * Usage: node scripts/demo.js [baseUrl]
 *
 * Covers: custodial + on-chain (sim) rails, a bot entry paid to its operator,
 * a carve-out sub-job (0 fee), a refund (0 fee), and the sponsor/depth rules.
 */
const BASE = process.argv[2] || process.env.STUB_BASE || 'http://127.0.0.1:3847';

async function api(method, path, body, as) {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers['X-Lockwork-As'] = as;
  const r = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `${r.status} ${r.statusText}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function expectFail(status, fn, label) {
  try {
    await fn();
  } catch (e) {
    if (e.status === status) return console.log(`  ✓ ${label} → ${status}: ${e.message}`);
    throw new Error(`${label}: expected ${status}, got ${e.status} ${e.message}`);
  }
  throw new Error(`${label}: expected ${status}, but it succeeded`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const ts = Date.now().toString(36);
  console.log('demo against', BASE);
  await api('GET', '/health');

  const emp = await api('POST', '/people', { handle: `emp_${ts}`, display_name: `Employer ${ts}` });
  const wrk = await api('POST', '/people', { handle: `wrk_${ts}`, display_name: `Worker ${ts}` });
  const op = await api('POST', '/people', { handle: `op_${ts}`, display_name: `Operator ${ts}` });
  const spon = await api('POST', '/people', { handle: `sp_${ts}`, display_name: `Sponsor ${ts}` });
  const co = await api('POST', '/companies', { name: `Demo ${ts}`, employer_user_id: emp.id });
  await api('POST', `/companies/${co.id}/sponsors`, { name: 'Fund', kinds: ['financing'], sponsor_user_id: spon.id });

  // 1. Custodial rail: human winner → hired.
  const a = await api('POST', '/jobs', { company_id: co.id, title: 'Landing page', requirements: 'One URL', amount: 1000, rail: 'custodial' });
  await api('POST', `/jobs/${a.job.id}/fund`);
  const sa = await api('POST', `/jobs/${a.job.id}/submissions`, { submitter_user_id: wrk.id, demo_url: 'https://example.com/a' });
  await expectFail(403, () => api('POST', `/jobs/${a.job.id}/pay`, { submission_id: sa.id }, spon.id), 'sponsor picks winner');
  await api('POST', `/jobs/${a.job.id}/review`);
  const pa = await api('POST', `/jobs/${a.job.id}/pay`, { submission_id: sa.id }, emp.id);
  assert(pa.job.status === 'paid', 'custodial job paid');
  assert(pa.fee.fee_amount === '25.00' && pa.fee.net_to_winner === '975.00', `custodial fee ${JSON.stringify(pa.fee)}`);
  assert(pa.employment.seat_status === 'pending', 'employment pending');
  console.log('  ✓ custodial: fee', pa.fee.fee_amount, 'net', pa.fee.net_to_winner, 'USD; seat', pa.employment.seat_status);

  // 2. On-chain (sim) rail with a carve-out sub-job won by a bot.
  const b = await api('POST', '/jobs', { company_id: co.id, title: 'Treasury bot', requirements: 'Alerts', amount: 10000, rail: 'onchain' });
  const fb = await api('POST', `/jobs/${b.job.id}/fund`);
  assert(/^0x[0-9a-f]{64}$/.test(fb.tx_ref), 'onchain lock returns a tx hash');
  const leaf = await api('POST', '/jobs', { company_id: co.id, parent_job_id: b.job.id, budget_source: 'parent_carveout', title: 'Leaf', requirements: 'x', amount: 4000 });
  await api('POST', `/jobs/${leaf.job.id}/fund`);
  const bot = await api('POST', `/companies/${co.id}/bots`, { name: 'Scout', kind: 'job_scoped', job_id: leaf.job.id, operator_user_id: op.id });
  const sb = await api('POST', `/jobs/${leaf.job.id}/submissions`, { submitter_bot_id: bot.id, demo_url: 'https://example.com/bot' });
  await expectFail(400, () => api('POST', `/jobs/${b.job.id}/pay`, { submission_id: sb.id }), 'pay parent with open carve-out');
  const pl = await api('POST', `/jobs/${leaf.job.id}/pay`, { submission_id: sb.id });
  assert(pl.fee.fee_amount === '100.000000' && pl.payee.id === op.id && !pl.employment, `bot leaf ${JSON.stringify(pl.fee)}`);
  console.log('  ✓ on-chain carve-out won by bot: fee', pl.fee.fee_amount, 'USDC → operator', pl.payee.display_name);

  // Depth cap.
  const l2 = await api('POST', '/jobs', { company_id: co.id, parent_job_id: b.job.id, title: 'L2', requirements: 'x', amount: 1000 });
  await api('POST', `/jobs/${l2.job.id}/fund`);
  const l3 = await api('POST', '/jobs', { company_id: co.id, parent_job_id: l2.job.id, title: 'L3', requirements: 'x', amount: 500 });
  await api('POST', `/jobs/${l3.job.id}/fund`);
  await expectFail(400, () => api('POST', '/jobs', { company_id: co.id, parent_job_id: l3.job.id, title: 'L4', requirements: 'x', amount: 1 }), 'depth 4');

  // 3. Refunds: bottom-up, 0 fee; carve-outs return to the parent.
  await expectFail(400, () => api('POST', `/jobs/${l2.job.id}/cancel`), 'cancel parent before child');
  const r3 = await api('POST', `/jobs/${l3.job.id}/cancel`);
  const r2 = await api('POST', `/jobs/${l2.job.id}/cancel`);
  assert(r3.refund.to === 'parent_escrow' && r2.refund.fee === '0', 'carve-out refunds go to parent at 0 fee');
  const rb = await api('POST', `/jobs/${b.job.id}/cancel`);
  assert(rb.refund.amount === '6000.000000' && rb.refund.to === 'payer', `root refund ${JSON.stringify(rb.refund)}`);
  console.log('  ✓ refunds: leaf→parent, then root returns', rb.refund.amount, 'USDC to payer, fee', rb.refund.fee);

  const rep = await api('GET', '/reputation');
  const w = rep.find((x) => x.user_id === wrk.id);
  const bw = rep.find((x) => x.bot_agent_id === bot.id);
  assert(w.wins_count === 1 && bw.wins_count === 1, 'reputation wins counted once');
  console.log('  ✓ reputation: worker wins', w.wins_count, '· bot wins', bw.wins_count);

  console.log('DEMO PASSED');
})().catch((e) => {
  console.error('DEMO FAILED:', e.message);
  process.exit(1);
});
