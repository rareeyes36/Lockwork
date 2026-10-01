'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PLACEMENT_FEE_BPS, placementFeeAmount } = require('../routes/market');
const { PLATFORM_FEE_BPS } = require('../escrow/feeMath');
const { stripMoney } = require('../routes/feed');

describe('placement fee config', () => {
  it('defaults to 500 bps and is separate from platform 250', () => {
    assert.equal(PLACEMENT_FEE_BPS, 500);
    assert.equal(PLATFORM_FEE_BPS, 250);
  });

  it('computes $50 on a $1000 financing contribution', () => {
    assert.equal(placementFeeAmount('1000', 'USD', 500), '50.00');
  });
});

describe('sponsor placement API (integration)', () => {
  let base;
  let srv;

  before(async () => {
    const { migrate } = require('../migrate');
    await migrate({ log: () => {} });
    const { app } = require('../server');
    srv = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${srv.address().port}/api`;
  });

  after(async () => {
    if (srv) await new Promise((r) => srv.close(r));
  });

  async function api(method, path, body, as) {
    const headers = { 'Content-Type': 'application/json' };
    if (as) headers['X-Lockwork-As'] = as;
    const r = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.error || `${r.status}`);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  it('pledges $1000 financing → lock+attach → placement invoice $50 paid', async () => {
    const ts = Date.now().toString(36);
    const emp = await api('POST', '/people', { handle: `p_emp_${ts}`, display_name: 'Place Emp' });
    const spon = await api('POST', '/people', { handle: `p_sp_${ts}`, display_name: 'Place Spon' });
    const co = await api('POST', '/companies', { name: `Place Co ${ts}`, employer_user_id: emp.id });
    const job = await api('POST', '/jobs', {
      company_id: co.id, title: 'Place job', requirements: 'x', amount: 2000, rail: 'custodial',
    });
    await api('POST', `/jobs/${job.job.id}/fund`);

    const sp = await api('POST', `/companies/${co.id}/sponsors`, {
      name: `Fund ${ts}`, kinds: ['financing'], sponsor_user_id: spon.id,
    });
    const pledged = await api('POST', `/sponsors/${sp.id}/contributions`, {
      job_id: job.job.id, kind: 'co_lock', amount: 1000,
    });
    assert.equal(pledged.state, 'pledged');
    assert.equal(Number(pledged.placement_fee_bps), 500);

    const attached = await api('POST', `/contributions/${pledged.id}/placement-attach`, {}, emp.id);
    assert.equal(attached.contribution.state, 'locked');
    assert.equal(attached.invoice.state, 'paid');
    assert.equal(Number(attached.invoice.amount), 50);
    assert.equal(Number(attached.invoice.placement_fee_bps), 500);
    assert.equal(attached.invoice.rail, 'custodial_sim');
    assert.equal(attached.billing.stripe_live, false);
    assert.ok(attached.invoice.paid_at);

    const cfg = await api('GET', '/config');
    assert.equal(cfg.placement_fee_bps, 500);
    assert.equal(cfg.platform_fee_bps, 250);
    assert.equal(cfg.placement_billing.simulated, true);

    const stats = await api('GET', `/stats?company_id=${co.id}`);
    assert.equal(Number(stats.sponsors.placement_fees_paid), 50);
    assert.equal(cfg.platform_fee_bps, 250);

    // Public feed strip still drops placement / GMV dollars
    const stripped = stripMoney({
      title: 'ok',
      placement_fee_bps: 500,
      placement_fee_amount: 50,
      amount: 1000,
      gmv: 999,
      seat_price: 79,
    });
    assert.deepEqual(stripped, { title: 'ok' });

    let failed = false;
    try {
      await api('POST', `/contributions/${pledged.id}/placement-attach`, { rail: 'stripe' }, emp.id);
    } catch (e) {
      // already attached returns 200; stripe on a fresh path — use job attach instead
      failed = e.status === 501 || e.status === 200;
    }
    // Fresh contribution to assert stripe 501
    const p2 = await api('POST', `/sponsors/${sp.id}/contributions`, {
      job_id: job.job.id, kind: 'top_up', amount: 200,
    });
    try {
      await api('POST', `/contributions/${p2.id}/placement-attach`, { rail: 'stripe' }, emp.id);
      failed = false;
    } catch (e) {
      failed = e.status === 501;
    }
    assert.ok(failed, 'stripe rail should 501');
  });

  it('job sponsor-attach creates locked contrib + paid placement fee', async () => {
    const ts = Date.now().toString(36) + 'j';
    const emp = await api('POST', '/people', { handle: `j_emp_${ts}`, display_name: 'Job Emp' });
    const co = await api('POST', '/companies', { name: `Job Place Co ${ts}`, employer_user_id: emp.id });
    const job = await api('POST', '/jobs', {
      company_id: co.id, title: 'Job place', requirements: 'x', amount: 1500, rail: 'custodial',
    });
    await api('POST', `/jobs/${job.job.id}/fund`);
    const sp = await api('POST', `/companies/${co.id}/sponsors`, {
      name: `JobFund ${ts}`, kinds: ['financing'],
    });
    const r = await api('POST', `/jobs/${job.job.id}/sponsor-attach`, {
      sponsor_id: sp.id, amount: 1000, kind: 'co_lock',
    }, emp.id);
    assert.equal(r.contribution.state, 'locked');
    assert.equal(Number(r.invoice.amount), 50);
    assert.equal(r.invoice.state, 'paid');
  });

  it('refund before pay voids open placement invoice with 0 release fee', async () => {
    const ts = Date.now().toString(36) + 'r';
    const emp = await api('POST', '/people', { handle: `r_emp_${ts}`, display_name: 'Ref Emp' });
    const co = await api('POST', '/companies', { name: `Ref Co ${ts}`, employer_user_id: emp.id });
    const job = await api('POST', '/jobs', {
      company_id: co.id, title: 'Ref job', requirements: 'x', amount: 900, rail: 'custodial',
    });
    await api('POST', `/jobs/${job.job.id}/fund`);
    const sp = await api('POST', `/companies/${co.id}/sponsors`, {
      name: `RefFund ${ts}`, kinds: ['financing'],
    });
    const pledged = await api('POST', `/sponsors/${sp.id}/contributions`, {
      job_id: job.job.id, kind: 'co_lock', amount: 400,
    });
    // Lock only (creates open invoice, not paid)
    const locked = await api('PATCH', `/contributions/${pledged.id}`, { state: 'locked' });
    const invId = locked.placement_invoice && locked.placement_invoice.id;
    assert.ok(invId);
    assert.equal(locked.placement_invoice.state, 'open');

    await api('PATCH', `/contributions/${pledged.id}`, { state: 'refunded' });
    const list = await api('GET', `/companies/${co.id}/placement-invoices`);
    const inv = list.invoices.find((i) => i.id === invId);
    assert.ok(inv);
    assert.equal(inv.state, 'void');
    assert.equal(inv.meta_json.platform_release_fee, 0);
  });
});
