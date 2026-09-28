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

- [ ] T1 — Backend write: `UpdateModulePricingCommand` + handler + validator + DTO,
      `PUT /v1/modules/pricing` action on `ModulesController` with
      `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (action-level override of
      the class-level `StoresAdmin`). Response returns the saved rows with
      recalculated `CurrentPrice`.
- [ ] T2 — Backend E2E (new `ModuleCatalogPricingTests.cs`): PUT persists price /
      percent / flat; GET ToStore reflects them; `CurrentPrice` recalculated;
      only pricing fields change (IsActive/AvailableToStore/PriceIncluded intact);
      non-SuperAdmin gets 403; validation rejects negatives / percent > 100.
- [ ] T3 — Frontend contract: http-service method `updateModulePricing` pointing
      at `PUT /v1/modules/pricing`; reuse existing domain `Module` type + formula
      (`module-pricing.ts`) + grouping (`plan-module-groups.ts`).
- [ ] T4 — Page `/admin/modules`: `clientLoader = superAdminLoader`, route entry,
      menu item "Módulos" in ADMIN group with `rolesOnly: (user) => user.isSuperAdmin`,
      i18n keys (en + es). Table grouped by plan, inline inputs, strikethrough
      when on offer, live group totals, single Save (with error/success handling,
      refetch after save).
- [ ] T5 — Page unit tests: render, grouping by plan, offer strikethrough, live
      total math, save calls service and refreshes, save error path.
- [ ] T6 — Frontend E2E (new spec + fixture/support only if needed): SuperAdmin
      opens the page, sees modules grouped by plan, edits price/percent/flat,
      sees strikethrough on an offered module, saves, reloads and values persist.
      No non-SuperAdmin E2E (maintainer declined vacuous role pins; the menu
      `rolesOnly` + `superAdminLoader` gate the route by construction).

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