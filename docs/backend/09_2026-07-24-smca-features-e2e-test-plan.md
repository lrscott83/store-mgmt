# 09 — SMCA.WebApi Features E2E — Test Plan

**Date:** 2026-07-24
**Scope:** the 3 endpoints of `FeaturesController` (`api/v1/Features`) — behavior + the per-endpoint
auth (401/403), the `activate` shared-seed mutation (snapshot+restore), and the `activate`
non-idempotent-return pin.
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `[Collection("e2e")]`,
`ApiResponse<T>`, `DbTestHelpers`, `StoreSeed`) against real Postgres `smca_test`. As of this date the
harness is **planned only, not yet implemented as code** — these tests slot into it once it exists.

---

## 1. Self-contained by directive

Unlike `08` (which delegated the generic 403/401 matrix to `05`), **this plan carries its own auth
matrix inline** for all 3 endpoints. If a seed/auth helper is not on disk, duplicate it here — do not
cross-reference another plan for coverage. These are e2e tests; duplication is acceptable.

## 2. Verified contract facts (code-cited — bake into assertions)

- Class-level `[HasPermission(StoreRoleFeatures.SuperAdmin)]` on the controller
  (`FeaturesController.cs:14`). `SuperAdmin = [HasRoles(SuperAdmin)]` (`StoreRoleFeatures.cs`).
- **`GET all/{includeInactive}`** (`FeaturesController.cs:18-23`) → `GetFeaturesQuery` — **no handler
  gate**, only the class filter. Returns `ResponseResult<List<FeatureDto>>`. `includeInactive` is a
  route bool: `true` → all features; `false` → active only
  (`GetFeaturesQuery.cs:23` → `_featureRepository.GetFeaturesIncludingModuleAsync(includeInactive)`).
- **`POST activate`** (`FeaturesController.cs:25-30`) → `ActivateFeaturesCommand`. Returns
  `ResponseResult<bool>` where `bool = SaveChangesAsync() > 0` (`ActivateFeaturesCommand.cs:90`). It
  **mutates shared seed rows** (`ActivateFeaturesCommand.cs:47-88`):
  - Module `Statistics` (6) → `IsActive=true`, `Price=1000`.
  - Feature `Dashboard` (60) → `IsActive=true`.
  - Module `Reports` (5) → `IsActive=true`.
  - Feature `TodayReports` (50) → `IsActive=true`.
  - Feature `Egress` (33) → **created if missing** (module `Inventory`=3, order 71).
  - Redundant handler check `if (!IsSuperAdmin) throw ApiException(400)` — unreachable (filter already
    requires SuperAdmin). See §6.
- **`GET available`** (`FeaturesController.cs:32-38`) → method-level
  `[HasPermission(SuperAdmin, StoresAdmin)]` (widens the class filter). Returns
  `ResponseResult<IEnumerable<FeatureDto>>`. `StoresAdmin = [HasRoles(OwnerAdmin)] [HasFeature(Stores)]
  [HasModule(Management)]` (`StoreRoleFeatures.cs:188-191`). Redundant handler check
  `if (!IsSuperAdminOrOwnerAdmin) throw 400` — unreachable (see §6).
- **Failures are thrown → real HTTP status.** No token → **401** (auth middleware). Authenticated but
  filter-rejected → **403** (`HasPermissionAttribute`). The controllers' `Ok(...)` runs only on success.

## 3. Behavior to PIN as-is (like register-500 in `02` / activate-500 in `06`)

- **`activate` return is not idempotent.** 1st call mutates rows → `SaveChanges>0` → `200 { Data:true }`.
  2nd call (all already active + Egress exists) → `SaveChanges==0` → `200 { Data:false }`. Pin both;
  update if the contract is later made idempotent.

## 4. Endpoints → test classes

| # | Endpoint | Class |
|---|----------|-------|
| 1 | `GET all/{includeInactive}` | `FeaturesListTests` + `FeaturesListAuthTests` |
| 2 | `POST activate` | `FeaturesActivateTests` + `FeaturesActivateAuthTests` |
| 3 | `GET available` | `FeaturesAvailableTests` + `FeaturesAvailableAuthTests` |

### `FeaturesListTests`
- `List_features_as_super_admin_returns_200`
- `List_includeInactive_true_includes_inactive_feature` — seed a feature with `IsActive=false`, assert it
  appears; delete it in `finally`.
- `List_includeInactive_false_excludes_inactive_feature` — same seeded inactive feature is absent when
  `includeInactive=false`.

### `FeaturesListAuthTests`
- `List_no_token_returns_401`
- `List_as_owner_admin_returns_403` (class filter is SuperAdmin-only)
- `List_as_store_user_returns_403`
- `List_as_reseller_returns_403`

### `FeaturesActivateTests`
- `Activate_as_super_admin_returns_200_true` — **snapshot** Statistics(6)/Reports(5) modules +
  Dashboard(60)/TodayReports(50) features + whether Egress(33) pre-exists; POST; assert `200` +
  `Succeeded` + `Data==true`; assert the mutation (Statistics `IsActive==true` & `Price==1000`,
  Dashboard/TodayReports `IsActive==true`, Egress exists); **restore** all snapshotted values + delete
  Egress if the test created it, in `finally`.
- `Activate_twice_second_returns_false` **(PIN)** — POST twice in one test; assert 1st `Data==true`,
  2nd `Data==false`; same snapshot+restore in `finally`.

### `FeaturesActivateAuthTests`
- `Activate_no_token_returns_401`
- `Activate_as_owner_admin_returns_403`
- `Activate_as_store_user_returns_403`
- `Activate_as_reseller_returns_403`

### `FeaturesAvailableTests`
- `Available_as_super_admin_returns_200`
- `Available_as_stores_admin_returns_200` — `StoreSeed.SeedStoresAdminUserAsync` (OwnerAdmin + Stores
  feature + active Management module) passes the widened filter; `finally` cleans the seeded graph.

### `FeaturesAvailableAuthTests`
- `Available_no_token_returns_401`
- `Available_as_store_user_returns_403`
- `Available_as_reseller_returns_403`
- `Available_as_owner_admin_without_stores_feature_returns_403` — an OwnerAdmin lacking the Stores
  feature / Management module fails the `StoresAdmin` grant → 403 (never reaches the handler).

## 5. Seeding needs (reuse `04`/`05`; duplicate locally if absent)

- SuperAdmin: `DbTestHelpers.SeedSuperAdminAsync`.
- Role actors: `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.{OwnerAdmin|StoreUser|ReSeller})`.
- StoresAdmin actor: `StoreSeed.SeedStoresAdminUserAsync` (from `04`/`05`).
- Inactive feature for the List tests: insert a `Feature` with `IsActive=false` via a `Factory.Services
  .CreateScope()` + `ApplicationDbContext` (same pattern as `01`/`04`); delete it in `finally`.
- `activate` snapshot/restore: direct `ApplicationDbContext` read of Module(6,5) + Feature(60,50,33)
  before, write-back after (see the implementation plan Task 2).

## 6. Findings — documented, NOT asserted (like `08` §6 minor findings)

- **Unreachable handler gate (dead code) — 2 spots.** Both redundant handler checks are unreachable
  because the controller filter is at least as strict as the check:
  - `activate`: filter requires `SuperAdmin`; handler re-checks `IsSuperAdmin` → can never be false.
  - `available`: filter requires `SuperAdmin || StoresAdmin`, and `StoresAdmin = [HasRoles(OwnerAdmin)]`,
    so every actor passing the filter satisfies `IsSuperAdmin || IsOwnerAdmin`; the handler's
    `throw 400` branch is unreachable.
  We **cannot** write a test that triggers these branches (no actor passes the filter yet fails the
  handler). Pin observable behavior only; do not change production code in this task.
- **Note:** the `available` filter (`StoresAdmin`) is *stricter* than its handler gate (`OwnerAdmin`
  claim). Today this is masked; if the filter is ever loosened, the handler would not enforce the Stores
  feature/Management module — a latent inconsistency worth a separate production-code review.

## 7. Deferred — how to test unreachable filter/handler branches

**Decision: Option B.** The dead handler-gate branches are covered by **handler unit tests** in
`Application.Tests` — see the separate plan **`09b`** (`09b_2026-07-24-smca-features-dead-gate-unit-tests-plan.md`).
Each handler is constructed directly with a mocked `IHttpContextService` returning
`IsSuperAdmin=false` (activate) / `IsSuperAdminOrOwnerAdmin=false` (available) and asserts the
`ApiException` with `StatusCode == BadRequest`. Options considered and rejected here: (a) filter-bypass
integration factory — artificial, tests a non-production scenario; (c) remove the redundant gate in
production — a separate production-code change, out of scope for a test task.

## 8. Out of scope

- `ReSellers` / `Usages` controllers → later plans (`ReSellers` is deliberately **last**).
- The generic role×feature×scope matrix over Stores (the `05` cross-cutting engine). This plan asserts
  only the per-endpoint auth of the 3 Features endpoints.
- Repository-level content correctness of `GetAvailableFeaturesToStore()` / `GetFeaturesIncludingModule`
  beyond the active/inactive inclusion asserted in §4.
