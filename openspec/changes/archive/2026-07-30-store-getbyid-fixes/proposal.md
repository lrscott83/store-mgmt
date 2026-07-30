# Proposal: Fix GET /api/v1/stores/{id} — 7 bugs from code review

## Intent

Fix 5 severity bugs + 2 bonus issues found during `api-endpoint-review` of `GET /api/v1/stores/{id}`. The endpoint crashes with a NullReferenceException on `Owner.User.FullName` due to missing `.Include()`, has naming confusion, redundant async patterns, double DB queries, missing API metadata, a wrong namespace, and a race condition gap.

## Scope

### In Scope
1. Add `.Include(s => s.Owner).ThenInclude(o => o.User)` to both `GetStoreByIdIncludingModules*` methods in `StoreRepository`
2. Rename handler class `GetAllStoresQueryHandler` → `GetStoreByIdQueryHandler`
3. Remove redundant `await Task.FromResult(...)` → `return ResponseResult.Success(...)`
4. Add `ExistsAsync(Guid id)` to `IStoreRepository` + `StoreRepository`; use it in validator instead of the full query
5. Add missing `[ProducesResponseType(401/403/400)]` + XML doc to `GetStoreByIdAsync` in controller
6. Fix namespace in `GetStoreByIdService.cs`: `Domain.Entities.Stores` → `Application.Services.Stores`
7. Add null check in handler after service call → return 404 if store not found (race condition)

### Out of Scope
- Other endpoints in `StoresController` or other controllers
- Refactoring the service layer architecture
- Adding integration tests (separate change)

## Approach

Each fix is isolated. 1–2 file changes per fix:

- **#1**: Add `.Include(s => s.Owner).ThenInclude(o => o.User)` before `.Include(s => s.StoreModules...)` in both methods in `StoreRepository.cs`
- **#2**: Rename class in `GetStoreByIdQuery.cs`
- **#3**: Remove `await Task.FromResult` wrapper in handler
- **#4**: Add `Task<bool> ExistsAsync(Guid id)` to `IStoreRepository`, implement it in `StoreRepository` with `.AnyAsync()`, inject repository into validator, call `_storeRepository.ExistsAsync(id)` instead of service method
- **#5**: Add `[ProducesResponseType(...)]` attributes + `<summary>` XML comment to `GetStoreByIdAsync`
- **#6**: Change namespace in `GetStoreByIdService.cs`
- **#7**: Add `if (store is null) return ResponseResult.NotFound(...)` in handler after service call

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modified | Add `.Include(Owner.User)` + `ExistsAsync()` |
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Modified | Add `ExistsAsync` signature |
| `Application/Features/.../GetStoreById/GetStoreByIdQuery.cs` | Modified | Rename class, remove Task.FromResult, add null check |
| `Application/Features/.../GetStoreById/GetStoreByIdQueryValidator.cs` | Modified | Use `ExistsAsync` instead of full query |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | Add ProducesResponseType + XML doc |
| `Application/Services/Stores/GetStoreByIdService.cs` | Modified | Fix namespace |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `ExistsAsync` returns false due to query filter mismatch | Low | Use `.IgnoreQueryFilters()` variant in validator to match service behavior (superadmin bypass) |
| Validator `StoreExists` change breaks other validators using same pattern | Low | Only this validator uses `IGetStoreByIdService` for existence check |

## Rollback Plan

Revert each file independently. All changes are additive or replace existing code — no structural refactors. If one fix fails, the others remain valid.

## Dependencies

None.

## Success Criteria

- [ ] `GET /api/v1/stores/{id}` returns 200 with store including `ownerName` (no NRE)
- [ ] Handler class name matches query type (`GetStoreByIdQueryHandler`)
- [ ] No redundant `Task.FromResult` in handler
- [ ] Validator executes a lightweight `AnyAsync` query, not the full include query
- [ ] Swagger shows 401/403/400 response codes for the endpoint
- [ ] `GetStoreByIdService.cs` namespace matches file location
- [ ] Deleting a store between validation and execution returns 404, not NRE
