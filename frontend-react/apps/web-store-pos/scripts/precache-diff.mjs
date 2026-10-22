// Pure comparison logic for the precache build gate. Given the planned URLs
// (precache-plan.mjs) and the URLs actually injected into the built
// `service-worker.js`, decides what is missing and whether the shell / route
// manifest / allowlist invariants hold. No I/O — so this logic has Vitest
// coverage without a real build.
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
          'add one to FAMILY_MATCHERS in precache-diff.mjs',
      );
    }
    const actual = injectedUrls.filter(matcher).length;
    if (actual !== expected) {
      shortfalls.push({ family, expected, actual });
    }
  }

  return { shortfalls, ok: shortfalls.length === 0 };
}

/**
 * Compares the planned set against the injected manifest in both directions.
 * `extra` is the allowlist's teeth: a URL nobody planned is a chunk the install
 * downloaded without a decision. `missing` is the shell losing something.
 */
export function computePrecacheDiff(plannedUrls, injectedUrls) {
  const plannedSet = new Set(plannedUrls);
  const injectedSet = new Set(injectedUrls);
  const missing = plannedUrls.filter((url) => !injectedSet.has(url)).sort();
  const extra = injectedUrls.filter((url) => !plannedSet.has(url)).sort();

  const shellCount = injectedUrls.filter((url) => url === 'index.html').length;
  const routeManifestCount = injectedUrls.filter((url) =>
    /^assets\/manifest-.*\.js$/.test(url),
  ).length;

  const ok =
    missing.length === 0 && extra.length === 0 && shellCount === 1 && routeManifestCount === 1;

  return { missing, extra, shellCount, routeManifestCount, ok };
}

/**
 * Chunk names follow the route module file name, so a prefix survives every
 * content hash. This is the gate's independent check: `computePrecacheDiff`
 * compares the plan against the injection, and both sides agree when the PLAN
 * itself regresses. A forbidden prefix in the manifest means an online-only
 * view is being downloaded on install again.
 */
export function checkForbiddenPrefixes(injectedUrls, prefixes) {
  const leaked = injectedUrls
    .filter((url) => prefixes.some((prefix) => url.startsWith(prefix)))
    .sort();

  return { leaked, ok: leaked.length === 0 };
}
