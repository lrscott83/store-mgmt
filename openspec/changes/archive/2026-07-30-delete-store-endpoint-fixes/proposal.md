# Proposal: Delete Store Endpoint Fixes

## Intent

Fix 8 bugs identified in the `DELETE /api/v1/stores/{id}` endpoint (`StoresController.DeleteAsync`) ranging from a crash-level NullReferenceException to missing OpenAPI metadata. The endpoint currently has no null check on the loaded store entity, a broken test controller reference, wrong HTTP status codes for authorization failures, over-fetching in the DB query, duplicate DB round-trips, and missing response type documentation.

## Scope

### In Scope
1. **NRE fix** — Add null check after `GetStoreByIdIncludingModulesAsync` in handler; throw `ApiException(NotFound)` if store is null
2. **WebApiTest broken reference** — Fix `DeleteStoreCommand` → `DeactivateStoreCommand` in test controller
3. **Over-fetching** — Replace heavy include query with lightweight `GetStoreByIdAsync` (new repo method) that loads only the store entity without navigation properties
4. **Double DB query elimination** — Remove `MustAsync(StoreExists)` from validator; replace with lightweight `ExistsAsync`
5. **Fix auth status code** — Change `HttpStatusCode.BadRequest` → `HttpStatusCode.Forbidden` for auth failure
6. **Fix error message** — Change `"UserNotFound"` key → `"DontHavePermission"` for auth failure
7. **Add missing ProducesResponseType** — Add 401, 403, 404, 400 to controller action
8. **Fix XML comment** — Change "Delete tenant by id" → "Deactivate store by id"
9. **Unused import** — Remove `using Domain.Interfaces.Repositories;` from validator

### Out of Scope
- Namespace rename (`DeleteStore` → `DeactivateStore`) — cosmetic, low value, would break existing imports across files
- Handler permission check mismatch (`IsSuperAdminOrOwnerAdmin` vs `[HasPermission(SuperAdmin)]`) — already handled by the controller-level filter; handler check is defense-in-depth
- E2E tests for this endpoint — deferred to a separate change

## Approach

Per-file targeted fixes:

- **`DeactivateStoreCommand.cs`**: Add null check + 404 for missing store, fix auth status code to 403 with `"DontHavePermission"`, switch from `GetStoreByIdIncludingModulesAsync` to lightweight `GetStoreByIdAsync`
- **`DeactivateStoreCommandValidator.cs`**: Remove `MustAsync(StoreExists)` rule and unused `using Domain.Interfaces.Repositories;` import
- **`StoresController.cs`**: Add `[ProducesResponseType(401, 403, 404, 400)]`, fix XML comment
- **`WebApiTest/Controllers/v1/StoresController.cs`**: Fix `DeleteStoreCommand` → `DeactivateStoreCommand`, fix XML comment
- **`IStoreRepository.cs`**: Add `Task<Store?> GetStoreByIdAsync(Guid id)` — lightweight, respects query filters
- **`StoreRepository.cs`**: Implement `GetStoreByIdAsync` — `_stores.Where(s => s.Id == id).FirstOrDefaultAsync()`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/.../DeactivateStoreCommand.cs` | Modified | NRE fix, auth code, lightweight load |
| `backend/src/Application/.../DeactivateStoreCommandValidator.cs` | Modified | Remove DB existence check + unused import |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | Add ProducesResponseType, fix XML |
| `backend/src/WebApiTest/Controllers/v1/StoresController.cs` | Modified | Fix broken class reference, fix XML |
| `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` | Modified | Add GetStoreByIdAsync method |
| `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modified | Implement GetStoreByIdAsync |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| New `GetStoreByIdAsync` might not respect tenant filters | Low | Uses `_stores.Where(s => s.Id == id)` which passes through EF Core query filters |
| Removing validator's StoreExists could break client expectations | Low | Handler returns 404 with proper message — same end result |
| `ExistsAsync` ignores query filters (tenant isolation) | Low | Validator existence check is pre-flight only; handler does the real scoped load |

## Rollback Plan

Revert individual file changes via `git checkout` on each modified file. No migration or DB changes involved.

## Dependencies

None.

## Success Criteria

- [ ] Handler returns 404 NotFound (not 500 NRE) when store doesn't exist
- [ ] WebApiTest compiles (no more `DeleteStoreCommand` reference)
- [ ] Handler loads store without Owner/User/StoreModules/Module data
- [ ] Validator doesn't execute a DB query (only structural Id validation)
- [ ] Auth failure returns 403 Forbidden (not 400) with "DontHavePermission"
- [ ] Swagger shows 400, 401, 403, 404 response codes for the endpoint
- [ ] Build passes with 0 errors
