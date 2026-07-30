# Design: Delete Store Endpoint Fixes

## Technical Approach

Eight targeted fixes across 6 files in the `DeactivateStore` command pipeline and its surrounding infrastructure. No new types, interfaces (other than one new repo method), or migrations. Each fix is self-contained.

## Architecture Decisions

### Decision: Lightweight store load

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add `GetStoreByIdAsync` to repo | Single lightweight query, respects query filters | ✅ Chosen |
| Keep `GetStoreByIdIncludingModulesAsync` | Over-fetches Owner→User, StoreModules→Module for a bool flip | ❌ Rejected |

**Rationale**: The handler only needs to set `IsActive = false`. Loading Owner, User, StoreModules, Module data is wasteful. The new method uses `_stores.Where(s => s.Id == id).FirstOrDefaultAsync()` which respects tenant query filters.

### Decision: Remove validator existence check (not replace with ExistsAsync)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Remove `MustAsync(StoreExists)` entirely | No DB call in validator; handler handles 404 | ✅ Chosen |
| Replace with lightweight `ExistsAsync` | Extra DB round-trip; ExistsAsync ignores tenant filters | ❌ Rejected |

**Rationale**: The handler already loads the store and will return 404 if null. The validator's pre-check adds latency with zero benefit — the `ExistsAsync` also ignores query filters, so it's a false sense of security.

### Decision: Fix auth status code

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `HttpStatusCode.Forbidden` + `"DontHavePermission"` | Correct HTTP semantics for auth failure | ✅ Chosen |
| Keep `HttpStatusCode.BadRequest` + `"UserNotFound"` | Wrong status (400 is for malformed input) | ❌ Rejected |

**Rationale**: 403 Forbidden is the standard HTTP status for authenticated-but-not-authorized. The resource key `"DontHavePermission"` already exists in both locale files ("No tienes permiso" / "You don't have permission").

### Decision: Skip namespace rename

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep `DeleteStore` namespace | Works fine, cosmetic only | ✅ Chosen |
| Rename to `DeactivateStore` | Breaks existing `using` in 2 controller files, folder rename needed | ❌ Rejected |

**Rationale**: Zero functional impact. The namespace rename would create unnecessary diff noise across 4+ files.

## Data Flow (After Fixes)

```
Client → DELETE /api/v1/stores/{id}
  → StoresController.DeleteAsync (add [ProducesResponseType], fix XML)
    → DeactivateStoreCommandHandler.Handle
      → Remove auth double-check (controller already filters)
      → Load store via lightweight GetStoreByIdAsync (no includes)
      → Null check → 404 if missing ← NEW
      → store.IsActive = false
      → UpdateAsync + SaveChangesAsync
    → DeactivateStoreCommandValidator (remove StoreExists + unused import)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `IStoreRepository.cs` | Modify | Add `Task<Store?> GetStoreByIdAsync(Guid id)` |
| `StoreRepository.cs` | Modify | Implement lightweight `GetStoreByIdAsync` |
| `DeactivateStoreCommand.cs` | Modify | Null check, auth code, lightweight load |
| `DeactivateStoreCommandValidator.cs` | Modify | Remove StoreExists, remove unused import |
| `SMCA.WebApi/StoresController.cs` | Modify | Add ProducesResponseType, fix XML |
| `WebApiTest/StoresController.cs` | Modify | Fix class reference, fix XML |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration | DELETE with non-existent ID | Returns 404, not 500 |
| Integration | DELETE without auth | Returns 401 |
| Integration | DELETE with non-admin role | Returns 403 (was 400) |
| Integration | Swagger shows 400/401/403/404 | Inspect OpenAPI doc |
| Build | WebApiTest compiles | `dotnet build WebApiTest` succeeds |

## Migration / Rollout

No migration required. All changes are code-only.
