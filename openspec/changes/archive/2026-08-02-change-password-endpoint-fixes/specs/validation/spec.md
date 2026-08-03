# Delta for validation: UpdateUserPasswordCommandValidator

**Domain**: `validation` — `UpdateUserPasswordCommandValidator.cs`
**Change**: `change-password-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## MODIFIED Requirements

### Requirement: VL-CPW1 — UserExists Swaps GetByIdAsync → ExistsAsync

The `MustAsync(UserExists)` rule on `UserId` MUST call `IUserRepository.ExistsAsync(userId, cancellationToken)` (single lightweight `IgnoreQueryFilters().AnyAsync` PK lookup — same pattern as `UpdateUserCommandValidator.cs:33-36`) instead of `GetByIdAsync(tenantId) != null` (`:40`). Eliminates the full entity fetch + the double round-trip with the handler load (finding #5). The `UserNotFound` message and the 400 contract MUST be preserved; cancellation token MUST be propagated.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing GUID | Validator runs `ExistsAsync(userId, ct)` | Single lightweight query; passes |
| 1b | User absent | Non-existent GUID | Validator runs `ExistsAsync` | Fails → 400 `UserNotFound` |
| 1c | No full fetch | Any request | Validator executes | Zero `GetByIdAsync`/`FindAsync` calls from validator |

### Requirement: VL-CPW2 — Misnamed Param `tenantId` Renamed to `userId`

The `UserExists` helper parameter MUST be renamed from `tenantId` to `userId` (`UpdateUserPasswordCommandValidator.cs:38`) — the parameter is a user id, not a tenant id; the misname hides the cross-tenant bug class.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Correct name | Validator source inspected | `UserExists` signature | Parameter named `userId` (Guid) |

### Requirement: VL-CPW3 — NewPassword Enforces Password Policy (8 + Uppercase)

The `NewPassword` rule MUST add `.MinimumLength(8)` with `_localizer["PasswordMinLength", "{PropertyName}", 8]` and `password.Any(char.IsUpper)` with `_localizer["PasswordRequiresUppercase", "{PropertyName}"]`, mirroring `RegisterCommandValidator.cs:22-26`. The `NotNull`/`NotEmpty` rules MUST be retained. Requires keys `PasswordMinLength` + `PasswordRequiresUppercase` to be added to BOTH `I18n.resx` and `I18n.en.resx` (decision D9 — also fixes the latent register fallback to literal key names).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Too short | NewPassword = 7 chars | Validator runs | Fails → 400 with `PasswordMinLength` key |
| 3b | No uppercase | NewPassword = `"alllowercase123"` | Validator runs | Fails → 400 with `PasswordRequiresUppercase` key |
| 3c | Policy parity | Register validator policy | NewPassword rule compared | Same MinimumLength(8) + uppercase rules |

### Requirement: VL-CPW4 — OldPassword/NewPassword Required Rules Retained; Validation → Real HTTP 400

`OldPassword` and `NewPassword` MUST keep `NotNull().NotEmpty()` with `IsRequired` messages. The FluentValidation pipeline (`ValidationBehaviour` → `ValidationException`) MUST surface as a REAL HTTP 400 (FluentValidation interceptor — no 200+envelope for validation failures).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Missing old password | `oldPassword` omitted/null | POST `change-password/{id}` | HTTP 400 |
| 4b | Missing new password | `newPassword` omitted/null | POST `change-password/{id}` | HTTP 400 |
| 4c | Pipeline status | Any validation failure | ValidationBehaviour runs | Throws `ValidationException` → real HTTP 400 |

## Verification Criteria

- [ ] Validator issues single `ExistsAsync(userId, ct)`; zero `GetByIdAsync`/`FindAsync`
- [ ] Param named `userId`
- [ ] NewPassword policy byte-matches Register (8 + uppercase) with the 2 resx keys in BOTH files
- [ ] Missing OldPassword/NewPassword → 400; weak NewPassword → 400 with localized key
