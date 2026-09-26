'use strict';

/**
 * Lockwork — escrow fee math (JS port of onchain/feeMath.ts)
 *
 * platform_fee_bps = 250. Fee ONLY on outward release to a winner:
 * 0 on lock, refunds and carve-outs (OPEN_DECISIONS.md D1 — leaf-outward only).
 *
 * Integer math in currency minor units (USD cents, USDC 6 decimals).
 * No floating point: numeric strings in, numeric strings out.
 */

const PLATFORM_FEE_BPS = 250;
const PLACEMENT_FEE_BPS = 500;
const BPS_DENOMINATOR = 10_000n;

const DECIMALS = { USD: 2, USDC: 6 };

function decimalsFor(currency) {
  return DECIMALS[String(currency).toUpperCase()] ?? 2;
}

/** "1234.5" → 123450n (for 2 decimals). Extra precision is truncated. */
function toMinor(value, currency) {
  const d = decimalsFor(currency);
  const s = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${value}`);
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 10n ** BigInt(d) + BigInt((frac + '0'.repeat(d)).slice(0, d) || '0');
}

/** 123450n → "1234.50" (for 2 decimals). */
function fromMinor(minor, currency) {
  const d = decimalsFor(currency);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const base = 10n ** BigInt(d);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(d, '0');
  return `${neg ? '-' : ''}${whole}${d ? '.' + frac : ''}`;
}

/**
 * fee_amount = floor(amount * bps / 10000); winner_net = amount - fee_amount.
 * Takes and returns minor units.
 */
function computeReleaseFee(amount, feeBps = PLATFORM_FEE_BPS) {
  if (amount < 0n) throw new Error('amount must be >= 0');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error('feeBps must be an integer in [0, 10000]');
  }
  const feeAmount = (amount * BigInt(feeBps)) / BPS_DENOMINATOR;
  return { amount, feeBps, feeAmount, winnerNet: amount - feeAmount };
}

/** True when a money movement should charge the release fee (D1). */
function shouldChargeReleaseFee({ isOutwardWinnerPayee, isCarveout = false, isRefund = false }) {
  if (isRefund || isCarveout) return false;
  return Boolean(isOutwardWinnerPayee);
}

/** Decimal-string convenience used by routes: release `amount` outward to a winner. */
function releaseBreakdown(amount, currency, feeBps = PLATFORM_FEE_BPS) {
  const r = computeReleaseFee(toMinor(amount, currency), feeBps);
  return {
    amount: fromMinor(r.amount, currency),
    fee_bps: feeBps,
    fee_amount: fromMinor(r.feeAmount, currency),
    net_to_winner: fromMinor(r.winnerNet, currency),
  };
}

module.exports = {
  PLATFORM_FEE_BPS,
  PLACEMENT_FEE_BPS,
  decimalsFor,
  toMinor,
  fromMinor,
  computeReleaseFee,
  shouldChargeReleaseFee,
  releaseBreakdown,
};
