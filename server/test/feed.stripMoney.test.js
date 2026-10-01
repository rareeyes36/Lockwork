'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { stripMoney, MONEY_KEYS } = require('../routes/feed');

describe('stripMoney', () => {
  it('drops known money keys and nested amounts', () => {
    const raw = {
      title: 'Ship landing',
      badge: 'funded',
      amount: 1000,
      fee_bps: 250,
      fee_amount: 25,
      escrow_ref: 'esc_abc',
      rail: 'onchain',
      seat_price: 79,
      currency: 'USDC',
      nested: { budget: 50, note: 'ok', payout: 40 },
      list: [{ price: 1, kind: 'submission' }],
    };
    const safe = stripMoney(raw);
    assert.equal(safe.title, 'Ship landing');
    assert.equal(safe.badge, 'funded');
    assert.equal(safe.nested.note, 'ok');
    assert.equal(safe.list[0].kind, 'submission');
    for (const k of [
      'amount', 'fee_bps', 'fee_amount', 'escrow_ref', 'rail', 'seat_price', 'currency',
    ]) {
      assert.equal(safe[k], undefined, `should omit ${k}`);
    }
    assert.equal(safe.nested.budget, undefined);
    assert.equal(safe.nested.payout, undefined);
    assert.equal(safe.list[0].price, undefined);
  });

  it('drops keys matching money regex patterns', () => {
    const safe = stripMoney({
      job_title: 'x',
      net_to_winner: 975,
      platform_fee_bps: 250,
      usd_cents: 100,
      carved_out_amount: 10,
    });
    assert.deepEqual(safe, { job_title: 'x' });
  });

  it('MONEY_KEYS covers core public-forbidden fields', () => {
    for (const k of ['amount', 'fee', 'escrow_ref', 'rail', 'seat_price', 'budget']) {
      assert.ok(MONEY_KEYS.has(k), k);
    }
  });
});
