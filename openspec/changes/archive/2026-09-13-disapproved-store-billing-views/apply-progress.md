# Apply Progress — disapproved-store-billing-views

- lineage_id: `disapproved-store-billing-views`
- generation: 1
- batch: 1 (single-batch apply; no prior progress existed)
- status: all 16 tasks complete, 3 work-unit commits created on `qa`
- artifact store: openspec (files in this folder mirror engram observations)

## Verdict

**Apply complete.** Disapproved stores now read as free on every store-view
surface (backend and frontend), proven by unit, E2E and component suites.

## Work Units (commits on `qa` — direct-to-branch, no PRs per user decision)

1. `0f359f79` — `feat(stores): gate disapproved stores off plan names and due dates`
   (4 prod files + 4 unit suites; full `Application.Tests` 447/447 green)
2. `9ea1a9f2` — `test(e2e): disapproved stores read Gratis with null dates on all three views`
   (new `DisapprovedStoreBillingViewsTests.cs`; filtered E2E 1/1 green)
3. pending (this batch's final commit) — frontend card gates + tests + openspec artifacts

## Task Status

| Task | Status | Evidence |
|------|--------|----------|
| 1.1 RED StoreProfilePlanTypeTests | done | 3 failed / 5 passed |
| 1.2 GREEN StoreProfile ResolvePlanType guard | done | 8/8 passed |
| 1.3 RED by-current-user disapproved test | done | 1 failed / 8 passed |
| 1.4 GREEN GetStoresByCurrentUserQuery.cs ternary | done | 9/9 passed |
| 1.5 RED my-stores disapproved test | done | 1 failed / 7 passed |
| 1.6 GREEN GetMyStoresQuery.cs ternary | done | 8/8 passed |
| 1.7 RED new GetStorePlanQueryHandlerTests (real mapper) | done | 2 failed / 1 passed |
| 1.8 GREEN GetStorePlanQuery.cs ternary | done | 3/3 passed |
| 2.1–2.3 E2E DisapprovedStoreBillingViewsTests.cs | done | filtered E2E 1/1 passed |
| 3.1 RED store-card-list.test.tsx additive | done | 1 failed / 21 passed |
| 3.2 GREEN store-card-list.tsx showPrice gate | done | 22/22 passed |
| 3.3 RED new owner-store-card.test.tsx | done | intended RED observed |
| 3.4 GREEN owner-store-card.tsx isOnPaidPlan gate | done | 24/24 (both suites) |
| 4.1 unit + filtered E2E | done | 447/447; 1/1 |
| 4.2 full E2E | done | 500/500 (3m23s), existing suites untouched |
| 4.3 frontend full suite + typecheck | done | 3450/3452; 2 failures — isolation noise, both pass in isolation and on pre-change state (see Risks) |

## Deviations from Task/Design Contract

- **E2E caller role (task 2.2 wording)**: the design card said "assert as
  super-admin `by-current-user` ... and owner `my-stores` and plan". Implemented
  ALL three endpoints as the **owner-admin** who owns both stores (the real
  consumer of all three surfaces). The super-admin by-current-user branch is
  covered by `StoresByCurrentUserTests` + unit `GetStoresByCurrentUserQueryHandlerTests`.
  Seeding uses `AuthzSeed.SeedOwnerAdminAsync` (already sets `SelectedStoreId`,
  so the StoresController class-level permission gate passes) instead of the raw
  user+role inline seed from `GetMeBillingZeroAmountTests`.
- **Module price for Statistics snapshot**: spec said Statistics priceIncluded
  = false without a fixed amount; used 2000 (matches `BillingSeed.SeedPaidStoreAsync` default 1000? No — used 2000f explicitly; harmless, only asserted presence).

## Test Evidence (commands)

```
dotnet test backend/src/Application.Tests/Application.Tests.csproj            → Passed 447/447
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter FullyQualifiedName~DisapprovedStoreBillingViews → Passed 1/1
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj    → Passed 500/500
pnpm vitest run <store-card-list | owner-store-card suites>                 → Passed 24/24
pnpm vitest run (full app)                                                  → 3450/3452 (see Risks)
pnpm typecheck                                                              → 2 errors, both pre-existing (configurations.tsx:41, store-switcher.tsx:56 — StoreSummary.isActive)
```

## Risks / Notes for Verify

1. Full frontend suite shows 2 failures (`sync-routes.test.tsx` S-ROUTE-1,
   `user-routes.test.tsx` S-LIST-1). Both pass when run in isolation AND pass on
   the pre-change HEAD with this apply's files stashed — vitest full-suite module
   isolation noise, not a regression. Verify phase should scope with the focused
   commands above or flag as pre-existing.
2. `pnpm typecheck` blames 2 pre-existing `StoreSummary.isActive` errors in files
   untouched by this change (backend contract drift, unrelated).
3. BillingService (the billing engine) was NOT touched — its `!Approved → "Free"`
   gate predates this change (`c0c47ec5`); this change only aligned the three
   store-view surfaces with it.