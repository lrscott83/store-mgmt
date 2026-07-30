# Design: Set My Store Endpoint Fixes

## Technical Approach

Six targeted fixes across 3 files in the `SetMyStore` command pipeline. No new types, interfaces, or migrations. Each fix is self-contained and follows precedent patterns established in the `update-store-endpoint-fixes` change.

## Architecture Decisions

### Decision: Null user → throw ApiException (not return Failure)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `ResponseResult.Failure<bool>("AuthorizationFailed")` | Breaks existing handler pattern — other handlers throw ApiException | ❌ Rejected |
| `throw new ApiException(_localizer["Forbidden"], 403)` | Follows precedent from `UpdateStoreCommand` line 72 | ✅ Chosen |

**Rationale**: Every other handler in `Commands/` throws `ApiException` for auth failures. A `ResponseResult.Failure` would need different middleware handling and introduces inconsistency.

### Decision: SuperAdmin bypass for store access check

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Skip access check entirely if `IsSuperAdmin` | Zero cost, correct — SuperAdmin accesses all stores | ✅ Chosen |
| Use `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync` | Still queries with same result | ❌ Rejected |

**Rationale**: SuperAdmin has unconditional access. Adding a no-op query wastes DB resources. Spec explicitly allows bypass ("passes or skipped").

### Decision: Validator uses `IStoreRepository.ExistsAsync(Guid)`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `IStoreRepository.ExistsAsync(storeId)` | Single `COUNT(*) WHERE Id = @p0` — lightweight | ✅ Chosen |
| Keep `IGetStoreByIdService.GetStoreByIdIncludingModulesAsync` | Full aggregate load with joins — 10×+ cost | ❌ Rejected |

**Rationale**: `IStoreRepository` is already in the Application layer DI container. `ExistsAsync` maps to EF `AnyAsync()` — minimal query.

### Decision: `[ProducesResponseType]` set follows UpdatedStoreAsync precedent

**Choice**: Add `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]` — identical to the set on `UpdatedStoreAsync` (lines 91-94).
**Rationale**: Same `[HasPermission]` class-level filter and same handler patterns produce these status codes. Consistency across the controller.

### Decision: Remove `.NotNull()` from `Guid` rule

**Choice**: Delete the `.NotNull().WithMessage(...)` line entirely. Keep `.NotEmpty()`.
**Rationale**: `Guid` is a non-nullable value type — `.NotNull()` always passes and is dead code.

## Data Flow

```
Client → PUT /api/v1/stores
  → StoresController.SetMyStoreIdAsync (add [ProducesResponseType 400/401/403])
    → SetMyStoreCommandValidator (fix: light ExistsAsync, no .NotNull())
    → SetMyStoreCommandHandler.Handle
      → Get user by JWT sub (fix: null-check → 403 ApiException)
      → If !IsSuperAdmin: check store access via GetActiveStoresByUserIdAsync (NEW)
      → user.SelectedStoreId = request.StoreId
      → UpdateAsync + SaveChangesAsync
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/.../SetMyStore/SetMyStoreCommand.cs` | Modify | HIGH-01, HIGH-02, MEDIUM-05: rename handler, null-check, access validation |
| `backend/src/Application/.../SetMyStore/SetMyStoreCommandValidator.cs` | Modify | MEDIUM-03, LOW-06: replace service dep, remove .NotNull() |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modify | MEDIUM-04: add 3 ProducesResponseType attributes |

### Detailed changes per file

#### `SetMyStoreCommand.cs`
- **Line 12**: Rename class `SetStoreCommandHandler` → `SetMyStoreCommandHandler`
- **Line 19**: Rename constructor `SetStoreCommandHandler` → `SetMyStoreCommandHandler`
- **Inject**: Add `IStoreRepository _storeRepository` and `IStringLocalizer<I18n> _localizer` (fields + constructor params)
- **Line 31-32**: Add null-check after `GetByIdAsync`:
  ```csharp
  var user = await _userRepository.GetByIdAsync(...);
  if (user is null)
      throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);
  ```
- **After null-check**: Add store access validation:
  ```csharp
  if (!_httpContextService.IsSuperAdmin)
  {
      var accessibleStores = await _storeRepository.GetActiveStoresByUserIdAsync(user.Id);
      if (!accessibleStores.Any(s => s.Id == request.StoreId))
          throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);
  }
  ```
- **Blank line**: Remove extra blank line between `_applicationUnitOfWork` field and constructor (SM-CH4)
- **Using**: Add `using Application.Exceptions;`, `using Domain.Interfaces.Repositories;`, `using Microsoft.Extensions.Localization;`, `using Resources;`

#### `SetMyStoreCommandValidator.cs`
- **Line 12-13**: Replace field `IGetStoreByIdService _storeByIdService` → `IStoreRepository _storeRepository`
- **Line 13**: Replace constructor param `IGetStoreByIdService storeByIdService` → `IStoreRepository storeRepository`
- **Line 16**: Replace `_storeByIdService = storeByIdService` → `_storeRepository = storeRepository`
- **Line 19**: Delete `.NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])` — only `.NotEmpty()` stays
- **Line 21**: Change `MustAsync(StoreExists)` to use `_storeRepository.ExistsAsync`
- **Method (lines 24-27)**: Simplify:
  ```csharp
  private async Task<bool> StoreExists(Guid storeId, CancellationToken ct)
      => await _storeRepository.ExistsAsync(storeId);
  ```
- **Using**: Remove `using Domain.Interfaces.Services.Stores;`, add `using Domain.Interfaces.Repositories;` (if needed)

#### `StoresController.cs`
- **After line 34**: Add 3 attributes:
  ```csharp
  [ProducesResponseType(StatusCodes.Status400BadRequest)]
  [ProducesResponseType(StatusCodes.Status401Unauthorized)]
  [ProducesResponseType(StatusCodes.Status403Forbidden)]
  ```

## Interfaces / Contracts

No new interfaces, contracts, or DTOs. API contract (`ResponseResult<bool>`) and command shape (`SetMyStoreCommand`) are unchanged.

## Edge Cases

| Case | Behavior |
|------|----------|
| Null user (JWT sub not in DB) | ApiException 403 — never reaches `user.SelectedStoreId` |
| Guid.Empty request | Caught by validator `.NotEmpty()` before handler |
| Store ID not in user's accessible stores | ApiException 403 — SelectedStoreId unchanged |
| SuperAdmin with any store ID | Bypasses access check entirely |
| Valid request | Assigns SelectedStoreId, saves, returns 200 |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Null user → 403 | Mock `GetByIdAsync` → null, assert `ApiException` with 403 |
| Unit | Access denied → 403 | Mock `GetActiveStoresByUserIdAsync` → list without request.StoreId, assert 403 |
| Unit | SuperAdmin bypass | Mock `IsSuperAdmin` → true, assert access check NOT called |
| Unit | Validator uses ExistsAsync | Assert `_storeRepository.ExistsAsync` called once; `_storeByIdService` never called |
| Unit | Validator no .NotNull() on Guid | Assert rule chain has `.NotEmpty()` but not `.NotNull()` |
| Integration | SetMyStore returns 401/403/400 | Call without auth → 401, with non-admin → 403, with Guid.Empty → 400 |
| Integration | Happy path | Valid SuperAdmin sets store ID → 200, SelectedStoreId updated |

## Migration / Rollout

No migration required. All changes are code-only. Rollback: revert any of the 3 files independently.

## Open Questions

None.
