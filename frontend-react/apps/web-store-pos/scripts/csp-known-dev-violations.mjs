// Pure matcher for e2e/support/csp-violations.ts's zero-violation sweep
// (design.md §4.4.3, spec.md "No Violations on Real Routes"). Extracted out
// of e2e/support/ 2026-08-12: that directory is outside vitest.config.ts's
// `include` globs (`app/**`, `scripts/**`), so this matcher — the thing that
// decides whether a CSP violation is safely ignorable — had zero automated
// coverage; a regex widened by accident would only ever be caught by a full
// Playwright run. Living here gives it the same Vitest coverage as
// csp-policy.mjs / csp-nginx.mjs / csp-hydration-hashes.mjs.
// e2e/support/csp-violations.ts imports KNOWN_DEV_ONLY_VIOLATIONS and
// isKnownDevOnly from this file; everything Playwright-specific (the
// `Page`-driven observer) stays there.

/**
 * @typedef {object} KnownDevOnlyViolation
 * @property {string} effectiveDirective
 * @property {string} blockedURI
 * @property {RegExp} sampleMatch The violation's `sample` (leading whitespace
 *   trimmed) must match this. This is what keeps the allowlist narrow:
 *   without it, an entry for `blockedURI: 'inline'` would swallow every
 *   inline script on every route, including one a future change introduces
 *   by accident. A RegExp rather than a plain prefix because the browser
 *   samples the script's raw source — react-router's HydrateFallback warning
 *   carried a newline and 16 spaces inside the first 40 characters, so no
 *   literal prefix survived contact with it. Anchor every pattern with `^`.
 * @property {string} reason Why this is dev-only. Required — an entry nobody
 *   can justify is an entry nobody can retire.
 */

/**
 * @typedef {object} CspViolationSample
 * @property {string} effectiveDirective
 * @property {string} blockedURI
 * @property {string} sample
 */

/**
 * Started empty (design.md §4.4.3, spec.md "No Violations on Real Routes")
 * and gained its first entry the moment task 2.3's RED sweep actually ran —
 * design.md §6.7 named this in advance as "the single most likely thing to
 * force a revision of §4.4":
 *
 * `@react-router/dev@7.15.1`'s dev SSR document — which runs even in SPA mode
 * (`react-router.config.ts` `ssr: false`; the dev server still SSRs the
 * initial HTML, only the BUILD skips it) — inlines the client hydration
 * payload as three bare `<script>` tags with no `src`:
 * `window.__reactRouterContext = {...}`, then two
 * `window.__reactRouterContext.streamController.enqueue(...)` /
 * `.close()` calls (verified by curling `http://localhost:3333/` directly
 * and inspecting the raw HTML — NOT a Playwright artifact). Chrome reports
 * all three identically as `effectiveDirective: 'script-src-elem'`,
 * `blockedURI: 'inline'` — so those two fields alone cannot tell this
 * payload apart from a genuinely new inline script. `script-src` therefore
 * declares `'report-sample'` (csp-policy.mjs), which grants no source any
 * permission and only makes the report carry a `sample`. All three scripts
 * are emitted from string literals that begin with
 * `window.__reactRouterContext` (react-router@7.15.1
 * `dist/development/chunk-4N6VE7H7.mjs:8189, 8201, 9983` — read from the
 * package on disk, not inferred from a run), so ONE prefix covers all three
 * and nothing else.
 *
 * Never fixed by adding `'unsafe-inline'` to `script-src` — that deletes the
 * reason this change exists (spec.md, "script-src Excludes Unsafe
 * Keywords").
 *
 * VERIFIED 2026-08-12 (csp-hydration-hashes.mjs): `react-router build`'s
 * static output (SPA mode) DOES carry the same inline payload — this entry
 * covers dev only; production is allowlisted separately, by hash, in
 * `deploy/nginx.conf` (a static file cannot get a fresh per-request nonce).
 */
export const KNOWN_DEV_ONLY_VIOLATIONS = [
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sampleMatch: /^window\.__reactRouterContext/,
    reason:
      "react-router's dev SSR hydration payload — three inline scripts emitted from literals starting " +
      'with this (react-router@7.15.1 dist/development/chunk-4N6VE7H7.mjs:8189, :8201, :9983). Verified ' +
      "2026-08-12 to ALSO ship in production; that copy is allowlisted by hash in deploy/nginx.conf, not here.",
  },
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sampleMatch: /^console\.log\(\s*"\u{1F4BF} Hey dev/u,
    reason:
      "react-router's RemixRootDefaultHydrateFallback console warning " +
      '(chunk-4N6VE7H7.mjs:8903-8917), an inline `dangerouslySetInnerHTML` script gated on ' +
      "React Router's default HydrateFallback. Verified 2026-08-12 that it ALSO shipped in production " +
      "(app/root.tsx never defined its own HydrateFallback); fixed at the source instead of allowlisted — " +
      'root.tsx now exports HydrateFallback, so react-router never falls back to this script in EITHER ' +
      'environment. This entry stays only in case a future regression reintroduces the default fallback.',
  },
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sampleMatch: /^import "\/@id\/__x00__virtual:react-router/,
    reason:
      "Vite's dev-only module injection for @react-router/dev's virtual modules " +
      '(@react-router/dev/dist/vite.js). The production build resolves these at bundle time and ' +
      'emits no inline import.',
  },
];

/**
 * True if `sample`, `effectiveDirective`, and `blockedURI` match one of
 * `KNOWN_DEV_ONLY_VIOLATIONS`. `sample` is matched with leading whitespace
 * trimmed — same reason every `sampleMatch` regex is anchored with `^`
 * instead of relying on `RegExp.test` to skip leading characters.
 *
 * @param {CspViolationSample} record
 * @returns {boolean}
 */
export function isKnownDevOnly(record) {
  return KNOWN_DEV_ONLY_VIOLATIONS.some(
    (known) =>
      known.effectiveDirective === record.effectiveDirective &&
      known.blockedURI === record.blockedURI &&
      known.sampleMatch.test(record.sample.trimStart())
  );
}
