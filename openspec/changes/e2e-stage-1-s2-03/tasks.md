# Tasks: Document OwnerAdmin Direct POST /v1/stores (H-10 gap) as E2E

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150–190 (1 new file) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit on `feat/e2e-s2-03`; NO PRs (orchestrator override) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | New file `StoreCreateAuthorizationGapTests.cs` with 2 passing tests | N/A (no PR — commits only) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreCreateAuthorizationGapTests"` | Real PostgreSQL `smca_test` via `WebAppFixture`; regression: same csproj with `--filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Stores"` | Delete the single new file — no other file touched |

## Phase 1: Scaffold — New Test File

- [ ] 1.1 Create `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs`: `[Collection("e2e")]` class, ctor taking `WebAppFixture`, private static `Body(ownerId, name, moduleIds)` helper mirroring `StoreCreateTests.cs:18-19` (OwnerId, Name, Address, Description, Approved, ModuleIds).
- [ ] 1.2 Add DB-read helpers using `Set<T>().IgnoreQueryFilters()` (global tenant filter on `User`) for deterministic persistence asserts (mirror `DbTestHelpers.GetUserByLoginAsync`).

## Phase 2: Test 1 — OwnerAdmin 201 + persistence + re-point (R2.10)

- [ ] 2.1 Test `OwnerAdmin_with_stores_feature_can_create_store_directly_and_repoints_selected_store_id`: seed `StoreSeed.SeedStoresAdminUserAsync(_f)`; POST `Body(sa.OwnerId, $"S-{Guid.NewGuid():N}", [StoreSeed.ManagementModuleId])` via `DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)`.
- [ ] 2.2 Assert 201 Created; `ApiResponse<StoreData>` via `ApiResponse.Json` with `Succeeded`; `Location == /api/v1/stores/{id}`.
- [ ] 2.3 Assert persistence: `Store` and `StoreModule` rows exist (`IgnoreQueryFilters`, mirror `StoreCreateTests.cs:39-42`); assert `User.SelectedStoreId == created && != sa.StoreId` (re-point, D-3).
- [ ] 2.4 Ordered cleanup in `finally`: `StoreSeed.CleanupStoreAsync(_f, created)` FIRST, then `StoreSeed.CleanupStoresAdminAsync(_f, sa)` (new store shares fixture owner — D-4).

## Phase 3: Test 2 — StoreUser 400-not-403 + no Store row (R2.11)

- [ ] 3.1 Test `Store_user_with_stores_feature_gets_400_not_403`: seed `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId /* 73 */)`; POST `Body(f.OwnerId, $"S-{Guid.NewGuid():N}", [StoreSeed.ManagementModuleId])`.
- [ ] 3.2 Assert 400 BadRequest (documents handler 400-not-403, `CreateStoreCommand.cs:50-51`); optionally assert `NotAuthorized` error key in `Errors` (D-5, non-blocking).
- [ ] 3.3 Assert no Store row: `!AnyAsync(s => s.Name == name)` via `IgnoreQueryFilters`; cleanup `AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId)`.

## Phase 4: Verification

- [ ] 4.1 Run focused filter (table above) → 2 passed, 0 failed.
- [ ] 4.2 Run Stores-area regression filter (table above) → no existing tests broken.
- [ ] 4.3 `git diff --stat` shows exactly 1 new file, zero edits to existing tests / production code (add-only rule); commit as conventional commit, e.g. `test(e2e): pin H-10 store-create authz gap behavior`.

Acceptance: both tests PASS — they pin current defective behavior (not RED). Threat matrix is N/A (design) → no RED tasks. Coupling: when H-10 is fixed, R2.10/R2.11 and these tests MUST flip in the same change (spec coupling notes).
