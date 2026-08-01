# Delta for validation: DeleteUserCommandValidator

**Domain**: `validation` — `DeleteUserCommandValidator.cs`
**Change**: `delete-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## REMOVED Requirements

### Requirement: VL-D1 — UserExists Async Validation Rule (F2)

(Reason: `MustAsync(UserExists)` executes a redundant `GetByIdAsync(tenantId)` DB query before the handler's own load — a double round-trip per request. Worse, it fails with 400 for non-existent ids, making the handler's real 404 (CH-D3) UNREACHABLE. It must be removed for D1 to fire. Mirrors `delete-store-endpoint-fixes` VL1/VL3/VL4 — NOT the UpdateUser `ExistsAsync` pattern, which belongs to the 400 contract.)

The `MustAsync(UserExists)` rule, the `UserExists` method, the `_userRepository` field, and the `using Domain.Interfaces.Repositories;` import MUST be removed. The constructor MUST drop `IUserRepository`. `ExistsAsync` MUST NOT be added as a replacement.

## ADDED Requirements

### Requirement: VL-D2 — Structural Validation Only, No DB Query

The validator MUST keep `RuleFor(x => x.Id).NotNull()` and `RuleFor(x => x.Id).NotEmpty()` — exact mirror of `DeactivateStoreCommandValidator` — and MUST NOT contain any existence check that queries the database.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty id rejected | `Id = Guid.Empty` | Validation runs | Fails immediately; no DB query |
| 2b | Null id rejected | `Id = null` | Validation runs | Fails immediately; no DB query |
| 2c | Valid GUID passes | Non-empty GUID | Validation runs | Structural check passes; no async rule runs |

### Requirement: VL-D3 — Single DB Responsibility (404 Reachability)

The user existence check SHALL be the sole responsibility of the handler (CH-D3). The validator SHALL NOT duplicate this check — this is the mechanism that guarantees a non-existent id reaches the handler and returns HTTP 404, not 400.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 404 reachable | Valid GUID, user absent | Full request flow | Exactly 1 DB query (handler); HTTP 404 returned |
| 3b | No validator query | Any request | Validation executes | Zero DB queries from validator |

## Verification Criteria

- [ ] No `MustAsync` / `ExistsAsync` / `GetByIdAsync` in validator; no `IUserRepository` dependency
- [ ] Only `NotNull().NotEmpty()` rules remain
- [ ] `Delete_nonexistent_returns_404` passes (404 reachable)
