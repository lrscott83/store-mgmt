// Pure comparison logic for the precache build gate. Given the on-disk URLs
// matching the shared precache patterns (workbox-build's `getManifest()`, run
// with `PRECACHE_GLOB_IGNORES`) and the URLs actually injected into the built
// `service-worker.js`, decides what is missing and whether the shell / route
// manifest invariants hold. No I/O — extracted from verify-sw-precache.mjs
// (verify-report SUGGESTION #3, pwa-offline-shell) purely so this logic has
// Vitest coverage; the script itself is unchanged in behavior, output, and
// exit code.
export function computePrecacheDiff(onDiskUrls, injectedUrls) {
  const injectedSet = new Set(injectedUrls);
  const missing = onDiskUrls.filter((url) => !injectedSet.has(url)).sort();

  const shellCount = injectedUrls.filter((url) => url === 'index.html').length;
  const routeManifestCount = injectedUrls.filter((url) => /^assets\/manifest-.*\.js$/.test(url)).length;

  const ok = missing.length === 0 && shellCount === 1 && routeManifestCount === 1;

  return { missing, shellCount, routeManifestCount, ok };
}
