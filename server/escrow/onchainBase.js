'use strict';

/**
 * Real on-chain rail: LockworkEscrow on Base Sepolia (testnet USDC).
 *
 * The server never holds keys or sends transactions. The employer's wallet
 * signs lock / release / refund in the browser, and the client sends the tx
 * hash here. We fetch the receipt from a public RPC and accept it only if it
 * emitted the exact event for this job (contract, jobKey, amount, winner).
 *
 * Enabled when LOCKWORK_ESCROW_ADDRESS is set; otherwise the simulated
 * adapter in adapters.js stays in use.
 */

const {
  createPublicClient, http, parseEventLogs, keccak256, stringToBytes, getAddress, isAddress, isHash,
} = require('viem');
const { HttpError } = require('../db');
const { abi: ESCROW_ABI } = require('../../public/contracts/LockworkEscrow.json');

const BASE_SEPOLIA = {
  id: 84532,
  name: 'Base Sepolia',
  rpc: 'https://sepolia.base.org',
  explorer: 'https://sepolia.basescan.org',
  // Circle's official testnet USDC on Base Sepolia (developers.circle.com).
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

// Dante treasury — production feeRecipient on deploy (override with LOCKWORK_FEE_RECIPIENT).
const DEFAULT_FEE_RECIPIENT = '0x47D0A167FF6A5508440ef6D8902076A7aaD0844C';

function cleanAddr(raw) {
  if (raw == null) return '';
  return String(raw).trim().replace(/^['"]|['"]$/g, '').trim();
}

function config() {
  const escrow = cleanAddr(process.env.LOCKWORK_ESCROW_ADDRESS);
  const chainId = Number(process.env.LOCKWORK_CHAIN_ID || BASE_SEPOLIA.id);
  const isBaseSepolia = chainId === BASE_SEPOLIA.id;
  const feeRaw = cleanAddr(process.env.LOCKWORK_FEE_RECIPIENT) || DEFAULT_FEE_RECIPIENT;
  const lockworkKeys = Object.keys(process.env).filter((k) => k.startsWith('LOCKWORK_')).sort();
  return {
    enabled: isAddress(escrow),
    escrow: isAddress(escrow) ? getAddress(escrow) : null,
    fee_recipient: isAddress(feeRaw) ? getAddress(feeRaw) : null,
    usdc: process.env.LOCKWORK_USDC_ADDRESS || BASE_SEPOLIA.usdc,
    chain_id: chainId,
    chain_name: process.env.LOCKWORK_CHAIN_NAME || (isBaseSepolia ? BASE_SEPOLIA.name : `Chain ${chainId}`),
    rpc: process.env.LOCKWORK_RPC_URL || BASE_SEPOLIA.rpc,
    explorer: process.env.LOCKWORK_EXPLORER_URL || (isBaseSepolia ? BASE_SEPOLIA.explorer : null),
    testnet: true,
    // Debug (names only / length): confirms whether Vercel injected the env.
    escrow_env_present: Boolean(process.env.LOCKWORK_ESCROW_ADDRESS),
    escrow_env_len: escrow.length,
    lockwork_keys: lockworkKeys,
  };
}

let client = null;
let clientKey = '';
function publicClient() {
  const c = config();
  const k = `${c.chain_id}|${c.rpc}`;
  if (!client || clientKey !== k) {
    client = createPublicClient({
      chain: { id: c.chain_id, name: c.chain_name, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } },
      transport: http(c.rpc),
    });
    clientKey = k;
  }
  return client;
}

/** Deterministic escrow key for a job: keccak256(job uuid). Same in the browser. */
const jobKey = (jobId) => keccak256(stringToBytes(jobId));

function same(a, b) {
  if (typeof b === 'bigint') return BigInt(a) === b;
  if (typeof b === 'string' && isAddress(b)) return isAddress(a) && getAddress(a) === getAddress(b);
  return String(a).toLowerCase() === String(b).toLowerCase();
}

const WHAT = { Locked: 'lock', Released: 'release', Refunded: 'refund' };

/**
 * Wait for `txHash` and return the matching escrow event, or throw a 400
 * explaining what did not match.
 */
async function verifyEvent(txHash, eventName, expected) {
  const c = config();
  if (!c.enabled) throw new HttpError(400, 'On-chain escrow is not configured on this server (LOCKWORK_ESCROW_ADDRESS).');
  if (!isHash(txHash)) throw new HttpError(400, 'tx_hash must be a 0x-prefixed 32-byte hash.');
  let receipt;
  try {
    receipt = await publicClient().waitForTransactionReceipt({ hash: txHash, timeout: 45_000 });
  } catch (e) {
    throw new HttpError(400, `Could not find that transaction on ${c.chain_name} yet. Wait a few seconds and retry.`, { detail: e.shortMessage || e.message });
  }
  if (receipt.status !== 'success') throw new HttpError(400, 'That transaction reverted on-chain.');
  const events = parseEventLogs({ abi: ESCROW_ABI, logs: receipt.logs, eventName })
    .filter((l) => getAddress(l.address) === c.escrow);
  const hit = events.find((l) => Object.entries(expected).every(([k, v]) => same(l.args[k], v)));
  if (!hit) {
    throw new HttpError(400,
      `That transaction does not ${WHAT[eventName]} this job's escrow as expected (contract, job, amount${expected.winner ? ', winner' : ''}).`,
      { rule: 'chain_mismatch' });
  }
  return { tx: txHash, block: Number(receipt.blockNumber), args: hit.args, chain_id: c.chain_id };
}

/** Record the tx so it can back only one action. */
async function recordTx(db, proof, jobId, kind) {
  try {
    await db.query(
      'INSERT INTO chain_txs (tx_hash, chain_id, job_id, kind, block) VALUES ($1, $2, $3, $4, $5)',
      [proof.tx.toLowerCase(), proof.chain_id, jobId, kind, proof.block]
    );
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'That transaction was already used for another action.');
    throw e;
  }
}

module.exports = { config, jobKey, verifyEvent, recordTx, publicClient, BASE_SEPOLIA };
