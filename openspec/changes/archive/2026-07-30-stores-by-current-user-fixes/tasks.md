# Tasks: stores-by-current-user-fixes

## Phase 1: Repository Interface & Implementation

- [x] 1.1 **IStoreRepository.cs** (L10, L16, L17) — Add `Guid? excludeStoreId = null` to `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync`, `GetActiveStoresByUserIdAsync`, `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync`. Default null = backward compat.
- [x] 1.2 **StoreRepository.cs** (L13-19) — `GetActiveStoresByUserIdAsync`: add `Guid? excludeStoreId = null` param, add `.ThenInclude(o => o.User)` after `.Include(s => s.Owner)`, add `.Where(s => s.Id != excludeStoreId!.Value)` when provided.
- [x] 1.3 **StoreRepository.cs** (L21-28) — Same 3 changes for `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync`.
- [x] 1.4 **StoreRepository.cs** (L30-36) — `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync`: add param, `.ThenInclude(o => o.User)`, `.Where(s => s.Id != excludeStoreId!.Value)`.

**Verify**: `dotnet build src/StoreMgmt.sln`

## Phase 2: Handler & Controller

- [x] 2.1 **GetStoresByCurrentUserQuery.cs** (L25-31) — Replace body: add `var userId = _httpContextService.UserExternalId.ToGuid()`, swap non-superadmin query to `GetActiveStoresByUserIdAsync(userId, DataUtils.DefaultStore.Id)`, pass `DataUtils.DefaultStore.Id` to superadmin query, remove client-side `.Where(s => s.Id != DefaultStore.Id)`.
- [x] 2.2 **StoresController.cs** (L28-33) — Add `/// <summary>Get stores accessible by current user</summary>` before `[HttpGet]`. Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` and `[ProducesResponseType(StatusCodes.Status403Forbidden)]`.

**Verify**: `dotnet build src/StoreMgmt.sln`

## Phase 3: E2E Tests

- [x] 3.1 **StoresByCurrentUserTests.cs** — Add `OwnerAdmin_sees_only_their_owned_stores`: seed OwnerAdmin via `AuthzSeed.SeedOwnerAdminAsync(f, true)`, create 2nd store under same Owner (direct DB), 3rd store under different OwnerAdmin, assert response has only 2 owned stores + all inactive excluded.
- [x] 3.2 **StoresByCurrentUserTests.cs** — Add `OwnerAdmin_sees_OwnerName_populated`: same seed as 3.1, assert `OwnerName != null` and non-empty for each returned store.

**Verify**: `dotnet test src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~StoresByCurrentUser" --no-build`

## Rollback

Revert all 5 files in a single commit. Endpoint returns to previous broken state (NRE for non-superadmin).
