# Exploration: features-e2e

**Date:** 2026-07-25
**Scope:** Implement E2E tests for `FeaturesController` (3 endpoints) per the pre-existing plans `09_2026-07-24-smca-features-e2e-test-plan.md` and `09_2026-07-24-smca-features-e2e-implementation-plan.md`.

---

## Current State

The `FeaturesController` at `backend/src/SMCA.WebApi/Controllers/v1/FeaturesController.cs` exposes 3 endpoints:

| Endpoint | Method | Class filter | Method filter | Return |
|----------|--------|-------------|---------------|--------|
| `GET /api/v1/Features/all/{includeInactive}` | `GetFeaturesAsync(bool)` | `[HasPermission(SuperAdmin)]` | (inherited) | `ResponseResult<List<FeatureDto>>` |
| `POST /api/v1/Features/activate` | `ActivateFeaturesAsync()` | `[HasPermission(SuperAdmin)]` | (inherited) | `ResponseResult<bool>` |
| `GET /api/v1/Features/available` | `GetAvailableFeaturesToStoreQueryAsync()` | `[HasPermission(SuperAdmin)]` | `[HasPermission(SuperAdmin, StoresAdmin)]` | `ResponseResult<List<FeatureDto>>` |

No `Features/` test directory exists yet under `SMCA.WebApi.E2ETests/`. It needs creation.

---

## Verified Facts

### Controller & Routes
- ✅ **Controller**: Class-level `[HasPermission(StoreRoleFeatures.SuperAdmin)]` confirmed
- ✅ **List**: `GET all/{includeInactive}` → `GetFeaturesQuery(bool IncludeInactive)` → no handler gate
- ✅ **Activate**: `POST activate` → `ActivateFeaturesCommand` (parameterless) → `ResponseResult<bool>`
- ✅ **Available**: `GET available` → method-level `[HasPermission(SuperAdmin, StoresAdmin)]` widens filter → `ResponseResult<List<FeatureDto>>`
- ✅ **Response envelopes**: All return `Ok(await Sender.Send(...))` — success only; failures thrown as exceptions

### Domain Entities
- ✅ **Feature.Create(id, name, description, moduleId, order, availableToStore, isActive)** — 7 params, confirmed
- ✅ **Feature properties**: Id, Name, Description, ModuleId, Module (nav), IsActive, Order, AvailableToStore, StoreRoleFeatures
- ✅ **Module.Create(id, name, order, priceIncluded, price, availableToStore, isActive)** — 7-arg overload confirmed
- ✅ **Module properties**: Id, Name, IsActive, Order, Price (float), PriceIncluded, DiscountPrice, PercentDiscountPrice, AvailableToStore, Features (nav), StoreModules (nav)

### ActivateFeaturesCommand Mutation
- ✅ **Module.Statistics(6)**: `IsActive=true, Price=1000`
- ✅ **Module.Reports(5)**: `IsActive=true`
- ✅ **Feature.Dashboard(60)**: `IsActive=true`
- ✅ **Feature.TodayReports(50)**: `IsActive=true`
- ✅ **Feature.Egress(33)**: Created if null (ModuleId=Inventory(3), Order=71, AvailableToStore=true, IsActive=true)
- ✅ **Return**: `SaveChangesAsync() > 0` — NOT idempotent

### Enum Values
- ✅ **ModuleType**: Administration=1, Inventory=3, Reports=5, Statistics=6, Management=7
- ✅ **FeatureType**: Egress=33, TodayReports=50, Dashboard=60, Stores=73

### DTO
- ✅ **FeatureDto**: Id, ModuleId, Name, DisplayName, Description, Order, AvailableToStore — all confirmed
- ✅ **DisplayName** is NOT on Feature entity (only on DTO)

### E2E Infrastructure
- ✅ **ApiResponse<T>**: Has Succeeded, Data, Errors, ActionCode, Message
- ✅ **ApiResponse.Json**: `new JsonSerializerOptions { PropertyNameCaseInsensitive = true }`
- ✅ **DbTestHelpers.SeedSuperAdminAsync(factory, login, password)** → returns `Guid userId`
- ✅ **DbTestHelpers.SeedUserWithRoleAsync(factory, roleId)** → returns `UserFixture(Guid UserId, string Login)`
- ✅ **DbTestHelpers.AuthedClient(factory, userId, login)** → `HttpClient` with Bearer token
- ✅ **DbTestHelpers.CleanupUserAsync(factory, userId)** — confirmed
- ✅ **StoreSeed.SeedStoresAdminUserAsync(factory)** → `StoresAdminFixture(Guid UserId, string Login, Guid StoreId, Guid OwnerId)`
- ✅ **StoreSeed.CleanupStoresAdminAsync(factory, fixture)** — method name is `CleanupStoresAdminAsync`

### Repository Layer
- ✅ **GetFeaturesIncludingModuleAsync(bool)**: `Where(f => f.IsActive || includeInactive).Include(f => f.Module)` — NO OrderBy
- ✅ **GetAvailableFeaturesToStore()**: `Where(f => f.IsActive && f.Module.IsActive && f.ModuleId != Administration).OrderBy(f => f.Order).Include(f => f.Module)`

### Existing Test Patterns
All existing tests follow this pattern:
- `[Collection("e2e")]` on test class
- Constructor takes `WebAppFixture fixture` → stores `_f = fixture.Factory`
- `try/finally` blocks for cleanup
- Seed actors with `DbTestHelpers.SeedSuperAdminAsync` / `SeedUserWithRoleAsync`
- Auth via `DbTestHelpers.AuthedClient`
- Response via `ReadFromJsonAsync<ApiResponse<T>>(ApiResponse.Json)`
- FluentAssertions for assertions

---

## Discrepancies Found (Plans vs Code)

### 🔴 DISCREPANCY 1: `CleanupStoresAdminUserAsync` doesn't exist
- **Plan references**: `StoreSeed.CleanupStoresAdminUserAsync(_f, actor)` (implementation plan lines 379, 824)
- **Actual method**: `StoreSeed.CleanupStoresAdminAsync(_f, f)` (no "User" in name)
- **Impact**: Will fail to compile. Must fix in 3 places.

### 🔴 DISCREPANCY 2: `decimal StatisticsPrice` type mismatch
- **Plan's ActivateSnapshot**: `decimal StatisticsPrice`
- **Entity**: `Module.Price` is `float` (non-nullable)
- **Expression**: `stats?.Price ?? 0` produces `float`, cannot implicitly convert to `decimal`
- **Impact**: Compilation error. Must change to `float StatisticsPrice`.

### 🔶 DISCREPANCY 3: `Available_as_stores_admin_returns_200` cleanuup references wrong method
- Same as #1 — calls `CleanupStoresAdminUserAsync` instead of `CleanupStoresAdminAsync`.

### 🔶 DISCREPANCY 4: `Available_as_owner_admin_with_inactive_management_module_returns_403` cleanup references wrong method
- Same as #1 — calls `CleanupStoresAdminUserAsync` instead of `CleanupStoresAdminAsync`.

---

## Test Files Needed (10 files)

All under `backend/src/SMCA.WebApi.E2ETests/Features/`:

| # | File | Tests | Description |
|---|------|-------|-------------|
| 1 | `FeatureSeed.cs` | (helper) | Snapshot/restore for activate, inactive feature insert, gap helpers |
| 2 | `FeaturesListTests.cs` | 4 | Happy path, includeInactive toggle, DTO shape, no-order pin |
| 3 | `FeaturesListAuthTests.cs` | 5 | 401/403 matrix for List + malformed token |
| 4 | `FeaturesActivateTests.cs` | 2 | Snapshot+restore, non-idempotent pin |
| 5 | `FeaturesActivateAuthTests.cs` | 4 | 401/403 matrix for Activate |
| 6 | `FeaturesAvailableTests.cs` | 2 | SuperAdmin + StoresAdmin happy paths |
| 7 | `FeaturesAvailableAuthTests.cs` | 4 | 401/403 matrix for Available |
| 8 | `FeaturesListGapTests.cs` | 4 | Non-bool route, DTO shape, unordered pin, malformed token |
| 9 | `FeaturesActivateGapTests.cs` | 5 | Egress create/duplicate, missing row tolerance, 405, ignored body |
| 10 | `FeaturesAvailableGapTests.cs` | 7 | Administration exclusion, inactive module/feature, order asc, DTO shape, 405, inactive Management module |

**Total: 37 tests across 9 test classes + 1 helper**

---

## Gotchas / Risks

### 1. `FeatureSeed` must use `.AsTracking()` for RestoreAsync
- `ApplicationDbContext` has `QueryTrackingBehavior.NoTracking` by default
- The plan's `SnapshotAsync` and `RestoreAsync` use `FindAsync` which respects the context's tracking mode
- `RestoreAsync` modifies properties then calls `SaveChangesAsync` — but if entities are not tracked, the changes won't be persisted
- **Mitigation**: Plan's `RestoreAsync` should use `.AsTracking()` on queries, OR attach entities before modifying. The current plan code does NOT use `AsTracking()` — this needs fixing.

### 2. FK constraint on TodayReports(50) deletion
- The `Activate_tolerates_missing_optional_seed_row` test deletes Feature(50) — if any `StoreRoleFeature` rows reference it, the delete will throw FK violation
- **Plan acknowledges this** — says to handle FKs if they exist. Need to check at implementation time.

### 3. `Module.Price` type is `float`
- Plan's snapshot record should be `float StatisticsPrice` not `decimal`
- The handler sets `statisticsModule.Price = 1000` which is implicitly `1000f`

### 4. `Available` endpoint deserialization
- Handler returns `ResponseResult<IEnumerable<FeatureDto>>` but controller's `ProducesResponseType` says `ResponseResult<List<FeatureDto>>`
- At runtime, `.ToList()` returns `List<FeatureDto>`, so JSON is an array — deserialization into `List<FeatureDtoShape>` works fine

### 5. Verb-mismatch tests (405)
- Plan assumes `405 MethodNotAllowed` for `GET .../activate` and `POST .../available`
- Some ASP.NET routing configs return `404` instead of `405` for matched routes with wrong verbs
- The plan's `List_includeInactive_nonbool_route_returns_400_or_404` correctly uses `BeOneOf(400, 404)` — good pattern
- The 405 tests should also be flexible if the pipeline returns 404

---

## Ready for Proposal

**Yes.** The pre-existing plans are solid and well-researched. Only minor discrepancies to fix (method name, type mismatch). The codebase is ready. Recommend proceeding to SDD proposal phase with the corrections noted.
