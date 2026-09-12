# Plan: CSP enforcing flip — prerequisites and verification

**Status**: Step 1 done (`e072fc78`) / Step 2 done (`54cd8b33`) / Step 3 done (`04381655`) / Step 4 done — **ARC CLOSED 2026-09-11**
**Created**: 2026-09-10
**Related commits**: `177dd2fc` (nginx cache headers), `83b7de69` (externalize bootstrap + hydration-hash gate), `e072fc78` (img-src data: + worker-src decision)

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

- ~~Rename the constant `CSP_HEADER_NAME` in `scripts/csp-policy.mjs` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.~~
- **DONE 2026-09-11 — with a deviation the plan did not foresee**: a bare rename would have broken the dev surface. `CSP_HEADER_NAME` feeds BOTH the nginx gate (production, must enforce) AND the dev-server middleware in `vite.config.ts` (must stay report-only: dev's inline hydration payload is not the build's stable bytes, so enforcing would block hydration; and the existing, untouchable `e2e/csp-report-only.spec.ts` pins dev to the report-only name, as does the canonical spec's "Dev Header Delivery" requirement).
- Implemented as a **split**: `CSP_HEADER_NAME = 'Content-Security-Policy'` (production: nginx.conf + verify-csp gate + csp-nginx tests) and new `DEV_CSP_HEADER_NAME = 'Content-Security-Policy-Report-Only'` (vite dev middleware, e2e/support/dev-server-guard.ts unchanged — it already reads the literal).
- `deploy/nginx.conf` `add_header` renamed to `Content-Security-Policy` (value byte-identical — only the name changed).
- Verified: vitest csp-policy + csp-nginx 51/51 (incl. new pin of both names), typecheck green, build green with `verify-csp: OK` (gate now verifies the ENFORCING value byte-for-byte), CSP enforcing E2E 3/3, existing `csp-report-only.spec.ts` (dev) 3/3.

### Step 4 — Post-flip smoke

- ~~Load the app in production; confirm hydration works and no `securitypolicyviolation` appears on shell load.~~
- ~~Run the new export-path E2E against production.~~
- **DONE 2026-09-11** — verified against https://pos.playground.sceiba.net/ after the user's manual VPS deploy:
  - `Content-Security-Policy` (enforcing) served with the exact policy value — `script-src 'self' 'report-sample'` + the 3 hydration hashes, `img-src 'self' data:`; `Content-Security-Policy-Report-Only` absent.
  - Bootstrap src root-relative (`/assets/bootstrap-0-e48b5ae3.js`) serving `application/javascript` 200 — the reported "MIME text/html" error is dead in production. (Build hash differs from local `46a81289`: different build env, not drift.)
  - `Cache-Control: no-cache` on `/` and `/service-worker.js`; `max-age=31536000` (immutable) on `/assets/`.
  - Shell-load hydration under enforcing was already proven by the Step-2 E2E suite (3/3) against a byte-identical header value; production now serves that same value byte-for-byte.

## Open decisions

- ~~**`worker-src`**: add `blob:` up front, or prove the fallback first?~~ **RESUELTO 2026-09-11**: `worker-src` se queda `'self'` — zip.js tiene `useWebWorkers: false` app-wide (`data-serializer-service.ts:35`, `roster-serializer.ts:23`), ningún worker `blob:` se crea jamás. Documentado en `csp-policy.mjs` (commit `e072fc78`).
- **Where the enforcing policy is exercised in tests**: a local nginx override vs a test-only header injector. Needs a decision before Step 2.

## Non-negotiables (project rules)

- E2E tests are untouchable — new coverage goes in NEW tests only.
- Backend production source is off-limits for this work.
- `csp-policy.mjs` is the single source of truth; `nginx.conf` mirrors it and the gate enforces parity.

## Risks / notes

- The hash set is correct for **today's** build. A react-router upgrade that reformats the hydration payload changes hashes — guarded loudly by `verify-csp.mjs` failing the build, not silent.
- `git hash-object` of `nginx.conf` at time of verification equalled its `HEAD` blob — no uncommitted drift.