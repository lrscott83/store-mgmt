# Verify Report — angular-react-parity-fixes

**Source-of-truth rule applied**: verdict grounded ONLY in Angular `frontend/src` vs React `frontend-react` source code, checked against the 12 playbook rules (`docs/migration/playbook-migracion-servicios-angular-react.md`). openspec specs/engram were NOT used as correctness source — only for change-scope bookkeeping (tasks artifact does not exist for this change; see WARNING-1).

**Verdict: PASS WITH WARNINGS** (CRITICAL: 0, WARNING: 2, SUGGESTION: 2)

## Test + Build Evidence

- `pnpm test` (from `frontend-react/apps/web-store-pos`): **114 test files / 1635 tests — ALL PASS**
- `pnpm exec tsc --noEmit -p .`: **clean, zero errors**
- `pnpm exec vitest run app/shared/lib/http/__tests__/api-client.test.ts --reporter=verbose`: **12/12 PASS**, explicitly covering 401 delegation, AUTH_MODEL-only clear (token/currentUser survive), anti-loop redirect guard, navigate-based redirect, no-clear-on-500, always-rejects, network-error tagging, and the 500 blocking dialog.

## Per-Work-Unit Verdict Table

| WU | Playbook Rule | Verdict | Evidence (file:line) |
|---|---|---|---|
| WU3 api-client interceptor | R9 (exact error contract) | PASS (minor note, see WARNING-2) | `frontend-react/.../api-client.ts:44-62` vs `frontend/src/app/_interceptors/error-interceptor.service.ts:61-93` — 401→`useAuthStore.getState().logout()` (`api-client.ts:50`) mirrors `authService?.logout()` (`error-interceptor.service.ts:64`); 500→`showBlockingError(...)` (`api-client.ts:57-60`) mirrors `Swal.fire(...)` with same i18n keys (`error-interceptor.service.ts:79-83`); network-error tagged `isNetworkError` (`api-client.ts:40`) mirrors `error-interceptor.service.ts:57` |
| WU3 | R10 (call-site parity) | PASS | Same logical usage; only `subscribe`→axios-interceptor-promise mechanic changed |
| WU3 | R12 (invents nothing) | PASS | Reused existing `blocking-alert.ts`, `i18n/es.ts`, `useAuthStore` — no new abstraction created |
| WU4 CSV parsing | R3 (signature parity) | PASS | `ParsedProductRow.category` now `string` (required), matches Angular's `CsvProduct` model + `validateProducts` treating `category` as mandatory (`csv-product.service.ts:26-34`) |
| WU4 | R9 (validation contract) | PASS | `MISSING_CATEGORY` error added consistent with pre-existing `MISSING_NAME`/`MISSING_PRICE`/`INVALID_PRICE` pattern (verified via `git diff` — only category branch is new, error-code system itself predates this change; see SUGGESTION-2) |
| WU4 | R12 (invents nothing / no new dep) | PASS | No `papaparse` dependency added (verified: zero `papaparse` entries in any `frontend-react` package.json/lockfile) — hand-rolled RFC4180 tokenizer instead, justified in-file comment |
| WU-R: `InventoryOfflineService.hasAvailableStock` removed | R12 | PASS | Angular `frontend/src/app/application/entries/inventory-offline.service.ts` has no `hasAvailableStock` (only `hasAvailableProductToSale`, line 397, unaffected). Post-removal grep: 0 references in `frontend-react/` |
| WU-R: `OrderOfflineService.getByDateRange` removed | R12 | PASS | Angular `frontend/src/app/application/orders/order-offline.service.ts` has no `getByDateRange`. Post-removal grep: 0 real references (3 doc-comment mentions in sibling files, non-functional) |
| WU-R: `storeHttpService.deactivateStore` removed | R12 | PASS | Angular `frontend/src/app/_services/store/store.service.ts` has `activateStore` but no deactivate/delete method. Post-removal grep: 0 references |
| WU-R: `ReSeller.login?` kept | R12 | PASS | Angular `frontend/src/app/domain/resellers/reseller.model.ts` (lines 3-12) omits `login`, BUT `edit-reseller-details.component.ts:129` declares a disabled `login` FormGroup control populated via `patchValue(reSeller)` from the live API response — Angular's own model is stale relative to its runtime contract. React's `reseller-edit.tsx:80` (`setLogin(r.login ?? '')`) is the exact structural mirror of this real (if undeclared) Angular behavior. Correctly deviates from the proposal's REMOVE recommendation — code-grep proved a live consumer, overriding the stale design-doc claim, exactly as the source-of-truth rule requires. |
| WU5 service-base no-op | R4/R5 (reactive-state exception) | PASS | Angular `.fetch()`/`.items$` consumers (`frontend/src/app/_services/base.service.ts` + 5 form components: `edit-reseller-details.component.ts:63-64`, `create-reseller.component.ts:58-59`, `edit-store.component.ts:68-69`, `edit-owner-details.component.ts:63-64`, `create-owner.component.ts:59-60`) are ALL dropdown-population-only. React's `useEffect`+`listX()`+`useState` idiom (e.g. `edit-store.tsx:51`, confirmed calling `storeHttpService.listOwners()`) already satisfies this without a `BehaviorSubject`/Zustand port. No live non-dropdown consumer found. |
| Dead-code non-port | R10/R12 | PASS | Zero occurrences in `frontend-react/{apps,packages}` for: `getOwnerDetailsById`, `deleteReSeller`, `MessageService`, `AddressModel`, `SocialNetworksModel`, `StoreModuleStateService`, `setLanguage`, `DataService`. Angular dead-code re-confirmed at source: `owners.component.html` has zero `<app-owner-details>` tags (component imported at `owners.component.ts:32` but never rendered); `resellers.component.ts:47-49` `deleteReSeller(reSeller) {}` is a genuinely empty stub. |

## Issues

**CRITICAL**: none.

**WARNING-1 (process/pipeline)**: No `tasks` artifact exists for this change — `mem_search("sdd/angular-react-parity-fixes/tasks")` returned nothing, and no `tasks.md` file exists under `openspec/changes/angular-react-parity-fixes/`. The `sdd-tasks` phase appears to have been skipped; `sdd-apply` proceeded directly from `design.md`'s WU3/WU4/WU-R breakdown. This does not affect code correctness (design.md and apply-progress agree 1:1 and were independently verified against source above), but breaks SDD traceability/task-completion bookkeeping for this change. Recommend backfilling a tasks artifact before archive, or explicitly noting the skip in the archive report.

**WARNING-2 (minor R9 deviation)**: Angular's network-error branch (`error-interceptor.service.ts:56-58`) discards the original error and re-throws a brand-new `Error(err.message)` with only the `isNetworkError` flag attached — losing all original HTTP metadata. React's `api-client.ts:40` instead tags `isNetworkError` directly onto the original axios error object, preserving more information. Functionally equivalent for the one confirmed consumer pattern (checking `err.isNetworkError`), but not a byte-identical envelope per rule 9's strict "no envelope flattening" language. No live React consumer currently depends on either shape being stricter (see SUGGESTION-1). Low risk, does not block.

**SUGGESTION-1**: Angular's `GlobalErrorHandler` (`frontend/src/app/_services/global-error-handler.service.ts`) is the actual consumer of `isNetworkError` beyond the interceptor (suppresses network errors from the uncaught-error UI). React has no equivalent global handler yet. Out of scope for WU3 (which only targeted `api-client.ts`), but flagged for a future parity pass if an uncaught-error UI is ever needed in React.

**SUGGESTION-2**: The CSV per-row error-diagnostics system (`MISSING_NAME`/`MISSING_PRICE`/`INVALID_PRICE`/now `MISSING_CATEGORY`) is itself a pre-existing React-only invention relative to Angular's `validateProducts`, which silently filters invalid rows with zero per-row diagnostics (`csv-product.service.ts:26-34`, a single `&&` boolean filter). Confirmed via `git diff` that only the `MISSING_CATEGORY` branch is new in this change — the diagnostic system predates it. Not a regression introduced by this change; flagged only as an inherited rule-12 deviation for a future dedicated audit.

## Verdict

**PASS WITH WARNINGS.** All 3 in-scope work units (WU3, WU4, WU-R) and the WU5 no-op verification hold against Angular source under playbook rules 3/4/9/10/12. All 4 removal/keep decisions for WU-R are independently confirmed via source grep, including one correct deviation from the proposal doc (`ReSeller.login?` kept, not removed, because code proved a live consumer the proposal's table missed). Full test suite (1635/1635) and `tsc --noEmit` are clean. No CRITICAL issues block archive; the 2 WARNINGs are process/traceability and a minor non-blocking error-object-shape nuance, not functional defects.
