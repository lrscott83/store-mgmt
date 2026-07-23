# 05 — SMCA.WebApi Authorization (cross-cutting) E2E — Test Plan

**Date:** 2026-07-23
**Type:** Cross-cutting (the deliberate exception to one-plan-per-controller — see `backend-endpoints-by-role.md` §9.4).
**Depends on / reuses:** the `04` stores harness (`AppTestFactory`, `WebAppFixture`, `[Collection("e2e")]`, `ApiResponse<T>`, `DbTestHelpers`, `StoreSeed`) against real Postgres `smca_test`.

---

## 1. Why cross-cutting

Permissions are **one engine, two windows**. The computation lives in shared code exercised across
controllers, not in any single endpoint:

- `ClaimsTransformerService` (`IClaimsTransformation`) — recomputes `super_admin` / `admin` / `reseller`
  / `tenant_id` / `store_id` / `features` claims **from the DB on every authenticated request**
  (registered `AddScoped`, `Program.cs:51`). It does not trust the token; it rebuilds the principal.
- `HasPermissionAttribute` → `HasUserPermissionRequirementFilter` (`IAuthorizationFilter`) — enforces
  the same computation on protected endpoints.
- `AllowedFeaturesService.GetAllowedFeatureIdsForCurrentUserAsync` + the role/feature repositories —
  the shared core both windows read.

So the plan tests the engine through its two windows: `GET /auth/me` (the **report** window the frontend
trusts) and `Stores` (the **enforcement** window, the real security boundary), plus a `Usages` smoke and
the login→`/me` bootstrap / store-scoping chain (§9.5).

## 2. Verified contract facts (from code — bake these into assertions)

- **Enforcement denial = HTTP 403** (`ForbidResult`, empty body) in every branch of the filter
  (`HasPermissionAttribute.cs:57,66,74`). This is NOT the 200-wrapped body used by login/`/me` business
  failures — the enforcement window returns a real 403.
- **SuperAdmin bypasses the whole filter** before any store/feature check (`HasPermissionAttribute.cs:47`).
- **approve / disapprove / delete on Stores are effectively SuperAdmin-only.** Their method-level
  `[HasPermission(StoreRoleFeatures.SuperAdmin)]` carries no feature type (`GetFeatureType()==null`), so
  any non-SuperAdmin is always Forbidden there regardless of the class-level `StoresAdmin` grant
  (`StoresController.cs:78,86,94`).
- **`/me` failures are 200-wrapped** (controller returns `Ok(...)`): unknown user / inactive user →
  HTTP 200, `succeeded=false`, `actionCode=404`, code `User.NotFound` / `User.Inactive`
  (`GetMeQuery.cs`). Inactive also triggers `SignOutAsync`.
- **`admin` (OwnerAdmin) claim requires a tenant match**: `IsStoreAdmin` needs
  `ur.TenantId == ur.User.TenantId` (`UserRoleRepository.cs:71-80`). `IsSuperAdmin` and `IsReSeller` do
  NOT have this condition — so a `UserRole` whose `TenantId` differs from its `User.TenantId` yields no
  OwnerAdmin recognition.
- **ReSeller allowed-features apply NO store/module filter** (raw enum-derived ids) while OwnerAdmin
  filters by the store's available modules (`AllowedFeaturesService.cs:29-46`).
- **The policy-based layer is dormant.** `AuthorizationPolicyProvider` + `FeatureTypeHandler` are
  registered (`Program.cs:49-50`) but fire only on `[Authorize(Policy="...")]`, and **no controller uses
  it** (0 occurrences). Enforcement in scope is `[HasPermission]` + plain `[Authorize]` only — no second
  layer to cover.
- **Constants (all confirmed):** Stores feature `73` (`FeatureType.cs:88`), Management module `7`
  (`ModuleType.cs:27`), `RoleType` SuperAdmin=1 / OwnerAdmin=2 / StoreUser=3 / ReSeller=4
  (`RoleType.cs`), DefaultTenant `B58BF718-C4ED-4EE9-A958-BB5A5DB4F7E8` (`DataUtils.cs:32`).

## 3. Coverage matrix (§9.4)

| # | Role / scope | `/me` (report window) | `HasPermission` over Stores (enforcement) |
|---|---|---|---|
| 1 | SuperAdmin | `IsSuperAdmin=true` | passes all, incl. approve/disapprove |
| 2 | OwnerAdmin, selected store **has** active Management(7) | `IsOwnerAdmin=true`, `FeatureIds` includes Stores(73) | GET/POST/PUT pass; approve → **403** |
| 3 | OwnerAdmin, selected store **without** Management | `FeatureIds` excludes Stores | stores → **403** |
| 4 | StoreUser with `StoreRoleFeature` for the feature in the selected store | `Roles[]` reflects it | that endpoint passes; others → **403** |
| 5 | StoreUser without the feature / wrong `SelectedStoreId` | empty scope | **403** |
| 6 | ReSeller | `IsReSeller=true`, `FeatureIds` only Owners | stores → **403** always |
| 7 | Inactive user (`User.IsActive=false`) | SignOut + `User.Inactive` (200-body 404) | — |
| 8 | `UserRole` tenant mismatch (`ur.TenantId != ur.User.TenantId`) | OwnerAdmin not recognized | **403** |
| 9 | No token | — | **401** |

## 4. Test classes (proposed)

**`AuthMePermissionsTests`** — report window (rows 1–8 of the `/me` column):
- `Me_super_admin_reports_IsSuperAdmin`
- `Me_owner_admin_with_management_store_reports_IsOwnerAdmin_and_stores_feature`
- `Me_owner_admin_without_management_store_excludes_stores_feature`
- `Me_store_user_with_feature_reports_role_in_selected_store`
- `Me_store_user_without_feature_reports_empty_scope`
- `Me_reseller_reports_IsReSeller_owners_only`
- `Me_inactive_user_returns_200_with_Inactive_body` (already exists at endpoint level in `03b`; here it is the permissions-engine assertion — keep or cross-reference)
- `Me_user_role_tenant_mismatch_not_recognized_as_owner_admin`

**`StoresAuthorizationTests`** — enforcement window (rows 1–9 of the Stores column):
- `Stores_super_admin_passes_all_including_approve`
- `Stores_owner_admin_with_feature_passes_read_write_but_approve_403`
- `Stores_owner_admin_without_management_403`
- `Stores_store_user_with_feature_passes_that_endpoint`
- `Stores_store_user_without_feature_403`
- `Stores_store_user_wrong_selected_store_403`
- `Stores_reseller_403`
- `Stores_tenant_mismatch_403`
- `Stores_no_token_401`

**`StoreScopingTests`** — §9.5 store-scoping + bootstrap:
- `Login_then_me_bootstraps_session_for_active_store`
- `SetMyStore_changes_selected_store_and_me_recomputes_features` (`PUT /stores` → `/me` payload changes)

**`UsagesSmokeTests`** — §9.5 high-frequency bootstrap call:
- `Post_store_daily_usage_returns_200_for_authorized_user` (class-level `ProfileAdmin`, or SuperAdmin)

## 5. Seed helpers needed (extend `StoreSeed` / `DbTestHelpers` — do NOT redefine `04`'s)

Reused from `04` as-is: `DbTestHelpers.{SeedSuperAdminAsync, SeedUserWithRoleAsync(roleId), CleanupUserAsync, AuthedClient}`;
`StoreSeed.{SeedOwnerAsync, SeedStoreAsync(name,approved,moduleIds), SeedStoresAdminUserAsync, SeedStoreInNewTenantAsync, DeactivateStoreAsync, ManagementModuleId, UnavailableModuleId, Cleanup*}`.

New helpers the matrix requires (contract only — bodies follow `04`'s `StoreSeed` pattern, entity factory
signatures to be confirmed at implementation time):
- `SeedOwnerAdminWithStoreAsync(factory, bool withManagementModule)` → OwnerAdmin (`RoleType.OwnerAdmin`)
  whose `SelectedStoreId` is a store with/without the Management(7) module + Stores(73) feature.
- `SeedStoreUserWithFeatureAsync(factory, int featureId)` → StoreUser (`RoleType.StoreUser`) with a
  `StoreRoleFeature` granting `featureId` in its selected store.
- `SeedStoreUserWithoutFeatureAsync(factory)` → StoreUser with a selected store but no matching feature.
- `SeedTenantMismatchOwnerAdminAsync(factory)` → OwnerAdmin whose `UserRole.TenantId != User.TenantId`.
- ReSeller: reuse `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.ReSeller)`.

## 6. Out of scope / optional

- **Optional edge cases surfaced from code** (add only if cheap): SuperAdmin whose tenant ≠ DefaultTenant
  loses the query-filter bypass on `GET stores/{id}` (`GetStoreByIdService.cs:19-24`); ReSeller allowed-
  features not filtered by store modules (could pass a check for a feature not enabled on the store).
- Endpoint-level validation/happy-paths for Stores are already covered by `04`; this plan covers only the
  authorization concern.
- Sales/Inventory/Expenses/Credits/Reports/Statistics: localStorage-only, zero backend — not tested (§9.5).

## 7. Open items — RESOLVED

- Second authorization layer (`PolicyCode`) → **dormant, no coverage needed** (§2, verified 0 usages).
- Enforcement status code → **403 `ForbidResult`** confirmed (§2).
- `/me` inactive/unknown → **200-wrapped 404** confirmed (§2).
- 401 origin (upstream JWT auth, not the filter) → the `no token → 401` case asserts pipeline behavior,
  not the `HasPermission` filter.
