'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { SEAT_PRICE_USD } = require('../routes/companies');

describe('seat billing config', () => {
  it('defaults to $79 workspace_member plan', () => {
    assert.equal(SEAT_PRICE_USD, 79);
  });
});

describe('seat billing API (integration)', () => {
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

  it('creates a paid seat invoice that activates the company seat', async () => {
    const ts = Date.now().toString(36);
    const emp = await api('POST', '/people', { handle: `s_emp_${ts}`, display_name: 'Seat Emp' });
    const wrk = await api('POST', '/people', { handle: `s_wrk_${ts}`, display_name: 'Seat Wrk' });
    const co = await api('POST', '/companies', { name: `Seat Co ${ts}`, employer_user_id: emp.id });
    const job = await api('POST', '/jobs', {
      company_id: co.id, title: 'Seat job', requirements: 'x', amount: 400, rail: 'custodial',
    });
    await api('POST', `/jobs/${job.job.id}/fund`);
    const sub = await api('POST', `/jobs/${job.job.id}/submissions`, {
      submitter_user_id: wrk.id, demo_url: 'https://example.com/s',
    });
    await api('POST', `/jobs/${job.job.id}/review`);
    const paid = await api('POST', `/jobs/${job.job.id}/pay`, { submission_id: sub.id }, emp.id);
    assert.equal(paid.employment.seat_status, 'pending');
    assert.equal(Number(paid.fee.fee_amount), 10); // 250 bps of 400 — fee math untouched

    const charge = await api('POST', `/employments/${paid.employment.id}/seat-invoices`, {}, emp.id);
    assert.equal(charge.invoice.state, 'open');
    assert.equal(Number(charge.invoice.amount), 79);
    assert.equal(charge.billing.stripe_live, false);

    const marked = await api('POST', `/seat-invoices/${charge.invoice.id}/pay`, {}, emp.id);
    assert.equal(marked.invoice.state, 'paid');
    assert.equal(marked.employment.seat_status, 'active');
    assert.ok(marked.employment.seat_started_at);

    const cfg = await api('GET', '/config');
    assert.equal(cfg.seat_price_usd, 79);
    assert.equal(cfg.seat_billing.simulated, true);
    assert.equal(cfg.platform_fee_bps, 250);

    let failed = false;
    try {
      await api('POST', `/employments/${paid.employment.id}/seat-attach`, { rail: 'stripe' }, emp.id);
    } catch (e) {
      failed = e.status === 501;
    }
    assert.ok(failed, 'stripe rail should 501');
  });
});
