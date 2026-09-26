/**
 * Lockwork — escrow fee math (pure, dependency-free)
 *
 * platform_fee_bps = 250
 * Fee ONLY on outward release to a winner.
 * 0 on lock, refunds, carve-outs (OPEN_DECISIONS.md D1 — leaf-outward only).
 *
 * Integer math in USDC 6-decimal minor units. No floating point.
 *
 * See: ONCHAIN_ESCROW_ADAPTER.md, PAYOUT_HYBRID.md, OPEN_DECISIONS.md D1
 */

import { PLATFORM_FEE_BPS, type FeeBreakdown } from './escrowAdapter.types';

const BPS_DENOMINATOR = 10_000n;

/**
 * fee_amount = amount * 250 / 10000  (floor)
 * winner_net = amount - fee_amount
 */
export function computeReleaseFee(
  amount: bigint,
  feeBps: number = PLATFORM_FEE_BPS
): FeeBreakdown {
  if (amount < 0n) {
    throw new Error('amount must be >= 0');
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error('feeBps must be an integer in [0, 10000]');
  }

  const feeAmount = (amount * BigInt(feeBps)) / BPS_DENOMINATOR;
  const winnerNet = amount - feeAmount;

  return {
    amount,
    feeBps,
    feeAmount,
    winnerNet,
  };
}

/** Lock never takes a platform fee. */
export function feeOnLock(_amount: bigint): bigint {
  return 0n;
}

/** Refunds never take a platform fee. */
export function feeOnRefund(_amount: bigint): bigint {
  return 0n;
}

/**
 * Carve-outs (parent → child inside company tree) are not fee events.
 * D1 leaf-outward only — OPEN_DECISIONS.md.
 */
export function feeOnCarveout(_amount: bigint): bigint {
  return 0n;
}

/**
 * True when this release should charge 250 bps:
 * outward winner payee (money leaves company tree).
 * Callers pass product-layer judgment; this helper only documents the gate.
 */
export function shouldChargeReleaseFee(opts: {
  isOutwardWinnerPayee: boolean;
  isCarveout: boolean;
  isRefund: boolean;
}): boolean {
  if (opts.isRefund || opts.isCarveout) return false;
  return opts.isOutwardWinnerPayee;
}

/** Convenience: apply D1 gate then compute, or return zero fee. */
export function computeFeeIfOutwardRelease(
  amount: bigint,
  opts: {
    isOutwardWinnerPayee: boolean;
    isCarveout?: boolean;
    isRefund?: boolean;
  },
  feeBps: number = PLATFORM_FEE_BPS
): FeeBreakdown {
  const charge = shouldChargeReleaseFee({
    isOutwardWinnerPayee: opts.isOutwardWinnerPayee,
    isCarveout: opts.isCarveout ?? false,
    isRefund: opts.isRefund ?? false,
  });

  if (!charge) {
    return {
      amount,
      feeBps: 0,
      feeAmount: 0n,
      winnerNet: amount,
    };
  }

  return computeReleaseFee(amount, feeBps);
}
