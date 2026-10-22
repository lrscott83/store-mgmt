import { describe, it, expect } from 'vitest';
import {
  checkForbiddenPrefixes,
  checkRequiredFamilies,
  computePrecacheDiff,
} from '../precache-diff.mjs';

// ── computePrecacheDiff — pwa-precache-build spec ────────────────────────────
// Pure comparison logic: given the planned precache URLs (precache-plan.mjs) and
// the URLs actually injected into the built service-worker.js, decides what is
// missing, what leaked in, and whether the shell / route manifest invariants
// hold. No filesystem, no workbox-build — safe to run under Vitest with no real
// build present.

describe('computePrecacheDiff', () => {
  it('reports failure for the historical 10 known-missing paths', () => {
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

  it('reports success when the manifest matches the plan', () => {
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
    expect(result.extra).toEqual([]);
    expect(result.shellCount).toBe(1);
    expect(result.routeManifestCount).toBe(1);
  });

  it('does not fail when service-worker.js is absent from both lists', () => {
    // The planner never enumerates `**/*.js`, so the worker is never a
    // candidate; by the time this runs it is in NEITHER list.
    const onDiskUrls = ['index.html', 'assets/manifest-abc123.js'];
    const injectedUrls = ['index.html', 'assets/manifest-abc123.js'];

    const result = computePrecacheDiff(onDiskUrls, injectedUrls);

    expect(result.missing).not.toContain('service-worker.js');
    expect(result.ok).toBe(true);
  });

  it('fails when the manifest injects an asset nobody planned', () => {
    const planned = ['index.html', 'assets/manifest-abc123.js'];
    const injected = [...planned, 'assets/web-catalog-DzleFifX.js'];

    const result = computePrecacheDiff(planned, injected);

    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(['assets/web-catalog-DzleFifX.js']);
    expect(result.missing).toEqual([]);
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

// ── checkForbiddenPrefixes — allowlist teeth ─────────────────────────────────
// Vite names a chunk after its route module, so the prefix survives every
// content hash. `computePrecacheDiff` cannot catch an online-only chunk that the
// PLAN itself started including (both sides would agree); this can.

describe('checkForbiddenPrefixes', () => {
  const prefixes = ['assets/web-catalog-', 'assets/user-list-', 'assets/ordering-'];

  it('passes when no forbidden prefix is precached', () => {
    const result = checkForbiddenPrefixes(
      ['index.html', 'assets/sale-DJTd-HKs.js', 'assets/today-orders-BM1WGCY-.js'],
      prefixes,
    );

    expect(result.ok).toBe(true);
    expect(result.leaked).toEqual([]);
  });

  it('flags every leaked online-only chunk, sorted', () => {
    const result = checkForbiddenPrefixes(
      ['assets/user-list-BA4L9ZTW.js', 'assets/sale-DJTd-HKs.js', 'assets/web-catalog-DzleFifX.js'],
      prefixes,
    );

    expect(result.ok).toBe(false);
    expect(result.leaked).toEqual([
      'assets/user-list-BA4L9ZTW.js',
      'assets/web-catalog-DzleFifX.js',
    ]);
  });

  it('does not match a prefix in the middle of a URL', () => {
    const result = checkForbiddenPrefixes(['assets/my-web-catalog-thing.js'], prefixes);

    expect(result.ok).toBe(true);
  });
});

describe('checkRequiredFamilies', () => {
  it('passes when every declared family is at its count', () => {
    const urls = [
      'index.html',
      'assets/manifest-abc.js',
      'manifest.webmanifest',
      'favicon.png',
      ...Array.from({ length: 6 }, (_, i) => `images/help/${i}.png`),
      ...Array.from({ length: 5 }, (_, i) => `fonts/inter/${i}.woff2`),
      ...Array.from({ length: 8 }, (_, i) => `icons/${i}.png`),
    ];

    expect(checkRequiredFamilies(urls).ok).toBe(true);
  });

  it('flags a family that lost an asset', () => {
    const urls = ['index.html', 'assets/manifest-abc.js', 'manifest.webmanifest', 'favicon.png'];

    const { shortfalls } = checkRequiredFamilies(urls);

    expect(shortfalls).toContainEqual({ family: 'images/**/*.png', expected: 6, actual: 0 });
    expect(shortfalls).toContainEqual({ family: 'fonts/**/*.woff2', expected: 5, actual: 0 });
    expect(shortfalls).toContainEqual({ family: 'icons/*.png', expected: 8, actual: 0 });
  });
});
