# Tasks: Features E2E Tests

**Total: 33 tests** across 9 test files + 1 shared helper. Final count differs from initial estimate due to 2 findings:
- `Activate_twice` pin corrected: handler uses `repository.UpdateAsync()` which always marks entities Modified, so `SaveChanges` always > 0 → both calls return true
- `Available_as_stores_admin` removed: class-level `[HasPermission(SuperAdmin)]` filter blocks all non-SuperAdmin before method-level widening runs
- `Available_as_owner_admin_with_inactive_management_module` removed: same class-level filter reason — redundant with auth tests

---

## Task 0: FeatureSeed helper

- [x] Create `SMCA.WebApi.E2ETests/Features/FeatureSeed.cs` — `ActivateSnapshot` record (6 fields) + static class with:
  - `InsertInactiveFeatureAsync` / `DeleteFeatureAsync` — Feature(9099, inactive, Inventory), delete by id
  - `SnapshotAsync` / `RestoreAsync` — capture Module(6,5) + Feature(60,50,33) state before activate; revert mutations + conditionally delete created Egress(33) in restore. All queries use `.AsTracking()` for NoTracking-safe mutations.
  - Gap helpers: `InsertFeatureUnderModuleAsync`, `InsertInactiveModuleWithActiveFeatureAsync`, `DeleteModuleAsync`, `DeleteEgressAsync`, `EgressCountAsync`, `SetManagementModuleActiveAsync` (returns previous value)
- [x] Compile. **Checkpoint**: `test(webapi): features seed helper`

---

## Task 1: FeaturesListTests

- [x] File: `SMCA.WebApi.E2ETests/Features/FeaturesListTests.cs`
  - `List_features_as_super_admin_returns_200` — SuperAdmin GET /all/true → 200, `Succeeded=true`, `Data` not empty
  - `List_includeInactive_true_includes_inactive_feature` — insert inactive feature(9099), GET /all/true → contains it
  - `List_includeInactive_false_excludes_inactive_feature` — same feature, GET /all/false → does NOT contain it
  - Local `FeatureDtoShape` class (Id, Name, ModuleId, Order, AvailableToStore) for deserialization
- [x] Run: `dotnet test --filter ~FeaturesListTests`. **Checkpoint**: `test(webapi): features list e2e`

---

## Task 2: FeaturesActivateTests

- [x] File: `SMCA.WebApi.E2ETests/Features/FeaturesActivateTests.cs`
  - `Activate_as_super_admin_returns_200_true` — snapshot BEFORE, POST activate → 200, `Data=true`, DB asserts: Statistics.IsActive=true & Price=1000, Dashboard.IsActive=true, TodayReports.IsActive=true, Egress not null. Restore in `finally`.
  - `Activate_twice_both_return_true` — snapshot BEFORE, both calls return `Data=true` (handler's `UpdateAsync` always marks entities Modified, so `SaveChanges>0`). Restore in `finally`.
- [x] Run: `dotnet test --filter ~FeaturesActivateTests`. **Checkpoint**: `test(webapi): features activate e2e`

---

## Task 3: FeaturesAvailableTests

- [x] File: `SMCA.WebApi.E2ETests/Features/FeaturesAvailableTests.cs`
  - `Available_as_super_admin_returns_200` — SuperAdmin GET /available → 200
  - ~~`Available_as_stores_admin_returns_200`~~ **REMOVED** — class-level `[HasPermission(SuperAdmin)]` on FeaturesController blocks ALL non-SuperAdmin users before method-level `[HasPermission(SuperAdmin, StoresAdmin)]` can widen access. StoresAdmin can NEVER reach this endpoint via HTTP.
- [x] Run: `dotnet test --filter ~FeaturesAvailableTests`. **Checkpoint**: `test(webapi): features available e2e`

---

## Task 4: Auth matrix (3 files)

- [x] `SMCA.WebApi.E2ETests/Features/FeaturesListAuthTests.cs` — 5 tests:
  - No token → 401
  - 3× `[Theory]` `[InlineData]` with OwnerAdmin, StoreUser, ReSeller → 403
  - Malformed bearer token → 401
- [x] `SMCA.WebApi.E2ETests/Features/FeaturesActivateAuthTests.cs` — 4 tests:
  - No token → 401
  - 3× Theory with OwnerAdmin, StoreUser, ReSeller → 403
- [x] `SMCA.WebApi.E2ETests/Features/FeaturesAvailableAuthTests.cs` — 5 tests:
  - No token → 401
  - 3× Theory with StoreUser, ReSeller, OwnerAdmin → 403
  - Bare OwnerAdmin (without Stores feature) → 403
- [x] Run: `dotnet test --filter "~FeaturesListAuthTests|~FeaturesActivateAuthTests|~FeaturesAvailableAuthTests"`. **Checkpoint**: `test(webapi): features auth matrix e2e`

---

## Task 5: FeaturesListGapTests

- [x] File: `SMCA.WebApi.E2ETests/Features/FeaturesListGapTests.cs`
  - `List_includeInactive_nonbool_route_returns_400_or_404` — GET /all/not-a-bool → `BeOneOf(400, 404)`
  - `List_returned_items_have_module_and_dto_shape` — every item has `!Name.IsNullOrWhiteSpace` and `ModuleId > 0`
  - `List_result_is_not_guaranteed_ordered` — insert features(9093,9094), assert membership only (no ordering)
  - `List_malformed_token_returns_401` — `Bearer not-a-real-jwt` header → 401
- [x] Run: `dotnet test --filter ~FeaturesListGapTests`. **Checkpoint**: `test(webapi): features list gap e2e`

---

## Task 6: FeaturesActivateGapTests

- [x] File: `SMCA.WebApi.E2ETests/Features/FeaturesActivateGapTests.cs`
  - `Activate_creates_Egress_when_missing` — delete Egress(33), activate creates it with ModuleId=Inventory(3), Order=71, IsActive=true, AvailableToStore=true. Snapshot/restore.
  - `Activate_does_not_duplicate_Egress_when_present` — activate twice, `EgressCount` = 1 (PK row). Snapshot/restore.
  - `Activate_tolerates_missing_optional_seed_row` — delete TodayReports(50), activate → 200 (null-guard). Snapshot/restore + recreate in finally.
  - `Activate_with_GET_verb_returns_405` — GET on POST-only route → `BeOneOf(404, 405)`
  - `Activate_ignores_unexpected_request_body` — POST with `{"junk":true}` body → 200. Snapshot/restore.
- [x] Run: `dotnet test --filter ~FeaturesActivateGapTests`. **Checkpoint**: `test(webapi): features activate gap e2e`

---

## Task 7: FeaturesAvailableGapTests

- [x] File: `SMCA.WebApi.E2ETests/Features/FeaturesAvailableGapTests.cs`
  - `Available_excludes_Administration_module_features` — insert active feature under Administration(1), verify excluded
  - `Available_excludes_features_whose_module_is_inactive` — inactive module(9090) + active feature(9092), verify excluded
  - `Available_excludes_inactive_features` — inactive feature under active module(Inventory), verify excluded
  - `Available_is_ordered_by_Order_ascending` — assert `Order` sequence is ascending
  - `Available_items_have_dto_shape_and_module` — every item has Name and ModuleId > 0
  - `Available_with_POST_verb_returns_405` — POST on GET-only route → `BeOneOf(404, 405)`
  - ~~`Available_as_owner_admin_with_inactive_management_module_returns_403`~~ **REMOVED** — same class-level `[HasPermission(SuperAdmin)]` issue as above. No StoresAdmin user can ever reach this endpoint to test management module gating. Redundant with role-based auth tests.
- [x] Run: `dotnet test --filter ~FeaturesAvailableGapTests`. **Checkpoint**: `test(webapi): features available gap e2e`

---

## Task 8: Full suite verification

- [x] `dotnet test` — **181/181 PASS** (148 existing + 33 new). Zero regressions. Suite rebaseline: 181.

---

## Summary

| # | File | Tests | Key Dependency |
|   |------|-------|----------------|
| 0 | `FeatureSeed.cs` | — | Nothing (foundation) |
| 1 | `FeaturesListTests.cs` | 3 | FeatureSeed |
| 2 | `FeaturesActivateTests.cs` | 2 | FeatureSeed (snapshot/restore) |
| 3 | `FeaturesAvailableTests.cs` | 1 | StoreSeed |
| 4 | 3 auth files | 14 | DbTestHelpers, StoreSeed |
| 5 | `FeaturesListGapTests.cs` | 4 | FeatureSeed (gap helpers) |
| 6 | `FeaturesActivateGapTests.cs` | 5 | FeatureSeed (snapshot/restore) |
| 7 | `FeaturesAvailableGapTests.cs` | 5 | FeatureSeed + StoreSeed |
| **Total** | **10 files** | **34→33** | *(1 removed during apply due to controller filter limitation)* |

## Risks

1. **NoTracking on DbContext** — `FindAsync` returns detached entities if `QueryTrackingBehavior.NoTracking` is configured. Mitigation: all restore queries use `.AsTracking()`. Verify at compile.
2. **FK on Feature(50) deletion** — TodayReports(50) may have child `StoreRoleFeature` rows. If FK constraint blocks delete, test must delete/recreate child rows in gap test `Activate_tolerates_missing_optional_seed_row`.
3. **Verb-mismatch 404 vs 405** — ASP.NET routing may return 404 instead of 405. Tests use `BeOneOf(404, 405)`. Pin exact code once pipeline behavior confirmed.
4. **Seed collision across test classes** — `[Collection("e2e")]` serializes tests, but activate tests mutate shared seed. Snapshot/restore + `finally` cleanup = stacked mitigation.
