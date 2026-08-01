# Delta for validation: AddUserRoles + DeleteUserRoles Command Validators

**Domain**: `validation` — `AddUserRolesCommandValidator.cs` + `DeleteUserRolesCommandValidator.cs`
**Change**: `user-roles-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-01

---

## MODIFIED Requirements

### Requirement: VL-R1 — AddUserRoles UserExists Uses Lightweight ExistsAsync

The `MustAsync(UserExists)` rule on `UserId` MUST call `IUserRepository.ExistsAsync(userId, cancellationToken)` (single `IgnoreQueryFilters().AnyAsync` PK lookup — `UserRepository.cs:99-102`) instead of `GetByIdAsync` (full entity fetch). The `UserNotFound` message, the 400 contract, the `RoleIds` visibility rule (`AreVisibleRolesToCurrentUser`, `RoleNotFound` message), and existing dependencies MUST be preserved; no new dependencies.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing user GUID | Validator runs `ExistsAsync(userId, ct)` | Single lightweight query; validation passes |
| 1b | User absent | Non-existent GUID | Validator runs `ExistsAsync` | Single query returns false; validation fails → 400 `UserNotFound` |
| 1c | No full fetch | Any request | Validator executes | Zero `GetByIdAsync`/`FindAsync` calls from validator |

### Requirement: VL-R2 — DeleteUserRoles UserExists Uses Lightweight ExistsAsync, Batch Logic Unchanged

The same `GetByIdAsync` → `ExistsAsync` swap MUST be applied to `DeleteUserRolesCommandValidator`. The `RoleIds` rules (`NotNull().NotEmpty()`) and the handler's batch removal (`GetActiveUserRolesByIds` — soft-deactivate matching rows) MUST NOT change behavior.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | User exists | Valid existing user GUID | Validator runs `ExistsAsync` | Single query; validation passes |
| 2b | User absent | Non-existent GUID | Validator runs `ExistsAsync` | Fails → 400 `UserNotFound` |
| 2c | Batch semantics kept | User + active matching role rows | Delete flow executes | Exactly the matching active rows soft-deactivated; response 200 |

### Requirement: VL-R3 — Non-Existent RoleId Fails Validation → 400 (Not 500)

With the VisibleRoleService null-guard (CH-R4), an AddUserRoles request whose `RoleIds` contains a non-existent role MUST fail the `AreVisibleRolesToCurrentUser` rule → 400 `RoleNotFound` (today: 500 NRE). Duplicate RoleIds MUST still pass validation (dedup is the handler's job, CH-R2).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Bad RoleId | `RoleIds` contains non-existent role | Validation runs | Fails → 400 `RoleNotFound`; no 500 |
| 3b | Duplicate RoleIds | `RoleIds = [5, 5]`, both visible | Validation runs | Passes; handler dedups (CH-R2) |

## Verification Criteria

- [ ] Both validators issue single `ExistsAsync(userId, ct)`; zero `GetByIdAsync`/`FindAsync`
- [ ] DeleteUserRoles handler batch logic untouched (VL-R2)
- [ ] Non-existent RoleId → 400 (no 500); duplicate RoleIds pass validation
