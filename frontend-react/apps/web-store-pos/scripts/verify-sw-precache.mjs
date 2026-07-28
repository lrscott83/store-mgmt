#!/usr/bin/env node
// Build-gating verifier (pwa-precache-build spec: "Verification step is a
// mandatory build gate"). Computes the set of on-disk files in `build/client`
// that match the shared precache patterns (the same patterns build-sw.mjs
// injects with), extracts the manifest actually baked into the built
// `service-worker.js`, and fails loudly if anything on disk that should be
// precached is missing from the injected manifest — or if the app shell
// (`index.html`) / hashed route-manifest chunk (`assets/manifest-*.js`) is
// not present exactly once.
import { getManifest } from 'workbox-build';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_GLOB_IGNORES,
  MAX_FILE_SIZE_BYTES,
} from './precache-patterns.mjs';

const BUILD_CLIENT_DIR = resolve(process.cwd(), 'build/client');
const SW_PATH = resolve(BUILD_CLIENT_DIR, 'service-worker.js');

/**
 * Extracts the injected precache manifest array from a built service-worker
 * bundle. `injectManifest` replaces the `self.__WB_MANIFEST` placeholder with
 * a `fast-json-stable-stringify`'d array — keys are sorted alphabetically, so
 * every entry is `{"revision":...,"url":"..."}` with "revision" first,
 * regardless of minification. We locate that literal and do a
 * string-aware bracket-depth scan (not a naive regex) so nested/minified
 * punctuation inside the surrounding bundle can never truncate the match.
 */
function extractInjectedManifest(swSource) {
  const marker = '[{"revision"';
  const start = swSource.indexOf(marker);
  if (start === -1) {
    return [];
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < swSource.length; i += 1) {
    const ch = swSource[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(swSource.slice(start, i + 1));
      }
    }
  }

  throw new Error(
    `verify-sw-precache: found a manifest start marker but never found a balanced closing bracket in ${SW_PATH}`
  );
}

async function main() {
  let swSource;
  try {
    swSource = await readFile(SW_PATH, 'utf8');
  } catch (error) {
    console.error(`verify-sw-precache: FAILED — cannot read ${SW_PATH}. Did the build run?`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const injectedEntries = extractInjectedManifest(swSource);
  const injectedUrls = new Set(injectedEntries.map((entry) => entry.url));

  const { manifestEntries } = await getManifest({
    globDirectory: BUILD_CLIENT_DIR,
    globPatterns: PRECACHE_GLOB_PATTERNS,
    globIgnores: PRECACHE_GLOB_IGNORES,
    maximumFileSizeToCacheInBytes: MAX_FILE_SIZE_BYTES,
  });

  const missing = manifestEntries
    .map((entry) => entry.url)
    .filter((url) => !injectedUrls.has(url))
    .sort();

  const shellCount = injectedEntries.filter((entry) => entry.url === 'index.html').length;
  const routeManifestCount = injectedEntries.filter((entry) =>
    /^assets\/manifest-.*\.js$/.test(entry.url)
  ).length;

  const errors = [];
  if (missing.length > 0) {
    errors.push(
      `${missing.length} on-disk asset(s) matching the shared precache patterns are missing ` +
        `from the injected manifest:\n  - ${missing.join('\n  - ')}`
    );
  }
  if (shellCount !== 1) {
    errors.push(`expected exactly one "index.html" entry in the precache manifest, found ${shellCount}`);
  }
  if (routeManifestCount !== 1) {
    errors.push(
      `expected exactly one "assets/manifest-*.js" entry in the precache manifest, found ${routeManifestCount}`
    );
  }

  if (errors.length > 0) {
    console.error('verify-sw-precache: FAILED\n');
    for (const error of errors) {
      console.error(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `verify-sw-precache: OK — ${injectedEntries.length} precached entries; shell and route manifest each present exactly once.`
  );
}

await main();
