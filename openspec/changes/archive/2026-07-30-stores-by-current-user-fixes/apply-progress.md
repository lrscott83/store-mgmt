# Apply Progress: stores-by-current-user-fixes

## Status
8/8 tasks complete. Build succeeded.

## Completed Tasks

### Phase 1: Repository Interface & Implementation
- [x] 1.1 IStoreRepository.cs — Added `Guid? excludeStoreId = null` to 3 methods
- [x] 1.2 StoreRepository.cs — Updated GetActiveStoresByUserIdAsync with ThenInclude + optional Where
- [x] 1.3 StoreRepository.cs — Updated GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync with ThenInclude + optional Where
- [x] 1.4 StoreRepository.cs — Updated GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync with ThenInclude + optional Where

### Phase 2: Handler & Controller
- [x] 2.1 GetStoresByCurrentUserQuery.cs — Rewrote Handle with ToGuid(), correct repo queries, removed client-side filter
- [x] 2.2 StoresController.cs — Added XML summary + ProducesResponseType(401/403)

### Phase 3: E2E Tests
- [x] 3.1 StoresByCurrentUserTests.cs — OwnerAdmin_sees_only_their_owned_stores
- [x] 3.2 StoresByCurrentUserTests.cs — OwnerAdmin_sees_OwnerName_populated

## Files Changed
| File | Action | Description |
|------|--------|-------------|
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Modified | Added `Guid? excludeStoreId = null` to 3 method signatures |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modified | Added ThenInclude(o => o.User) + optional Where filter to 3 methods |
| `Application/.../GetStoresByCurrentUserQuery.cs` | Modified | Rewrote handler: userId.ToGuid(), correct repo queries, removed client-side filter |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | Added XML summary, ProducesResponseType(401), ProducesResponseType(403) |
| `SMCA.WebApi.E2ETests/Stores/StoresByCurrentUserTests.cs` | Modified | Added 2 OwnerAdmin E2E tests |
| `Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs` | Modified | Fixed Moq setup for new optional parameter |

## Build
`dotnet build` — 0 errors, only pre-existing warnings.
