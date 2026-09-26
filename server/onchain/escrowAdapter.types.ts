/**
 * Lockwork — on-chain EscrowAdapter types (Base + USDC draft)
 *
 * Dependency-free. Matches PAYOUT_HYBRID.md EscrowAdapter surface.
 * No deploy, no private keys, no runtime chain calls in this file.
 *
 * See: ONCHAIN_ESCROW_ADAPTER.md
 */

/** Shared job escrow lifecycle (same as PAYOUT_HYBRID). */
export type JobEscrowState =
  | 'draft'
  | 'funded'
  | 'in_review'
  | 'paid'
  | 'expired_refunded'
  | 'cancelled_refunded'
  | 'disputed'; // v2

/** Adapter-level hold status (subset mapped from job state). */
export type EscrowHoldStatus = 'funded' | 'released' | 'refunded' | 'unknown';

/** v1 currency: USDC only on Base. */
export type OnchainCurrency = 'USDC';

/**
 * Base USDC (Circle) — VERIFY-BEFORE-DEPLOY.
 * Well-known candidate: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 * Re-check Circle docs + BaseScan before any deploy.
 */
export const BASE_USDC_ADDRESS =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

export const BASE_MAINNET_CHAIN_ID = 8453 as const;
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const USDC_DECIMALS = 6 as const;

/** Platform fee: 250 bps = 2.5%. Fee only on outward release to winner. */
export const PLATFORM_FEE_BPS = 250 as const;

export interface LockParams {
  jobId: string;
  /** USDC minor units (6 decimals), integer. */
  amount: bigint;
  currency: OnchainCurrency;
  /** Employer wallet address (payer). */
  payer: string;
}

export interface ReleaseParams {
  escrowRef: string;
  /** Winner payee wallet — product layer must have selected exactly one. */
  winnerPayee: string;
  /** Platform treasury; custody risk — see ONCHAIN_ESCROW_ADAPTER.md. */
  feeRecipient: string;
}

export interface RefundParams {
  escrowRef: string;
  reason: string;
}

/**
 * EscrowAdapter — identical method surface to PAYOUT_HYBRID.
 * On-chain impl will wrap Base USDC contract calls; workers never invoke these.
 */
export interface EscrowAdapter {
  /** Employer funds job. Returns escrowRef. Fee: 0. */
  lock(
    jobId: string,
    amount: bigint,
    currency: string,
    payer: string
  ): Promise<string>;

  /** System/employer after one winner. Fee skimmed to feeRecipient in concrete impl. */
  release(escrowRef: string, winnerPayee: string): Promise<string>;

  /** System expiry or employer allowed cancel. Fee: 0. Workers never call. */
  refund(escrowRef: string, reason: string): Promise<string>;

  status(escrowRef: string): Promise<EscrowHoldStatus>;
}

/** Optional richer on-chain adapter (feeRecipient explicit at release). */
export interface OnchainEscrowAdapter extends EscrowAdapter {
  releaseWithFee(
    escrowRef: string,
    winnerPayee: string,
    feeRecipient: string
  ): Promise<string>;
}

export interface FeeBreakdown {
  amount: bigint;
  feeBps: number;
  feeAmount: bigint;
  winnerNet: bigint;
}

/** Who may trigger (documentation as const; enforce in product layer). */
export const ESCROW_ACTORS = {
  lock: ['employer'] as const,
  release: ['system', 'employer'] as const,
  refund: ['system', 'employer'] as const,
  never: ['worker', 'lead_bot'] as const,
} as const;
