'use strict';

/**
 * EscrowAdapter implementations (PAYOUT_HYBRID.md):
 *   lock(jobId, amount, currency, payer)  → { escrowRef, txRef?, meta }
 *   release(escrowRef, winnerPayee)       → { txRef, meta }
 *   refund(escrowRef, reason)             → { txRef, meta }
 *   status(escrow row)                    → funded | released | refunded | unknown
 *
 * Both rails are SIMULATED in this build: no card is charged and nothing is
 * broadcast on-chain. The on-chain adapter mirrors the Base + USDC design in
 * docs/ONCHAIN_ESCROW_ADAPTER.md and produces realistic-looking (fake) refs,
 * always flagged with meta.sim = true.
 */

const crypto = require('crypto');

const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// Illustrative escrow contract address for the simulation — not deployed.
const SIM_ESCROW_CONTRACT = '0x10c4a0000000000000000000000000000000e5c0';

const fakeHash = () => '0x' + crypto.randomBytes(32).toString('hex');
const fakeBlock = () => 21_000_000 + Math.floor(Math.random() * 900_000);

function statusFromState(state) {
  if (state === 'funded' || state === 'in_review') return 'funded';
  if (state === 'paid') return 'released';
  if (state === 'expired_refunded' || state === 'cancelled_refunded') return 'refunded';
  return 'unknown';
}

const custodial = {
  rail: 'custodial',
  currency: 'USD',
  lock(escrowId) {
    return {
      escrowRef: `custodial-sim-${escrowId}`,
      meta: { sim: true, funded_via: 'custodial_sim', ledger: 'hold' },
    };
  },
  release(escrowRef) {
    return { txRef: `${escrowRef}-release`, meta: { sim_release: true } };
  },
  refund(escrowRef, reason) {
    return { txRef: `${escrowRef}-refund`, meta: { sim_refund: true, refund_reason: reason } };
  },
  status: (escrow) => statusFromState(escrow.state),
};

const onchainSim = {
  rail: 'onchain',
  currency: 'USDC',
  lock(escrowId, { payerWallet } = {}) {
    const txRef = fakeHash();
    return {
      escrowRef: `base:${SIM_ESCROW_CONTRACT}#${escrowId}`,
      txRef,
      meta: {
        sim: true,
        chain: 'base',
        chain_id: BASE_CHAIN_ID,
        token: 'USDC',
        token_address: BASE_USDC_ADDRESS,
        escrow_contract: SIM_ESCROW_CONTRACT,
        payer_wallet: payerWallet || null,
        lock_tx: txRef,
        lock_block: fakeBlock(),
      },
    };
  },
  release(_escrowRef, { winnerWallet } = {}) {
    const txRef = fakeHash();
    return {
      txRef,
      meta: { sim_release: true, release_tx: txRef, release_block: fakeBlock(), winner_wallet: winnerWallet || null },
    };
  },
  refund(_escrowRef, reason) {
    const txRef = fakeHash();
    return { txRef, meta: { sim_refund: true, refund_tx: txRef, refund_reason: reason } };
  },
  status: (escrow) => statusFromState(escrow.state),
};

/** Carve-outs move budget inside the company tree: ledger-only, 0 bps. */
const carveout = {
  rail: 'carveout',
  lock(escrowId, { parentEscrowId } = {}) {
    return {
      escrowRef: `carveout-${parentEscrowId}-${escrowId}`,
      meta: { carveout: true, parent_escrow_id: parentEscrowId, fee_bps_on_transfer: 0 },
    };
  },
};

const ADAPTERS = { custodial, onchain: onchainSim };

function adapterFor(rail) {
  const a = ADAPTERS[rail];
  if (!a) throw new Error(`unknown rail ${rail}`);
  return a;
}

module.exports = { adapterFor, carveout, statusFromState, BASE_CHAIN_ID, BASE_USDC_ADDRESS };
