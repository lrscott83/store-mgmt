#!/usr/bin/env node
// Build-gating verifier (pwa-precache-build spec: "Verification step is a
// mandatory build gate"). Resolves the expected precache plan from build/client
// (precache-plan.mjs), extracts the manifest actually baked into the built
// `service-worker.js`, and fails loudly when:
//   - the injected manifest and the plan disagree in either direction,
//   - an offline route id no longer exists in the route manifest,
//   - a route the plan needs has no module entry in the manifest,
//   - the shell (`index.html`) or the hashed route-manifest chunk is not
//     present exactly once,
//   - a required asset family is off its declared count,
//   - a chunk matching a forbidden prefix reached the manifest.
import { getManifest } from 'workbox-build';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  FORBIDDEN_PRECACHE_PREFIXES,
  MAX_FILE_SIZE_BYTES,
  OFFLINE_ROUTE_IDS,
  PRECACHE_STATIC_PATTERNS,
  REQUIRED_PRECACHE_FAMILIES,
} from './precache-patterns.mjs';
import {
  parseRouteManifest,
  resolveOfflineRouteIds,
  resolvePrecachePlan,
} from './precache-plan.mjs';
import {
  checkForbiddenPrefixes,
  checkRequiredFamilies,
  computePrecacheDiff,
} from './precache-diff.mjs';

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
    `verify-sw-precache: found a manifest start marker but never found a balanced closing bracket in ${SW_PATH}`,
  );
}

async function findRouteManifest() {
  const entries = await readdir(join(BUILD_CLIENT_DIR, 'assets'));
  const file = entries.find((name) => /^manifest-.*\.js$/.test(name));
  if (!file) {
    throw new Error(
      'verify-sw-precache: no assets/manifest-<hash>.js route manifest in build/client',
    );
  }
  return { absolutePath: join(BUILD_CLIENT_DIR, 'assets', file), url: `assets/${file}` };
}

async function resolvePlan(routeManifest, routeManifestUrl) {
  // No size filter here on purpose: an oversized planned asset must surface as a
  // gate failure, not silently disappear from the planned set.
  const { manifestEntries: staticEntries } = await getManifest({
    globDirectory: BUILD_CLIENT_DIR,
    globPatterns: PRECACHE_STATIC_PATTERNS,
    maximumFileSizeToCacheInBytes: Number.MAX_SAFE_INTEGER,
  });

  return resolvePrecachePlan({
    routeManifest,
    offlineRouteIds: OFFLINE_ROUTE_IDS,
    staticUrls: staticEntries.map((entry) => entry.url),
    routeManifestUrl,
    readChunk: (url) => readFile(resolve(BUILD_CLIENT_DIR, url), 'utf8').catch(() => null),
  });
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
  const injectedUrls = injectedEntries.map((entry) => entry.url);

  let routeManifest;
  let routeManifestUrl;
  try {
    const routeManifestFile = await findRouteManifest();
    routeManifestUrl = routeManifestFile.url;
    routeManifest = parseRouteManifest(await readFile(routeManifestFile.absolutePath, 'utf8'));
  } catch (error) {
    console.error('verify-sw-precache: FAILED\n');
    console.error(`- ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
    return;
  }

  const plan = await resolvePlan(routeManifest, routeManifestUrl);
  // The plan is the unfiltered truth. Do NOT re-glob it through getManifest with
  // maximumFileSizeToCacheInBytes: that drops an oversized planned asset from
  // BOTH sides of the diff and the gate goes green while the install lost a
  // chunk. Size and presence are checked explicitly right below.
  const plannedUrls = plan.urls;

  const oversized = [];
  const missingOnDisk = [];
  for (const url of plannedUrls) {
    try {
      const { size } = await stat(resolve(BUILD_CLIENT_DIR, url));
      if (size > MAX_FILE_SIZE_BYTES) oversized.push(`${url} (${size} bytes)`);
    } catch {
      missingOnDisk.push(url);
    }
  }

  const { missing, extra, shellCount, routeManifestCount } = computePrecacheDiff(
    plannedUrls,
    injectedUrls,
  );

  // Every route (and every layout above it) the plan declares offline must have
  // its module in the manifest, reported by route id rather than by hash.
  const injectedSet = new Set(injectedUrls);
  const ancestry = resolveOfflineRouteIds(routeManifest, OFFLINE_ROUTE_IDS);
  const missingRouteModules = ancestry.ids
    .map((id) => [id, String(routeManifest.routes[id].module ?? '').replace(/^\//, '')])
    .filter(([, module]) => module && !injectedSet.has(module))
    .map(([id, module]) => `${id} -> ${module}`);

  const errors = [];

  if (plan.unknownRouteIds.length > 0) {
    errors.push(
      'OFFLINE_ROUTE_IDS names route id(s) that are absent from the built route manifest ' +
        '(renamed or removed route module):\n' +
        plan.unknownRouteIds.map((id) => `  - ${id}`).join('\n'),
    );
  }
  if (plan.missingChunks.length > 0) {
    errors.push(
      'the precache plan references chunk(s) that are not in build/client:\n' +
        plan.missingChunks.map((url) => `  - ${url}`).join('\n'),
    );
  }
  if (missingOnDisk.length > 0) {
    errors.push(
      'planned asset(s) are missing from build/client:\n' +
        missingOnDisk.map((url) => `  - ${url}`).join('\n'),
    );
  }
  if (oversized.length > 0) {
    errors.push(
      `planned asset(s) exceed maximumFileSizeToCacheInBytes (${MAX_FILE_SIZE_BYTES}):\n` +
        oversized.map((entry) => `  - ${entry}`).join('\n'),
    );
  }
  if (missing.length > 0) {
    errors.push(
      `${missing.length} planned asset(s) are missing from the injected manifest:\n` +
        missing.map((url) => `  - ${url}`).join('\n'),
    );
  }
  if (extra.length > 0) {
    errors.push(
      `${extra.length} injected asset(s) are not part of the offline plan (the install is ` +
        'downloading something nobody declared):\n' +
        extra.map((url) => `  - ${url}`).join('\n'),
    );
  }
  if (missingRouteModules.length > 0) {
    errors.push(
      'offline route(s) have no module entry in the precache manifest:\n' +
        missingRouteModules.map((entry) => `  - ${entry}`).join('\n'),
    );
  }
  if (shellCount !== 1) {
    errors.push(
      `expected exactly one "index.html" entry in the precache manifest, found ${shellCount}`,
    );
  }
  if (routeManifestCount !== 1) {
    errors.push(
      `expected exactly one "assets/manifest-*.js" entry in the precache manifest, found ${routeManifestCount}`,
    );
  }

  const { shortfalls } = checkRequiredFamilies(injectedUrls);
  if (shortfalls.length > 0) {
    errors.push(
      'required precache families are off their declared counts ' +
        '(see REQUIRED_PRECACHE_FAMILIES in precache-patterns.mjs):\n' +
        shortfalls
          .map((s) => `  - ${s.family}: expected ${s.expected}, found ${s.actual}`)
          .join('\n'),
    );
  }

  const { leaked } = checkForbiddenPrefixes(injectedUrls, FORBIDDEN_PRECACHE_PREFIXES);
  if (leaked.length > 0) {
    errors.push(
      'online-only chunk(s) reached the precache manifest (see FORBIDDEN_PRECACHE_PREFIXES ' +
        'in precache-patterns.mjs):\n' +
        leaked.map((url) => `  - ${url}`).join('\n'),
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
    `verify-sw-precache: OK — ${injectedEntries.length} precached entries; shell and route manifest ` +
      `each present exactly once; all ${REQUIRED_PRECACHE_FAMILIES.length} required families at their declared counts.`,
  );
}

await main();
