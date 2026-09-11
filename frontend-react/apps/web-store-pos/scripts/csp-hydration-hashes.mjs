// Pure hashing logic for the react-router SPA-mode hydration payload
// (design.md's "No Violations on Real Routes" register, item (a) — "NOT
// VERIFIED whether react-router build's static output carries the same
// inline payload"). Verified 2026-08-12, revised 2026-09-10: `react-router
// build` (ssr:false) prerenders `build/client/index.html` once, inlining
// THREE stable bare `<script>` tags (no `src`) that bootstrap client
// hydration — `window.__reactRouterContext = {...}`, then two
// `.streamController.enqueue(...)` / `.close()` calls — PLUS one non-stable
// `<script type="module">` that imports content-hashed asset filenames
// (`import "/assets/manifest-<hash>.js"`). Only the three stable scripts can
// ever be covered by a static CSP hash-source; the fourth's bytes change
// every build, so it is externalized into `assets/bootstrap-*.js` by
// `scripts/externalize-bootstrap.mjs` before this file runs. `script-src
// 'self'` forbids inline scripts outright; a CSP hash-source
// (`'sha256-<base64 of the exact script bytes>'`) is the correct fit for the
// STATIC scripts — a nonce needs a fresh value per HTTP response, which a
// prebuilt `index.html` served by plain nginx `try_files` cannot provide
// (design.md's "future enforcing" register already assumes nonce is
// impractical here without ADR).
//
// Mirrors precache-diff.mjs / csp-nginx.mjs's shape: no I/O here, so this has
// direct Vitest coverage; the caller (scripts/verify-csp.mjs) does the single
// `readFile('build/client/index.html')`.
import { createHash } from 'node:crypto';
import { STABLE_INLINE_PREFIX, scanInlineScripts } from './externalize-inline-scripts.mjs';

// Re-exported so existing importers keep working unchanged.
export { STABLE_INLINE_PREFIX };

// Anchored with `^` so it can never match arbitrary app code that happens to
// mention the identifier mid-string. Kept as an alias for the shared prefix:
// the two must never diverge.
const HYDRATION_SCRIPT_PREFIX = STABLE_INLINE_PREFIX;

/**
 * Extracts every inline `<script>` in `html` whose content matches
 * `HYDRATION_SCRIPT_PREFIX`, hashes each with SHA-256 per the CSP hash-source
 * algorithm, and returns the sorted, deduplicated `'sha256-<base64>'` source
 * list. Sorted so the result is stable across calls regardless of the
 * scripts' order in the document (multiple builds of the same content must
 * produce the same token list).
 *
 * THROWS when an inline script does NOT match the stable prefix: that means
 * either `scripts/externalize-bootstrap.mjs` was skipped, or react-router
 * started emitting a new non-stable inline script. Both are regressions that
 * would otherwise become a silent production CSP gap once the header flips
 * from Report-Only to enforcing — so they fail the build here instead.
 */
export function extractHydrationScriptHashes(html) {
  const hashes = new Set();

  for (const { content } of scanInlineScripts(html)) {
    if (!HYDRATION_SCRIPT_PREFIX.test(content)) {
      const preview = content.length > 200 ? `${content.slice(0, 200)}…` : content;
      throw new Error(
        'csp-hydration-hashes: found an inline script that is not a stable react-router hydration script ' +
          '(does not match /^window\\.__reactRouterContext/). Either scripts/externalize-bootstrap.mjs was ' +
          'skipped, or react-router emitted a new inline script. Run scripts/externalize-bootstrap.mjs before ' +
          `verify-csp (it is part of the build chain in package.json). Offending script content:\n${preview}`
      );
    }
    HYDRATION_SCRIPT_PREFIX.lastIndex = 0;
    const digest = createHash('sha256').update(content, 'utf8').digest('base64');
    hashes.add(`'sha256-${digest}'`);
  }

  return [...hashes].sort();
}