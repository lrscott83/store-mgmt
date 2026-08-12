import { describe, it, expect } from 'vitest';
import {
  buildCspDirectives,
  buildCspHeaderValue,
  deriveApiOrigin,
  ALLOWED_ENV_DELTA_DIRECTIVES,
  CSP_HEADER_NAME,
} from '../csp-policy.mjs';

// content-security-policy spec — design.md §4.2 / D3. `csp-policy.mjs` is the
// ONLY place a directive is written (design.md §0); this file is Vitest's
// half of the strategy split (§4): pure functions and strings need no
// browser, so they never appear in a Playwright spec.

describe('csp-policy', () => {
  describe('production directives', () => {
    it('script-src is exactly self, no unsafe-inline or unsafe-eval', () => {
      const value = buildCspHeaderValue('prod');
      expect(value).toContain("script-src 'self'");
      expect(value).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(value).not.toMatch(/unsafe-eval/);
    });

    it("script-src declares 'report-sample' so a report says WHICH inline script violated", () => {
      // Not a relaxation: 'report-sample' grants no source any permission, it
      // only makes the violation report carry the first ~40 chars of the
      // offending script. Without it Chrome reports every inline script
      // identically (`blockedURI: 'inline'`), so the Playwright sweep's
      // KNOWN_DEV_ONLY_VIOLATIONS allowlist could only be written broadly
      // enough to swallow a genuinely new inline script too. See
      // e2e/support/csp-violations.ts.
      const value = buildCspHeaderValue('prod');
      expect(value).toMatch(/script-src [^;]*'report-sample'/);
    });

    it('style-src carries the permanent unsafe-inline carve-out', () => {
      const value = buildCspHeaderValue('prod');
      expect(value).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('matches the canonical production string byte-for-byte (design.md D3)', () => {
      expect(buildCspHeaderValue('prod')).toBe(
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
          "form-action 'self'; script-src 'self' 'report-sample'; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self'; " +
          "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'"
      );
    });
  });

  describe('deriveApiOrigin — design.md D4 four-row table', () => {
    it.each([
      ['http://localhost:5019/api', 'http://localhost:5019'],
      ['/api', null],
      ['', null],
      [undefined, null],
      ['not a url at all', null],
    ])('%s -> %s', (input, expected) => {
      expect(deriveApiOrigin(input)).toBe(expected);
    });
  });

  describe('canonical serialization', () => {
    it('is stable across two calls', () => {
      const first = buildCspHeaderValue('prod');
      const second = buildCspHeaderValue('prod');
      expect(first).toBe(second);
    });

    it('has no trailing semicolon', () => {
      expect(buildCspHeaderValue('prod')).not.toMatch(/;\s*$/);
    });

    it('separates directives with "; " and tokens with a single space (no runs of whitespace)', () => {
      const value = buildCspHeaderValue('prod');
      for (const directive of value.split('; ')) {
        expect(directive).not.toMatch(/\s{2,}/);
      }
    });
  });

  describe('dev vs prod parity — design.md D3 delta axis', () => {
    it('directive order is identical between dev and prod', () => {
      const dev = buildCspDirectives('dev', { apiUrl: 'http://localhost:5019/api' });
      const prod = buildCspDirectives('prod');
      expect([...dev.keys()]).toEqual([...prod.keys()]);
    });

    it('every directive except those in ALLOWED_ENV_DELTA_DIRECTIVES is identical', () => {
      const dev = buildCspDirectives('dev', { apiUrl: 'http://localhost:5019/api' });
      const prod = buildCspDirectives('prod');

      for (const name of dev.keys()) {
        const devTokens = dev.get(name).join(' ');
        const prodTokens = prod.get(name).join(' ');
        if (devTokens === prodTokens) continue;
        expect(ALLOWED_ENV_DELTA_DIRECTIVES).toContain(name);
      }
    });

    it('dev connect-src includes the derived API origin and the explicit ws HMR origin', () => {
      const dev = buildCspDirectives('dev', {
        apiUrl: 'http://localhost:5019/api',
        devServerOrigin: 'http://localhost:3333',
      });
      expect(dev.get('connect-src')).toEqual(["'self'", 'http://localhost:5019', 'ws://localhost:3333']);
    });

    it('dev connect-src with no apiUrl still includes the ws HMR origin, never crashes', () => {
      const dev = buildCspDirectives('dev', { devServerOrigin: 'http://localhost:3333' });
      expect(dev.get('connect-src')).toEqual(["'self'", 'ws://localhost:3333']);
    });
  });

  it('exports the report-only header name', () => {
    expect(CSP_HEADER_NAME).toBe('Content-Security-Policy-Report-Only');
  });

  describe('hydrationScriptHashes option — 2026-08-12 hash-allowlist for react-router\'s SPA hydration payload', () => {
    it('is a no-op when omitted — every existing caller stays byte-for-byte unaffected', () => {
      expect(buildCspHeaderValue('prod')).toContain("script-src 'self' 'report-sample';");
    });

    it('is a no-op for an empty array', () => {
      expect(buildCspHeaderValue('prod', { hydrationScriptHashes: [] })).toBe(buildCspHeaderValue('prod'));
    });

    it('appends the given hash sources to script-src, after the existing tokens', () => {
      const value = buildCspHeaderValue('prod', {
        hydrationScriptHashes: ["'sha256-AAAA'", "'sha256-BBBB'"],
      });
      expect(value).toContain("script-src 'self' 'report-sample' 'sha256-AAAA' 'sha256-BBBB';");
    });

    it('never relaxes script-src to unsafe-inline or unsafe-eval', () => {
      const value = buildCspHeaderValue('prod', { hydrationScriptHashes: ["'sha256-AAAA'"] });
      expect(value).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(value).not.toMatch(/unsafe-eval/);
    });
  });
});
