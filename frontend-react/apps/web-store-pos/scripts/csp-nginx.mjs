// Pure comparison logic for the CSP build gate (design.md §3, D7). Given
// `deploy/nginx.conf`'s text and the canonical policy `csp-policy.mjs`
// generates, decides whether the file carries the declared production
// policy — no I/O. Extracted purely so this logic has Vitest coverage,
// mirroring `precache-diff.mjs`'s role in the precache triple
// (`csp-policy.mjs` -> `csp-nginx.mjs` -> `verify-csp.mjs`).
import { ALLOWED_ENV_DELTA_DIRECTIVES, CSP_HEADER_NAME, buildCspDirectives, deriveApiOrigin } from './csp-policy.mjs';

// The declared set of `add_header` names `deploy/nginx.conf` is allowed to
// contain (design.md D6). A header added anywhere in the file that is not on
// this list fails the build — because `add_header` is NOT merged into a
// child block that declares its own, so a header added inside `location /`
// would silently shadow this one and nothing else would notice. Same
// "update the constant on purpose" shape as
// `precache-patterns.mjs`'s `REQUIRED_PRECACHE_FAMILIES`.
export const EXPECTED_ADD_HEADERS = [CSP_HEADER_NAME];

// Matches `add_header <Name> "<value>" [always];`. The value is always
// double-quoted in this file because CSP keyword syntax uses single quotes
// ('self', 'none', ...), so a literal `"` inside the value never occurs.
const ADD_HEADER_RE = /add_header\s+(\S+)\s+"([^"]*)"\s*(always)?\s*;/g;

/**
 * Extracts every `add_header` directive found anywhere in the nginx config
 * text, in file order. Deliberately a flat regex scan, not a brace-depth
 * parser (design.md D6 "Rejected": more code, more ways to be subtly wrong,
 * and it still would not catch a header added at `http` level).
 */
export function extractAddHeaders(conf) {
  const headers = [];
  for (const match of conf.matchAll(ADD_HEADER_RE)) {
    const [raw, name, value, always] = match;
    headers.push({ name, value, always: Boolean(always), raw });
  }
  return headers;
}

/**
 * Parses a CSP header VALUE (not the whole `add_header` line) into a
 * Map<directiveName, tokens[]> — the same shape `buildCspDirectives`
 * returns, so it can be compared with `diffPolicies`. Tolerant of irregular
 * whitespace: a hand-edited nginx.conf is not guaranteed to match the
 * generator's canonical spacing, and that must never be reported as drift
 * (design.md D3 "two policies differing only in whitespace must serialize
 * identically").
 */
export function parseCspHeaderValue(text) {
  const directives = new Map();
  for (const part of text.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...tokens] = trimmed.split(/\s+/).filter(Boolean);
    directives.set(name, tokens);
  }
  return directives;
}

/**
 * Compares two directive Maps. Directive presence is compared as a SET
 * (`onlyInA`/`onlyInB`); each directive present in both is compared as a
 * TOKEN MULTISET (`differingTokens`) — so directive order and intra-directive
 * token order are never drift, only a missing/added/changed directive is
 * (design.md §3 check 3).
 */
export function diffPolicies(a, b) {
  const namesA = new Set(a.keys());
  const namesB = new Set(b.keys());

  const onlyInA = [...namesA].filter((name) => !namesB.has(name)).sort();
  const onlyInB = [...namesB].filter((name) => !namesA.has(name)).sort();

  const differingTokens = [];
  for (const name of namesA) {
    if (!namesB.has(name)) continue;
    const tokensA = [...a.get(name)].sort().join(' ');
    const tokensB = [...b.get(name)].sort().join(' ');
    if (tokensA !== tokensB) differingTokens.push(name);
  }
  differingTokens.sort();

  return { onlyInA, onlyInB, differingTokens };
}

/**
 * The five checks from design.md §3, in order, plus check 6 — the build-time
 * `apiUrl` coverage check, promoted from a non-fatal warning to a hard
 * failure (see `checkConnectSrcCoverage`). Returns an array of
 * human-readable error strings; empty means pass. Never rewrites the config
 * — "a gate that fixes the thing it guards is not a gate".
 *
 * `options.apiUrl` is optional: callers with no build-time API_URL in hand
 * (the fixture tests, the `deploy/nginx.conf` drift test) get checks 1-5
 * exactly as before.
 *
 * `options.hydrationScriptHashes` is optional too: an array of
 * `'sha256-<base64>'` source strings computed by
 * scripts/csp-hydration-hashes.mjs from a fresh `build/client/index.html`
 * (scripts/verify-csp.mjs is the only caller with that file in hand). Omitted
 * by every fixture test, so check 3's `script-src` comparison stays exactly
 * `'self' 'report-sample'` for them — only the real build-gate run compares
 * against the hash-augmented value.
 */
export function checkNginxConf(conf, options = {}) {
  const errors = [];
  const addHeaders = extractAddHeaders(conf);
  const cspHeaders = addHeaders.filter((header) => header.name === CSP_HEADER_NAME);

  // 1. Presence.
  if (cspHeaders.length === 0) {
    errors.push(
      `the production policy is missing: no "${CSP_HEADER_NAME}" add_header directive found in the nginx config`
    );
  } else if (cspHeaders.length > 1) {
    errors.push(
      `ambiguous: found ${cspHeaders.length} "${CSP_HEADER_NAME}" add_header directives, expected exactly 1`
    );
  }

  if (cspHeaders.length === 1) {
    const [cspHeader] = cspHeaders;

    // 2. `always` flag.
    if (!cspHeader.always) {
      errors.push(
        `the "${CSP_HEADER_NAME}" add_header is missing the "always" flag — the header would be dropped ` +
          'on non-2xx/3xx responses'
      );
    }

    // 3. Text equality with the generator. `hydrationScriptHashes` (check 6.1
    // below) is threaded in here so a fresh build's hydration-script hashes
    // are compared against nginx.conf exactly like every other token —
    // missing/stale hashes surface as an ordinary script-src drift error.
    const nginxDirectives = parseCspHeaderValue(cspHeader.value);
    const prodDirectives = buildCspDirectives('prod', { hydrationScriptHashes: options.hydrationScriptHashes });
    const { onlyInA: onlyInNginx, onlyInB: missingFromNginx, differingTokens } = diffPolicies(
      nginxDirectives,
      prodDirectives
    );
    if (onlyInNginx.length > 0) {
      errors.push(`nginx declares directive(s) the generated production policy does not: ${onlyInNginx.join(', ')}`);
    }
    if (missingFromNginx.length > 0) {
      errors.push(`nginx is missing directive(s) the generated production policy declares: ${missingFromNginx.join(', ')}`);
    }
    for (const name of differingTokens) {
      errors.push(
        `directive "${name}" differs between nginx.conf ("${nginxDirectives.get(name).join(' ')}") and the ` +
          `generated production policy ("${prodDirectives.get(name).join(' ')}")`
      );
    }
  }

  // 4. The delta axis. Reads no file — an invariant of the generator itself
  // (design.md §3 check 4): dev and prod must declare the same directive
  // NAMES, and may differ in TOKENS only on directives named in
  // ALLOWED_ENV_DELTA_DIRECTIVES. Catches "someone added 'unsafe-eval' to dev
  // script-src because HMR complained".
  const devDirectives = buildCspDirectives('dev');
  const prodDirectivesForDelta = buildCspDirectives('prod');
  const delta = diffPolicies(devDirectives, prodDirectivesForDelta);
  if (delta.onlyInA.length > 0) {
    errors.push(`dev declares directive(s) prod does not: ${delta.onlyInA.join(', ')}`);
  }
  if (delta.onlyInB.length > 0) {
    errors.push(`prod declares directive(s) dev does not: ${delta.onlyInB.join(', ')}`);
  }
  const disallowedDelta = delta.differingTokens.filter((name) => !ALLOWED_ENV_DELTA_DIRECTIVES.includes(name));
  if (disallowedDelta.length > 0) {
    errors.push(
      `dev and prod differ on directive(s) outside ALLOWED_ENV_DELTA_DIRECTIVES ` +
        `(${ALLOWED_ENV_DELTA_DIRECTIVES.join(', ')}): ${disallowedDelta.join(', ')}`
    );
  }

  // 5. EXPECTED_ADD_HEADERS — the file may contain exactly the declared set
  // of add_header names (design.md D6).
  const presentNames = [...new Set(addHeaders.map((header) => header.name))].sort();
  const expectedNames = [...EXPECTED_ADD_HEADERS].sort();
  const undeclared = presentNames.filter((name) => !expectedNames.includes(name));
  const missingDeclared = expectedNames.filter((name) => !presentNames.includes(name));
  if (undeclared.length > 0) {
    errors.push(
      `nginx.conf declares add_header(s) not in EXPECTED_ADD_HEADERS: ${undeclared.join(', ')} — a header added ` +
        'inside a location block can silently shadow the CSP header (design.md D6); update EXPECTED_ADD_HEADERS ' +
        'in csp-nginx.mjs if this is intentional'
    );
  }
  if (missingDeclared.length > 0) {
    errors.push(`nginx.conf is missing declared add_header(s): ${missingDeclared.join(', ')}`);
  }

  // 6. Build-time API_URL coverage. Lives here, in the pure layer, rather
  // than as a second verdict `verify-csp.mjs` has to interpret: the fatality
  // decision is then unit-tested like every other check, and the script keeps
  // its single failure path.
  const connectSrcError = checkConnectSrcCoverage(options.apiUrl);
  if (connectSrcError) errors.push(connectSrcError);

  return errors;
}

/**
 * If the build-time API_URL resolves to a cross-origin value the production
 * connect-src does not cover, returns an error STRING (never throws, never an
 * error object). Pure and file-I/O-free so the failure path is real,
 * unit-tested code rather than a decorative comment.
 *
 * This was design.md §3's "non-fatal check", and shipped as a warning because
 * a wrong connect-src cannot harm a user while the header is report-only.
 * It is fatal now: the bundle that a cross-origin API_URL produces is one
 * `Report-Only` -> `Content-Security-Policy` flip away from an app whose every
 * API call is blocked, and a build is the last place that can still say so.
 * The deploy is same-origin by construction — `Dockerfile`'s `ARG API_URL=/api`
 * default, proxied by `deploy/nginx.conf`'s `location /api` — so nothing that
 * exists today trips this. Pointing the bundle at another host stays possible,
 * but it now costs a deliberate edit here instead of an unnoticed `--build-arg`.
 */
export function checkConnectSrcCoverage(apiUrl) {
  const apiOrigin = deriveApiOrigin(apiUrl);
  if (!apiOrigin) return null; // same-origin, empty, undefined, or unparseable — nothing to report

  const prodConnectSrc = buildCspDirectives('prod').get('connect-src') ?? [];
  if (prodConnectSrc.includes(apiOrigin)) return null;

  return (
    `the build-time API_URL ("${apiUrl}") resolves to the cross-origin value "${apiOrigin}", which the ` +
    `production connect-src ("${prodConnectSrc.join(' ')}") does not cover — every API call the deployed app ` +
    'makes would violate the policy. This deploy serves the API same-origin: build with API_URL=/api (the ' +
    'Dockerfile default), which deploy/nginx.conf proxies to the backend. Serving the API from another origin ' +
    'is a deliberate change: connect-src in scripts/csp-policy.mjs has to learn that origin first.'
  );
}
