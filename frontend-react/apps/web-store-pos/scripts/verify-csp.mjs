#!/usr/bin/env node
// Build-gating verifier (design.md D7): fails `pnpm build` — which
// `Dockerfile:22-23` runs inside the image build — if `deploy/nginx.conf`
// has drifted from the policy `scripts/csp-policy.mjs` generates. Same
// shape as `verify-sw-precache.mjs`: I/O + exit code, no comparison logic of
// its own (that lives in `scripts/csp-nginx.mjs`, pure and Vitest-covered).
// Never rewrites `nginx.conf` — a gate that fixes the thing it guards is not
// a gate.
import { config as loadDotenv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHydrationScriptHashes } from './csp-hydration-hashes.mjs';
import { checkNginxConf } from './csp-nginx.mjs';

// scripts/ -> web-store-pos/ -> apps/ -> frontend-react/, then deploy/nginx.conf.
// Resolved from this file's own location, NOT process.cwd() — unlike
// verify-sw-precache.mjs's target (a build output of ITS OWN package), this
// target lives outside apps/web-store-pos entirely.
const FRONTEND_REACT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const NGINX_CONF_PATH = resolve(FRONTEND_REACT_ROOT, 'deploy/nginx.conf');

// Unlike NGINX_CONF_PATH, this DOES resolve from process.cwd() — same
// convention as verify-sw-precache.mjs's BUILD_CLIENT_DIR: the build output
// of THIS package, produced by `react-router build` earlier in the same
// `pnpm build` (package.json), so it always exists by the time this script
// runs.
const HYDRATION_HTML_PATH = resolve(process.cwd(), 'build/client/index.html');

async function main() {
  // The build-time API_URL: baked into `frontend-react/.env` by
  // `Dockerfile:17` (`RUN echo "API_URL=${API_URL}" > .env`), or already
  // present in the environment. dotenv never overrides an already-set
  // process.env value, and silently no-ops when the file is absent (e.g.
  // running this script outside a Docker build).
  loadDotenv({ path: resolve(FRONTEND_REACT_ROOT, '.env'), quiet: true });

  let conf;
  try {
    conf = await readFile(NGINX_CONF_PATH, 'utf8');
  } catch (error) {
    console.error(`verify-csp: FAILED — cannot read ${NGINX_CONF_PATH}.`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  let hydrationHtml;
  try {
    hydrationHtml = await readFile(HYDRATION_HTML_PATH, 'utf8');
  } catch (error) {
    console.error(`verify-csp: FAILED — cannot read ${HYDRATION_HTML_PATH}.`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }
  const hydrationScriptHashes = extractHydrationScriptHashes(hydrationHtml);

  // The build-time API_URL is checked alongside the file itself, and fails the
  // build the same way (csp-nginx.mjs check 6) — a cross-origin bundle is a
  // deploy that the enforcing flip would break, and this is the last place
  // that can still say so. hydrationScriptHashes closes the sibling gap: the
  // exact inline hydration scripts THIS build emits must be allowlisted by
  // hash in nginx.conf's script-src, or the enforcing flip breaks hydration
  // on every production page load (2026-08-12 finding — verified via a real
  // build, not assumed dev-only).
  const errors = checkNginxConf(conf, { apiUrl: process.env.API_URL, hydrationScriptHashes });
  if (errors.length > 0) {
    console.error('verify-csp: FAILED\n');
    for (const error of errors) {
      console.error(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`verify-csp: OK — ${NGINX_CONF_PATH} carries the exact production policy.`);
}

await main();
