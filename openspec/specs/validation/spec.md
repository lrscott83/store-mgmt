# Delta for validation: UpdateStoreCommandValidator

**Domain**: `validation` — `UpdateStoreCommandValidator.cs`  
**Change**: `update-store-endpoint-fixes`  
**Status**: Draft  
**Last Updated**: 2026-07-30

---

## REMOVED Requirements

### Requirement: VL1 — StoreExists Validation Rule

(Reason: The handler already loads the store via `GetStoreByIdIncludingModulesAsync` and throws `NotFoundException` if null. The validator's `StoreExists` rule was executing a second, redundant DB query — the same full include query — before the handler. Removing it eliminates a double DB round-trip per request.)

The `StoreExists` rule in `UpdateStoreCommandValidator` that calls `_storeByIdService.GetStoreByIdIncludingModulesAsync(query.Id)` MUST be removed. The validator MUST only validate the `Id` field for not-null/not-empty constraints.

## ADDED Requirements

### Requirement: VL2 — Id Structural Validation Only

The validator MUST keep `RuleFor(x => x.Id).NotEmpty()` and `RuleFor(x => x.Id).NotEqual(Guid.Empty)` but MUST NOT add any async existence check that queries the database.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty ID rejected | Request with default/empty GUID | Validation runs | Validation fails immediately, no DB query executed |
| 2b | Null ID rejected | Request with null GUID | Validation runs | Validation fails immediately, no DB query executed |
| 2c | Valid GUID passes structural validation | Request with non-empty GUID | Validation runs | Structural validation passes, no async existence check runs |
| 2d | Nonexistent store reaches handler | Request with valid GUID that doesn't exist in DB | Handler executes | Handler loads null store and returns 404 NotFound |

## MODIFIED Requirements

### Requirement: VL3 — Single DB Responsibility

The store existence check SHALL be the sole responsibility of the handler (which loads the store for its own use). The validator SHALL NOT duplicate this check.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Total DB queries reduced | Request with valid store ID | Full request flow | Exactly 1 DB query for store data (in handler), not 2 |
