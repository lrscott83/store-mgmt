# Delta for validation: SetMyStoreCommandValidator

**Domain**: `validation` — `SetMyStoreCommandValidator.cs`
**Change**: `2026-07-30-set-my-store-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## MODIFIED Requirements

### Requirement: SM-VL1 — Existence Check Optimized to Lightweight Query

Replace the `IGetStoreByIdService.GetStoreByIdIncludingModulesAsync(storeId)` call (full aggregate load with joins) with `IStoreRepository.ExistsAsync(storeId)` (lightweight primary key lookup). The validator MUST also replace its constructor dependency from `IGetStoreByIdService` to `IStoreRepository`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Store exists via lightweight check | Valid store GUID in request | Validator runs `ExistsAsync` | Single PK lookup executed; validation passes |
| 1b | Store does not exist | Invalid store GUID in request | Validator runs `ExistsAsync` | Single PK lookup executed; validation fails with "StoreNotFound" |
| 1c | DB query reduction | Any valid request | Validator runs existence check | One lightweight query (< 5ms) replaces multi-join aggregate load |
| 1d | Constructor dependency swapped | Validator instantiated | DI resolves `IStoreRepository` | No `IGetStoreByIdService` dependency in validator |

## REMOVED Requirements

### Requirement: SM-VL2 — Redundant .NotNull() on Guid

(Reason: `Guid` is a non-nullable value type — `.NotNull()` always passes and is dead code. Removes noise.)

The `.NotNull().WithMessage(...)` call on `RuleFor(x => x.StoreId)` MUST be deleted. Only `.NotEmpty()` SHALL remain for the structural check.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty GUID still rejected | Request with `Guid.Empty` | Validation runs | `.NotEmpty()` catches it; validation fails |
| 2b | Valid GUID still passes | Request with valid non-empty GUID | Validation runs | Structural validation passes; no `.NotNull()` in rule chain |
