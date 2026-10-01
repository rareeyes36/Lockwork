// Browser wallet flows for the real escrow (Base Sepolia testnet).
// Uses the injected EIP-1193 wallet (MetaMask, Coinbase Wallet, …). The server
// never signs anything: it only verifies the tx hashes these calls produce.

import {
  createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits,
  keccak256, stringToBytes, getAddress, BaseError, decodeErrorResult,
} from '../vendor/viem.js';

const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

let artifact = null;
async function escrowArtifact() {
  if (!artifact) artifact = await (await fetch('/contracts/LockworkEscrow.json')).json();
  return artifact;
}

export const hasWallet = () => typeof window !== 'undefined' && Boolean(window.ethereum);
export const jobKey = (jobId) => keccak256(stringToBytes(jobId));
export const usdcUnits = (amount) => parseUnits(String(amount), 6);
export const formatUsdc = (units) => formatUnits(units, 6);
export const txUrl = (cfg, hash) => (cfg.explorer ? `${cfg.explorer}/tx/${hash}` : null);
export const addressUrl = (cfg, addr) => (cfg.explorer ? `${cfg.explorer}/address/${addr}` : null);

function chainDef(cfg) {
  return {
    id: cfg.chain_id,
    name: cfg.chain_name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: cfg.explorer ? { default: { name: 'Basescan', url: cfg.explorer } } : undefined,
  };
}

/** Human-readable reason from a viem / wallet error. */
export function walletError(e, abi) {
  if (!e) return 'Unknown wallet error';
  if (e.code === 4001 || /user (rejected|denied)/i.test(e.message || '')) return 'You rejected the request in your wallet.';
  if (abi && e instanceof BaseError) {
    const data = e.walk((x) => typeof x.data === 'string' && x.data.startsWith('0x'));
    if (data) {
      try { return `Contract refused: ${decodeErrorResult({ abi, data: data.data }).errorName}`; } catch { /* fall through */ }
    }
  }
  return e.shortMessage || e.message || String(e);
}

/**
 * Connect the injected wallet and make sure it's on the configured chain.
 * Returns { account, wallet, pub }.
 */
export async function connect(cfg) {
  if (!hasWallet()) throw new Error('No browser wallet found. Install MetaMask or Coinbase Wallet, or open this page in the wallet app’s browser.');
  const chain = chainDef(cfg);
  const wallet = createWalletClient({ chain, transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  const current = await wallet.getChainId();
  if (current !== cfg.chain_id) {
    try {
      await wallet.switchChain({ id: cfg.chain_id });
    } catch (e) {
      if (e.code === 4902 || /unrecognized|not been added|unknown chain/i.test(e.message || '')) {
        await wallet.addChain({ chain });
        await wallet.switchChain({ id: cfg.chain_id });
      } else {
        throw e;
      }
    }
  }
  const pub = createPublicClient({ chain, transport: http(cfg.rpc) });
  return { account: getAddress(account), wallet, pub };
}

async function send(ctx, request) {
  const hash = await ctx.wallet.writeContract({ account: ctx.account, ...request });
  const receipt = await ctx.pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted.`);
  return hash;
}

export async function usdcBalance(ctx, cfg) {
  return ctx.pub.readContract({ address: cfg.usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [ctx.account] });
}

/**
 * approve (if needed) + lock. onStep(name) is called with
 * 'approve' | 'approved' | 'lock' so the UI can show progress.
 */
export async function lock(ctx, cfg, { jobId, amount, onStep = () => {} }) {
  const { abi } = await escrowArtifact();
  const units = usdcUnits(amount);
  const bal = await usdcBalance(ctx, cfg);
  if (bal < units) throw new Error(`Not enough test USDC: wallet has ${formatUsdc(bal)}, job needs ${formatUsdc(units)}. Get more at faucet.circle.com.`);
  const allowance = await ctx.pub.readContract({ address: cfg.usdc, abi: ERC20_ABI, functionName: 'allowance', args: [ctx.account, cfg.escrow] });
  if (allowance < units) {
    onStep('approve');
    await send(ctx, { address: cfg.usdc, abi: ERC20_ABI, functionName: 'approve', args: [cfg.escrow, units] });
  }
  onStep('approved');
  onStep('lock');
  try {
    return await send(ctx, { address: cfg.escrow, abi, functionName: 'lock', args: [jobKey(jobId), units] });
  } catch (e) {
    throw new Error(walletError(e, abi));
  }
}

/** Release `units` (bigint, 6 decimals) of the funding escrow to `winner`. */
export async function release(ctx, cfg, { fundingJobId, winner, units }) {
  const { abi } = await escrowArtifact();
  try {
    return await send(ctx, { address: cfg.escrow, abi, functionName: 'release', args: [jobKey(fundingJobId), getAddress(winner), units] });
  } catch (e) {
    throw new Error(walletError(e, abi));
  }
}

export async function refund(ctx, cfg, { jobId }) {
  const { abi } = await escrowArtifact();
  try {
    return await send(ctx, { address: cfg.escrow, abi, functionName: 'refund', args: [jobKey(jobId)] });
  } catch (e) {
    throw new Error(walletError(e, abi));
  }
}

/** Deploy LockworkEscrow(usdc, feeRecipient = cfg.fee_recipient, 250 bps). */
export async function deployEscrow(ctx, cfg) {
  const { abi, bytecode } = await escrowArtifact();
  if (!cfg.fee_recipient) throw new Error('Missing fee_recipient in chain config (set LOCKWORK_FEE_RECIPIENT).');
  const feeRecipient = getAddress(cfg.fee_recipient);
  const hash = await ctx.wallet.deployContract({ account: ctx.account, abi, bytecode, args: [cfg.usdc, feeRecipient, 250] });
  const receipt = await ctx.pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Deploy transaction ${hash} failed.`);
  return { hash, address: getAddress(receipt.contractAddress), feeRecipient };
}
