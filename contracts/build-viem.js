'use strict';

/**
 * Bundles the few viem functions the browser needs into one ES module
 * (public/vendor/viem.js), so wallet flows don't depend on a third-party CDN.
 * Usage: npm run vendor:build
 */
const path = require('path');
const esbuild = require('esbuild');

esbuild.buildSync({
  stdin: {
    contents: `export {
      createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits,
      keccak256, stringToBytes, getAddress, isAddress, BaseError, ContractFunctionRevertedError,
      UserRejectedRequestError, decodeErrorResult,
    } from 'viem';`,
    resolveDir: path.join(__dirname, '..'),
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'inline',
  outfile: path.join(__dirname, '..', 'public', 'vendor', 'viem.js'),
});
console.log('built public/vendor/viem.js');
