import { describe, it, expect } from 'vitest';
import { computePrecacheDiff } from '../precache-diff.mjs';

// ── computePrecacheDiff — pwa-precache-build spec ────────────────────────────
// Pure comparison logic extracted from verify-sw-precache.mjs (verify-report
// SUGGESTION #3, pwa-offline-shell): given the on-disk URLs matching the
// shared precache patterns and the URLs actually injected into the built
// service-worker.js, decides what is missing and whether the shell / route
// manifest invariants hold. No filesystem, no workbox-build — safe to run
// under Vitest with no real build present.

describe('computePrecacheDiff', () => {
  it('reports failure for the actual Phase 2.2 RED scenario (10 known-missing paths)', () => {
    // Exact scenario captured in apply-progress.md's "Regression Evidence":
    // the pre-fix build's injected manifest was missing these 10 paths.
    const missingPaths = [
      'index.html',
      'assets/manifest-4cde2a13.js',
      'manifest.webmanifest',
      'favicon.png',
      'images/help/add-cat-dialog.png',
      'images/help/add-entry-dialog.png',
      'images/help/add-product-btn.png',
      'images/help/add-product-dialog.png',
      'images/help/menu.png',
      'images/help/register.png',
    ];
    const alreadyPresent = ['icons/icon-192x192.png', 'fonts/inter/inter-regular.woff2'];

    const result = computePrecacheDiff([...missingPaths, ...alreadyPresent], alreadyPresent);

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([...missingPaths].sort());
    expect(result.shellCount).toBe(0);
    expect(result.routeManifestCount).toBe(0);
  });

  it('reports success when the manifest is complete', () => {
    const urls = [
      'index.html',
      'assets/manifest-7c3d2092.js',
      'manifest.webmanifest',
      'favicon.png',
      'icons/icon-192x192.png',
    ];

    const result = computePrecacheDiff(urls, urls);

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.shellCount).toBe(1);
    expect(result.routeManifestCount).toBe(1);
  });

  it('does not fail when service-worker.js is absent from both lists (the ignore-list case)', () => {
    // `PRECACHE_GLOB_IGNORES` (precache-patterns.mjs) excludes
    // `service-worker.js` from the disk-side glob (getManifest), and
    // injectManifest excludes its own swDest from the injected manifest
    // internally (design.md Correction 1). So by the time onDiskUrls reaches
    // this function, `service-worker.js` is present in NEITHER list — it
    // must never be reported as "missing", or every build would fail.
    const onDiskUrls = ['index.html', 'assets/manifest-abc123.js'];
    const injectedUrls = ['index.html', 'assets/manifest-abc123.js'];

    const result = computePrecacheDiff(onDiskUrls, injectedUrls);

    expect(result.missing).not.toContain('service-worker.js');
    expect(result.ok).toBe(true);
  });

  it('fails when there are zero index.html entries in the manifest', () => {
    const onDiskUrls = ['index.html', 'assets/manifest-abc123.js'];
    const injectedUrls = ['assets/manifest-abc123.js'];

    const result = computePrecacheDiff(onDiskUrls, injectedUrls);

    expect(result.ok).toBe(false);
    expect(result.shellCount).toBe(0);
  });

  it('fails when there is more than one assets/manifest-*.js entry in the manifest', () => {
    const onDiskUrls = ['index.html', 'assets/manifest-abc123.js', 'assets/manifest-def456.js'];
    const injectedUrls = ['index.html', 'assets/manifest-abc123.js', 'assets/manifest-def456.js'];

    const result = computePrecacheDiff(onDiskUrls, injectedUrls);

    expect(result.ok).toBe(false);
    expect(result.routeManifestCount).toBe(2);
  });
});
