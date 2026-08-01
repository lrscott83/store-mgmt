# Delta for command-handler: ApproveStore + DisapproveStore

**Domain**: `command-handler` — `ApproveStoreCommand.cs`, `DisapproveStoreCommand.cs`  
**Change**: `approve-store-endpoint-fixes`  
**Precedent**: `DeactivateStoreCommand.cs` (delete-store) — lightweight query, null check → 404, removed StoreExists from validator

---

## REMOVED Requirements

### SM-CH1 — Dead `IsSuperAdminOrOwnerAdmin` Auth Guard

(Reason: The `[HasPermission(StoreRoleFeatures.SuperAdmin)]` attribute on the controller action enforces this at the framework level — a request that reaches the handler is already authorized. The in-handler check is dead code.)

The `_httpContextService.IsSuperAdminOrOwnerAdmin` guard that throws `ApiException` with `HttpStatusCode.BadRequest` MUST be removed from BOTH `ApproveStoreCommandHandler.Handle` and `DisapproveStoreCommandHandler.Handle`.

### SM-CH2 — Over-fetching via `GetStoreByIdIncludingModulesAsync`

(Reason: Approve/Disapprove only toggle `Store.Approved` — no related entities are needed. The include query wastes a JOIN.)

The call to `_storeByIdService.GetStoreByIdIncludingModulesAsync(id)` MUST be replaced with `_storeRepository.GetStoreByIdAsync(id)` (lighter query, no `.Include()`).

### SM-CH4 — Unused Constructor Dependencies

If removing the auth guard and the include-query service leaves `_httpContextService`, `_storeByIdService`, or `_localizer` unused, those fields and their constructor parameters MUST be removed.

---

## ADDED Requirements

### SM-CH3 — Null Check Returns 404 Not Found

After fetching the store, BOTH handlers MUST check for null and return a 404 Not Found response (via `ResponseResult.Failure<bool>` or `ApiException` with `HttpStatusCode.NotFound`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Valid store | Store exists in DB | Handler executes | Store fetched, `Approved` toggled, saved, succeeded=true |
| 3b | Non-existent store | Store ID not in DB | Handler executes | `GetStoreByIdAsync` returns null, handler returns 404 NotFound |

### SM-CH5 through SM-CH8 — Mirror All Changes to DisapproveStoreCommandHandler

SM-CH1 through SM-CH4 SHALL be applied identically to `DisapproveStoreCommandHandler`. The two handlers MUST have identical structure (same deps, same null check, same lightweight query).

---

## MODIFIED Requirements

### SM-CH5 — Already-Approved/Disapproved Behavior

When a store is already approved and `ApproveStore` is called again, the handler still sets `store.Approved = true` and calls `UpdateAsync`. EF marks the entity as Modified even if the value doesn't change, so `SaveChangesAsync` returns > 0. **Behavior is unchanged**: the response still returns `succeeded=true, data=true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Already approved | Store with `Approved=true` | ApproveStore called | Store.Approved stays true, response: succeeded=true, data=true |
| 5b | Already disapproved | Store with `Approved=false` | DisapproveStore called | Store.Approved stays false, response: succeeded=true, data=true |

---

## Verification Criteria

- [ ] `ApproveStoreCommandHandler` has no `IsSuperAdminOrOwnerAdmin` check
- [ ] `ApproveStoreCommandHandler` uses `_storeRepository.GetStoreByIdAsync(id)` not `_storeByIdService.GetStoreByIdIncludingModulesAsync(id)`
- [ ] `ApproveStoreCommandHandler` has null check → 404 after fetch
- [ ] Unused `_httpContextService`, `_storeByIdService`, `_localizer` removed from constructor
- [ ] Same 4 checks pass for `DisapproveStoreCommandHandler`
