# Design: Approve / Disapprove Store Endpoint Fixes

## Technical Approach

Align both `ApproveStore` and `DisapproveStore` endpoints with the `DeactivateStore` precedent: remove the dead auth guard, replace over-fetching `GetStoreByIdIncludingModulesAsync` with lightweight `GetStoreByIdAsync`, add null check → 404, remove double-query `StoreExists` from validators, and add missing controller attributes (`[FromBody]`, XML docs, `[ProducesResponseType]`). Mirror all changes identically to both endpoints.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| 404 mechanism | `ApiException` with `HttpStatusCode.NotFound` | `ResponseResult.Failure<bool>` | Matches `DeactivateStoreCommandHandler` exactly — consistent exception middleware flow |
| Repository method | `GetStoreByIdAsync` (no includes) | `ExistsAsync` then `GetByIdAsync` | Single query, returns nullable `Store?`, respects query filters. `DeactivateStore` precedent. |
| Auth guard | Remove entirely | Keep as defense-in-depth | `[HasPermission(SuperAdmin)]` controller attribute enforces at framework level. DeactivateStore also uses same pattern (throws Forbidden, not 400). The `"UserNotFound"` + 400 BadRequest is misleading semantics. |
| Validator scope | Structural only (NotNull/NotEmpty) | Keep `StoreExists` | Handler is single gate for existence. Eliminates double DB query. Matches `DeactivateStoreValidator`. |

## Data Flow

```
Client → POST /approve → [HasPermission] → [FromBody] → Validator (NotNull/NotEmpty) → Handler
                                                                                          │
                                                                               _storeRepository.GetStoreByIdAsync
                                                                                          │
                                                                                    ┌──── null? ────→ ApiException 404
                                                                                    │ not null
                                                                              store.Approved = true
                                                                              _storeRepository.UpdateAsync
                                                                                          │
                                                                              _uow.SaveChangesAsync
                                                                                          │
                                                                              ResponseResult.Success(bool)
```

Same flow for `DisapproveStore` with `store.Approved = false`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `ApproveStoreCommand.cs` | Modify | Remove `_storeByIdService`, `_httpContextService`, `_localizer` fields. Remove auth guard. Replace `GetStoreByIdIncludingModulesAsync` with `GetStoreByIdAsync`. Add null check → 404. |
| `DisapproveStoreCommand.cs` | Modify | Same 4 changes as Approve. |
| `ApproveStoreCommandValidator.cs` | Modify | Remove `_storeByIdService` and `_localizer` fields. Remove `StoreExists` method and `.MustAsync()` rule. Keep only `NotNull().NotEmpty()`. |
| `DisapproveStoreCommandValidator.cs` | Modify | Same changes as Approve validator. |
| `StoresController.cs` | Modify | Add XML `<summary>`, `[FromBody]`, `[ProducesResponseType(400, 401, 403, 404)]` on both `ApproveStoreAsync` and `DisapproveStoreAsync`. |
| `StoreApproveTests.cs` | Modify | Rename `Approve_already_approved_returns_succeeded_data_false` → `..._true`. Change `Approve_unknown_store_returns_400_code_Id` → expects 404. |
| `StoreDisapproveTests.cs` | Modify | Rename `Disapprove_already_disapproved_returns_succeeded_data_false` → `..._true`. Change `Disapprove_unknown_store_returns_400_code_Id` → expects 404. |

## Interfaces / Contracts

No new interfaces. Consumes existing:
- `IStoreRepository.GetStoreByIdAsync(Guid)` → `Task<Store?>` (already exists at line 12 of `IStoreRepository.cs`)
- `IApplicationUnitOfWork.SaveChangesAsync(CancellationToken)` → `Task<int>`
- `IStoreRepository.UpdateAsync(Store)` → `Task`

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | Unknown store returns 404 | Update `Approve/Disapprove_unknown_store_returns_400_code_Id` to assert `HttpStatusCode.NotFound` instead of `BadRequest` |
| E2E | Already approved/disapproved test name | Rename both `_false` suffix tests to `_true` — assertion stays `BeTrue()` |
| E2E | Empty ID still returns 400 | No change — `Guid.Empty` fails structural validation. Both `_empty_id_returns_400_code_Id` tests stay as-is. |
| E2E | All existing tests pass | 8 Approve + 6 Disapprove tests must pass with zero behavioral regression |

## Migration / Rollout

No migration required. All changes are code-only. Rollback via `git revert <commit>`.

## Open Questions

None.
