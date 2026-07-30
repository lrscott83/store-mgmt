# Design: Fix GET /api/v1/stores/{id} — 7 bugs from code review

## Technical Approach

Seven independent surgical fixes to the GetStoreById endpoint, each touching 1–2 files. No structural changes, no refactors, no new abstractions. Each fix maps 1:1 to a root cause identified during the `api-endpoint-review`.

The dependency graph is flat — all changes are independent except #7 (needs `NotFound` error added in StoreErrors.cs first) and #4 (needs `ExistsAsync` signature added to `IStoreRepository` before implementation in `StoreRepository`).

## Architecture Decisions

### Decision: Where to add `.Include(s => s.Owner).ThenInclude(o => o.User)`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Before `.Include(s => s.StoreModules...)` | Keeps logical order: Owner first, then modules. No EF Core ordering impact. ✅ | **Chosen** |
| After `.Include(s => s.StoreModules...)` | Different convention from other methods like `GetStoresAsync` which put Owner first. ❌ | Rejected |

**Rationale**: All other methods in `StoreRepository` put `Owner.User` before `StoreModules`. Consistency with the existing pattern.

### Decision: Validator existence check with `ExistsAsync`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `_storeRepository.ExistsAsync(id)` | Lightweight `AnyAsync` query, no includes, no query filters. ✅ | **Chosen** |
| Keep `IGetStoreByIdService` call | Full Include query (expensive) just for existence check. Race condition gap (store deleted between validation and execution). ❌ | Rejected |
| `_storeRepository.GetStoreByIdIgnoreQueryFiltersAsync(id)` | Simple, no includes. But superadmin might see store that normal admin can't. ❌ | Rejected |

**Rationale**: The validator should check raw existence without business-rule filtering. The handler's null check (change #7) handles the race condition. Using the repository directly avoids the service layer entirely for validation.

### Decision: `ExistsAsync` — ignore query filters or not?

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `.IgnoreQueryFilters().AnyAsync()` | Superadmins can validate stores soft-deleted by tenant filters. Consistent with `GetStoreByIdIncludingModulesIgnoreQueryFiltersAsync` usage. ✅ | **Chosen** |
| `.AnyAsync()` without ignore | Normal behavior, but superadmin flow could get false negatives. ❌ | Rejected |

**Rationale**: The service already differentiates superadmin vs normal admin. The validator should err on the side of allowing the request through — the handler does the real work and returns 404 if the store doesn't exist after query filter application.

## Data Flow

```
Client ──GET /api/v1/stores/{id}──→ StoresController.GetStoreByIdAsync(Guid id)
                                           │
                                           ▼
                                     GetStoreByIdQuery (mediator request)
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                     Validator (ExistsAsync)     Handler (full query)
                         │                          │
                         ▼                          ▼
                   IStoreRepository           GetStoreByIdService
                   .ExistsAsync(id)               │
                         │                        ▼
                         ▼                  StoreRepository
                   AnyAsync()            .Include(Owner.User)
                                          .Include(Modules)
                         │                        │
                         └────────┬───────────────┘
                                  ▼
                          ResponseResult<StoreDto>
                          200 OK  |  404 NotFound
```

## File Changes

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modify | Add `.Include(s => s.Owner).ThenInclude(o => o.User)` to both `GetStoreByIdIncludingModules*` methods + add `ExistsAsync(Guid id)` impl |
| 2 | `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` | Modify | Add `Task<bool> ExistsAsync(Guid id)` signature |
| 3 | `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQuery.cs` | Modify | Rename handler class, remove `Task.FromResult`, add null check + 404 |
| 4 | `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQueryValidator.cs` | Modify | Replace `IGetStoreByIdService` with `IStoreRepository.ExistsAsync` |
| 5 | `backend/src/Application/Services/Stores/GetStoreByIdService.cs` | Modify | Fix namespace: `Domain.Entities.Stores` → `Application.Services.Stores` |
| 6 | `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modify | Add `[ProducesResponseType(401,403,400)]` + XML `<summary>` |
| 7 | `backend/src/Domain/Entities/Stores/StoreErrors.cs` | Modify | Add `NotFound` static error |

## Interfaces / Contracts

**IStoreRepository** — new signature:

```csharp
Task<bool> ExistsAsync(Guid id);
```

**StoreErrors** — new error:

```csharp
public static readonly Error NotFound = new("Store.NotFound", "The store was not found.");
```

## Change Details

### #1 — Missing `.Include(Owner.User)` in StoreRepository

**Files**: `StoreRepository.cs` only, lines 63–78

**Approach**: Insert `.Include(s => s.Owner).ThenInclude(o => o.User)` after the `.Where(s => s.Id == id)` and before the existing `.Include(s => s.StoreModules...)` in both methods:

```csharp
// Before → After
.Include(s => s.Owner)           // NEW
    .ThenInclude(o => o.User)    // NEW
.Include(s => s.StoreModules.Where(sm => sm.IsActive))
```

### #2 — Rename `GetAllStoresQueryHandler` → `GetStoreByIdQueryHandler`

**Files**: `GetStoreByIdQuery.cs` line 12

**Approach**: Rename the class. MediatR resolves by generic type parameter (`IQueryHandler<GetStoreByIdQuery, StoreDto>`), not by class name, so no DI registration or callers need updating.

### #3 — Remove redundant `await Task.FromResult`

**Files**: `GetStoreByIdQuery.cs` line 29

**Approach**:
```csharp
// Before
return await Task.FromResult(ResponseResult.Success(storeDto));
// After
return ResponseResult.Success(storeDto);
```

### #4 — Add `ExistsAsync` + use in validator

**Files**: `IStoreRepository.cs`, `StoreRepository.cs`, `GetStoreByIdQueryValidator.cs`

**Approach**:
1. Add `Task<bool> ExistsAsync(Guid id)` to IStoreRepository
2. Implement in StoreRepository with `.IgnoreQueryFilters().AnyAsync(s => s.Id == id)`
3. In validator: replace `IGetStoreByIdService` injection with `IStoreRepository`, replace `StoreExists` body with `_storeRepository.ExistsAsync(storeId)`

### #5 — `[ProducesResponseType(401,403,400)]` + XML doc

**Files**: `StoresController.cs` lines 66–71

**Approach**:
```csharp
/// <summary>
/// Get a store by its unique identifier.
/// Returns the store with included owner details and active modules.
/// </summary>
[HttpGet("{id}")]
[ProducesResponseType(typeof(ResponseResult<StoreDto>), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
public async Task<IActionResult> GetStoreByIdAsync(Guid id)
```

### #6 — Fix namespace

**Files**: `GetStoreByIdService.cs` line 6

**Approach**: Change `namespace Domain.Entities.Stores` → `namespace Application.Services.Stores`

### #7 — Null check in handler + NotFound error

**Files**: `GetStoreByIdQuery.cs`, `StoreErrors.cs`

**Approach**:
1. Add to `StoreErrors.cs`: `public static readonly Error NotFound = new("Store.NotFound", "The store was not found.");`
2. In handler, after service call:
```csharp
if (store is null)
    return ResponseResult.NotFound<StoreDto>(StoreErrors.NotFound);
```

## Dependencies Between Changes

```
#7 (StoreErrors.NotFound) ──→ (used by) #7 (handler null check)
#2 (interface sig) ──→ #4 (impl + validator)
All others: independent
```

**Execution order**: any order. #4 requires both interface update AND impl in the same logical step.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `ExistsAsync` returns false for valid superadmin store | Low | Medium | Using `.IgnoreQueryFilters()` — same pattern as the service. Accepts false positive (validator passes, handler finds null → 404). |
| `GetAllStoresQueryHandler` referenced elsewhere | Low | Low | Grep confirms no references. MediatR resolves by generic type. |
| Namespace fix breaks `IGetStoreByIdService` resolution | Low | High | Verify DI registration uses interface (`IGetStoreByIdService`), not the implementation's namespace. The interface is in `Domain.Interfaces.Services.Stores` — unchanged. |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Handler returns 404 when store is null | Mock service → null → assert NotFound |
| Unit | Validator passes for existing store ID | Mock repository → `ExistsAsync=true` → assert valid |
| Unit | Validator fails for missing store ID | Mock repository → `ExistsAsync=false` → assert invalid |
| Integration | End-to-end: valid ID returns 200 with ownerName | Use test fixture with seeded store → GET → assert 200 + ownerName |
| Integration | End-to-end: invalid ID returns 404 | Use test fixture → GET random ID → assert 404 |

## Migration / Rollout

No migration required. Changes are additive (new methods, new error) or replace existing code inline. Rollback: revert each file independently via `git revert` or checkout of specific files.

## Open Questions

None. All decisions are scoped and unambiguous.
