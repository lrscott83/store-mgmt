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

---

## Delta for validation: ApproveStore + DisapproveStore

**Change**: `approve-store-endpoint-fixes`

---

## Decision: 400 vs 404 for Unknown Store

**Decision**: Follow DeactivateStore precedent — validator removes `StoreExists` rule, handler returns 404 when store not found.

| Aspect | Before | After |
|--------|--------|-------|
| Validator existence check | `StoreExists` calls `GetStoreByIdIncludingModulesAsync` | REMOVED — not present |
| Store not found response | 400 BadRequest (validation error, error code "Id") | 404 NotFound (resource not found) |
| DB queries per request | 2 (validator existence + handler load) | 1 (handler load only) |
| Source of truth | Validator double-checks handler's work | Handler is single gate |

## REMOVED Requirements (ApproveStore/DisapproveStore)

### SM-VL1 — StoreExists Async Validation Rule

The `StoreExists` rule (`MustAsync(StoreExists)`) and its backing `StoreExists` method MUST be removed from BOTH `ApproveStoreCommandValidator` and `DisapproveStoreCommandValidator`.

### SM-VL2 — `_storeByIdService` Dependency from Validator

With `StoreExists` removed, the `_storeByIdService` field and its constructor parameter MUST be removed from BOTH validators.

## ADDED Requirements (ApproveStore/DisapproveStore)

### SM-VL3 — Structural Validation Only

Both validators MUST keep `RuleFor(x => x.Id).NotNull().NotEmpty()` but MUST NOT add any database existence check.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Empty ID rejected | Request with `Id=Guid.Empty` | Validation runs | Fails immediately, no DB query |
| 3b | Null ID rejected | Request with `Id=null` | Validation runs | Fails immediately, no DB query |
| 3c | Valid GUID passes structural check | Request with valid non-empty GUID | Validation runs | Structural check passes, no async existence rule runs |
| 3d | Non-existent store reaches handler | Request with well-formed GUID not in DB | Handler executes | Handler returns 404, no validator error |

---

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

---

## Delta for validation: GetAllUsersQueryValidator (NEW)

**Change**: `2026-07-30-get-users-all-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: VL1 — New Validator Class at Project Conventional Path

A new `GetAllUsersQueryValidator` class SHALL be created at:
`Application/Features/UserManagement/Users/Queries/GetAllUsers/GetAllUsersQueryValidator.cs`

The class MUST extend `AbstractValidator<GetAllUsersQuery>` and follow the project convention (same namespace, same pattern as `GetUserByIdQueryValidator`). Since `GetAllUsersQuery` has only a non-nullable `bool IncludeInactive` property, the validator body MAY be empty or contain a structural `NotNull()` rule for consistency — no async DB existence check is needed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Validator exists | File system inspected | `GetAllUsers` query directory | `GetAllUsersQueryValidator.cs` present |
| 1b | Validation pipeline passes | Request with `includeInactive=true` | MediatR pipeline runs validator | No validation error (bool is always valid) |
| 1c | No DB query on validation | Any valid request | Validator executes | Zero DB queries from validator |

### Verification Criteria

- [ ] `GetAllUsersQueryValidator.cs` exists at the conventional path
- [ ] Class extends `AbstractValidator<GetAllUsersQuery>`
- [ ] No async existence check queries the database

---

## Delta for validation: SetMyStoreCommandValidator

**Change**: `2026-07-30-set-my-store-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: SM-VL1 — Existence Check Optimized to Lightweight Query

Replace the `IGetStoreByIdService.GetStoreByIdIncludingModulesAsync(storeId)` call (full aggregate load with joins) with `IStoreRepository.ExistsAsync(storeId)` (lightweight primary key lookup). The validator MUST also replace its constructor dependency from `IGetStoreByIdService` to `IStoreRepository`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Store exists via lightweight check | Valid store GUID in request | Validator runs `ExistsAsync` | Single PK lookup executed; validation passes |
| 1b | Store does not exist | Invalid store GUID in request | Validator runs `ExistsAsync` | Single PK lookup executed; validation fails with "StoreNotFound" |
| 1c | DB query reduction | Any valid request | Validator runs existence check | One lightweight query (< 5ms) replaces multi-join aggregate load |
| 1d | Constructor dependency swapped | Validator instantiated | DI resolves `IStoreRepository` | No `IGetStoreByIdService` dependency in validator |

### REMOVED Requirements

#### Requirement: SM-VL2 — Redundant .NotNull() on Guid

(Reason: `Guid` is a non-nullable value type — `.NotNull()` always passes and is dead code. Removes noise.)

The `.NotNull().WithMessage(...)` call on `RuleFor(x => x.StoreId)` MUST be deleted. Only `.NotEmpty()` SHALL remain for the structural check.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty GUID still rejected | Request with `Guid.Empty` | Validation runs | `.NotEmpty()` catches it; validation fails |
| 2b | Valid GUID still passes | Request with valid non-empty GUID | Validation runs | Structural validation passes; no `.NotNull()` in rule chain |

---

## Delta for validation: GetUserByIdQueryValidator

**Change**: `get-user-by-id-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: VL-G1 — Existence Check Uses Lightweight ExistsAsync

The `MustAsync(UserExists)` rule MUST call the new `IUserRepository.ExistsAsync(id)` (single `IgnoreQueryFilters().AnyAsync(u => u.Id == id)` PK lookup) instead of `GetByIdAsync`/`FindAsync` (full entity fetch with navigation materialization). One DB query per validation, no aggregate load.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing user GUID | Validation runs `ExistsAsync` | Single lightweight query executed; validation passes |
| 1b | User does not exist | Non-existent GUID | Validation runs `ExistsAsync` | Single lightweight query returns false; validation fails |
| 1c | No full fetch | Any request | Validator executes | No `GetByIdAsync`/`FindAsync`/Include-chain query issues from validator |

#### Requirement: VL-G2 — 400 Semantics Preserved for Non-Existent Id

The validator MUST retain 400 Bad Request as the contract response when validation fails (user does not exist). HTTP 404 remains reserved for the handler race guard only (command-handler delta CH-G1). Contract decision D1=A.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Non-existent id → 400 | Request with well-formed GUID not in DB | Validation fails | Endpoint returns 400 Bad Request (validation error), not 404 |
| 2b | Existing id passes | Valid GUID in DB | Validation runs | No validation error; handler proceeds |

### Verification Criteria

- [ ] Validator issues single `AnyAsync` query — zero `GetByIdAsync`/`FindAsync` calls (finding 2)
- [ ] Non-existent id still returns 400 — no contract change for the non-race path

---

## Delta for validation: UpdateUserCommandValidator

**Change**: `update-user-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: VL-U1 — Existence Check Uses Existing Lightweight ExistsAsync

The existence rule MUST call the existing `IUserRepository.ExistsAsync(userId, cancellationToken)` (single `IgnoreQueryFilters().AnyAsync` PK lookup — added by the GET change, NO new method) instead of `GetByIdAsync`/`FindAsync` (full entity fetch with navigation materialization). The misleading `tenantId` parameter MUST be renamed `userId`, and the request `cancellationToken` MUST be propagated to the call.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing user GUID | Validator runs `ExistsAsync(userId, ct)` | Single lightweight query executed; validation passes |
| 1b | User does not exist | Non-existent GUID | Validator runs `ExistsAsync` | Single lightweight query returns false; validation fails → 400 |
| 1c | No full fetch | Any request | Validator executes | No `GetByIdAsync`/`FindAsync`/Include-chain query issues from validator |
| 1d | Param renamed | Validator source inspected | Existence-check method signature | Parameter named `userId` — not `tenantId` |

#### Requirement: VL-U2 — FullName and Email Rules Preserved, Email Format Conditional on Non-Empty

FullName MUST remain required (`NotNull().NotEmpty()`). The Email format rule MUST remain, but SHALL apply only when the value is non-empty — `null` (absent) and `""` MUST bypass the format check so the tri-state clear (D2, `""` → null) is not blocked by a format failure.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FullName missing | Body `{}` or missing FullName | Validation runs | Fails → 400 |
| 2b | Email format | Body `email: "not-an-email"` | Validation runs | Format rule fires → fails → 400 |
| 2c | Email empty allowed | Body `email: ""` | Validation runs | Format rule skipped; value cleared downstream |
| 2d | Email absent allowed | Body omits email | Validation runs | No rule fires; value kept unchanged |

#### Requirement: VL-U3 — IsActive Has No Validator Rule

`bool? IsActive` MUST have NO validator rule — a nullable bool is structurally always valid. Its semantics are enforced exclusively by the handler guard (CH-U4).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Any bool? accepted | Body omits isActive, or sends `true`, or sends `false` | Validation runs | No validation error originating from isActive |

### Verification Criteria

- [ ] Validator issues single `ExistsAsync(userId, ct)` — zero `GetByIdAsync`/`FindAsync` calls
- [ ] Parameter renamed `userId`; `cancellationToken` propagated
- [ ] FullName `NotNull().NotEmpty()` present; Email format rule conditional on non-empty
- [ ] No rule targets `IsActive`

---

## Delta for validation: DeleteUserCommandValidator

**Change**: `delete-user-endpoint-fixes`

---

### REMOVED Requirements

#### Requirement: VL-D1 — UserExists Async Validation Rule (F2)

(Reason: `MustAsync(UserExists)` executes a redundant `GetByIdAsync(tenantId)` DB query before the handler's own load — a double round-trip per request. Worse, it fails with 400 for non-existent ids, making the handler's real 404 (CH-D3) UNREACHABLE. It must be removed for D1 to fire. Mirrors `delete-store-endpoint-fixes` VL1/VL3/VL4 — NOT the UpdateUser `ExistsAsync` pattern, which belongs to the 400 contract.)

The `MustAsync(UserExists)` rule, the `UserExists` method, the `_userRepository` field, and the `using Domain.Interfaces.Repositories;` import MUST be removed. The constructor MUST drop `IUserRepository`. `ExistsAsync` MUST NOT be added as a replacement.

### ADDED Requirements

#### Requirement: VL-D2 — Structural Validation Only, No DB Query

The validator MUST keep `RuleFor(x => x.Id).NotNull()` and `RuleFor(x => x.Id).NotEmpty()` — exact mirror of `DeactivateStoreCommandValidator` — and MUST NOT contain any existence check that queries the database.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty id rejected | `Id = Guid.Empty` | Validation runs | Fails immediately; no DB query |
| 2b | Null id rejected | `Id = null` | Validation runs | Fails immediately; no DB query |
| 2c | Valid GUID passes | Non-empty GUID | Validation runs | Structural check passes; no async rule runs |

#### Requirement: VL-D3 — Single DB Responsibility (404 Reachability)

The user existence check SHALL be the sole responsibility of the handler (CH-D3). The validator SHALL NOT duplicate this check — this is the mechanism that guarantees a non-existent id reaches the handler and returns HTTP 404, not 400.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 404 reachable | Valid GUID, user absent | Full request flow | Exactly 1 DB query (handler); HTTP 404 returned |
| 3b | No validator query | Any request | Validation executes | Zero DB queries from validator |

### Verification Criteria

- [x] No `MustAsync` / `ExistsAsync` / `GetByIdAsync` in validator; no `IUserRepository` dependency
- [x] Only `NotNull().NotEmpty()` rules remain
- [x] `Delete_nonexistent_returns_404` passes (404 reachable — E2E 5/5 GREEN)

---

## Delta for validation: ActivateUserCommandValidator

**Change**: `activate-user-endpoint-fixes`

> **Scope amendment (user decision)**: `ActivateStoreCommandValidator` is **OUT OF SCOPE** — its `StoreExists` double-query rule stays as-is; the debt is noted in the plan doc only.

---

### REMOVED Requirements

#### Requirement: VL-A1 — UserExists Async Validation Rule (F4)

(Reason: `MustAsync(UserExists)` executes a redundant `GetByIdAsync(tenantId)` DB query before the handler's own load — a double round-trip per request. Worse, it fails with 400 for non-existent ids, so `ValidationBehaviour` (→400) pre-empts the handler's real 404 (CH-A3). Removal is REQUIRED for the 404 to be reachable. Mirrors `delete-user-endpoint-fixes` VL-D1 — NOT the UpdateUser `ExistsAsync` pattern, which belongs to the 400 contract.)

The `MustAsync(UserExists)` rule, the `UserExists` method, the `_userRepository` field, and the `using Domain.Interfaces.Repositories;` import MUST be removed. The constructor MUST drop `IUserRepository`. `ExistsAsync` MUST NOT be added as a replacement.

### ADDED Requirements

#### Requirement: VL-A2 — Structural Validation Only, No DB Query

The validator MUST keep `RuleFor(x => x.Id).NotNull()` and `RuleFor(x => x.Id).NotEmpty()`, and MUST retain `_localizer`, `using Microsoft.Extensions.Localization;`, and `using Resources;`. It MUST NOT contain any existence check that queries the database.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty id rejected | `Id = Guid.Empty` | Validation runs | Fails immediately; no DB query |
| 2b | Null id rejected | `Id = null` | Validation runs | Fails immediately; no DB query |
| 2c | Valid GUID passes | Non-empty GUID | Validation runs | Structural check passes; no async rule runs |

#### Requirement: VL-A3 — Single DB Responsibility (404 Reachability)

The user existence check SHALL be the sole responsibility of the handler (CH-A3). The validator SHALL NOT duplicate this check — this is the mechanism that guarantees a non-existent id reaches the handler and returns HTTP 404, not 400.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 404 reachable | Valid GUID, user absent | Full request flow | Exactly 1 DB query (handler); HTTP 404 returned |
| 3b | No validator query | Any request | Validation executes | Zero DB queries from validator |

### Verification Criteria

- [x] No `MustAsync` / `ExistsAsync` / `GetByIdAsync` in validator; no `IUserRepository` dependency
- [x] Only `NotNull().NotEmpty()` rules remain; `_localizer` + usings retained
- [x] `Activate_nonexistent_returns_404` passes (404 reachable — E2E 4/4 GREEN)

---

## Delta for validation: AddUserRoles + DeleteUserRoles Command Validators

**Change**: `user-roles-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: VL-R1 — AddUserRoles UserExists Uses Lightweight ExistsAsync

The `MustAsync(UserExists)` rule on `UserId` MUST call `IUserRepository.ExistsAsync(userId, cancellationToken)` (single `IgnoreQueryFilters().AnyAsync` PK lookup — `UserRepository.cs:99-102`) instead of `GetByIdAsync` (full entity fetch). The `UserNotFound` message, the 400 contract, the `RoleIds` visibility rule (`AreVisibleRolesToCurrentUser`, `RoleNotFound` message), and existing dependencies MUST be preserved; no new dependencies.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing user GUID | Validator runs `ExistsAsync(userId, ct)` | Single lightweight query; validation passes |
| 1b | User absent | Non-existent GUID | Validator runs `ExistsAsync` | Single query returns false; validation fails → 400 `UserNotFound` |
| 1c | No full fetch | Any request | Validator executes | Zero `GetByIdAsync`/`FindAsync` calls from validator |

#### Requirement: VL-R2 — DeleteUserRoles UserExists Uses Lightweight ExistsAsync, Batch Logic Unchanged

The same `GetByIdAsync` → `ExistsAsync` swap MUST be applied to `DeleteUserRolesCommandValidator`. The `RoleIds` rules (`NotNull().NotEmpty()`) and the handler's batch removal (`GetActiveUserRolesByIds` — soft-deactivate matching rows) MUST NOT change behavior.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | User exists | Valid existing user GUID | Validator runs `ExistsAsync` | Single query; validation passes |
| 2b | User absent | Non-existent GUID | Validator runs `ExistsAsync` | Fails → 400 `UserNotFound` |
| 2c | Batch semantics kept | User + active matching role rows | Delete flow executes | Exactly the matching active rows soft-deactivated; response 200 |

#### Requirement: VL-R3 — Non-Existent RoleId Fails Validation → 400 (Not 500)

With the VisibleRoleService null-guard (CH-R4), an AddUserRoles request whose `RoleIds` contains a non-existent role MUST fail the `AreVisibleRolesToCurrentUser` rule → 400 `RoleNotFound` (today: 500 NRE). Duplicate RoleIds MUST still pass validation (dedup is the handler's job, CH-R2).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Bad RoleId | `RoleIds` contains non-existent role | Validation runs | Fails → 400 `RoleNotFound`; no 500 |
| 3b | Duplicate RoleIds | `RoleIds = [5, 5]`, both visible | Validation runs | Passes; handler dedups (CH-R2) |

### Verification Criteria

- [x] Both validators issue single `ExistsAsync(userId, ct)`; zero `GetByIdAsync`/`FindAsync`
- [x] DeleteUserRoles handler batch logic untouched (VL-R2)
- [x] Non-existent RoleId → 400 (no 500); duplicate RoleIds pass validation — `Add_roles_with_nonexistent_role_id_returns_400` + `Add_roles_with_duplicate_role_ids_returns_200_single_row` GREEN (verify re-run 2026-08-01)
