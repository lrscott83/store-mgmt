#!/usr/bin/env node
// Post-build precache injection (pwa-precache-build spec: "Manifest injection
// runs after the client build"). Runs AFTER `react-router build` has finished
// writing `build/client/{index.html,assets/manifest-<hash>.js,...}` to disk, so
// the plan below observes the FINISHED output rather than vite-plugin-pwa's
// in-build `closeBundle` injection (design.md D1).
//
// Steps, one owner each:
//   1. esbuild bundles app/service-worker.ts (+ its sw-strategy.ts import)
//      into a standalone IIFE at build/.sw-bundle.js (design.md D2/D3).
//   2. The precache plan is resolved from the route manifest
//      (precache-plan.mjs): the closure of OFFLINE_ROUTE_IDS plus the static
//      shell families. Nothing else is precached.
//   3. workbox-build's injectManifest replaces the `self.__WB_MANIFEST`
//      placeholder with exactly those entries and writes
//      build/client/service-worker.js.
// The temporary bundle is then removed — it must never live inside
// build/client.
import { build } from 'esbuild';
import { getManifest, injectManifest } from 'workbox-build';
import { rm, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  MAX_FILE_SIZE_BYTES,
  OFFLINE_ROUTE_IDS,
  PRECACHE_STATIC_PATTERNS,
} from './precache-patterns.mjs';
import { parseRouteManifest, resolvePrecachePlan } from './precache-plan.mjs';

const ROOT = process.cwd();
const SW_SRC = resolve(ROOT, 'app/service-worker.ts');
const SW_BUNDLE = resolve(ROOT, 'build/.sw-bundle.js');
const SW_DEST = resolve(ROOT, 'build/client/service-worker.js');
const GLOB_DIRECTORY = resolve(ROOT, 'build/client');

const INJECTION_POINT = 'self.__WB_MANIFEST';

async function findRouteManifest() {
  let entries;
  try {
    entries = await readdir(join(GLOB_DIRECTORY, 'assets'));
  } catch {
    throw new Error(
      `build-sw: cannot read ${join(GLOB_DIRECTORY, 'assets')} — did react-router build run?`,
    );
  }

  const file = entries.find((name) => /^manifest-.*\.js$/.test(name));
  if (!file) {
    throw new Error(
      'build-sw: no assets/manifest-<hash>.js route manifest in the build output. ' +
        'The precache plan cannot be resolved without it.',
    );
  }

  return {
    absolutePath: resolve(GLOB_DIRECTORY, 'assets', file),
    url: `assets/${file}`,
  };
}

async function main() {
  await build({
    entryPoints: [SW_SRC],
    outfile: SW_BUNDLE,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    sourcemap: false,
    legalComments: 'none',
  });

  // Belt-and-braces (design.md D3): count the injection-point placeholder in
  // the bundle BEFORE injecting. esbuild's minifier does not rename member
  // expressions like `self.__WB_MANIFEST`, so this occurrence count is a
  // reliable pre-flight check.
  const bundleSource = await readFile(SW_BUNDLE, 'utf8');
  const occurrences = bundleSource.split(INJECTION_POINT).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `build-sw: expected exactly one occurrence of "${INJECTION_POINT}" in the pre-injection ` +
        `bundle (${SW_BUNDLE}), found ${occurrences}. Check app/service-worker.ts and ` +
        `app/shared/lib/pwa/sw-strategy.ts for a second reference to self.__WB_MANIFEST.`,
    );
  }

  const routeManifestFile = await findRouteManifest();
  const routeManifest = parseRouteManifest(await readFile(routeManifestFile.absolutePath, 'utf8'));

  // Static shell families come from the planner's own glob list; their
  // revisions are computed by workbox later, together with every chunk.
  // No size filter here: the plan must see every static candidate so an
  // oversized one is reported instead of silently dropped from both sides.
  const { manifestEntries: staticEntries } = await getManifest({
    globDirectory: GLOB_DIRECTORY,
    globPatterns: PRECACHE_STATIC_PATTERNS,
    maximumFileSizeToCacheInBytes: Number.MAX_SAFE_INTEGER,
  });

  const plan = await resolvePrecachePlan({
    routeManifest,
    offlineRouteIds: OFFLINE_ROUTE_IDS,
    staticUrls: staticEntries.map((entry) => entry.url),
    routeManifestUrl: routeManifestFile.url,
    readChunk: (url) => readFile(resolve(GLOB_DIRECTORY, url), 'utf8').catch(() => null),
  });

  if (plan.unknownRouteIds.length > 0) {
    throw new Error(
      'build-sw: OFFLINE_ROUTE_IDS names route id(s) that are absent from the built route ' +
        `manifest — a route module was renamed or removed:\n  - ${plan.unknownRouteIds.join('\n  - ')}`,
    );
  }

  if (plan.missingChunks.length > 0) {
    throw new Error(
      'build-sw: the precache plan references chunk(s) that are not in build/client:\n' +
        `  - ${plan.missingChunks.join('\n  - ')}`,
    );
  }

  const { manifestEntries } = await getManifest({
    globDirectory: GLOB_DIRECTORY,
    globPatterns: plan.urls,
    maximumFileSizeToCacheInBytes: MAX_FILE_SIZE_BYTES,
  });

  // A plan URL that getManifest does not return was dropped by the size limit or
  // is missing on disk. Never inject a silently shorter manifest.
  const resolved = new Set(manifestEntries.map((entry) => entry.url));
  const unresolved = plan.urls.filter((url) => !resolved.has(url));
  if (unresolved.length > 0) {
    throw new Error(
      'build-sw: planned precache URL(s) could not be resolved from build/client ' +
        `(missing, or over ${MAX_FILE_SIZE_BYTES} bytes):\n  - ${unresolved.join('\n  - ')}`,
    );
  }

  await injectManifest({
    swSrc: SW_BUNDLE,
    swDest: SW_DEST,
    globDirectory: GLOB_DIRECTORY,
    globPatterns: [],
    additionalManifestEntries: manifestEntries,
    maximumFileSizeToCacheInBytes: MAX_FILE_SIZE_BYTES,
  });

  await rm(SW_BUNDLE, { force: true });

  console.log(`build-sw: injected manifest into ${SW_DEST}`);
}

await main();
