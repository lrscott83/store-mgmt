import { describe, it, expect } from 'vitest';
import { checkRequiredFamilies } from '../precache-diff.mjs';
import { REQUIRED_PRECACHE_FAMILIES } from '../precache-patterns.mjs';

// ── checkRequiredFamilies — pwa-offline-shell task 8.2 ───────────────────────
// `computePrecacheDiff` only diffs on-disk → manifest, so it cannot see a
// family that vanished from the BUILD OUTPUT: a deleted woff2 is not on disk,
// therefore not "missing from the manifest", therefore green. Offline fonts
// break and the gate says OK.
//
// Task 8.2 asks a human to eyeball Cache Storage for exactly these families.
// This is that check, executable. The counts are the ones precache-patterns.mjs
// already claims in prose.

const fullManifest = () => [
  'index.html',
  'assets/manifest-4cde2a13.js',
  'manifest.webmanifest',
  'favicon.png',
  ...Array.from({ length: 6 }, (_, i) => `images/help/screenshot-${i}.png`),
  ...Array.from({ length: 5 }, (_, i) => `fonts/inter/inter-${i}.woff2`),
  ...Array.from({ length: 8 }, (_, i) => `icons/icon-${i}.png`),
  // Route chunks and CSS are precached too and are deliberately unconstrained —
  // their count moves with every code split.
  'assets/route-abc123.js',
  'assets/route-def456.js',
  'assets/styles-a1b2c3.css',
];

describe('checkRequiredFamilies', () => {
  it('passes on a manifest carrying every required family at its expected count', () => {
    const result = checkRequiredFamilies(fullManifest());

    expect(result.ok).toBe(true);
    expect(result.shortfalls).toEqual([]);
  });

  it('catches a family that vanished from the build entirely — the hole the on-disk diff cannot see', () => {
    const withoutFonts = fullManifest().filter((url) => !url.endsWith('.woff2'));

    const result = checkRequiredFamilies(withoutFonts);

    expect(result.ok).toBe(false);
    expect(result.shortfalls).toHaveLength(1);
    expect(result.shortfalls[0]).toMatchObject({
      family: 'fonts/**/*.woff2',
      expected: 5,
      actual: 0,
    });
  });

  it('catches a partial loss — 4 of 5 fonts survive a bad build', () => {
    const oneFontShort = fullManifest().filter((url) => url !== 'fonts/inter/inter-4.woff2');

    const result = checkRequiredFamilies(oneFontShort);

    expect(result.ok).toBe(false);
    expect(result.shortfalls[0]).toMatchObject({ expected: 5, actual: 4 });
  });

  it('reports every failing family at once, not just the first', () => {
    const stripped = fullManifest().filter(
      (url) => !url.endsWith('.woff2') && !url.startsWith('images/'),
    );

    const result = checkRequiredFamilies(stripped);

    expect(result.shortfalls.map((s) => s.family).sort()).toEqual([
      'fonts/**/*.woff2',
      'images/**/*.png',
    ]);
  });

  it('flags a count that GREW, so adding an asset forces an intentional update here', () => {
    const extraImage = [...fullManifest(), 'images/help/screenshot-6.png'];

    const result = checkRequiredFamilies(extraImage);

    expect(result.ok).toBe(false);
    expect(result.shortfalls[0]).toMatchObject({
      family: 'images/**/*.png',
      expected: 6,
      actual: 7,
    });
  });

  it('pins the declared counts, so the prose in precache-patterns.mjs cannot drift from the gate', () => {
    expect(REQUIRED_PRECACHE_FAMILIES).toEqual([
      { family: 'index.html', expected: 1 },
      { family: 'assets/manifest-*.js', expected: 1 },
      { family: 'manifest.webmanifest', expected: 1 },
      { family: 'favicon.png', expected: 1 },
      { family: 'images/**/*.png', expected: 6 },
      { family: 'fonts/**/*.woff2', expected: 5 },
      { family: 'icons/*.png', expected: 8 },
    ]);
  });
});
