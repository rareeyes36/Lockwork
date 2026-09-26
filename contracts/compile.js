'use strict';

/**
 * Compiles the contracts with solc-js and writes ABI + bytecode JSON.
 * Usage: npm run contracts:build
 *   contracts/build/*.json   (tests)
 *   public/contracts/LockworkEscrow.json   (deploy page + wallet flows)
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const files = ['LockworkEscrow.sol', 'MockUSDC.sol'];
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(files.map((f) => [f, { content: fs.readFileSync(path.join(__dirname, f), 'utf8') }])),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris', // widest compatibility (Base, local test chains),
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
if (errors.length) {
  errors.forEach((e) => console.error(e.formattedMessage));
  process.exit(1);
}
fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'public', 'contracts'), { recursive: true });
for (const f of files) {
  for (const [name, c] of Object.entries(out.contracts[f])) {
    if (!c.evm.bytecode.object) continue; // interfaces
    const art = { contractName: name, compiler: `solc ${solc.version()}`, abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
    fs.writeFileSync(path.join(__dirname, 'build', `${name}.json`), JSON.stringify(art, null, 2) + '\n');
    if (name === 'LockworkEscrow') {
      fs.writeFileSync(path.join(__dirname, '..', 'public', 'contracts', `${name}.json`), JSON.stringify(art) + '\n');
    }
    console.log(`compiled ${name}: ${(c.evm.bytecode.object.length / 2) | 0} bytes`);
  }
}
