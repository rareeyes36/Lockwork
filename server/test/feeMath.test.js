'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toMinor, fromMinor, computeReleaseFee, shouldChargeReleaseFee, releaseBreakdown,
} = require('../escrow/feeMath');

test('minor-unit round trip per currency', () => {
  assert.equal(toMinor('1234.5', 'USD'), 123450n);
  assert.equal(fromMinor(123450n, 'USD'), '1234.50');
  assert.equal(toMinor('0.000001', 'USDC'), 1n);
  assert.equal(fromMinor(4000000000n, 'USDC'), '4000.000000');
  assert.throws(() => toMinor('-5', 'USD'));
  assert.throws(() => toMinor('abc', 'USD'));
});

test('250 bps fee floors in minor units, winner gets the rest', () => {
  const r = computeReleaseFee(100000n); // $1,000.00
  assert.equal(r.feeAmount, 2500n);
  assert.equal(r.winnerNet, 97500n);
  const odd = computeReleaseFee(333n); // $3.33 → 0.08325 fee floors to 0.08
  assert.equal(odd.feeAmount, 8n);
  assert.equal(odd.feeAmount + odd.winnerNet, 333n);
});

test('D1: only outward winner releases are charged', () => {
  assert.equal(shouldChargeReleaseFee({ isOutwardWinnerPayee: true }), true);
  assert.equal(shouldChargeReleaseFee({ isOutwardWinnerPayee: true, isCarveout: true }), false);
  assert.equal(shouldChargeReleaseFee({ isOutwardWinnerPayee: true, isRefund: true }), false);
  assert.equal(shouldChargeReleaseFee({ isOutwardWinnerPayee: false }), false);
});

test('OPEN_DECISIONS $10k tree: one $4k leaf pays → $100 fee', () => {
  const b = releaseBreakdown('4000', 'USDC');
  assert.equal(b.fee_amount, '100.000000');
  assert.equal(b.net_to_winner, '3900.000000');
});
