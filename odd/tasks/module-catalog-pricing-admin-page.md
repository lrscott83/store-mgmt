# module-catalog-pricing-admin-page

SuperAdmin-only page to edit the GLOBAL module catalog pricing (price, percent discount, flat discount), grouped by plan, with strikethrough offer display. Additive feature — nothing existing is modified: no plan-gating change, no per-store pricing change, no existing E2E test touched.

## Objective

Let the SuperAdmin easily update the module catalog prices: price, percent discount, and flat discount, in one table of modules grouped by plan. If a module is on offer (has any discount), show the base price strikethrough and the effective price normal — same for the plan group total, recomputed live while typing.

## Why

The catalog (`Module`) currently has no write surface; only seed migrations change pricing. The previous feature (`store-module-pricing-admin-view`) edits per-STORE frozen copies. This feature edits the GLOBAL catalog only.

## Scope (authorized 2026-09-28 by maintainer)

- Edit scope: GLOBAL `Module` catalog ONLY (price, `DiscountPrice`, `PercentDiscountPrice`). Existing per-store `StoreModule` rows stay untouched.
- Location: NEW SuperAdmin page `/admin/modules` (menu group ADMIN, item "Módulos", visible only to SuperAdmin).
- Display: modules `IsActive && AvailableToStore`, grouped by plan (`groupModulesByPlanDelta` partition — same helper as the store pricing modal); modules no plan claims go in their own catch-all group. Price is GLOBAL (one per module, shown in its plan group; group total = sum of effective prices). Offer state = any discount > 0 → base price strikethrough + effective price normal.
- Edit UI: inline inputs for price, percent discount, flat discount; one Save button persists the whole table.
- Backend: new SuperAdmin-only endpoint `PUT /v1/modules/pricing` (validator: amounts >= 0, percent <= 100, module ids exist; only the 3 pricing fields change; `CurrentPrice` recalculated with the shared formula `CurrentPriceServiceUtils.GetCurrentPrice(price, percent, flat)`).
- Tests: NEW backend E2E + NEW frontend E2E + page unit tests. No existing test/support file modified without explicit per-item authorization.

## Constraints

- NEVER read or touch Angular `frontend/`.
- NEVER modify/delete/rename/skip/weaken existing E2E tests or `e2e/support/*` helpers without explicit authorization; NEW tests are allowed and the maintainer must be told what each tests.
- Backend production code: the maintainer's request authorizes ADDING the new endpoint (controller action + command/handler/validator + DTO). No other existing production file changes.
- Backend E2E and Playwright must never run in parallel (`WebAppFixture.ResetDataAsync` deletes live rows).
- `ApplicationDbContext` is NoTracking by default: query-then-mutate writes nothing — attach with `db.Set<T>().Update(entity)`.
- Float drift C# float32 vs JS float64: E2E compares prices/totals with 0.001 tolerance.
- Work-unit commits on `qa` (established session pattern); Conventional Commits; no Co-Authored-By; push only when the maintainer asks.

## Tasks

- [x] T1 — Backend write: `UpdateModuleCatalogPricingCommand` + handler +
      validator + DTO, `PUT /v1/modules/pricing` action on `ModulesController`
      with `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (action-level override
      of the class-level `StoresAdmin`). Response returns the saved rows with
      recalculated `CurrentPrice`. Commit `d2d7e448`. All-or-nothing save
      (unknown module aborts the whole table; empty/duplicate tables rejected).
- [x] T2 — Backend E2E (new `ModuleCatalogPricingTests.cs`): 7 tests, all green
      (spot-checked 7/7 on 2026-09-28). Covers: save persists and GET ToStore
      reflects it; CurrentPrice recalculated incl. floor-at-zero; only pricing
      fields change (visible/active/free-included intact, hidden module stays
      hidden); OwnerAdmin gets 403; negatives / percent>100 rejected with no
      write; unknown module aborts everything; empty/duplicate tables refused.
- [x] T3 — Frontend contract: `updateModulePricing` added to `store-http-service.ts`
      (PUT `/v1/modules/pricing`); domain types added to `store.ts`
      (`ModuleCatalogPricingPayload/Row/Result`); formula + grouping reused from
      `/packages/domain` (no duplication).
- [x] T4 — Page `/admin/modules`: `module-catalog.tsx` (clientLoader
      `superAdminLoader`) + `module-catalog-table.tsx`; route in `routes.ts`;
      menu item "Módulos" in ADMIN group, plain text, `rolesOnly` isSuperAdmin;
      i18n keys in `es.ts` (`MENU.MODULES`, `MODULE_CATALOG.*`). Table grouped by
      plan (`groupModulesByPlanDelta`), inline inputs for the 3 prices, offer →
      base strikethrough + effective normal (row and group total), one Guardar
      button, refetch after save, edits kept on error.
- [x] T5 — Unit tests `module-catalog.test.tsx`: 23/23 pass (grouping, offer
      strikethrough, live math, save success/refetch, save error keeps edits).
      Commit `70dce636`.

## Notes from T3–T5 writer (2026-09-28)

- No client-side IsActive filter added: `GetAvailableModulesToStore` already
  returns exactly `IsActive && AvailableToStore`; a client filter would be dead
  code.
- PRE-EXISTING wire mismatch, not introduced here: domain `Module` declares
  `selected` as required but `ModuleDto` has no such field; `ModuleDto` carries
  `order`/`availableToStore`/`featureDescriptions` which `Module` does not
  declare. Suggested as a separate follow-up; NOT fixed in this feature.
- No `StoreRoleFeatures` entry advertises catalog pricing (the menu+loader gate
  is UI-only; the backend endpoint 403s independently). Intentional.
- [x] T6 — Frontend E2E (new `module-catalog-pricing.spec.ts`, 4 tests MCP1–MCP4):
      page loads grouped by plan; offer strikethrough + effective price; edit +
      save persists across reload; live group totals. Catalog snapshot/restore
      before/after with post-run re-read verification (no leaked mutations).
      4/4 green + store-module-pricing 8/8 green + smoke/regression specs green.
      Commit `cf296167`. No non-SuperAdmin E2E (maintainer preference).

## Delivery

- Forecast: well over the ~400 authored-line heuristic across backend + frontend → chained/split PR at PR time; work-unit commits until then.
- PR split discussion deferred until the maintainer asks for a PR (same as previous feature).

## Verification (per task, observed)

- T1: `dotnet build` backend passes; new command/handler unit-testable.
- T2: `dotnet test backend/src/SMCA.WebApi.E2ETests/... --filter StoreModulePricing|ModuleCatalogPricing` green (with `-p:InvariantGlobalization=false` workaround; pre-existing failures documented below are NOT ours).
- T3–T5: `pnpm typecheck`, `pnpm lint`, targeted app unit tests.
- T6: Playwright new spec green; full frontend suite has no new failures.

## Known environmental failures (pre-existing, not ours — do not chase)

- `Plans.StorePlanCatalogTests.StorePlanModule_seed_matches_documented_plan_matrix` + `Plans.PlanChangeMatrixTests.SuperAdmin_upgrades_{superior,gratis,pago}_to_vip_...` — stale VIP matrix expectations after migration `20260927175335_Add-WebCatalog-Module`.
- `dotnet run` startup `CultureNotFoundException "es"` (`ServiceExtensions.cs:126` vs `<InvariantGlobalization>true</InvariantGlobalization>`); E2E writers use `-p:InvariantGlobalization=false`.
- ReSeller cannot list stores on `/admin/stores` (by-current-user 403) — unrelated to this feature.

## Progress

- 2026-09-28 — Feature doc created. T1+T2 delegated to backend writer.
- 2026-09-28 — T1+T2 DONE. Backend writer (fresh context) reported success,
      spot-checked 7/7 E2E green. Commits on `qa`: `d2d7e448` (endpoint + E2E,
      5 files, 820 insertions, 0 deletions), `e3feb127` (this doc). Endpoint PUT
      /v1/modules/pricing — SuperAdmin-only, all-or-nothing, only 3 pricing
      fields change, CurrentPrice via shared `CurrentPriceServiceUtils`.
- 2026-09-28 — T3+T4+T5 DONE. Frontend writer (fresh context) reported success;
      spot-checked tree clean, `features.tsx` pristine. Commit `70dce636`
      (8 files, +1085). 23/23 new unit tests, full app suite 4820 tests no
      regressions, typecheck 5/5, lint 4/4.
- 2026-09-28 — T6 DONE. Frontend E2E writer (fresh context) reported success.
      Commit `cf296167` (1 file, +961). MCP1–MCP4 4/4 green; combined with
      store-module-pricing 12/12; regression specs green; catalog restored after
      runs (verified). Playwright config lives at `frontend-react/playwright.config.ts` —
      run `pnpm exec playwright test <filtro> --project=chromium` from
      `frontend-react/` (the `--filter` app form is invalid for Playwright).
      Next: independent verification over the feature diff; then final report.