import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FORBIDDEN_PRECACHE_PREFIXES, OFFLINE_ROUTE_IDS } from '../precache-patterns.mjs';

// ── Built precache invariants — allowlist model (2026-10-22) ────────────────
// `verify-sw-precache.mjs` compares the plan against the injection, and both
// sides share the planner, so a planner bug where the allowlist silently grows
// would be invisible to it. These assertions read the real build output
// instead: they only run when `build/client` exists (CI builds before testing; a
// fresh clone skips them).
//
// Pinned rules, straight from the owner's requirement:
//   1. no online-only chunk reaches the precache,
//   2. every offline route's module IS precached,
//   3. a route outside the offline set plus its ancestors is NOT precached,
//   4. the heavy libraries the offline POS needs stay precached.

const CLIENT_DIR = join(process.cwd(), 'build/client');
const SW_PATH = join(CLIENT_DIR, 'service-worker.js');
const HAS_BUILD = existsSync(SW_PATH);

function readInjectedUrls() {
  const source = readFileSync(SW_PATH, 'utf8');
  const start = source.indexOf('[{"revision"');
  if (start === -1) throw new Error('no injected precache manifest found in service-worker.js');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(start, i + 1)).map((entry) => entry.url);
      }
    }
  }

  throw new Error('unterminated injected precache manifest');
}

function readRouteManifest() {
  const assetsDir = join(CLIENT_DIR, 'assets');
  const file = readdirSync(assetsDir).find((name) => /^manifest-.*\.js$/.test(name));
  if (!file) throw new Error('no assets/manifest-*.js route manifest in the build');

  const raw = readFileSync(join(assetsDir, file), 'utf8');
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

function moduleOf(route) {
  return String(route?.module ?? '').replace(/^\//, '');
}

/** Offline route ids plus every layout above them. */
function allowedRouteIds(routeManifest) {
  const allowed = new Set();
  for (const routeId of OFFLINE_ROUTE_IDS) {
    const visited = new Set();
    let currentId = routeId;
    while (currentId && routeManifest.routes?.[currentId] && !visited.has(currentId)) {
      visited.add(currentId);
      allowed.add(currentId);
      currentId = routeManifest.routes[currentId].parentId;
    }
  }
  return allowed;
}

describe.skipIf(!HAS_BUILD)('built precache invariants', () => {
  it('precaches no online-only chunk', () => {
    const leaked = readInjectedUrls().filter((url) =>
      FORBIDDEN_PRECACHE_PREFIXES.some((prefix) => url.startsWith(prefix)),
    );

    expect(leaked).toEqual([]);
  });

  it('keeps the heavy libraries the offline POS depends on', () => {
    const urls = readInjectedUrls();
    const required = [
      'assets/chart-core-',
      'assets/jspdf.es.min-',
      'assets/jspdf.plugin.autotable-',
      'assets/html2canvas.esm-',
      'assets/zip-fs-wasm-',
    ];

    for (const prefix of required) {
      expect(
        urls.some((url) => url.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
  });

  it('precaches the module of every offline route and of each layout above it', () => {
    const routeManifest = readRouteManifest();
    const urls = new Set(readInjectedUrls());
    const missing = [...allowedRouteIds(routeManifest)]
      .map((id) => [id, moduleOf(routeManifest.routes[id])])
      .filter(([, module]) => module && !urls.has(module))
      .map(([id, module]) => `${id} -> ${module}`);

    expect(missing).toEqual([]);
  });

  it('precaches no route module outside the offline set', () => {
    const routeManifest = readRouteManifest();
    const allowed = allowedRouteIds(routeManifest);
    const urls = new Set(readInjectedUrls());
    const leaked = Object.entries(routeManifest.routes)
      .filter(([id]) => !allowed.has(id))
      .map(([id, route]) => [id, moduleOf(route)])
      .filter(([, module]) => module && urls.has(module))
      .map(([id, module]) => `${id} -> ${module}`);

    expect(leaked).toEqual([]);
  });
});
