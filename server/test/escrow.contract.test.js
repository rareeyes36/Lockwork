'use strict';

/**
 * LockworkEscrow contract tests on an in-process ganache chain with MockUSDC.
 * Run `npm run contracts:build` first if the .sol files changed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ganache = require('ganache');
const {
  createWalletClient, createPublicClient, custom, keccak256, stringToBytes, parseUnits,
  encodeFunctionData, decodeErrorResult,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const Escrow = require('../../contracts/build/LockworkEscrow.json');
const Usdc = require('../../contracts/build/MockUSDC.json');

const chain = {
  id: 1337, name: 'ganache', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1'] } },
};

async function setup() {
  const provider = ganache.provider({ chain: { chainId: 1337 }, logging: { quiet: true }, wallet: { totalAccounts: 5, deterministic: true } });
  // Sign locally (eth_sendRawTransaction), like a browser wallet would.
  const keys = Object.values(provider.getInitialAccounts()).map((a) => privateKeyToAccount(a.secretKey));
  const [owner, employer, winner, stranger, platform] = keys;
  const pub = createPublicClient({ chain, transport: custom(provider) });
  const as = (account) => createWalletClient({ account, chain, transport: custom(provider) });
  const deploy = async (art, args = []) => {
    const hash = await as(owner).deployContract({ abi: art.abi, bytecode: art.bytecode, args });
    return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
  };
  const usdc = await deploy(Usdc);
  const escrow = await deploy(Escrow, [usdc, platform.address, 250]);
  const write = async (who, address, abi, functionName, args) => {
    const hash = await as(who).writeContract({ address, abi, functionName, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    assert.equal(r.status, 'success');
    return r;
  };
  const bal = (a) => pub.readContract({ address: usdc, abi: Usdc.abi, functionName: 'balanceOf', args: [a.address || a] });
  const fund = async (who, amount) => {
    await write(owner, usdc, Usdc.abi, 'mint', [who.address, amount]);
    await write(who, usdc, Usdc.abi, 'approve', [escrow, amount]);
  };
  // ganache hides revert data from viem's estimateGas path, so eth_call directly
  // and decode the contract's custom error by name.
  const reverts = async (who, fn, args, errName) => {
    const data = encodeFunctionData({ abi: Escrow.abi, functionName: fn, args });
    let raw;
    try {
      await provider.request({ method: 'eth_call', params: [{ from: who.address, to: escrow, data }, 'latest'] });
    } catch (e) {
      raw = (e.data && (e.data.result || e.data)) || null;
    }
    assert.ok(typeof raw === 'string', `${fn} should revert with ${errName}`);
    assert.equal(decodeErrorResult({ abi: Escrow.abi, data: raw }).errorName, errName);
  };
  return { employer, winner, stranger, platform, escrow, write, bal, fund, reverts, provider };
}

const key = (s) => keccak256(stringToBytes(s));
const U = (n) => parseUnits(String(n), 6);

test('lock → partial release → residual release → fees 2.5% each time', async () => {
  const t = await setup();
  const k = key('job-a');
  await t.fund(t.employer, U(10000));
  await t.write(t.employer, t.escrow, Escrow.abi, 'lock', [k, U(10000)]);
  assert.equal(await t.bal(t.escrow), U(10000));

  await t.write(t.employer, t.escrow, Escrow.abi, 'release', [k, t.winner.address, U(4000)]); // carve-out leaf
  assert.equal(await t.bal(t.winner), U(3900));
  assert.equal(await t.bal(t.platform), U(100));

  await t.reverts(t.employer, 'release', [k, t.winner.address, U(6001)], 'InsufficientEscrow');
  await t.write(t.employer, t.escrow, Escrow.abi, 'release', [k, t.winner.address, U(6000)]);
  assert.equal(await t.bal(t.winner), U(3900 + 5850));
  assert.equal(await t.bal(t.platform), U(250));
  assert.equal(await t.bal(t.escrow), 0n);
  await t.reverts(t.employer, 'refund', [k], 'NothingToRefund');
  await t.provider.disconnect();
});

test('refund returns everything left, with no fee; only the employer can move funds', async () => {
  const t = await setup();
  const k = key('job-b');
  await t.fund(t.employer, U(500));
  await t.write(t.employer, t.escrow, Escrow.abi, 'lock', [k, U(500)]);
  await t.reverts(t.stranger, 'release', [k, t.stranger.address, U(1)], 'NotEmployer');
  await t.reverts(t.stranger, 'refund', [k], 'NotEmployer');
  await t.write(t.employer, t.escrow, Escrow.abi, 'refund', [k]);
  assert.equal(await t.bal(t.employer), U(500));
  assert.equal(await t.bal(t.platform), 0n);
  await t.provider.disconnect();
});

test('rejects double lock, zero amounts and locks without approval', async () => {
  const t = await setup();
  const k = key('job-c');
  await t.fund(t.employer, U(100));
  await t.reverts(t.employer, 'lock', [k, 0n], 'ZeroAmount');
  await t.write(t.employer, t.escrow, Escrow.abi, 'lock', [k, U(100)]);
  await t.fund(t.employer, U(100));
  await t.reverts(t.employer, 'lock', [k, U(100)], 'AlreadyLocked');
  await t.reverts(t.stranger, 'lock', [key('job-d'), U(5)], 'TransferFailed');
  await t.reverts(t.employer, 'release', [k, t.winner.address, 0n], 'ZeroAmount');
  await t.provider.disconnect();
});
