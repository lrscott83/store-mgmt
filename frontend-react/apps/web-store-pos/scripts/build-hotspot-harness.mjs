// Bundles the REAL hotspot WebRTC engine for the browser-level E2E
// (frontend-react/e2e/hotspot-transfer.spec.ts). The output is an IIFE that
// exposes `window.__hotspot`, so two real browser contexts can drive a real
// loopback transfer without the app, a backend, or the dev server.
//
// Usage: node scripts/build-hotspot-harness.mjs <outfile>
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outfile = process.argv[2];

if (!outfile) {
  throw new Error('usage: node scripts/build-hotspot-harness.mjs <outfile>');
}

await build({
  stdin: {
    contents: [
      "import * as peer from './app/sync/lib/hotspot/peer-connection.ts';",
      "import * as transfer from './app/sync/lib/hotspot/transfer-protocol.ts';",
      'window.__hotspot = { ...peer, ...transfer };',
    ].join('\n'),
    resolveDir: appRoot,
    sourcefile: 'hotspot-harness.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile,
});
