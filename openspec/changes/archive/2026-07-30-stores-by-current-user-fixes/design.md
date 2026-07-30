# Design: stores-by-current-user-fixes

## Technical Approach

Six fixes across 5 files (handler, repo interface, repo impl, controller, E2E tests). Core strategy: swap non-superadmin query from `GetStoresAsync(true)` to `GetActiveStoresByUserIdAsync()`, eagerly load `Owner.User`, and push DefaultStore exclusion to DB layer.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| DefaultStore exclusion API | (A) `Guid? excludeStoreId = null` on repo methods, handler passes `DataUtils.DefaultStore.Id` | (B) `bool excludeDefaultStore` hardcodes domain constant in repo, breaks isolation. (C) inline in handler | **A** — repo stays domain-agnostic, handler orchestrates business rules. Default `null` preserves backward compat for other callers. |
| `.ThenInclude(o => o.User)` scope | 3 methods: `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync`, `GetActiveStoresByUserIdAsync`, `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync` | Only the 2 needed now vs all 3 for consistency | **All 3** — precedent in `GetPaidStoresAsync()`. Single JOIN on indexed FK. Prevents future NRE. |
| Handler passes `excludeStoreId` | At handler level, not controller | Controller doesn't know repo layer | **Handler** — imports `Domain.Common.Constants` already, is the domain orchestrator. |
| `UserExternalId` → Guid | `_httpContextService.UserExternalId.ToGuid()` | Already 14+ usages in codebase (e.g. `GetMeQuery`, `SetMyStore`) | **Existing pattern** — no new conversion logic needed. |
| E2E: additional store under same owner | Direct `DbContext` in test | (B) New helper `SeedOwnerAdminWithMultipleStoresAsync` proliferates test fixtures | **Direct DB** — established pattern (`StoreSeed.SeedStoreAsync` internally does the same). |

## Data Flow

```
Request: GET /api/v1/stores/by-current-user
  │
  ▼ StoresController (new: XML summary, [ProducesResponseType(401,403)])
  │
  ▼ GetStoresByCurrentUserQueryHandler.Handle()
  │  userId = _httpContextService.UserExternalId.ToGuid()
  │
  ├─ IsSuperAdmin?
  │    └─ yes → GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(DataUtils.DefaultStore.Id)
  │               .Include(s => s.Owner).ThenInclude(o => o.User)     ← NEW
  │               .Where(s => s.Id != DefaultStore.Id)                ← NEW: in DB
  │               .IgnoreQueryFilters()
  │               .ToListAsync()
  │
  └─ no → GetActiveStoresByUserIdAsync(userId, DataUtils.DefaultStore.Id)
            .Include(s => s.Owner).ThenInclude(o => o.User)           ← NEW
            .Where(s => s.Owner.UserId == userId && s.IsActive)
            .Where(s => s.Id != DefaultStore.Id)                      ← NEW: in DB
            .ToListAsync()
  │
  ▼ Store → StoreDto: .Owner.User.FullName → OwnerName   ← Now loads without NRE
  │
  ▼ ResponseResult<IEnumerable<StoreDto>>
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Modify | Add `Guid? excludeStoreId = null` to 3 methods |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modify | Add `.ThenInclude(o => o.User)` + `.Where(s => s.Id != excludeStoreId)` to 3 methods |
| `Application/.../GetStoresByCurrentUserQuery.cs` | Modify | Swap non-superadmin query, remove client-side filter, pass `DataUtils.DefaultStore.Id` |
| `WebApi/.../Controllers/v1/StoresController.cs` | Modify | XML `<summary>` + `[ProducesResponseType(401)]` + `[ProducesResponseType(403)]` |
| `WebApi.E2ETests/.../StoresByCurrentUserTests.cs` | Modify | Add 2 OwnerAdmin test methods |

## Interfaces / Contracts

```csharp
// IStoreRepository — changed signatures (default null = backward compat)
Task<IEnumerable<Store>> GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(Guid? excludeStoreId = null);
Task<IEnumerable<Store>> GetActiveStoresByUserIdAsync(Guid userId, Guid? excludeStoreId = null);
Task<IEnumerable<Store>> GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid userId, Guid? excludeStoreId = null);
```

```csharp
// Handler — new logic
var userId = _httpContextService.UserExternalId.ToGuid();
var stores = _httpContextService.IsSuperAdmin
    ? await _storeRepository.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(DataUtils.DefaultStore.Id)
    : await _storeRepository.GetActiveStoresByUserIdAsync(userId, DataUtils.DefaultStore.Id);
var storeDtos = _mapper.Map<IEnumerable<StoreDto>>(stores);
return ResponseResult.Success(storeDtos);
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| E2E | OwnerAdmin sees only owned stores (R1b, R1c) | Seed OwnerAdmin via `AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)`. Create second store under same Owner (direct DB). Create third store under different Owner. Assert response contains only the 2 owned stores. |
| E2E | OwnerAdmin sees OwnerName (R2b) | Same test — assert `OwnerName != null` and non-empty for each returned store. |
| E2E | Regression: SuperAdmin paths | 3 existing tests pass unchanged. |
| E2E | Regression: unauthenticated 401 | Existing test passes unchanged. |

## Migration / Rollout

No migration. Endpoint was returning NRE for non-superadmins — any existing OwnerAdmin traffic was broken. Fix is a single deploy.

## Open Questions

None.
