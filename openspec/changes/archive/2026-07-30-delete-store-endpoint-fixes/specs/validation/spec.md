# Delta for validation: DeactivateStoreCommandValidator

**Domain**: `validation` — `DeactivateStoreCommandValidator.cs`  
**Change**: `delete-store-endpoint-fixes`  
**Status**: Draft  

## REMOVED Requirements

### Requirement: VL1 — StoreExists Validation Rule

(Reason: The handler now loads the store via lightweight `GetStoreByIdAsync` and returns 404 if null. The validator's `StoreExists` rule was executing a redundant, expensive DB query — loading the full entity graph with includes — before the handler. Removing it eliminates a double DB round-trip per request.)

The `MustAsync(StoreExists)` rule in `DeactivateStoreCommandValidator` that calls `_storeByIdService.GetStoreByIdIncludingModulesAsync(storeId)` MUST be removed. The corresponding `StoreExists` method and the `using Domain.Interfaces.Repositories;` import MUST also be removed.

### Requirement: VL2 — Unused Import Removed

The `using Domain.Interfaces.Repositories;` import in `DeactivateStoreCommandValidator.cs` serves no purpose after removing the `StoreExists` rule and MUST be deleted.

## ADDED Requirements

### Requirement: VL3 — Id Structural Validation Only

The validator MUST keep `RuleFor(x => x.Id).NotNull()` and `RuleFor(x => x.Id).NotEmpty()` but MUST NOT add any async existence check that queries the database.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Empty ID rejected | Request with default/empty GUID | Validation runs | Validation fails immediately, no DB query executed |
| 3b | Null ID rejected | Request with null GUID | Validation runs | Validation fails immediately, no DB query executed |
| 3c | Valid GUID passes structural validation | Request with non-empty GUID | Validation runs | Structural validation passes, no async existence check runs |
| 3d | Nonexistent store reaches handler | Request with valid GUID that doesn't exist in DB | Handler executes | Handler loads null store and returns 404 NotFound |

## MODIFIED Requirements

### Requirement: VL4 — Single DB Responsibility

The store existence check SHALL be the sole responsibility of the handler (which loads the store for its own use). The validator SHALL NOT duplicate this check.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Total DB queries reduced | Request with valid store ID | Full request flow | Exactly 1 DB query for store data (in handler), not 2 |
