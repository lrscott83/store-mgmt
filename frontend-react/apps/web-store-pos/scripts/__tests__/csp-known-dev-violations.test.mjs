import { describe, it, expect } from 'vitest';
import { KNOWN_DEV_ONLY_VIOLATIONS, isKnownDevOnly } from '../csp-known-dev-violations.mjs';

// 2026-08-12: this matcher used to live only in e2e/support/csp-violations.ts,
// outside vitest.config.ts's `include` globs — zero automated coverage for
// the logic that decides whether a CSP violation is safely ignorable. Moved
// here so a regex widened by accident fails fast, not only on a full
// Playwright run.

function record(overrides = {}) {
  return {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sample: 'window.__reactRouterContext = {"basename":"/"}',
    ...overrides,
  };
}

describe('KNOWN_DEV_ONLY_VIOLATIONS', () => {
  it('every entry requires a non-empty reason', () => {
    for (const entry of KNOWN_DEV_ONLY_VIOLATIONS) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('every sampleMatch is anchored with ^ (design.md — no unanchored prefix)', () => {
    for (const entry of KNOWN_DEV_ONLY_VIOLATIONS) {
      expect(entry.sampleMatch.source.startsWith('^')).toBe(true);
    }
  });
});

describe('isKnownDevOnly', () => {
  it('matches the react-router hydration payload entry', () => {
    expect(isKnownDevOnly(record({ sample: 'window.__reactRouterContext = {"basename":"/"}' }))).toBe(true);
  });

  it('matches the streamController.enqueue/close calls too (same prefix)', () => {
    expect(
      isKnownDevOnly(record({ sample: 'window.__reactRouterContext.streamController.close();' }))
    ).toBe(true);
  });

  it('matches the HydrateFallback dev-warning entry', () => {
    expect(
      isKnownDevOnly(record({ sample: '\n              console.log(\n                "💿 Hey developer 👋. ..."' }))
    ).toBe(true);
  });

  it('matches the Vite virtual-module import entry', () => {
    expect(
      isKnownDevOnly(record({ sample: 'import "/@id/__x00__virtual:react-router/server-build"' }))
    ).toBe(true);
  });

  it('trims leading whitespace from the sample before matching', () => {
    expect(isKnownDevOnly(record({ sample: '   \n  window.__reactRouterContext = {}' }))).toBe(true);
  });

  it('does NOT match a genuinely new inline script (the case this allowlist must never swallow)', () => {
    expect(isKnownDevOnly(record({ sample: 'window.someAttackerPayload = fetch(...)' }))).toBe(false);
  });

  it('does NOT match on directive/blockedURI alone without a sample match', () => {
    expect(isKnownDevOnly(record({ sample: 'totally unrelated content' }))).toBe(false);
  });

  it('does NOT match a different effectiveDirective even with a matching sample', () => {
    expect(
      isKnownDevOnly(
        record({ effectiveDirective: 'style-src-elem', sample: 'window.__reactRouterContext = {}' })
      )
    ).toBe(false);
  });

  it('does NOT match a different blockedURI even with a matching sample', () => {
    expect(isKnownDevOnly(record({ blockedURI: 'https://evil.example.com/x.js', sample: 'window.__reactRouterContext = {}' }))).toBe(
      false
    );
  });

  it('does NOT match an empty sample (report-sample missing from the header must not silently widen the allowlist)', () => {
    expect(isKnownDevOnly(record({ sample: '' }))).toBe(false);
  });
});
