# Exploration: Set My Store Endpoint Fixes

**Change**: `2026-07-30-set-my-store-endpoint-fixes`
**Date**: 2026-07-30
**Mode**: hybrid (engram + openspec)

---

## Current State

The `PUT /api/v1/stores` endpoint (`StoresController.SetMyStoreIdAsync`) allows SuperAdmin and StoresAdmin users to set their `SelectedStoreId` — the active store they're working with. The flow is:

1. **Class-level `[HasPermission]` filter** authorizes `SuperAdmin` and `StoresAdmin` roles
2. **FluentValidation** (`SetMyStoreCommandValidator`) validates `StoreId` is not null/empty and checks the store exists via `GetStoreByIdIncludingModulesAsync` (full aggregate load)
3. **Handler** (`SetStoreCommandHandler`) loads user by JWT external ID, sets `SelectedStoreId`, saves

### Call Chain

```
Client → PUT /api/v1/stores
  → [HasPermission(SuperAdmin, StoresAdmin)] class-level filter
  → StoresController.SetMyStoreIdAsync
    → Validator: NotNull + NotEmpty + StoreExists (via GetStoreByIdIncludingModulesAsync)
    → SetStoreCommandHandler.Handle
      → _httpContextService.UserExternalId → ToGuid()
      → _userRepository.GetByIdAsync(userId)  ← NRE risk
      → user.SelectedStoreId = request.StoreId
      → _userRepository.UpdateAsync(user)
      → _applicationUnitOfWork.SaveChangesAsync()
      → ResponseResult.Success(...)
```

---

## Affected Areas

| File | Role |
|------|------|
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` (line 30-38) | Controller action — missing `[ProducesResponseType]` for 401/403/400 |
| `backend/src/Application/.../Commands/SetMyStore/SetMyStoreCommand.cs` | Command record + Handler — NRE risk, wrong class name |
| `backend/src/Application/.../Commands/SetMyStore/SetMyStoreCommandValidator.cs` | Validator — over-fetches store with modules, redundant `.NotNull()` on Guid |
| `backend/src/Application/Abstractions/HttpContext/IHttpContextService.cs` | User identity provider |
| `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs` | User data access |
| `backend/src/Domain/Interfaces/Services/Stores/IGetStoreByIdService.cs` | Store existence check (over-fetching) |
| `backend/src/Infrastructure/Persistence/Repositories/GenericRepository.cs` | Base `GetByIdAsync` returns non-nullable TEntity |
| `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` | Has lightweight `ExistsAsync(Guid)` available |
| `backend/src/SMCA.WebApi.E2ETests/Auth/StoreScopingTests.cs` | Existing E2E test — happy path only |

---

## Findings Validation

### HIGH-01 — NullReferenceException in handler ✅ CONFIRMED

```csharp
var user = await _userRepository.GetByIdAsync(_httpContextService.UserExternalId.ToGuid());
user.SelectedStoreId = request.StoreId;  // NRE if user is null
```

**Evidence**: `GenericRepository<TEntity, TId>.GetByIdAsync` returns `Task<TEntity>` (non-nullable), but `FindAsync()` CAN return null if no matching entity exists. If the JWT user's GUID doesn't match a DB user record → `user` is null → `user.SelectedStoreId` throws NRE → 500 Internal Server Error.

**Impact**: Any request with a valid JWT token whose `sub` claim doesn't correspond to a database user will crash the endpoint with a 500 instead of returning a meaningful error.

### HIGH-02 — Class name mismatch ✅ CONFIRMED

```csharp
public sealed record SetMyStoreCommand(Guid StoreId) : ICommand<bool> { }
public class SetStoreCommandHandler : ICommandHandler<SetMyStoreCommand, bool>  // ← wrong name
```

**Evidence**: Handler class is named `SetStoreCommandHandler` but the command it handles is `SetMyStoreCommand`. Should be `SetMyStoreCommandHandler`. This breaks discoverability — developers searching for `SetMyStore` in their IDE won't find the handler by convention.

### MEDIUM-03 — Validator over-fetches ✅ CONFIRMED

```csharp
private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
{
    return await _storeByIdService.GetStoreByIdIncludingModulesAsync(storeId) != null;
}
```

**Evidence**: `GetStoreByIdIncludingModulesAsync` loads the full Store aggregate INCLUDING all module relationships (joins across StoreModule, Module tables). The method is designed for scenarios needing the full store-with-modules graph. For a simple existence check, this is wasteful. `IStoreRepository` already exposes `ExistsAsync(Guid)` which does a lightweight primary key lookup — using it would save a multi-join query.

### MEDIUM-04 — Missing ProducesResponseType ✅ CONFIRMED

```csharp
[HttpPut]
[ProducesResponseType(StatusCodes.Status200OK)]
public async Task<IActionResult> SetMyStoreIdAsync([FromBody] SetMyStoreCommand command)
```

**Evidence**: Only `200 OK` is documented. The class-level `[HasPermission]` filter can return `401 Unauthorized` (no auth header) and `403 Forbidden` (authenticated but lacks role). The validator can return `400 Bad Request`. Other endpoints in the SAME controller (e.g., `GetStoresAsync`, `GetStoreByIdAsync`) already document all 4 response codes as precedent.

### MEDIUM-05 — No store access validation ✅ CONFIRMED

```csharp
user.SelectedStoreId = request.StoreId;  // No access check
```

**Evidence**: The handler assigns `request.StoreId` directly to `user.SelectedStoreId` without any verification that the user has access to that store. A SuperAdmin or StoresAdmin can set their selected store to ANY GUID — even one that doesn't exist (though the validator catches non-existent stores) or one they shouldn't have access to. There's no check like "is this store in the user's accessible stores list?"

**Context**: `IStoreRepository` has `GetActiveStoresByUserIdAsync(Guid userId)` and `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid userId)` — methods designed exactly for this kind of access scoping. Not using them here is an oversight.

### LOW-06 — Redundant validation ✅ CONFIRMED

```csharp
RuleFor(x => x.StoreId)
    .NotNull().WithMessage(...)    // ← dead code
    .NotEmpty().WithMessage(...)
```

**Evidence**: `StoreId` is declared as `Guid StoreId` in the command record. `Guid` is a value type — it can NEVER be null. `.NotNull()` on a non-nullable value type is dead code that always passes. This is a minor issue but contributes to noise in the codebase.

---

## Additional Discoveries

### ADC-01: Validator uses `IGetStoreByIdService` which has tenant-aware logic but handler doesn't need it

The service's `GetStoreByIdIncludingModulesAsync` applies tenant scoping (SuperAdmin + default tenant → ignore query filters). The validator doesn't need tenant-scoped existence — it just needs a raw existence check. Using `_storeRepository.ExistsAsync(storeId)` directly (or via `IStoreRepository`) would be cleaner and avoid introducing a service dependency in the validator.

### ADC-02: The existing E2E test only covers the happy path

`StoreScopingTests.SetMyStore_changes_selected_store_and_me_recomputes` tests:
- OwnerAdmin can set their selected store to another store they own ✅
- The `/api/v1/auth/me` endpoint reflects the change ✅

Missing coverage:
- ❌ User not found in DB (HIGH-01 scenario)
- ❌ Non-existent store ID (validator catches it, but 400 vs 404?)
- ❌ User without access to target store (MEDIUM-05 scenario)
- ❌ SuperAdmin setting store to any value
- ❌ Empty/default GUID

### ADC-03: Precedent for similar fixes exists

The `update-store-endpoint-fixes` change (archived 2026-07-30) addressed:
- Missing `[ProducesResponseType]` → same fix needed here
- Validator over-fetching → same pattern (lightweight `ExistsAsync` was accepted as a deviation)
- Handler auth failure handling → same NRE pattern with null user (return 403 Forbidden)
- The spec domains `api-controller`, `command-handler`, `validation` are ready to reuse

### ADC-04: IGenericRepository.GetByIdAsync returns non-nullable TEntity

```csharp
public interface IGenericRepository<TEntity, TId> where TEntity : Entity<TId>
{
    Task<TEntity> GetByIdAsync(TId id);  // Non-nullable
}
```

The implementation uses `FindAsync` which CAN return null, but the interface doesn't express this. This is a design smell in the generic repository pattern — callers must know to null-check even though the signature implies non-null. The NPE in HIGH-01 is a direct consequence.

---

## Approaches

### Approach 1: Targeted per-file fixes (precedent pattern)

Apply 6 self-contained fixes across 3 files, following the exact pattern from `update-store-endpoint-fixes`.

| Fix | File | Approach |
|-----|------|----------|
| HIGH-01 | Handler | Add null check after `GetByIdAsync` → throw `ApiException` with 403 Forbidden |
| HIGH-02 | Handler | Rename `SetStoreCommandHandler` → `SetMyStoreCommandHandler` |
| MEDIUM-03 | Validator | Replace `GetStoreByIdIncludingModulesAsync` with `_storeRepository.ExistsAsync(storeId)` |
| MEDIUM-04 | Controller | Add `[ProducesResponseType(401/403/400)]` attributes |
| MEDIUM-05 | Handler | Add check: `_storeRepository.GetActiveStoresByUserIdAsync(user.Id)` contains `request.StoreId` |
| LOW-06 | Validator | Remove `.NotNull()` line |

**Pros**:
- Matches established pattern from precedent change
- Self-contained, low-risk per-file changes
- Reuses existing spec domains

**Cons**:
- MEDIUM-05 requires adding `IStoreRepository` dependency to handler
- Lightweight approach — doesn't fix the underlying `GetByIdAsync` nullable design smell

**Effort**: Low

### Approach 2: Fix + Restructure

Same as Approach 1 but also introduces a nullable-aware `GetByIdOrNullAsync` on `IGenericRepository` to fix the design smell.

**Pros**:
- Fixes root cause of NRE risk across all handlers
- Makes nullable contract explicit

**Cons**:
- Changes a shared interface — broader scope, more files
- May conflict with other in-flight changes

**Effort**: Medium

### Approach 3: No store access validation (skip MEDIUM-05)

Apply fixes 1-4 and 6, but skip MEDIUM-05 (store access validation) because `[HasPermission]` already restricts to SuperAdmin/StoresAdmin who arguably should have access to all stores.

**Pros**:
- Fewer changes
- Less risk of breaking existing behavior

**Cons**:
- `StoresAdmin` is tied to `OwnerAdmin` role — an OwnerAdmin should only see their OWN stores, not arbitrary ones
- Security gap remains

**Effort**: Low (but incomplete)

---

## Recommendation

**Approach 1** — Targeted per-file fixes following the precedent pattern. This aligns with:
1. The established pattern from `update-store-endpoint-fixes` (same domains, same fixes)
2. Minimal risk profile (3 files, 6 self-contained changes)
3. Reuses existing spec domains (`api-controller`, `command-handler`, `validation`)
4. For MEDIUM-05, add `IStoreRepository` to the handler (it's already in the Application layer via the DI container)

The precedent change's `verify-report.md` confirms that the pattern works — even with deviations accepted. We should:
- Follow the `update-store-endpoint-fixes` spec structure exactly
- For MEDIUM-03, use the same deviation approach as the precedent: lightweight `ExistsAsync` instead of full removal
- Write E2E tests for the uncovered scenarios (ADC-02)

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Renaming handler class (HIGH-02) could break DI registration | Low | Scan for `SetStoreCommandHandler` references — likely registered via `AddMediatR` which scans assembly by convention, not class name |
| Adding `IStoreRepository` to handler (MEDIUM-05) adds a 4th dependency | Low | Handler already has 3 dependencies; one more is acceptable. Could also use `IGetStoreByIdService` which is already available |
| Store access check might be too restrictive for SuperAdmin | Medium | SuperAdmin should see all stores — use `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync` for SuperAdmin, or skip access check for SuperAdmin |
| Existing E2E test might need update | Low | The test creates an OwnerAdmin who owns store B, so access check should pass — verify before implementation |

---

## Ready for Proposal

**Yes**. All 6 findings are confirmed against actual source code. The precedent pattern from `update-store-endpoint-fixes` provides a clear template for the proposal, specs, and design. The key spec domains (`api-controller`, `command-handler`, `validation`) already exist and only need delta specs for this change.
