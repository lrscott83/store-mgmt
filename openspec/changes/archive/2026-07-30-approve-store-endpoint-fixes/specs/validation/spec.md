# Delta for validation: ApproveStore + DisapproveStore

**Domain**: `validation` — `ApproveStoreCommandValidator.cs`, `DisapproveStoreCommandValidator.cs`  
**Change**: `approve-store-endpoint-fixes`  
**Precedent**: `DeactivateStoreCommandValidator.cs` (delete-store) — removed `StoreExists` rule entirely, kept only `NotNull`/`NotEmpty`

---

## Decision: 400 vs 404 for Unknown Store

**Decision**: Follow DeactivateStore precedent — validator removes `StoreExists` rule, handler returns 404 when store not found.

| Aspect | Before | After |
|--------|--------|-------|
| Validator existence check | `StoreExists` calls `GetStoreByIdIncludingModulesAsync` | REMOVED — not present |
| Store not found response | 400 BadRequest (validation error, error code "Id") | 404 NotFound (resource not found) |
| DB queries per request | 2 (validator existence + handler load) | 1 (handler load only) |
| Source of truth | Validator double-checks handler's work | Handler is single gate |

**Why this approach was chosen**:
1. Removes double-DB-query (performance)
2. Removes over-fetching of includes (the existence check used the same heavy include query)
3. Aligns with DeactivateStore precedent
4. HTTP semantics: a store that doesn't exist at time of request is 404, not 400

---

## REMOVED Requirements

### SM-VL1 — StoreExists Async Validation Rule

(Reason: The handler now owns the existence check via `GetStoreByIdAsync` + null check → 404. The validator's `StoreExists` rule duplicated this with a heavier include query.)

The `StoreExists` rule (`MustAsync(StoreExists)`) and its backing `StoreExists` method MUST be removed from BOTH `ApproveStoreCommandValidator` and `DisapproveStoreCommandValidator`.

### SM-VL2 — `_storeByIdService` Dependency from Validator

With `StoreExists` removed, the `_storeByIdService` field and its constructor parameter MUST be removed from BOTH validators.

---

## ADDED Requirements

### SM-VL3 — Structural Validation Only

Both validators MUST keep `RuleFor(x => x.Id).NotNull().NotEmpty()` but MUST NOT add any database existence check.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Empty ID rejected | Request with `Id=Guid.Empty` | Validation runs | Fails immediately, no DB query |
| 3b | Null ID rejected | Request with `Id=null` | Validation runs | Fails immediately, no DB query |
| 3c | Valid GUID passes structural check | Request with valid non-empty GUID | Validation runs | Structural check passes, no async existence rule runs |
| 3d | Non-existent store reaches handler | Request with well-formed GUID not in DB | Handler executes | Handler returns 404, no validator error |

---

## Verification Criteria

- [ ] `ApproveStoreCommandValidator` has no `StoreExists` rule, no `MustAsync` call
- [ ] `ApproveStoreCommandValidator` has no `_storeByIdService` field or param
- [ ] Same 2 checks pass for `DisapproveStoreCommandValidator`
- [ ] Both validators only have `NotNull().NotEmpty()` on `Id`
