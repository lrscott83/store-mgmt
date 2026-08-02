// Pure comparison logic for the precache build gate. Given the on-disk URLs
// matching the shared precache patterns (workbox-build's `getManifest()`, run
// with `PRECACHE_GLOB_IGNORES`) and the URLs actually injected into the built
// `service-worker.js`, decides what is missing and whether the shell / route
// manifest invariants hold. No I/O — extracted from verify-sw-precache.mjs
// (verify-report SUGGESTION #3, pwa-offline-shell) purely so this logic has
// Vitest coverage; the script itself is unchanged in behavior, output, and
// exit code.
import { REQUIRED_PRECACHE_FAMILIES } from './precache-patterns.mjs';

// How each declared family is recognised in a manifest URL. Kept next to the
// diff logic rather than next to the counts so `precache-patterns.mjs` stays
// the single place a human edits a number.
const FAMILY_MATCHERS = {
  'index.html': (url) => url === 'index.html',
  'assets/manifest-*.js': (url) => /^assets\/manifest-.*\.js$/.test(url),
  'manifest.webmanifest': (url) => url === 'manifest.webmanifest',
  'favicon.png': (url) => url === 'favicon.png',
  'images/**/*.png': (url) => /^images\/.*\.png$/.test(url),
  'fonts/**/*.woff2': (url) => /\.woff2$/.test(url),
  'icons/*.png': (url) => /^icons\/.*\.png$/.test(url),
};

/**
 * Asserts the offline shell's required asset families are present at their
 * declared counts. Deviation in EITHER direction is a shortfall: a count that
 * dropped means the shell lost an asset it needs offline, and a count that grew
 * means someone added one without deciding it belongs in the precache.
 */
export function checkRequiredFamilies(injectedUrls) {
  const shortfalls = [];

  for (const { family, expected } of REQUIRED_PRECACHE_FAMILIES) {
    const matcher = FAMILY_MATCHERS[family];
    if (!matcher) {
      throw new Error(
        `checkRequiredFamilies: no matcher declared for required family "${family}" — ` +
          'add one to FAMILY_MATCHERS in precache-diff.mjs'
      );
    }
    const actual = injectedUrls.filter(matcher).length;
    if (actual !== expected) {
      shortfalls.push({ family, expected, actual });
    }
  }

  return { shortfalls, ok: shortfalls.length === 0 };
}

export function computePrecacheDiff(onDiskUrls, injectedUrls) {
  const injectedSet = new Set(injectedUrls);
  const missing = onDiskUrls.filter((url) => !injectedSet.has(url)).sort();

  const shellCount = injectedUrls.filter((url) => url === 'index.html').length;
  const routeManifestCount = injectedUrls.filter((url) => /^assets\/manifest-.*\.js$/.test(url)).length;

  const ok = missing.length === 0 && shellCount === 1 && routeManifestCount === 1;

  return { missing, shellCount, routeManifestCount, ok };
}
