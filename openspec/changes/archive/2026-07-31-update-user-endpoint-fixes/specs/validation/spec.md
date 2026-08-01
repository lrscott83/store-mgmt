# Delta for validation: UpdateUserCommandValidator

**Domain**: `validation` — `UpdateUserCommandValidator.cs`
**Change**: `update-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: VL-U1 — Existence Check Uses Existing Lightweight ExistsAsync

The existence rule MUST call the existing `IUserRepository.ExistsAsync(userId, cancellationToken)` (single `IgnoreQueryFilters().AnyAsync` PK lookup — added by the GET change, NO new method) instead of `GetByIdAsync`/`FindAsync` (full entity fetch with navigation materialization). The misleading `tenantId` parameter MUST be renamed `userId`, and the request `cancellationToken` MUST be propagated to the call.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing user GUID | Validator runs `ExistsAsync(userId, ct)` | Single lightweight query executed; validation passes |
| 1b | User does not exist | Non-existent GUID | Validator runs `ExistsAsync` | Single lightweight query returns false; validation fails → 400 |
| 1c | No full fetch | Any request | Validator executes | No `GetByIdAsync`/`FindAsync`/Include-chain query issues from validator |
| 1d | Param renamed | Validator source inspected | Existence-check method signature | Parameter named `userId` — not `tenantId` |

### Requirement: VL-U2 — FullName and Email Rules Preserved, Email Format Conditional on Non-Empty

FullName MUST remain required (`NotNull().NotEmpty()`). The Email format rule MUST remain, but SHALL apply only when the value is non-empty — `null` (absent) and `""` MUST bypass the format check so the tri-state clear (D2, `""` → null) is not blocked by a format failure.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FullName missing | Body `{}` or missing FullName | Validation runs | Fails → 400 |
| 2b | Email format | Body `email: "not-an-email"` | Validation runs | Format rule fires → fails → 400 |
| 2c | Email empty allowed | Body `email: ""` | Validation runs | Format rule skipped; value cleared downstream |
| 2d | Email absent allowed | Body omits email | Validation runs | No rule fires; value kept unchanged |

### Requirement: VL-U3 — IsActive Has No Validator Rule

`bool? IsActive` MUST have NO validator rule — a nullable bool is structurally always valid. Its semantics are enforced exclusively by the handler guard (CH-U4).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Any bool? accepted | Body omits isActive, or sends `true`, or sends `false` | Validation runs | No validation error originating from isActive |

## Verification Criteria

- [ ] Validator issues single `ExistsAsync(userId, ct)` — zero `GetByIdAsync`/`FindAsync` calls
- [ ] Parameter renamed `userId`; `cancellationToken` propagated
- [ ] FullName `NotNull().NotEmpty()` present; Email format rule conditional on non-empty
- [ ] No rule targets `IsActive`
