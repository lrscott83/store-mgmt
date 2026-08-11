// Single source of truth for every CSP directive this app ships (design.md
// §0, D1, D3). Consumed by three worlds: vite.config.ts (TypeScript, via the
// sibling csp-policy.d.mts declaration — design.md D2), scripts/verify-csp.mjs
// / scripts/csp-nginx.mjs (Node ESM, build gate — design.md D7, WU3), and this
// file's own Vitest coverage (scripts/__tests__/csp-policy.test.mjs).
// Precedent, not invention: scripts/precache-patterns.mjs is the same
// "declared data + builder, one shared module" shape for the precache
// manifest (design.md D1).

// The report-only header this change ships. Enforcing mode is a separate,
// future change (spec.md "Purpose").
export const CSP_HEADER_NAME = 'Content-Security-Policy-Report-Only';

// The only directive allowed to differ between dev and prod (design.md D3).
// A future engineer who wants a second axis edits this constant on purpose —
// same shape as precache-patterns.mjs's REQUIRED_PRECACHE_FAMILIES ("Adding a
// tutorial screenshot ... is expected to fail the gate until the number here
// is updated on purpose").
export const ALLOWED_ENV_DELTA_DIRECTIVES = ['connect-src'];

// Canonical directive order AND canonical per-directive token order — both
// fixed here so serialization never depends on object key iteration order.
// This IS the production policy (design.md D3's canonical string); dev
// overrides only 'connect-src' (design.md D4).
const BASE_DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  ['form-action', ["'self'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]], // permanent carve-out, spec.md — chart tooltip inline styles
  ['img-src', ["'self'"]],
  ['font-src', ["'self'"]],
  ['connect-src', ["'self'"]],
  ['worker-src', ["'self'"]],
  ['manifest-src', ["'self'"]],
];

// Matches apps/web-store-pos/vite.config.ts's server.host/server.port
// (design.md D4). Overridable so the generator itself carries no hidden
// coupling to the config that calls it.
const DEFAULT_DEV_SERVER_ORIGIN = 'http://localhost:3333';

/**
 * design.md D4's four-row table. Returns the origin (scheme + host + port, no
 * path) of a cross-origin API URL, or null when the value is same-origin
 * ('self' already covers it), empty, undefined, or unparseable — every one of
 * those means there is nothing to add to connect-src. Never throws: a
 * malformed API_URL must not crash the dev server.
 */
export function deriveApiOrigin(apiUrl) {
  if (!apiUrl) return null;
  try {
    return new URL(apiUrl).origin;
  } catch {
    return null; // relative ('/api') or genuinely unparseable
  }
}

function deriveWsOrigin(devServerOrigin) {
  try {
    const parsed = new URL(devServerOrigin);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Builds the ordered directive table for one environment. Returns a Map so
 * insertion order is guaranteed (design.md D3 "fixed order") regardless of
 * JS engine object-key ordering quirks.
 */
export function buildCspDirectives(env, options = {}) {
  const directives = new Map(BASE_DIRECTIVES.map(([name, tokens]) => [name, [...tokens]]));

  if (env === 'dev') {
    const { apiUrl, devServerOrigin = DEFAULT_DEV_SERVER_ORIGIN } = options;
    const connectSrc = ["'self'"];
    const apiOrigin = deriveApiOrigin(apiUrl);
    if (apiOrigin) connectSrc.push(apiOrigin);
    const wsOrigin = deriveWsOrigin(devServerOrigin);
    if (wsOrigin) connectSrc.push(wsOrigin);
    directives.set('connect-src', connectSrc);
  }

  return directives;
}

/**
 * Canonical serialization (design.md D3): fixed directive order (the Map's
 * insertion order), a single space between tokens, "; " between directives,
 * no trailing ';'. Two calls with the same inputs always produce the same
 * string — two policies differing only in whitespace must never be reported
 * as drift.
 */
export function buildCspHeaderValue(env, options = {}) {
  const directives = buildCspDirectives(env, options);
  return [...directives.entries()].map(([name, tokens]) => `${name} ${tokens.join(' ')}`).join('; ');
}
