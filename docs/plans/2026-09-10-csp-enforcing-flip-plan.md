# Plan: CSP enforcing flip — prerequisites and verification

**Status**: planning / not started
**Created**: 2026-09-10
**Related commits**: `177dd2fc` (nginx cache headers), `83b7de69` (externalize bootstrap + hydration-hash gate)

## Context — what is already done

The CSP work so far closed the **script-src** gap:

- `frontend-react/apps/web-store-pos/scripts/externalize-inline-scripts.mjs` — pure transform. Externalizes any non-stable inline `<script>` to `assets/bootstrap-<n>-<hash8>.js`.
- `frontend-react/apps/web-store-pos/scripts/externalize-bootstrap.mjs` — CLI wrapper, runs post-build.
- `frontend-react/apps/web-store-pos/scripts/csp-hydration-hashes.mjs` — now shares the scan and **throws** if any inline script is not a stable `window.__reactRouterContext` script.
- Build chain in `apps/web-store-pos/package.json`: `react-router build && externalize-bootstrap.mjs && build-sw.mjs && verify-sw-precache.mjs && verify-csp.mjs`.
- `frontend-react/deploy/nginx.conf` — cache-policy headers (`index.html` / `service-worker.js` revalidate, `/assets/` immutable).

**Verified 2026-09-10**: a real Dockerfile-equivalent build (`API_URL=/api`) emits exactly 3 inline scripts, whose hashes match the 3 `'sha256-…'` tokens committed in `nginx.conf`'s `script-src`. Set difference both directions = ∅. **The script-src axis is correct today.**

## The blocker — why the flip is RISKY, not SAFE

The CSP is `Content-Security-Policy-Report-Only`. Flipping to enforcing changes nothing about `script-src` (already correct), but two directives that are inert in report-only start **blocking**:

### Risk 1 — `worker-src 'self'` vs `blob:` workers (ZIP export)

`assets/zip-fs-wasm-*.js` calls `new Worker(o, g)` where `o` can `startsWith("blob:")`. Under enforcing `worker-src 'self'`, a `blob:` worker is blocked. The library has a catch-and-retry fallback (`se(...)` after revoking the object URL), so it likely degrades rather than hard-fails — **but the ZIP/import export path is NOT proven under enforcement.**

### Risk 2 — `img-src 'self'` vs `data:` images (PDF export)

`assets/html2canvas.esm-*.js` references `data:image/svg+xml` and `data:image/gif` (5 hits) when rasterizing for `jspdf`. Under `img-src 'self'` without a `data:` source, the PDF export rendering path can break. Not exercised by shell load — only by export.

Both are **export** paths, not shell load — which is why report-only never surfaced them.

## Work plan

### Step 1 — Extend the policy (`scripts/csp-policy.mjs`)

- Add `data:` to `img-src` (PDF export).
- Decide `worker-src`:
  - **Option A (preferred if fallback is proven unnecessary)**: add `blob:` to `worker-src`.
  - **Option B**: leave `worker-src 'self'` and prove the zip.js fallback covers the export under enforcement.
- Mirror the change into `deploy/nginx.conf` so `verify-csp.mjs` stays green (the gate compares the two byte-for-byte).
- Keep `csp-policy.mjs` the single source of truth; do not hand-edit only one side.

### Step 2 — Prove the export paths under an enforcing policy

- New Playwright tests only — **do NOT modify existing E2E**. The E2E-untouchable rule applies.
- Exercise: ZIP export (import/export path that uses `zip-fs-wasm`) and PDF export (jspdf + html2canvas).
- Run against a build serving the **enforcing** header (local override or a dedicated config) and assert no CSP `securitypolicyviolation` on those flows.
- If the zip.js fallback is confirmed sufficient, record that as the reason to keep `worker-src 'self'`; otherwise add `blob:`.

### Step 3 — Flip the header (separate change)

- Rename the constant `CSP_HEADER_NAME` in `scripts/csp-policy.mjs` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.
- Update the `add_header` name in `deploy/nginx.conf` to match.
- `verify-csp.mjs` will then verify the enforcing value byte-for-byte.
- Do the flip **only after** Steps 1–2 are green.

### Step 4 — Post-flip smoke

- Load the app in production; confirm hydration works and no `securitypolicyviolation` appears on shell load.
- Run the new export-path E2E against production.

## Open decisions

- **`worker-src`**: add `blob:` up front, or prove the fallback first? (Step 2 answers it.)
- **Where the enforcing policy is exercised in tests**: a local nginx override vs a test-only header injector. Needs a decision before Step 2.

## Non-negotiables (project rules)

- E2E tests are untouchable — new coverage goes in NEW tests only.
- Backend production source is off-limits for this work.
- `csp-policy.mjs` is the single source of truth; `nginx.conf` mirrors it and the gate enforces parity.

## Risks / notes

- The hash set is correct for **today's** build. A react-router upgrade that reformats the hydration payload changes hashes — guarded loudly by `verify-csp.mjs` failing the build, not silent.
- `git hash-object` of `nginx.conf` at time of verification equalled its `HEAD` blob — no uncommitted drift.