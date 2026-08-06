# Exploration: e2e-stage-1-s2-03 — Document the OwnerAdmin can create stores (H-10)

## Current State

`POST /v1/stores` has **no action-level `[HasPermission]`** — only the class-level
`[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]`
(`StoresController.cs:27`) applies, so an OwnerAdmin whose SelectedStoreId grants the
`Stores` feature passes. The handler then explicitly admits OwnerAdmins and re-points
their `SelectedStoreId` to the newly created store. A non-admin caller who still passes
the class-level gate gets **400 BadRequest** from the handler, not 403.

The S2-03 user story asserts the frontend never emits `POST /v1/stores` (an emergent
`paramId ?? selectedStoreId` + `Boolean()` accident, `edit-store.tsx:33-34`). The defect
(H-10) is that the backend does not enforce this — the only barrier is the UI accident.
The requested new .NET E2E tests are **passing tests that document current behavior**,
not red/failing tests.

## Verified evidence (file:line)

### Authorization attribute chain
- `SMCA.WebApi/Controllers/v1/StoresController.cs:27` — class-level `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]`.
- `SMCA.WebApi/Controllers/v1/StoresController.cs:83-91` — `POST` action (`CreateStoreAsync`): only `[HttpPost()]` + `[ProducesResponseType(201)]`; **no** action-level `[HasPermission]`. Contrast: `DELETE /{id}` (`:129`) and `PUT /{storeId}/payment-date` (`:113`) both carry `[HasPermission(StoreRoleFeatures.SuperAdmin)]`. Response: `CreatedAtAction("GetStoreById", new { id = result.Data!.Id }, result)` → `Location: /api/v1/stores/{id}` (`:88-90`).
- `SMCA.WebApi/Filters/HasPermissionAttribute.cs:49-114` — `OnAuthorizationAsync`:
  - `:57-77` — if the action has its own `[HasPermission]`, the class-level filter skips. `POST` has none → class-level filter runs.
  - `:84` — SuperAdmin bypasses entirely.
  - `:89-97` — OwnerAdmin/ReSeller path: `featureIds = GetAllowedFeatureIdsForCurrentUserAsync(storeModuleIds)`; pass iff `_storeRoleFeatures.Any(srf => srf.GetFeatureType().HasValue && featureIds.Contains((int)srf.GetFeatureType().Value))`; else `ForbidResult` (403).
  - `:98-106` — other roles (StoreUser): `HasUserAnyFeatureInStoreAsync(userId, StoreId, storeRoleFeatures, storeModuleIds)` from the `StoreRoleFeature` table.
- Class-level candidates: `SuperAdmin` (no `[HasFeature]` → `GetFeatureType()` null → excluded by `HasValue`) and `StoresAdmin` → `FeatureType.Stores`. So **both OwnerAdmin and StoreUser need feature 73 (Stores)** to pass the class-level gate.
- `Domain/Common/Enums/StoreRoleFeatures.cs:192-195` — `StoresAdmin = [HasRoles(OwnerAdmin)][HasFeature(FeatureType.Stores)][HasModule(ModuleType.Management)]`.
- `Domain/Common/Enums/FeatureType.cs:88` — `Stores = 73` (same id space as frontend `EFeatures.Stores`; `AuthzSeed.StoresFeatureId = 73`).
- `Application/Services/Features/AllowedFeaturesService.cs:41-49` — OwnerAdmin allowed features are **module-driven** (enum walk where `storeModuleIds` contains the feature's `ModuleType`), then `FilterAvailableToStoreByIds`.
- `Domain/Common/Utils/StoreBillingUtils.cs:53-62` — `FilterForBilling`: billing status `NoAplica` (seeded stores have `PaymentStartDate: null`) → **all modules accessible**. Seed stores with module 7 (Management) therefore include feature 73 → class-level gate passes for the seeded OwnerAdmin.
- `SMCA.WebApi/Services/ClaimsTransformerService.cs:41` — `StoreIdClaim` = `currentUser.SelectedStoreId` read **fresh from the DB per request** (IClaimsTransformation). The filter's `_httpContextService.StoreId` therefore reflects the re-pointed store on subsequent requests; the create request itself uses the ORIGINAL store (module 7 → gate passes).

### Handler (the defect)
- `Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs:50-51` — `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.BadRequest)` → **400, not 403**.
- `CreateStoreCommand.cs:57-61` — `if (_httpContextService.IsOwnerAdmin) { owner.User.SelectedStoreId = store.Id; await _userRepository.UpdateAsync(owner.User); }` — the deliberate OwnerAdmin re-point branch.

### Existing coverage (what already exists)
- `Stores/StoreCreateTests.cs:101-106` — anonymous → 401 (already covers S2-03's 4th bullet).
- `Stores/StoreCreateTests.cs:22-99` — all POSTs as SuperAdmin (body helper `Body(ownerId, name, moduleIds)` at `:18-19`; persistence assertion `:39-42`; cleanup `StoreSeed.CleanupStoreAsync` + `CleanupOwnerAsync` + `DbTestHelpers.CleanupUserAsync` at `:46-48`).
- `Stores/StoreAuthorizationTests.cs:15-75` — OwnerAdmin (via `StoreSeed.SeedStoresAdminUserAsync`) exercised only against `GET /by-current-user`, `POST /approve`, `POST /disapprove`, `PUT /{id}`. **No OwnerAdmin POST on `/v1/stores` anywhere** (confirmed by grep of the whole E2E project).
- No test in the suite asserts a Store row count (`CountAsync`/`Count()` on `Store` — only `FeatureSeed.EgressCountAsync` exists). The doc's UI-flow "store count unchanged" bullet (`S2-03.md:54`) is a Playwright-layer observation and is NOT part of this change's backend bullets.

### Seeds (verified working shapes)
- `StoreSeed.SeedStoresAdminUserAsync` (`Infrastructure/StoreSeed.cs:53-72`) — OwnerAdmin UserRole + Owner + Store (module 7) + `SelectedStoreId = store.Id`. **No `StoreRoleFeature` rows needed for OwnerAdmin** (module-driven path). Proven by `StoreAuthorizationTests.cs:16-28` (200 on `GET /by-current-user`). Cleanup: `StoreSeed.CleanupStoresAdminAsync` (`:143-154`).
- `AuthzSeed.SeedStoreUserAsync(factory, grantedFeatureId)` (`Infrastructure/AuthzSeed.cs:74-104`) — StoreUser + Owner + Store (module 7) + optional `StoreRoleFeature(store, RoleType.StoreUser, featureId)` + `SelectedStoreId`. With `grantedFeatureId = 73`, the class-level gate passes via `HasUserAnyFeatureInStoreAsync` (`StoreRoleFeatureRepository.cs:66-76`) → reaches handler → **400**. Same seed used by `AuthMePermissionsTests.cs:64-75` (passing). Cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId)` (`AuthzSeed.cs:106-123`).
- OwnerAdmin **without** the Management module has no feature 73 (`AuthMePermissionsTests.cs:50-61`) → would get 403 at the filter. Relevant only if the "StoreUser without feature" negative is ever wanted — it is NOT one of this change's bullets (that one documents the 400).

## Approaches

1. **New test file `Stores/StoreCreateAuthorizationGapTests.cs` (recommended)** — new class `[Collection("e2e")]`, same ctor pattern, two tests: (a) OwnerAdmin direct create → 201 + persisted + SelectedStoreId re-point; (b) StoreUser-with-feature-73 → 400. No existing file touched.
   - Pros: clean defect documentation; zero risk to the untouchable-E2E rule (only new file); mirrors existing patterns (`StoreCreateTests` body/assertions, `StoreAuthorizationTests` seed/cleanup).
   - Cons: new file (trivial).
   - Effort: Low.

2. **Append tests to `StoreCreateTests.cs`** — add OwnerAdmin/StoreUser tests to the existing SuperAdmin-only file.
   - Pros: no new file; reuses `Body`/`AssertCreate400` helpers.
   - Cons: mixes personas in a SuperAdmin-focused file; needs helper access; slight ambiguity under the "touch existing E2E tests" rule (adding tests is allowed, but a separate file is cleaner).
   - Effort: Low.

3. **Merge both OwnerAdmin bullets into a single test** (create + persist + re-point in one test) vs splitting into two tests.
   - Pros: single seed chain, minimal runtime.
   - Cons: one failing assertion obscures the other; the doc lists them as separate evidence points.
   - Effort: Low.

## Recommendation

**Approach 1, with the two OwnerAdmin bullets merged into one test** (i.e., 2 new tests total):

- File: `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` (new).
- Test 1 `OwnerAdmin_with_stores_feature_can_create_store_directly_and_repoints_selected_store_id`:
  - Seed: `var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);`
  - Request: `DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PostAsJsonAsync("/api/v1/stores", new { OwnerId = sa.OwnerId, Name = $"S-{Guid.NewGuid():N}", Address = (string?)null, Description = (string?)null, Approved = false, ModuleIds = new[] { StoreSeed.ManagementModuleId } })`.
  - Assert: `201 Created`; `ApiResponse<StoreData>` `Succeeded`; `Location` = `/api/v1/stores/{id}`; DB: `Store` row exists (`IgnoreQueryFilters`) and `StoreModule` row exists (mirror `StoreCreateTests.cs:39-42`).
  - Assert re-point: DB read `db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == sa.UserId)` → `SelectedStoreId == created` (and `!= sa.StoreId`). Pattern precedent: `DbTestHelpers.GetUserByLoginAsync` (`:81`) / `ExportOfflineRosterTests.cs:620-683`; API alternative `GET /api/v1/auth/me` → `MeData.SelectedStoreId` (`TestDtos.cs:41`, `StoreScopingTests.cs:27-29`).
  - Cleanup (order matters): `if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);` **then** `await StoreSeed.CleanupStoresAdminAsync(_f, sa);` — the new store shares the fixture's owner, so delete the new store's graph (StoreRoleFeature/StoreModule/Store) before the fixture cleanup removes owner+user.
- Test 2 `Store_user_with_stores_feature_gets_400_not_403`:
  - Seed: `var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);` (73).
  - Request: same `AuthedClient` POST with `OwnerId = f.OwnerId`, module 7.
  - Assert: `400 BadRequest` (documents the 400-not-403 divergence, `CreateStoreCommand.cs:51`). Optionally assert the `NotAuthorized` error key.
  - Cleanup: `await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);` (mirror `AuthMePermissionsTests.cs:74`).

Both tests are **passing tests documenting current behavior** — no red tests, no test-file modification, no seed helper changes needed (both seeds already exist and are proven by passing tests).

## Risks

- **Cleanup order**: the re-pointed `SelectedStoreId` points to the newly created store; the new store references the fixture's owner. Always delete the new store first, then the fixture graph. `CleanupStoreAsync` handles the new store's generated `StoreRoleFeature` rows.
- **Query filters / NoTracking**: reads of `User`/`Store` must use `IgnoreQueryFilters()` (global tenant filter on `User` per `UserEntityTypeConfiguration.cs:22-24`). The seeds use `Add(...)` (tracked as Added) — the NoTracking trap (CLAUDE.md) applies to query-then-mutate, not here.
- **Defect-assertion coupling**: these tests assert CURRENT behavior. If H-10 is later fixed (action-level `[HasPermission(SuperAdmin)]` → 403, or removal of the re-point branch), these tests MUST be updated in the same change — flag to the user at proposal time.
- **E2E untouchable rule**: only a new file is created; zero existing tests touched. Verified via grep that no existing test exercises OwnerAdmin on `POST /v1/stores`.
- **Claim freshness**: the filter's `StoreId` is re-derived from the DB per request (claims transformer), so no token staleness issue after the re-point — but the test asserts the re-point via DB read anyway, which is deterministic.

## Ready for Proposal

Yes. The orchestrator should tell the user: the plan adds 2 new .NET E2E tests (new file `Stores/StoreCreateAuthorizationGapTests.cs`) that PASS and document the H-10 defect (OwnerAdmin direct create → 201 + persistence + SelectedStoreId re-point; StoreUser-with-feature → 400 instead of 403). No existing E2E test is touched. The Playwright-layer assertions of S2-03 remain PENDIENTE and are out of scope for this change.
