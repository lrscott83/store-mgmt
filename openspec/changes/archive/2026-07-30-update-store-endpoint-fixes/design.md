# Design: Update Store Endpoint Fixes

## Technical Approach

Six targeted fixes across 3 files in the `UpdateStore` command pipeline. No new types, interfaces, or migrations. Each fix is self-contained — refactors a single anti-pattern (async void, N+1, redundant query, missing metadata, wrong status code, dead import).

## Architecture Decisions

### Decision: Fire-and-forget → proper await

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `Task.WhenAll(storeRoleFeatures.Select(...))` | Concurrent — but `AddAsync` on EF Core is not thread-safe per context | ❌ Rejected |
| `foreach + await` | Sequential, safe, exception-propagating | ✅ Chosen |
| Keep `ForEach(async ...)` | Crash on unobserved task exception, async void | ❌ Rejected |

**Rationale**: EF Core `DbContext` is not thread-safe. Sequential await is the correct pattern for writes. The original `ForEach(async ...)` never awaited — exceptions would be lost.

### Decision: N+1 module loading → batch

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Batch-load via `GetModulesByIdsAsync` | Single query, `ToDictionary` for O(1) lookup | ✅ Chosen |
| Keep loading one-by-one | N queries, N round-trips to PostgreSQL | ❌ Rejected |

**Rationale**: `IModuleRepository` already exposes `GetModulesByIdsAsync(List<int>)`. Loading all modules in a single `WHERE Id IN (...)` query eliminates N-1 redundant DB calls.

### Decision: Remove validator `StoreExists` rule

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Remove `StoreExists` rule, keep `NotNull`/`NotEmpty` | No extra DB call in validator; handler throws `NotFoundException` if store missing | ✅ Chosen |
| Keep `StoreExists` | Double query: validator loads full store graph, handler loads it again | ❌ Rejected |

**Rationale**: The handler already loads the store via `GetStoreByIdIncludingModulesAsync` and throws if null. The validator's pre-check adds latency with zero benefit — it queries the same aggregate just to check existence.

### Decision: Auth status code 400 → 403

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `HttpStatusCode.Forbidden` + message `"AccessDenied"` | Correct HTTP semantics for auth failure | ✅ Chosen |
| Keep `HttpStatusCode.BadRequest` + `"UserNotFound"` | Wrong status (400 is for malformed input, not auth) | ❌ Rejected |

**Rationale**: 403 Forbidden is the standard HTTP status for authenticated-but-not-authorized. 400 BadRequest is for validation errors. The message `"UserNotFound"` is misleading — the user *is* found, they just lack the required role.

### Decision: Missing `ProducesResponseType` attributes

**Choice**: Add `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(400)]` to the `UpdatedStoreAsync` action.
**Rationale**: The class-level `[HasPermission]` filter can return 401/403, and the handler can throw `ValidationException` (400). Other actions in the same controller already document these codes — this was an oversight.

## Data Flow

No changes to the data flow or API contract. All fixes are internal to command processing:

```
Client → PUT /api/v1/stores/{id}
  → StoresController.UpdatedStoreAsync (add [ProducesResponseType])
    → UpdateStoreCommandHandler.Handle
      → Auth check (403 instead of 400)
      → Load store (single call, unchanged)
      → Load all modules in 1 query (was N queries)
      → UpdateStoreModules
        → foreach + await (was ForEach(async))
    → UpdateStoreCommandValidator (remove StoreExists rule)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/.../UpdateStoreCommand.cs` | Modify | Fixes 1, 2, 5, 6 |
| `backend/src/Application/.../UpdateStoreCommandValidator.cs` | Modify | Fix 3 |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modify | Fix 4 |

## Interfaces / Contracts

No new interfaces, contracts, or data structures. The API contract (`ResponseResult<bool>`) and command shape (`UpdateStoreCommand`) are unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Handler auth check returns 403 | Mock `IsSuperAdminOrOwnerAdmin` = false, assert `ApiException` with `HttpStatusCode.Forbidden` |
| Unit | Modules loaded in single batch | Assert `_moduleRepository.GetModulesByIdsAsync` called exactly once per handle |
| Unit | Validator skips existence check | Assert `_storeByIdService` is NOT called during validation |
| Unit | `ForEach` removed | Assert `AddAsync` called exactly `storeRoleFeatures.Count` times sequentially |
| Integration | PUT endpoint returns 401/403/400 | Call without auth → 401, call with non-admin → 403, call with invalid id → 400 |

## Migration / Rollout

No migration required. All changes are code-only. Rollback: revert any of the 3 files independently.

## Open Questions

- None. Each fix has clear unambiguous implementation.
