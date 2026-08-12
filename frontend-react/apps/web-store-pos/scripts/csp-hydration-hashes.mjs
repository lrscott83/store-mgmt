// Pure hashing logic for the react-router SPA-mode hydration payload
// (design.md's "No Violations on Real Routes" register, item (a) — "NOT
// VERIFIED whether react-router build's static output carries the same
// inline payload"). Verified 2026-08-12: it does. `react-router build`
// (ssr:false) prerenders `build/client/index.html` once, inlining three bare
// `<script>` tags (no `src`) that bootstrap client hydration —
// `window.__reactRouterContext = {...}`, then two
// `.streamController.enqueue(...)` / `.close()` calls. `script-src 'self'`
// forbids inline scripts outright; a CSP hash-source
// (`'sha256-<base64 of the exact script bytes>'`) is the correct fit for a
// STATIC file served identically to every visitor — a nonce needs a fresh
// value per HTTP response, which a prebuilt `index.html` served by plain
// nginx `try_files` cannot provide (design.md's "future enforcing" register
// already assumes nonce is impractical here without ADR).
//
// Mirrors precache-diff.mjs / csp-nginx.mjs's shape: no I/O here, so this has
// direct Vitest coverage; the caller (scripts/verify-csp.mjs) does the single
// `readFile('build/client/index.html')`.
import { createHash } from 'node:crypto';

// Same prefix e2e/support/csp-violations.ts's KNOWN_DEV_ONLY_VIOLATIONS
// anchors on for the identical reason: the browser samples the script's raw
// source, and every hydration-bootstrap script react-router emits (the
// context assignment AND both streamController calls) starts with this
// literal. Anchored with `^` so it can never match arbitrary app code that
// happens to mention the identifier mid-string.
const HYDRATION_SCRIPT_PREFIX = /^window\.__reactRouterContext/;

// Matches a `<script>` tag with NO `src` attribute (an inline script) and
// captures its exact raw content — not `.trim()`ed, because the CSP hash
// algorithm hashes the literal bytes between the tags, whitespace included.
const INLINE_SCRIPT_RE = /<script>([\s\S]*?)<\/script>/g;

/**
 * Extracts every inline `<script>` in `html` whose content matches
 * `HYDRATION_SCRIPT_PREFIX`, hashes each with SHA-256 per the CSP hash-source
 * algorithm, and returns the sorted, deduplicated `'sha256-<base64>'` source
 * list. Sorted so the result is stable across calls regardless of the
 * scripts' order in the document (multiple builds of the same content must
 * produce the same token list).
 */
export function extractHydrationScriptHashes(html) {
  const hashes = new Set();

  for (const match of html.matchAll(INLINE_SCRIPT_RE)) {
    const content = match[1];
    if (!HYDRATION_SCRIPT_PREFIX.test(content)) continue;
    const digest = createHash('sha256').update(content, 'utf8').digest('base64');
    hashes.add(`'sha256-${digest}'`);
  }

  return [...hashes].sort();
}
