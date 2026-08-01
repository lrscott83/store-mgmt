# Proposal: Set My Store Endpoint Fixes

## Intent

Fix 6 issues in `PUT /api/v1/stores` (`SetMyStoreIdAsync`) ranging from a crash-level NRE to missing OpenAPI metadata. The endpoint has unhandled null user, wrong handler class name, validator over-fetching, missing response types, no store access validation, and redundant code.

## Scope

### In Scope
1. **NRE fix** — Add null check after `GetByIdAsync` → throw 403 if user not found
2. **Class rename** — `SetStoreCommandHandler` → `SetMyStoreCommandHandler`
3. **Validator optimization** — Replace `GetStoreByIdIncludingModulesAsync` with `_storeRepository.ExistsAsync(Guid)`
4. **Missing `ProducesResponseType`** — Add `[ProducesResponseType(400/401/403)]` to action
5. **Store access validation** — Verify `request.StoreId` is in user's accessible stores via `GetActiveStoresByUserIdAsync`
6. **Remove dead validation** — Delete `.NotNull()` on value-type `Guid`

### Out of Scope
- Fixing `IGenericRepository` nullable design smell — deferred
- Adding new E2E tests — covered separately in test phase
- Refactoring handler SRP concerns

## Approach

Per-file targeted fixes following precedent pattern from `update-store-endpoint-fixes`:

- **`SetMyStoreCommand.cs`**: Rename handler class, add null-check, add store access validation (using `IStoreRepository`)
- **`SetMyStoreCommandValidator.cs`**: Replace over-fetching service with lightweight `ExistsAsync`, remove `.NotNull()`
- **`StoresController.cs`**: Add missing `[ProducesResponseType]` attributes

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `SetMyStoreCommand.cs` | Modified | NRE fix, class rename, access validation |
| `SetMyStoreCommandValidator.cs` | Modified | Optimize existence check, remove dead code |
| `StoresController.cs` | Modified | Add 400/401/403 response types |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Renaming handler breaks DI | Low | MediatR scans assembly — registration works by handler interface, not class name |
| Store access check too restrictive for SuperAdmin | Medium | Use `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync` for SuperAdmin accounts |
| Adding `IStoreRepository` to handler | Low | Already in Application layer DI container |

## Rollback Plan

Revert individual file changes via `git checkout` on each modified file. No migration or DB changes involved.

## Dependencies

None.

## Success Criteria

- [ ] Null user returns 403 Forbidden, not 500 NRE
- [ ] Handler class is named `SetMyStoreCommandHandler`
- [ ] Validator does lightweight `ExistsAsync` instead of full aggregate load
- [ ] Swagger/OpenAPI doc shows 400, 401, 403 response codes
- [ ] User cannot set store ID they don't have access to
- [ ] No `.NotNull()` on `Guid` value type in validator
