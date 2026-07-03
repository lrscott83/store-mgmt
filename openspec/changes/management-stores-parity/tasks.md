# Tasks: Management → Stores Parity (Stage 4)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100-1400 (route merge ~350 create/delete + rewrite 625-line route test; offline strip ~80; admin card-grid create ~120 + rewrite 261-line admin test + delete 139-line list component/test; L5+L6 ~150 across form/es.ts + rewire 3 test files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (by size); overridden by fixed delivery strategy |
| Suggested split | Unit 1 structure collapse — Unit 2 offline removal — Unit 3 admin/stores — Unit 4 L5+L6 |
| Delivery strategy | single-pr (commits-only, no PR, per user directive) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Delivery: single branch `feat/frontend-parity-audit`, commits ONLY, NO PR, NO push. `size:exception` pre-accepted per user directive. Work-unit commit boundaries below satisfy reviewability even without PR splitting.

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type |
|------|------|-------------|
| 1 | Structure collapse: 3 URLs → one `edit-store.tsx` | refactor |
| 2 | Offline layer removal (HTTP-only) | refactor |
| 3 | admin/stores card grid + approve/disapprove confirm | feat |
| 4 | L5 visual chrome + L6 i18n parity | fix |

## Phase 1: Structure Collapse (Unit 1) — Req: Unified Edit-Store Route Model

- [x] 1.1 RED: rewrite `management/stores/routes/__tests__/store-routes.test.tsx` against one module `../edit-store`: no-id+selectedStoreId→edit title; `/create` no selectedStoreId→create title; `/edit/:id`→edit, id=param; port existing HTTP/error/refresh cases
- [x] 1.2 GREEN: create `management/stores/routes/edit-store.tsx` merging `store-edit.tsx`+`store-create.tsx`; `storeId = paramId ?? user.selectedStoreId ?? ''`; `isEditMode = Boolean(storeId)`; title switch; keep `BaseRepository`/`isOnline` verbatim for now (isolate route-merge risk)
- [x] 1.3 GREEN: `app/routes.ts` (64-66) — 3 distinct route ids against `edit-store.tsx`
- [x] 1.4 DELETE `store-create.tsx`, `store-edit.tsx`, `management/stores/routes/store-list.tsx` (route only; shared list component stays — admin still uses it). Also fixed an unplanned real dependency: `admin/owners/routes/owner-edit.tsx` directly imported the deleted `management/stores/routes/store-list` (`StoreListPage`) to render its "Stores" tab — repointed at `admin/stores/routes/store-list` (`AdminStoreListPage`), the sole remaining super-admin store list, and updated its test's `vi.mock` path accordingly.
- [x] 1.5 Run `store-routes.test.tsx` green; commit `refactor(web-store-pos): collapse management/stores to unified edit-form route` (SHA 30b26c4)

## Phase 2: Offline Layer Removal (Unit 2) — Req: HTTP-Only Data Access

- [x] 2.1 RED: extend `edit-store` tests — no `BaseRepository` read/write on load/save; no `OFFLINE_NOTICE` text at any connectivity state
- [x] 2.2 GREEN: `edit-store.tsx` — remove `BaseRepository<Store>` import/instance/`.upsert`, `useOnlineStatus`/`isOnline` plumbing
- [x] 2.3 GREEN: `store-form.tsx` — drop `isOnline` prop + offline-notice block; `submitDisabled = isLoading` (plus a narrow `submitDisabled` prop, unrelated to connectivity, preserved for the create-mode module-catalog-failure gate — see Deviations)
- [x] 2.4 Update `store-form.test.tsx` — remove PRES-8 offline-gate case
- [x] 2.5 Grep stores scope for `BaseRepository<Store>` → none; run affected tests green; commit `refactor(web-store-pos): remove offline cache layer from management/stores` (SHA 090ef02)

## Phase 3: admin/stores Card Grid + Confirmations (Unit 3) — Req: Approve/Disapprove Require Confirmation, Card-Grid List, Activate/Deactivate Removed

- [x] 3.1 RED: `admin/stores/routes/__tests__/store-list.test.tsx` — approve/disapprove call `confirmDialog` (mock `shared/lib/blocking-alert`); `true`→http+reload; `false`→no http, status unchanged; still assert no Activate/Deactivate
- [x] 3.2 RED: new `admin/stores/components/__tests__/store-card-list.test.tsx` — Card grid renders, Button-based Approve/Disapprove, no Activate/Deactivate
- [x] 3.3 GREEN: create `admin/stores/components/store-card-list.tsx` (Card/Button/icons grid)
- [x] 3.4 GREEN: `admin/stores/routes/store-list.tsx` — import `StoreCardList`; wrap `handleApprove`/`handleDisapprove` in `confirmDialog({title, message, confirmButtonText: GENERAL.YES, cancelButtonText: GENERAL.NO})` before HTTP call
- [x] 3.5 DELETE `management/stores/components/store-list.tsx` + its test (no longer imported anywhere)
- [x] 3.6 Run admin store-list + store-card-list tests green; commit `feat(web-store-pos): admin/stores card grid with approve/disapprove confirmation` (SHA 194332c) — also added the 4 new `STORES.*_CONFIRM_TITLE/_MESSAGE` i18n keys this phase's confirmDialog wiring depends on (moved forward from 4.3 since missing-key handling crashed the test runner — see Deviations)

## Phase 4: L5 Visual + L6 i18n (Unit 4) — Req: Shared Visual Chrome, Field-Name-Aware Required Validation, Spanish Text Parity, Confirm-Dialog Copy Parity

- [x] 4.1 RED: `store-form.test.tsx` — owner-empty submit shows "El propietario es obligatorio."; paymentStartDate-empty shows "La fecha de inicio de pago es obligatoria."
- [x] 4.2 GREEN: `store-form.tsx` — adopt `Button`/`Card`/`InfoBox` + icons; replace generic `STORES.REQUIRED` branch with `OWNER_REQUIRED`/`PAYMENT_START_DATE_REQUIRED` keys (InfoBox not used for the error/validation banner — kept as `<p role="alert">` to preserve alert semantics; see Deviations)
- [x] 4.3 GREEN: `es.ts` — rename `CREATE_TITLE`→'Crear una tienda', `EDIT_TITLE`→'Editar la tienda', `APPROVED`→'Aceptado', `APPROVE`→'Aceptar', `IS_ACTIVE`→'Activo'; drop voseo in `ERROR`/`LIFECYCLE_ERROR`; remove `OFFLINE_NOTICE`/`DEGRADED_NOTICE`; add `OWNER_REQUIRED`, `PAYMENT_START_DATE_REQUIRED` (`APPROVE_CONFIRM_TITLE`/`_MESSAGE`, `DISAPPROVE_CONFIRM_TITLE`/`_MESSAGE` were already added in Phase 3)
- [x] 4.4 Update `store-routes.test.tsx` + admin `store-list.test.tsx` title/copy assertions to new strings — both already read copy via `esMessages[...]` lookups, so no literal-string edits were needed there; `store-form.test.tsx` DID need fixes (see Deviations)
- [x] 4.5 Regression: grep stores scope for `BaseRepository<Store>`/`Intentá`/`Conectate` → none; run `pnpm test` full suite green (100 files / 1153 tests); run `pnpm -C apps/web-store-pos exec tsc --noEmit` (clean, after `react-router typegen`); commit `fix(web-store-pos): stores L5 visual chrome + L6 Spanish parity` (SHA 58cc84b)

## Deviations / Unplanned Fixes (see apply-progress for full detail)

1. **owner-edit.tsx cross-module dependency (Phase 1)**: `admin/owners/routes/owner-edit.tsx` imported the deleted `management/stores/routes/store-list.tsx` directly for its "Stores" tab. Not flagged by the audit (out of Owners scope) but a real breakage. Fixed by repointing at `admin/stores/routes/store-list` (`AdminStoreListPage`).
2. **submitDisabled prop instead of literal "isLoading only" (Phase 2)**: design said "submitDisabled = isLoading"; literal compliance would have silently dropped the existing create-mode "module catalog failed to load" submit gate (S-CREATE-5). Added a narrow `submitDisabled?: boolean` prop instead — connectivity-free, but preserves the existing UX guarantee.
3. **Confirm-dialog i18n keys added one phase early (Phase 3, not 4.3)**: react-intl's missing-translation-key handling crashed the test runner (`RangeError: Invalid string length` inside Node's `util.inspect`) when `STORES.APPROVE_CONFIRM_TITLE` etc. didn't exist yet. Added the 4 new keys in Phase 3 instead of Phase 4 to unblock RED/GREEN; Phase 4 still owns the renames/removals.
4. **InfoBox not used for validation/error banner (Phase 4)**: `InfoBox` renders `role="status"`, which would have silently broken ~10+ existing `getByRole('alert')` assertions and the correct a11y semantics for form errors. Kept the existing `<p role="alert">` for error/validation text; only the submit button and field wrapper adopted Card/Button/icons.
5. **Test-only bugfix, not a scope change (Phase 4)**: the VALID-2 "paymentStartDate required" test was passing before Phase 4 only because both branches used the same generic message. Making the messages distinct exposed that a superAdmin (isAdminUser=true) hits the owner-required check first if no owner is set — this is correct Angular-parity behavior (isOwnerAdmin = isSuperAdmin || hasOwnersAvailableFeature()), not a bug. Fixed the test fixture to pre-fill `ownerId` so it actually exercises the paymentStartDate check.
