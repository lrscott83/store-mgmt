import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PRECACHE_GLOB_IGNORES } from '../precache-patterns.mjs';

// -- Built precache invariants - 2026-10-22 online-only precache exclusions ----
// `verify-sw-precache.mjs` compares on-disk against injected, and both sides
// apply the SAME ignore list, so a chunk that is both ignored and precached is
// invisible to it. These assertions read the real build output instead: they
// only run when `build/client` exists (CI builds before testing; a fresh clone
// skips them), and they pin the two rules the owner asked for:
//   1. nothing matched by an ignore pattern is precached,
//   2. the heavy libraries the offline POS needs stay precached.

const CLIENT_DIR = join(process.cwd(), 'build/client');
const SW_PATH = join(CLIENT_DIR, 'service-worker.js');
const HAS_BUILD = existsSync(SW_PATH);

const ignoreMatchers = PRECACHE_GLOB_IGNORES.map(
  (pattern) =>
    new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*')}$`),
);

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

describe.skipIf(!HAS_BUILD)('built precache invariants', () => {
  it('precaches no URL matched by an ignore pattern', () => {
    const leaked = readInjectedUrls().filter((url) =>
      ignoreMatchers.some((matcher) => matcher.test(url)),
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

  it('precaches the module chunk of every route the ignore list does not cover', () => {
    const urls = new Set(readInjectedUrls());
    const missing = Object.entries(readRouteManifest().routes)
      .map(([id, route]) => [id, String(route.module ?? '').replace(/^\//, '')])
      .filter(([, module]) => module && !ignoreMatchers.some((matcher) => matcher.test(module)))
      .filter(([, module]) => !urls.has(module))
      .map(([id, module]) => `${id} -> ${module}`);

    expect(missing).toEqual([]);
  });
});
