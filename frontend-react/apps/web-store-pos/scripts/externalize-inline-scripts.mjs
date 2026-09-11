// Pure transform for the react-router SPA-mode bootstrap inline scripts
// (design.md's "No Violations on Real Routes" register). `react-router build`
// (ssr:false) prerenders `build/client/index.html` with FOUR inline scripts:
// three stable hydration scripts matching `window.__reactRouterContext` (the
// only ones a static CSP hash-source can ever cover) and one that imports
// content-hashed asset filenames (`import "/assets/manifest-<hash>.js"`). The
// latter's bytes change every build, so it can never be allowlisted by hash —
// it has to become a real `assets/` file served same-origin under
// `script-src 'self'`.
//
// No I/O here: this module is pure and Vitest-covered. The caller
// (scripts/externalize-bootstrap.mjs) owns reading/writing
// `build/client/index.html` and the emitted assets.
import { createHash } from 'node:crypto';

// Same prefix csp-hydration-hashes.mjs anchors on and e2e/support's
// KNOWN_DEV_ONLY_VIOLATIONS mirrors: every stable react-router hydration
// script (the context assignment AND both streamController calls) starts with
// this literal. Anchored with `^` so it can never match arbitrary app code
// that merely mentions the identifier mid-string.
export const STABLE_INLINE_PREFIX = /^window\.__reactRouterContext/;

// Matches ANY `<script ...>...</script>` pair, capturing the raw attribute
// text (group 1) and the exact raw body (group 2, never trimmed — the CSP hash
// covers the literal bytes). Attribute presence/order and `type="module"` are
// arbitrary and handled by inspecting the captured attrs.
const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

// A `src` attribute in any form: `src="..."`, `src='...'`, `src=...`, bare
// `src`. Deliberately anchored so `data-src`/`srcset` never match.
const SRC_ATTRIBUTE_RE = /(?:^|\s)src(?:[\s=]|$)/i;

function sha256Hex(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function matchesPrefix(content, prefix) {
  // `prefix` may carry /g from a caller; reset so `.test` stays stateless.
  prefix.lastIndex = 0;
  const matched = prefix.test(content);
  prefix.lastIndex = 0;
  return matched;
}

/**
 * Returns every INLINE `<script>` in `html` — a `<script ...>` open tag with
 * NO `src` attribute — in document order, each as `{ attrs, content }`. Single
 * owner of the tag regex: `csp-hydration-hashes.mjs` imports this rather than
 * duplicating a second pattern.
 */
export function scanInlineScripts(html) {
  const scripts = [];
  for (const match of html.matchAll(SCRIPT_TAG_RE)) {
    const attrs = match[1];
    if (SRC_ATTRIBUTE_RE.test(attrs)) continue;
    scripts.push({ attrs, content: match[2] });
  }
  return scripts;
}

/**
 * Rewrites `html` so that every inline script whose content does NOT match
 * `options.prefix` (default `STABLE_INLINE_PREFIX`) is moved into an external
 * `assets/bootstrap-<index>-<sha256hex(content).slice(0,8)>.js` asset,
 * preserving the tag's attributes in order and adding `src`. Stable-prefix
 * scripts are left byte-identical. Returns `{ html, assets }` where `assets`
 * is `[]` (and `html` unchanged) when nothing needed externalizing.
 *
 * The `src` is ROOT-RELATIVE (`/assets/...`), never relative (`assets/...`):
 * the served `index.html` is the SPA shell for EVERY route, and a relative
 * `src` resolves against the PAGE's path — at `/sales/products` it becomes
 * `/sales/assets/bootstrap-*.js`, a 404 that kills hydration on any deep
 * link (nginx `try_files` would answer that 404 with index.html, so the
 * browser would try to execute HTML as JS — worse than the 404).
 */
export function externalizeInlineScripts(html, options = {}) {
  const prefix = options.prefix ?? STABLE_INLINE_PREFIX;
  const assets = [];
  let index = 0;

  const output = html.replace(SCRIPT_TAG_RE, (raw, attrs, content) => {
    if (SRC_ATTRIBUTE_RE.test(attrs)) return raw;
    if (matchesPrefix(content, prefix)) return raw;

    const fileName = `assets/bootstrap-${index}-${sha256Hex(content).slice(0, 8)}.js`;
    index += 1;
    assets.push({ fileName, content });
    return `<script${attrs} src="/${fileName}"></script>`;
  });

  return { html: output, assets };
}