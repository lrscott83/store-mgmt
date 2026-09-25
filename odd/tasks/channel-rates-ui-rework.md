# Feature: channel-rates-ui-rework

**Objective:** Rework the `management/channel-rates` view per the user's 5 requested UI changes: every info trigger opens a popup (never inline expansion); the header info icon sits next to the header text (not right-aligned); "Tasas Vigentes" drops the status column and shows active rows only; the Desactivar button becomes a delete icon with a confirmation popup that deactivates; the table then shows the latest active rate of that channel; the deactivate column header carries no text.

**Status:** DONE — work-unit committed and pushed. Commits: `77fff0f9` (branch sync origin/test → qa + push, user-requested), `59d596ad` (feature work-unit), `f05c2adf` (docs follow-up) on `qa` — all pushed to `origin/qa` (user-authorized 2026-09-25).

## Problem

The user described the channel-rates view (`management/channel-rates`) with features that did not exist on the local `qa` base: "i" info icons with expanded inline info, a "Tasas vigentes" table with an estado column and a Desactivar button. Those live on the dev/test branches (deactivate feature `56113bdf` + rate popup work) and were absent from `qa`.

## Why

Explicit user request 2026-09-25 (Spanish): "Cuando se da tap a todos los iconos de i debe mostrar un popup y no la info desplegada; el icono i que esta en el header debe estar al lado del texto del header y no alineado a la derecha; en las tasas vigentes no poner la columna estado, además en esa tabla solo se mostrará lo que esté activo; en lugar de poner el boton Descactivar se debe poner el icono de borrar, que mostrara un popup de confirmación y luego desactivara esa tasa y entonces en la tabla debe mostrarse la ultima tasa de ese canal que este activa; en el header de esa columna de desactivar no poner texto". User also requested the branch sync first: "actualiza esta rama local qa con los cambios que hay en la rama remota test, luego push".

## Authorized scope

**Branch sync (user-requested, done before this feature):**
- Merge `origin/test` (63 commits incl. dev channel-rates work) into local `qa`, then `git push origin qa` → `c5e95406..77fff0f9`. This brought the view the user described.

**Frontend (React only) — `frontend-react/` (Angular `frontend/` untouched):**
- `apps/web-store-pos/app/management/channel-rates/routes/channel-rates.tsx` — view rework.
- `apps/web-store-pos/app/shared/lib/i18n/es.ts` — 2 new keys (`DEACTIVATE_CONFIRM_TITLE`, `DEACTIVATE_CONFIRM_MESSAGE`).
- `apps/web-store-pos/app/management/channel-rates/routes/__tests__/channel-rates.test.tsx` — component tests updated to the new behavior (NOT an E2E spec; E2E rule untouched).
- `packages/domain` — rebuild `dist` only (source unchanged; `dist` was stale after the branch sync and lacked `isActive`, which broke typecheck). `dist` is git-ignored.

**Explicitly out of scope / protected:**
- No existing E2E test touched (`frontend-react/e2e/`, `backend/...E2ETests/`). Verified via grep: no E2E references the changed testids/labels.
- No backend production code touched.
- Angular `frontend/` never read or touched.

## Tasks

- [x] T0 — Authorize + sync: merge origin/test → qa, push (user-requested; `77fff0f9`).
- [x] T1 — Map merged view (route, model, service, i18n, Modal/ConfirmDialog primitives, E2E touchpoints).
- [x] T2 — Route rework per the 5 requirements (popups for all info triggers; header icon next to title; Vigentes: no estado column, active-only filter `isActive !== false`, trash icon + ConfirmDialog → `setChannelRateActive(id,false)`, latest-active-per-channel resolution, empty deactivate header).
- [x] T3 — i18n keys + domain dist rebuild.
- [x] T4 — Component tests updated (T22 header/detail popups, T19b deactivate via trash + confirmation, latest-active takeover, backwards-compat no-isActive).
- [x] T5 — Checks (typecheck, filtered tests, lint) + work-unit commit.

## Route plan (per task; delivery budget advisory)

- Single reviewable commit (< 400 authored lines: ~195 insertions / ~173 deletions). Direct-to-`qa`, Conventional Commit, work-unit evidence in this doc. Push remains user decision.

## Checks

- Typecheck: `pnpm --filter @store-mgmt/web-store-pos typecheck` (after `pnpm --filter @store-mgmt/domain build`).
- Tests: `pnpm --filter @store-mgmt/web-store-pos test -- channel-rates`.
- Lint: `pnpm --filter @store-mgmt/web-store-pos lint` (max-warnings=0).

## Progress

- T0 done (`77fff0f9`). T1 done. T2/T3/T4 done. T5 in progress — checks green, commit pending.

## Verification evidence

- Typecheck `@store-mgmt/web-store-pos`: 0 errors after `@store-mgmt/domain` dist rebuild (pre-rebuild: `isActive` missing from stale dist — 15 errors across app files).
- Tests `-- channel-rates`: **65/65 PASS** (6 files: channel-label 3, offline-service.crypto 4, data-synchronizer 9, offline-service 23, data-serializer 4, route component 22).
- Lint `@store-mgmt/web-store-pos`: 0 warnings.
- E2E impact scan: `channel-rates-catalogue.spec.ts` only uses `channel-rate-add` / `channel-rate-row-*` history rows + menu — unaffected by the changes; no other E2E references the changed elements.