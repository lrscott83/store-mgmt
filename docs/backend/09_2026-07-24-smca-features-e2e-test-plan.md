# 09 — SMCA.WebApi Features E2E — Test Plan

**Date:** 2026-07-24 | **As-built:** 2026-07-25 — 33 tests (initial estimate 37, 4 changes during apply)
**Scope:** the 3 endpoints of `FeaturesController` (`api/v1/Features`) — behavior + the per-endpoint
auth (401/403), the `activate` shared-seed mutation (snapshot+restore), and the `activate`
always-true-return pin.
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `[Collection("e2e")]`,
`ApiResponse<T>`, `DbTestHelpers`, `StoreSeed`) against real Postgres `smca_test`.

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
  `[HasPermission(SuperAdmin, StoresAdmin)]` (intended to widen the class filter). Returns
  `ResponseResult<IEnumerable<FeatureDto>>`. `StoresAdmin = [HasRoles(OwnerAdmin)] [HasFeature(Stores)]
  [HasModule(Management)]` (`StoreRoleFeatures.cs:188-191`). **⚠️ WARNING**: The class-level
  `[HasPermission(SuperAdmin)]` filter runs first and blocks ALL non-SuperAdmin users before the
  method-level widening can take effect. StoresAdmin can NEVER reach this endpoint via HTTP. See §6
  Finding #3. Redundant handler check `if (!IsSuperAdminOrOwnerAdmin) throw 400` — unreachable (see §6).
- **Failures are thrown → real HTTP status.** No token → **401** (auth middleware). Authenticated but
  filter-rejected → **403** (`HasPermissionAttribute`). The controllers' `Ok(...)` runs only on success.

## 3. Behavior to PIN as-is (like register-500 in `02` / activate-500 in `06`)

- **`activate` return is always true (corrected).** Initial plan expected non-idempotent behavior (1st
  call `true`, 2nd call `false`). Actual behavior: `FeaturesRepository.UpdateAsync` calls
  `context.UpdateAsync(entity)` which always marks entities as Modified, so `SaveChangesAsync > 0` even
  when no values changed. Both calls return `200 { Data:true }`. Test `Activate_twice_both_return_true`
  pins this. Update if the repository layer is ever made idempotent.
- `Activate_creates_Egress_when_missing` **(from 09c)** — snapshot, then delete Egress(33) to force the
  create branch; POST; assert Egress now exists with `ModuleId==Inventory(3)`, `Order==71`,
  `IsActive==true`, `AvailableToStore==true`; restore in `finally`.
- `Activate_does_not_duplicate_Egress_when_present` **(from 09c)** — Egress pre-exists; POST twice; assert
  a single Egress(33) row (no duplicate insert); snapshot+restore in `finally`.
- `Activate_tolerates_missing_optional_seed_row` **(from 09c)** — capture+delete an optional target
  (TodayReports=50); POST; the handler null-guard skips the missing row → `200`, no throw; recreate the row
  + restore snapshot in `finally`.
- `Activate_with_GET_verb_returns_405` **(from 09c)** — `GET .../activate` on the POST-only route → `405`.
- `Activate_ignores_unexpected_request_body` **(from 09c)** — the command is a parameterless record; a
  non-empty JSON body is ignored → `200`; snapshot+restore in `finally`.

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
- `List_includeInactive_nonbool_route_returns_400_or_404` **(from 09c)** — `all/not-a-bool`; bool route
  model-binding fails. Pin whichever status the pipeline returns (`400` vs `404`).
- `List_returned_items_have_module_and_dto_shape` **(from 09c)** — every `FeatureDto` has a non-empty
  `Name` and a resolved `ModuleId` (proves `Include(Module)` + mapping). `DisplayName` is not asserted (not
  on the `Feature` entity).
- `List_result_is_not_guaranteed_ordered` **(from 09c) (PIN)** — `all` has no `OrderBy`; assert set
  membership only, never sequence. Update if an order contract is later added.

### `FeaturesListAuthTests`
- `List_no_token_returns_401`
- `List_as_owner_admin_returns_403` (class filter is SuperAdmin-only)
- `List_as_store_user_returns_403`
- `List_as_reseller_returns_403`
- `List_malformed_token_returns_401` **(from 09c)** — a garbage/expired bearer is rejected by the auth
  middleware before the class filter (distinct from the no-token case).

### `FeaturesActivateTests`
- `Activate_as_super_admin_returns_200_true` — **snapshot** Statistics(6)/Reports(5) modules +
  Dashboard(60)/TodayReports(50) features + whether Egress(33) pre-exists; POST; assert `200` +
  `Succeeded` + `Data==true`; assert the mutation (Statistics `IsActive==true` & `Price==1000`,
  Dashboard/TodayReports `IsActive==true`, Egress exists); **restore** all snapshotted values + delete
  Egress if the test created it, in `finally`.
- `Activate_twice_both_return_true` **(PIN)** — POST twice in one test; assert both return `Data==true`;
  same snapshot+restore in `finally`. (Corrected from initial plan — `UpdateAsync` always marks entities
  Modified, so `SaveChanges > 0` on both calls.)

### `FeaturesActivateAuthTests`
- `Activate_no_token_returns_401`
- `Activate_as_owner_admin_returns_403`
- `Activate_as_store_user_returns_403`
- `Activate_as_reseller_returns_403`

### `FeaturesAvailableTests` (1 test — effect of Finding #3)
- `Available_as_super_admin_returns_200`
- ~~`Available_as_stores_admin_returns_200`~~ **REMOVED** — see §6 Finding #3

### `FeaturesAvailableGapTests` (5 tests — gap coverage; moved from the plan above)
- `Available_excludes_Administration_module_features` — seed an active feature under module
  `Administration(1)`; assert absent; `finally` cleanup.
- `Available_excludes_features_whose_module_is_inactive` — seed an active feature under a
  throwaway INACTIVE module; assert absent; `finally` cleanup.
- `Available_excludes_inactive_features` — seed an inactive feature under an active module;
  assert absent; `finally` cleanup.
- `Available_is_ordered_by_Order_ascending` — assert the returned sequence is sorted ascending.
- `Available_items_have_dto_shape_and_module` — every item has non-empty `Name` and resolved `ModuleId`.
- `Available_with_POST_verb_returns_405` — `POST .../available` → `405`.
- ~~`Available_as_owner_admin_with_inactive_management_module_returns_403`~~ **REMOVED** — see §6 Finding #3

### `FeaturesAvailableAuthTests` (4 tests)
- `Available_no_token_returns_401`
- `Available_as_store_user_returns_403`
- `Available_as_reseller_returns_403`
- `Available_as_owner_admin_without_stores_feature_returns_403` — an OwnerAdmin lacking the Stores
  feature / Management module fails the class filter → 403.
- ~~`Available_as_owner_admin_with_inactive_management_module_returns_403`~~ **REMOVED** — see §6
  Finding #3. No non-SuperAdmin can reach this endpoint, so testing the Management module leg is
  impossible via HTTP. Deferred to handler unit tests.

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
- **Note:** the `available` method-level filter (`StoresAdmin`) is *stricter* than its handler gate
  (`OwnerAdmin` claim). Today this is masked; if the filter is ever loosened, the handler would not
  enforce the Stores feature/Management module — a latent inconsistency worth a separate production-code
  review.
- **Finding #3 — Class-level filter blocks method-level widening.** `FeaturesController` has
  `[HasPermission(SuperAdmin)]` at the class level. Method-level `[HasPermission(SuperAdmin, StoresAdmin)]`
  on `/available` can never widen access because ASP.NET Core runs the class-level filter first. If it
  rejects the request, the method-level filter never executes. This means StoresAdmin users can NEVER
  reach any `/api/v1/Features/*` endpoint via HTTP. **3 test scenarios were removed as a result:**
  R4.2 (StoresAdmin available 200), R7.5 (inactive Management → 403), and R10.7 (inactive Management →
  403 via gap coverage). The latter two are redundant with R7.4 (OwnerAdmin without Stores → 403) which
  also tests the class-level filter rejection path. **Action**: Flag this design issue to the team — the
  method-level `[HasPermission(SuperAdmin, StoresAdmin)]` on `/available` is dead code as long as the
  class-level filter remains `[HasPermission(SuperAdmin)]`.

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

> **Note (09c merge):** the previous out-of-scope item — repository-level content correctness of
> `GetAvailableFeaturesToStore()` (Administration exclusion, inactive-module / inactive-feature exclusion,
> `Order` sort) — is now **in scope** and covered by the `(from 09c)` scenarios above.
