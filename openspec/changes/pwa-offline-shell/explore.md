# Exploration: pwa-offline-shell

**Change**: `pwa-offline-shell`
**Phase**: explore
**Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/pwa-offline-shell/explore`, obs 1585)
**Goal**: `web-store-pos` must LOAD and NAVIGATE with no Internet connection. Today offline navigation to any route fails with `ERR_FAILED`.

## 1. Current state (verified against code, not only the prior docs)

### `app/service-worker.ts` (161 lines)

- Excluded from `apps/web-store-pos/tsconfig.json:9` — the SW file is **not typechecked**.
- Three caches: `app-shell-v2`, `app-chunks-v1`, `fonts-v1`.
- The `fetch` handler comment at **L63** says "network-first for navigation". This is **false**. The code at **L83-88** is:
  `caches.match('/index.html').then((cached) => cached ?? fetch(request))`
  i.e. cache-first with no revalidation.
- The static-asset branch is an allowlist (`/assets/`, `.js`, `.css`, `/icons/`). `/images/`, `/favicon.png` and `/manifest.webmanifest` fall through unhandled.
- The `message` handler's `PRECACHE_APP_CHUNKS` (L136-155) fetches `/assets-manifest.json`, which **no build step emits**. nginx's SPA fallback (`deploy/nginx.conf:53-55`) returns `index.html` with a 200, the JSON parse throws, and the `catch` swallows it. Confirmed dead code. Its sender is `app-layout.tsx:40-46`.

### `vite.config.ts`

- **L13-27** — `injectManifest.globPatterns` = `['**/*.{js,css,html,woff2}', 'icons/*.png']`. Under-specified even before the build-ordering bug: no webmanifest, no images, no favicon.
- **L28-31** — `devOptions.enabled: true`. **Not mentioned anywhere in the 2026-07-27 design doc.** This is what makes `pnpm dev` register a genuinely live service worker rather than a no-op.
- **L44-51** — `server.port: 3333` **equals** `preview.port: 3333`. Dev and `vite preview` share one origin, therefore one service-worker scope.

### `app/shared/lib/pwa/service-worker-registration.ts`

- **L74-79** carries a comment claiming dev registration is "a no-op stub (`devOptions.enabled: false`)". **Stale and wrong** — the live config sets it `true`. This comment actively misled today's debugging session.

## 2. The problems, with evidence

### (a) Offline navigation fails

`injectManifest` globs `build/client` during the client build's `closeBundle`, which runs **before** React Router writes `index.html` and `assets/manifest-<hash>.js`. The resulting manifest has 113 entries and **zero** `.html` entries, so `caches.match('/index.html')` always misses, falls through to `fetch`, and fails offline with `ERR_FAILED`. Confirmed against current code; matches the approved design doc and engram obs #1555.

### (b) No revalidation or eviction path for a stale shell

The navigate handler is cache-first forever. The only eviction path is a full SW replacement: the `registerType: 'prompt'` dialog or the 15-minute update poll → `SKIP_WAITING` → `activate` deletes caches not in the current name list. That is a deliberate and sufficient design for normal production deploys — **provided the update-detection mechanism can run**, which is precisely what (c) breaks.

### (c) Dev/preview origin sharing — NEW, confirmed 2026-07-28, absent from the approved design

`server.port === preview.port` (3333) plus `devOptions.enabled: true` means a worker installed by `vite preview` — with a real precache and a cache-first navigate handler — keeps controlling `pnpm dev` tabs at the same origin. Compounding it: on the dev server `/sw.js` and `/service-worker.js` return `text/html` (the SPA catch-all), so the browser's byte-comparison update check cannot even detect that the worker changed. The stale worker can never self-heal through the normal flow.

This is orthogonal to (a) and (b). It does **not** invalidate Approach A, but it is a real, reproducible, dev-facing incident the design never scoped. Production is not exposed to the MIME-confusion half (nginx maps `.js` correctly via `mime.types`), only to the still-unverified gzip gap already flagged as Task 6, still unaddressed in `deploy/nginx.conf:27-35`.

Full incident record: engram `discovery/pwa-sw-hijacks-dev-origin` (obs 1582).

## 3. Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | **Approach A (approved) — post-build `injectManifest`** | Still correct and necessary for (a)/(b). Today's evidence does not weaken it. Effort: Medium; already broken into 7 TDD tasks. |
| 2 | Runtime-fetched manifest JSON | Correctly rejected earlier — a byte-identical worker defeats update detection. |
| 3 | `additionalManifestEntries` hand-added | Correctly rejected earlier — cannot cover the hashed manifest chunk. |
| 4 | **NEW — separate dev and preview ports** | Fixes the (c) mechanism directly. Zero behavior change, Low effort. **Recommended.** |
| 5 | NEW — disable `devOptions.enabled` | Also fixes (c), but loses local install-prompt testing, which is the stated reason it was turned on. Not recommended over #4. |

### Recommendation

Keep Approach A unchanged. Fold problem (c) into this change's scope via option 4 (separate ports), and fix the two stale/misleading comments (`service-worker.ts:63`, `service-worker-registration.ts:74-79`) in the same change, since they actively caused today's confusion.

## 4. Open questions (genuine forks only)

1. ~~Fold the dev/preview port fix into this change (recommended), or file it as a separate fast-follow?~~ — **RESOLVED 2026-07-28: separate fast-follow.** Problem (c) is OUT of this change's scope. Tracked in engram `todo/dev-preview-port-separation`. The stale comment in `service-worker-registration.ts:74-79` goes with it. The stale comment in `service-worker.ts:63` stays in scope here, because that file is rewritten in full by this change.
2. Task 8 (remove the `[SW]`/`[PWA]` debug logs) still requires explicit user approval per the plan — unchanged.
3. Task 6 (nginx MIME/gzip verification) remains blocked on Docker socket access in this environment — unresolved, no new information.

## 5. Risks

- Cache-first navigate handler plus dev/preview origin sharing means a browser tab can get permanently stuck on a stale worker with no self-heal path — the confirmed mechanism of today's incident. Production is not exposed to the MIME half, but "the update prompt is the only eviction path" is an accepted-by-design tradeoff worth re-confirming with the user given today's scare.
- The design doc's "branch conflict on `app-layout.tsx`" risk (against the billing work) is now **stale**: `<PaymentBanner />` is already merged into `main` (commits `957cab3`, `b57fc3e`). Task 5 only needs the dead `useEffect` removed against current `main`.
- The nginx gzip/MIME gap remains unverified (no Docker socket available here).
- The SW file stays untypechecked by design; keep logic in typechecked modules under `app/shared/lib/pwa/`.

## 6. Files in scope

- `frontend-react/apps/web-store-pos/app/service-worker.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/pwa/service-worker-registration.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/pwa/sw-strategy.ts` (new, + test)
- `frontend-react/apps/web-store-pos/app/shared/components/app-layout.tsx`
- `frontend-react/apps/web-store-pos/vite.config.ts` (glob patterns + NEW port separation)
- `frontend-react/apps/web-store-pos/scripts/build-sw.mjs` (new)
- `frontend-react/apps/web-store-pos/scripts/verify-sw-precache.mjs` (new)
- `frontend-react/apps/web-store-pos/scripts/precache-patterns.mjs` (new)
- `frontend-react/apps/web-store-pos/package.json`
- `deploy/nginx.conf` (conditional on Task 6)

## 7. Prior art consulted

- `docs/plans/2026-07-27-pwa-offline-shell-design.md` — approved design (Approach A)
- `docs/plans/2026-07-27-pwa-offline-shell-frontend-plan.md` — 8-task TDD implementation plan
- engram obs #1555 (root cause), #1572 (approved design), #1573 (implementation plan), #1582 (today's incident)
