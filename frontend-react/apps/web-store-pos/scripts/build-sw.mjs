#!/usr/bin/env node
// Post-build precache injection (pwa-precache-build spec: "Manifest injection
// runs after the client build"). Runs AFTER `react-router build` has finished
// writing `build/client/{index.html,assets/manifest-<hash>.js,...}` to disk,
// so the glob below observes the FINISHED output rather than
// vite-plugin-pwa's in-build `closeBundle` injection (design.md D1).
//
// Two steps, one owner each:
//   1. esbuild bundles app/service-worker.ts (+ its sw-strategy.ts import)
//      into a standalone IIFE at build/.sw-bundle.js (design.md D2/D3).
//   2. workbox-build's injectManifest reads that bundle, replaces the
//      `self.__WB_MANIFEST` placeholder with the real manifest computed from
//      the shared glob patterns, and writes build/client/service-worker.js.
// The temporary bundle is then removed — it must never live inside
// build/client, or it would glob itself into its own precache (Correction/D2
// in design.md).
import { build } from 'esbuild';
import { injectManifest } from 'workbox-build';
import { rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_GLOB_IGNORES,
  MAX_FILE_SIZE_BYTES,
} from './precache-patterns.mjs';

const ROOT = process.cwd();
const SW_SRC = resolve(ROOT, 'app/service-worker.ts');
const SW_BUNDLE = resolve(ROOT, 'build/.sw-bundle.js');
const SW_DEST = resolve(ROOT, 'build/client/service-worker.js');
const GLOB_DIRECTORY = resolve(ROOT, 'build/client');

const INJECTION_POINT = 'self.__WB_MANIFEST';

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
  // reliable pre-flight check — workbox-build's own
  // `multiple-injection-points` assert only fires *during* injectManifest,
  // with a less actionable error message.
  const bundleSource = await readFile(SW_BUNDLE, 'utf8');
  const occurrences = bundleSource.split(INJECTION_POINT).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `build-sw: expected exactly one occurrence of "${INJECTION_POINT}" in the pre-injection ` +
        `bundle (${SW_BUNDLE}), found ${occurrences}. Check app/service-worker.ts and ` +
        `app/shared/lib/pwa/sw-strategy.ts for a second reference to self.__WB_MANIFEST.`
    );
  }

  await injectManifest({
    swSrc: SW_BUNDLE,
    swDest: SW_DEST,
    globDirectory: GLOB_DIRECTORY,
    globPatterns: PRECACHE_GLOB_PATTERNS,
    globIgnores: PRECACHE_GLOB_IGNORES,
    maximumFileSizeToCacheInBytes: MAX_FILE_SIZE_BYTES,
  });

  await rm(SW_BUNDLE, { force: true });

  console.log(`build-sw: injected manifest into ${SW_DEST}`);
}

await main();
