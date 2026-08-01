# Delta for validation: ActivateUserCommandValidator

**Domain**: `validation` — `ActivateUserCommandValidator.cs`
**Change**: `activate-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

> **Scope amendment (user decision)**: `ActivateStoreCommandValidator` is **OUT OF SCOPE** — its `StoreExists` double-query rule stays as-is; the debt is noted in the plan doc only.

---

## REMOVED Requirements

### Requirement: VL-A1 — UserExists Async Validation Rule (F4)

(Reason: `MustAsync(UserExists)` executes a redundant `GetByIdAsync(tenantId)` DB query before the handler's own load — a double round-trip per request. Worse, it fails with 400 for non-existent ids, so `ValidationBehaviour` (→400) pre-empts the handler's real 404 (CH-A3). Removal is REQUIRED for the 404 to be reachable. Mirrors `delete-user-endpoint-fixes` VL-D1 — NOT the UpdateUser `ExistsAsync` pattern, which belongs to the 400 contract.)

The `MustAsync(UserExists)` rule, the `UserExists` method, the `_userRepository` field, and the `using Domain.Interfaces.Repositories;` import MUST be removed. The constructor MUST drop `IUserRepository`. `ExistsAsync` MUST NOT be added as a replacement.

## ADDED Requirements

### Requirement: VL-A2 — Structural Validation Only, No DB Query

The validator MUST keep `RuleFor(x => x.Id).NotNull()` and `RuleFor(x => x.Id).NotEmpty()`, and MUST retain `_localizer`, `using Microsoft.Extensions.Localization;`, and `using Resources;`. It MUST NOT contain any existence check that queries the database.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty id rejected | `Id = Guid.Empty` | Validation runs | Fails immediately; no DB query |
| 2b | Null id rejected | `Id = null` | Validation runs | Fails immediately; no DB query |
| 2c | Valid GUID passes | Non-empty GUID | Validation runs | Structural check passes; no async rule runs |

### Requirement: VL-A3 — Single DB Responsibility (404 Reachability)

The user existence check SHALL be the sole responsibility of the handler (CH-A3). The validator SHALL NOT duplicate this check — this is the mechanism that guarantees a non-existent id reaches the handler and returns HTTP 404, not 400.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 404 reachable | Valid GUID, user absent | Full request flow | Exactly 1 DB query (handler); HTTP 404 returned |
| 3b | No validator query | Any request | Validation executes | Zero DB queries from validator |

## Verification Criteria

- [ ] No `MustAsync` / `ExistsAsync` / `GetByIdAsync` in validator; no `IUserRepository` dependency
- [ ] Only `NotNull().NotEmpty()` rules remain; `_localizer` + usings retained
- [ ] `Activate_nonexistent_returns_404` passes (404 reachable)
