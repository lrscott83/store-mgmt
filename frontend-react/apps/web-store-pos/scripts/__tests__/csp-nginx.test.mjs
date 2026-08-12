import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildCspHeaderValue, buildCspDirectives, CSP_HEADER_NAME } from '../csp-policy.mjs';
import {
  extractAddHeaders,
  parseCspHeaderValue,
  diffPolicies,
  checkNginxConf,
  checkConnectSrcCoverage,
  EXPECTED_ADD_HEADERS,
} from '../csp-nginx.mjs';

// design.md §3 / §4.3 — WU3's drift verifier. `csp-nginx.mjs` is pure: parse /
// diff / check, no file I/O (design.md D7). It mirrors precache-diff.mjs's
// role in the precache triple: extracted purely so this logic has Vitest
// coverage, tested with fixtures BEFORE deploy/nginx.conf is ever touched.

// `deploy/nginx.conf` is 4 levels up from this test file:
// scripts/__tests__/ -> scripts/ -> web-store-pos/ -> apps/ -> frontend-react/
const NGINX_CONF_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../deploy/nginx.conf');

const CANONICAL_PROD_VALUE = buildCspHeaderValue('prod');

function fixtureConf(addHeaderLines) {
  return `events { worker_connections 1024; }\n\nhttp {\n  server {\n    listen 80;\n${addHeaderLines}\n    location / { try_files $uri /index.html; }\n  }\n}\n`;
}

describe('csp-nginx', () => {
  describe('extractAddHeaders', () => {
    it('extracts name, value and the always flag from a well-formed directive', () => {
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;`);
      const headers = extractAddHeaders(conf);
      expect(headers).toHaveLength(1);
      expect(headers[0].name).toBe(CSP_HEADER_NAME);
      expect(headers[0].value).toBe(CANONICAL_PROD_VALUE);
      expect(headers[0].always).toBe(true);
    });

    it('returns an empty array when no add_header directive is present', () => {
      expect(extractAddHeaders(fixtureConf(''))).toEqual([]);
    });

    it('reports always: false when the flag is absent', () => {
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}";`);
      expect(extractAddHeaders(conf)[0].always).toBe(false);
    });
  });

  describe('parseCspHeaderValue', () => {
    it('parses a canonical value into a directive-name -> tokens Map', () => {
      const parsed = parseCspHeaderValue("default-src 'self'; script-src 'self' 'report-sample'");
      expect(parsed.get('default-src')).toEqual(["'self'"]);
      expect(parsed.get('script-src')).toEqual(["'self'", "'report-sample'"]);
    });

    it('tolerates irregular whitespace without losing tokens', () => {
      const parsed = parseCspHeaderValue("default-src   'self' ;  script-src 'self'   'report-sample'  ");
      expect(parsed.get('default-src')).toEqual(["'self'"]);
      expect(parsed.get('script-src')).toEqual(["'self'", "'report-sample'"]);
    });
  });

  describe('diffPolicies', () => {
    it('reports no differences for two identical policy Maps', () => {
      const a = buildCspDirectives('prod');
      const b = buildCspDirectives('prod');
      expect(diffPolicies(a, b)).toEqual({ onlyInA: [], onlyInB: [], differingTokens: [] });
    });

    it('is order-insensitive: reordered tokens within a directive are NOT a difference', () => {
      const a = new Map([['script-src', ["'self'", "'report-sample'"]]]);
      const b = new Map([['script-src', ["'report-sample'", "'self'"]]]);
      expect(diffPolicies(a, b).differingTokens).toEqual([]);
    });

    it('reports onlyInA, onlyInB and differingTokens correctly', () => {
      const a = new Map([
        ['default-src', ["'self'"]],
        ['extra-only-a', ["'self'"]],
        ['script-src', ["'self'"]],
      ]);
      const b = new Map([
        ['default-src', ["'self'"]],
        ['extra-only-b', ["'self'"]],
        ['script-src', ["'self'", "'unsafe-inline'"]],
      ]);
      expect(diffPolicies(a, b)).toEqual({
        onlyInA: ['extra-only-a'],
        onlyInB: ['extra-only-b'],
        differingTokens: ['script-src'],
      });
    });
  });

  describe('checkNginxConf', () => {
    it('passes for a well-formed conf carrying the exact canonical production policy', () => {
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;`);
      expect(checkNginxConf(conf)).toEqual([]);
    });

    it('passes when the policy is reordered but token-equivalent (proves set/multiset comparison, not byte comparison)', () => {
      const reordered =
        "style-src 'self' 'unsafe-inline'; default-src 'self'; script-src 'report-sample' 'self'; " +
        "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; " +
        "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'";
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${reordered}" always;`);
      expect(checkNginxConf(conf)).toEqual([]);
    });

    it('fails when the header is missing entirely', () => {
      const errors = checkNginxConf(fixtureConf(''));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => /missing/i.test(e))).toBe(true);
    });

    it('fails when the header is declared twice (ambiguous)', () => {
      const conf = fixtureConf(
        `    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;\n` +
          `    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;`
      );
      const errors = checkNginxConf(conf);
      expect(errors.some((e) => /ambiguous|found 2/i.test(e))).toBe(true);
    });

    it('fails when the "always" flag is missing', () => {
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}";`);
      const errors = checkNginxConf(conf);
      expect(errors.some((e) => /always/i.test(e))).toBe(true);
    });

    it('fails when a directive is missing from the nginx value', () => {
      const dropped = CANONICAL_PROD_VALUE.replace(/script-src[^;]*; /, '');
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${dropped}" always;`);
      const errors = checkNginxConf(conf);
      expect(errors.some((e) => /script-src/.test(e))).toBe(true);
    });

    it('fails when a directive value differs from the generator', () => {
      const weakened = CANONICAL_PROD_VALUE.replace("script-src 'self' 'report-sample'", "script-src 'self' 'unsafe-inline'");
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${weakened}" always;`);
      const errors = checkNginxConf(conf);
      expect(errors.some((e) => /script-src/.test(e))).toBe(true);
    });

    it('fails when an extra, undeclared add_header is present (design.md D6 — a header inside a location block can shadow the CSP header)', () => {
      const conf = fixtureConf(
        `    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;\n` +
          `    add_header X-Frame-Options "DENY" always;`
      );
      const errors = checkNginxConf(conf);
      expect(errors.some((e) => /X-Frame-Options/.test(e))).toBe(true);
    });

    it('the delta axis never fires against the real generator (no ALLOWED_ENV_DELTA_DIRECTIVES violation)', () => {
      // This check reads no file — it is an invariant of csp-policy.mjs itself
      // (design.md §3 check 4), asserted here indirectly: a conforming conf
      // must pass with zero errors, which it does above. This test pins the
      // dedicated failure message shape by constructing the diff directly.
      const dev = buildCspDirectives('dev');
      const prod = buildCspDirectives('prod');
      const { differingTokens } = diffPolicies(dev, prod);
      for (const name of differingTokens) {
        expect(['connect-src']).toContain(name);
      }
    });
  });

  describe('checkConnectSrcCoverage — the build-failing coverage check', () => {
    it('returns null for a same-origin apiUrl', () => {
      expect(checkConnectSrcCoverage('/api')).toBeNull();
    });

    it('returns null for an empty/undefined apiUrl', () => {
      expect(checkConnectSrcCoverage('')).toBeNull();
      expect(checkConnectSrcCoverage(undefined)).toBeNull();
    });

    it('returns an error string (not throwing, not an error object) for a cross-origin apiUrl not covered by prod connect-src', () => {
      const error = checkConnectSrcCoverage('https://api.example.com/api');
      expect(typeof error).toBe('string');
      expect(error).toMatch(/api\.example\.com/);
      expect(error).toMatch(/connect-src/);
    });

    it('names the same-origin fix, so the failing build tells the operator what to do', () => {
      const error = checkConnectSrcCoverage('https://api.example.com/api');
      expect(error).toMatch(/API_URL=\/api/);
    });
  });

  describe('checkNginxConf — cross-origin API_URL is a build failure, not a warning', () => {
    const validConf = () => fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;`);

    it('reports an error when the build-time apiUrl is cross-origin', () => {
      const errors = checkNginxConf(validConf(), { apiUrl: 'https://api.example.com/api' });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/api\.example\.com/);
    });

    it('reports no error when the build-time apiUrl is the same-origin default', () => {
      expect(checkNginxConf(validConf(), { apiUrl: '/api' })).toEqual([]);
    });

    it('reports no error when no apiUrl is supplied at all', () => {
      expect(checkNginxConf(validConf())).toEqual([]);
    });
  });

  describe('checkNginxConf — hydrationScriptHashes (2026-08-12: react-router SPA hydration payload)', () => {
    const HASHES = ["'sha256-AAAA'", "'sha256-BBBB'", "'sha256-CCCC'"];

    it('passes when nginx.conf carries exactly the hashes a fresh build produced', () => {
      const value = buildCspHeaderValue('prod', { hydrationScriptHashes: HASHES });
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${value}" always;`);
      expect(checkNginxConf(conf, { hydrationScriptHashes: HASHES })).toEqual([]);
    });

    it('fails when nginx.conf is missing a hash the fresh build produced (the enforcing-flip blocker this closes)', () => {
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;`);
      const errors = checkNginxConf(conf, { hydrationScriptHashes: HASHES });
      expect(errors.some((e) => /script-src/.test(e))).toBe(true);
    });

    it('fails when nginx.conf carries a stale hash a NEW build no longer produces (react-router upgrade drift)', () => {
      const stale = buildCspHeaderValue('prod', { hydrationScriptHashes: ["'sha256-STALE'"] });
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${stale}" always;`);
      const errors = checkNginxConf(conf, { hydrationScriptHashes: HASHES });
      expect(errors.some((e) => /script-src/.test(e))).toBe(true);
    });

    it('omitted entirely, behaves exactly like before (no hash expected, no hash tolerated)', () => {
      const conf = fixtureConf(`    add_header ${CSP_HEADER_NAME} "${CANONICAL_PROD_VALUE}" always;`);
      expect(checkNginxConf(conf)).toEqual([]);
    });
  });

  describe('EXPECTED_ADD_HEADERS', () => {
    it('declares exactly the CSP header today', () => {
      expect(EXPECTED_ADD_HEADERS).toEqual([CSP_HEADER_NAME]);
    });
  });

  it('deploy/nginx.conf carries the exact production policy', async () => {
    const conf = await readFile(NGINX_CONF_PATH, 'utf8');
    // Same reason `apiUrl` is never passed here either: this file has no
    // fresh `build/client/` to hash (that's scripts/verify-csp.mjs's job,
    // covered above with synthetic hashes). Reads the hash tokens nginx.conf
    // ALREADY declares so this test still catches every OTHER kind of drift
    // (a missing directive, a weakened token, a dropped 'always') without
    // requiring a build to run first.
    const declaredHashes = (parseCspHeaderValue(extractAddHeaders(conf)[0]?.value ?? '').get('script-src') ?? [])
      .filter((token) => token.startsWith("'sha256-"));
    expect(checkNginxConf(conf, { hydrationScriptHashes: declaredHashes })).toEqual([]);
  });
});
