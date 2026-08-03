# Delta for command-handler: UpdateStoreCommand

**Domain**: `command-handler` — `UpdateStoreCommand.cs`  
**Change**: `update-store-endpoint-fixes`  
**Status**: Draft  
**Last Updated**: 2026-07-30

---

---

## Delta for command-handler: ApproveStore + DisapproveStore

**Change**: `approve-store-endpoint-fixes`

---

## ADDED Requirements (ApproveStore/DisapproveStore)

### SM-CH3 — Null Check Returns 404 Not Found

After fetching the store, BOTH handlers MUST check for null and return a 404 Not Found response (via `ApiException` with `HttpStatusCode.NotFound`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Valid store | Store exists in DB | Handler executes | Store fetched, `Approved` toggled, saved, succeeded=true |
| 3b | Non-existent store | Store ID not in DB | Handler executes | `GetStoreByIdAsync` returns null, handler returns 404 NotFound |

### SM-CH5 through SM-CH8 — Mirror All Changes to DisapproveStoreCommandHandler

SM-CH1 through SM-CH4 SHALL be applied identically to `DisapproveStoreCommandHandler`. The two handlers MUST have identical structure (same deps, same null check, same lightweight query).

## REMOVED Requirements (ApproveStore/DisapproveStore)

### SM-CH1 — Dead `IsSuperAdminOrOwnerAdmin` Auth Guard

The `_httpContextService.IsSuperAdminOrOwnerAdmin` guard that throws `ApiException` with `HttpStatusCode.BadRequest` MUST be removed from BOTH `ApproveStoreCommandHandler.Handle` and `DisapproveStoreCommandHandler.Handle`.

### SM-CH2 — Over-fetching via `GetStoreByIdIncludingModulesAsync`

The call to `_storeByIdService.GetStoreByIdIncludingModulesAsync(id)` MUST be replaced with `_storeRepository.GetStoreByIdAsync(id)` (lighter query, no `.Include()`).

### SM-CH4 — Unused Constructor Dependencies

If removing the auth guard and the include-query service leaves `_httpContextService`, `_storeByIdService`, or `_localizer` unused, those fields and their constructor parameters MUST be removed.

## MODIFIED Requirements (ApproveStore/DisapproveStore)

### SM-CH5 — Already-Approved/Disapproved Behavior

When a store is already approved and `ApproveStore` is called again, the handler still sets `store.Approved = true` and calls `UpdateAsync`. EF marks the entity as Modified even if the value doesn't change, so `SaveChangesAsync` returns > 0. **Behavior is unchanged**: the response still returns `succeeded=true, data=true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Already approved | Store with `Approved=true` | ApproveStore called | Store.Approved stays true, response: succeeded=true, data=true |
| 5b | Already disapproved | Store with `Approved=false` | DisapproveStore called | Store.Approved stays false, response: succeeded=true, data=true |

---

## ADDED Requirements

### Requirement: CH1 — Proper Async Await in UpdateStoreModules

`UpdateStoreModules` MUST use a sequential `foreach` loop with `await` instead of `List<T>.ForEach` with an async lambda, which creates fire-and-forget tasks that may complete after the response is sent.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Modules added sequentially | A set of `StoreRoleFeature` entities | `UpdateStoreModules` executes | Each `AddAsync` completes before the next starts; no unobserved task exception |
| 1b | Exception during add | `AddAsync` throws for one entity | The `foreach` loop reaches it | Exception propagates normally; caller receives the error |

### Requirement: CH2 — Batch Module Load, Not N+1

The handler MUST call `_moduleRepository.GetModulesByIdsAsync(moduleIds)` once before the module iteration loop, then use an in-memory lookup (e.g., dictionary) inside the loop. Individual `GetByIdAsync` calls MUST NOT appear inside the `foreach (var moduleId in moduleIds)` loop.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Single batch query | N module IDs to resolve | Handler processes modules | `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` called ZERO times |
| 2b | Module not found in batch | One module ID has no match in the batch result | Handler looks it up via dictionary | Dictionary lookup returns null, handler handles gracefully |

### Requirement: CH3 — Correct Auth Failure Status Code

When the authenticated user is not found in the database, the handler MUST throw `ApiException` with `HttpStatusCode.Forbidden` (403) and a message key `_localizer["AuthorizationFailed"]` (or equivalent). It MUST NOT use `HttpStatusCode.BadRequest`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | User not found returns 403 | Request with valid JWT but user missing from DB | Handler validates current user | 403 Forbidden returned with "AuthorizationFailed" message |
| 3b | Authorized user proceeds | Valid user exists in DB | Handler validates current user | Handler continues to store-update logic |

## REMOVED Requirements

### Requirement: CH4 — Unused Import Removed

(Reason: `using static System.Formats.Asn1.AsnWriter;` serves no purpose in `UpdateStoreCommand.cs` and generates a compiler warning.)

The `using static System.Formats.Asn1.AsnWriter;` directive MUST be deleted from the file.

---

## Delta for command-handler: GetAllUsersQueryHandler

**Change**: `2026-07-30-get-users-all-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: CH1 — CancellationToken Propagation Through FindUsersIncludingRoles

The `cancellationToken` received in `Handle(GetAllUsersQuery query, CancellationToken cancellationToken)` MUST be forwarded to all 3 repository calls inside `FindUsersIncludingRoles`.

The private method `FindUsersIncludingRoles(bool includeInactive)` MUST accept a `CancellationToken` parameter and pass it to each repository method:

| Repository method | Previous call | New call |
|---|---|---|
| SuperAdmin branch | `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(includeInactive)` | `...(includeInactive, cancellationToken)` |
| OwnerAdmin branch | `GetAllUsersIncludingStoreAndRolesAsync(includeInactive)` | `...(includeInactive, cancellationToken)` |
| Default branch | `GetAllUsersByStoreIdIncludingStoreAndRolesAsync(storeId, includeInactive)` | `...(storeId, includeInactive, cancellationToken)` |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Token passed to all 3 branches | Any request processed | Handler executes | `cancellationToken` flows into whichever repository branch the role selects |
| 1b | Token cancelled mid-query | Request cancelled | DB query in progress | `OperationCanceledException` propagates, no partial result committed |

### Verification Criteria

- [ ] `FindUsersIncludingRoles` signature includes `CancellationToken cancellationToken`
- [ ] All 3 `_userRepository` calls pass `cancellationToken` as final argument

---

## Delta for command-handler: SetMyStoreCommand

**Change**: `2026-07-30-set-my-store-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: SM-CH1 — Null User Returns 403 Forbidden

When `_userRepository.GetByIdAsync(...)` returns null (user from JWT not found in DB), the handler MUST throw `ApiException` with `HttpStatusCode.Forbidden` (403) and a localized message. It MUST NOT continue to `user.SelectedStoreId` which would cause a NullReferenceException.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User not found returns 403 | Request with valid JWT but user GUID missing from DB | Handler calls `GetByIdAsync` and gets null | `ApiException` with 403 Forbidden is thrown; no NRE occurs |
| 1b | Existing user proceeds | Valid user exists in DB matching JWT sub claim | Handler calls `GetByIdAsync` and gets non-null | Handler continues to SetSelectedStoreId logic |

#### Requirement: SM-CH2 — Handler Class Renamed to SetMyStoreCommandHandler

The handler class MUST be renamed from `SetStoreCommandHandler` to `SetMyStoreCommandHandler` to match the command it handles (`SetMyStoreCommand`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Class name matches command | Project compiled after rename | Inspect handler class | Class is `SetMyStoreCommandHandler : ICommandHandler<SetMyStoreCommand, bool>` |
| 2b | DI registration unaffected | MediatR scans assembly | Handler injected | Registration works — MediatR resolves by handler interface, not class name |

#### Requirement: SM-CH3 — Store Access Validation

The handler MUST verify that `request.StoreId` belongs to the user's accessible stores before assigning it. It MUST call `IStoreRepository.GetActiveStoresByUserIdAsync(user.Id)` and check the returned list contains `request.StoreId`. If not found, throw `ApiException` with `HttpStatusCode.Forbidden`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Access granted | User has access to store with ID in request | Handler validates access | Store ID assigned to `user.SelectedStoreId` and saved |
| 3b | Access denied | User does NOT have access to store ID in request | Handler validates access | `ApiException` with 403 Forbidden thrown; SelectedStoreId unchanged |
| 3c | SuperAdmin bypass | SuperAdmin user requests any store ID | Handler validates access | Access check passes (or skipped) — store ID assigned |

### REMOVED Requirements

#### Requirement: SM-CH4 — Dead Constructor Parameter Removed

(Reason: After renaming, the handler class has a suspicious blank line between constructor parameters — `_applicationUnitOfWork` has an extra blank line preceding it.)

The extraneous blank line between `_userRepository` and `_applicationUnitOfWork` in the constructor parameter list MUST be removed.

---

## Delta for command-handler: GetUserByIdQueryHandler

**Change**: `get-user-by-id-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: CH-G1 — Null User Race Guard Returns Envelope 404

After fetching the user via `_userRepository.GetUserByIdIncludingStoreAndRoles(...)`, the handler MUST check for null and return `ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404)` if the user was deleted between validation and execution. The endpoint MUST NOT return HTTP 200 with `data: null` in the race window. Mirrors `GetStoreByIdQuery.cs:30-31` (envelope-404, not HTTP 404 status).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Race window hit | User exists at validation, deleted before handler fetch | Handler executes | Repository returns null; handler returns `Failure(UserErrors.NotFound, 404)` |
| 1b | Normal flow | User exists and is not deleted | Handler executes | Returns 200 OK with valid `UserDto`; no null branch taken |

#### Requirement: CH-G2 — CancellationToken Forwarded to Repository

The `cancellationToken` received in `Handle(GetUserByIdQuery query, CancellationToken cancellationToken)` MUST be forwarded to the `GetUserByIdIncludingStoreAndRoles` repository call (which gains a token parameter per repository delta RR-G2).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Token reaches EF | Any request processed | Handler executes | `cancellationToken` flows into the repository query |
| 2b | Token cancelled mid-query | Request cancelled | DB query in progress | `OperationCanceledException` propagates; no partial result returned |

### Verification Criteria

- [ ] Handler returns `Failure(NotFound, 404)` when repository fetch yields null — never 200 `data:null`
- [ ] Repository call passes `cancellationToken` as final argument

---

## Delta for command-handler: UpdateUserCommandHandler

**Change**: `update-user-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: CH-U1 — Ownership Guard Returns Envelope 404 (IDOR Fix)

The handler MUST reject updates to a user the actor does not own, unless the actor is SuperAdmin or OwnerAdmin: `if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404)`. The response SHALL be HTTP 200 + envelope ActionCode 404 (anti-enumeration — NOT real 403, NOT HTTP 404). Mirrors `UpdateUserPasswordCommand.cs:49-56`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Self-edit allowed | Actor PUTs own id | Guard evaluates | Guard passes; handler continues |
| 1b | Admin edits any | SuperAdmin/OwnerAdmin PUTs another user | Guard evaluates | Guard passes (admin bypass) |
| 1c | IDOR denied | StoreUser+Profile PUTs another user | Guard evaluates | Envelope `Failure(NotFound, 404)` returned; no DB write |

#### Requirement: CH-U2 — Tri-State Partial Update for CellPhone and Email

CellPhone and Email MUST follow tri-state semantics: `null` (absent) → field UNCHANGED; `""` → cleared to null; non-empty → assigned. FullName remains required (validator) and is always assigned.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Absent keeps | Body omits cellPhone/email | Handler assigns | Existing values untouched |
| 2b | Empty clears | Body has `cellPhone: ""` | Handler assigns | CellPhone set to null |
| 2c | Value assigns | Body has `email: "x@y.z"` | Handler assigns | Email set to value |
| 2d | FullName applied | Body has FullName | Handler assigns | FullName updated |

#### Requirement: CH-U3 — Null Race Guard Returns Envelope 404

The handler MUST fetch the user into a nullable reference (`User? user = ...`) and MUST check for null immediately after the fetch; if null (deleted between validation and handler execution), MUST return `ResponseResult.Failure<bool>(UserErrors.NotFound, 404)` — never an NRE/500. Mirrors `GetUserByIdQuery.cs:27-28`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Race window hit | User deleted after validation, before handler fetch | Handler fetches user | Fetch returns null; envelope `Failure(NotFound, 404)`; no 500 |
| 3b | Normal flow | User exists and is not deleted | Handler fetches user | Non-null; handler proceeds |

#### Requirement: CH-U4 — IsActive Applied Only by Admin When Explicitly Present

`IsActive` on the command MUST be `bool?`. The handler MUST apply it ONLY when `_httpContextService.IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue`. Explicit `false` from an admin SHALL still deactivate; absent → unchanged; non-admin → NEVER applied (even if present in the body).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Admin explicit false | SuperAdmin body `isActive: false` | Handler applies | User deactivated (IsActive=false) |
| 4b | Admin absent | SuperAdmin body omits isActive | Handler applies | IsActive unchanged (self-deactivate bug eliminated) |
| 4c | Admin explicit true | OwnerAdmin body `isActive: true` | Handler applies | User reactivated (IsActive=true) |
| 4d | Non-admin never | StoreUser+Profile self body `isActive: false` | Handler applies | IsActive ignored; unchanged |

#### Requirement: CH-U5 — CancellationToken Propagated to Repository Calls

The `cancellationToken` received in `Handle(UpdateUserCommand request, CancellationToken cancellationToken)` MUST be forwarded to repository calls whose signature accepts a token (e.g., `ExistsAsync`, `SaveChangesAsync`; `GetByIdAsync` has no token parameter — `IGenericRepository.cs:16`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Token reaches EF | Any request processed | Handler executes | Token flows into repository calls accepting it |
| 5b | Token cancelled mid-write | Request cancelled | Save in progress | `OperationCanceledException` propagates; no partial save committed |

### MODIFIED Requirements

#### Requirement: CH-U6 — Persistence REQUIRES UpdateAsync (NoTracking Context)

The handler MUST persist changes via `await _userRepository.UpdateAsync(user)` followed by `SaveChangesAsync(cancellationToken)`. `UpdateAsync` is **REQUIRED**, not optional: `ApplicationDbContext` (`backend/src/Infrastructure/Persistence/Contexts/ApplicationDbContext.cs:45`) sets `ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking`, so `GetByIdAsync` (`FindAsync` via `GenericRepository.cs:82-85`) returns an **UNTRACKED** entity. Without `UpdateAsync` — which attaches the entity via `Entry.State = Modified` (`GenericRepository.cs:39-43`) — `SaveChangesAsync` detects zero changes, returns 0, and NOTHING persists (measured in Batch B: envelope `Succeeded=True, Data=False`). The full-column UPDATE is safe because the entity is freshly fetched (carries current DB values) and the tri-state guards (CH-U2) only mutate body-present fields. The handler MUST carry a rationale comment documenting the NoTracking root cause next to the `UpdateAsync` call.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | NoTracking persistence | DbContext NoTracking; entity fetched via `GetByIdAsync` | Handler calls `UpdateAsync` then `SaveChangesAsync` | `UpdateAsync` attaches entity (`Entry.State=Modified`); `SaveChangesAsync` returns > 0; changes persist |
| 6b | No UpdateAsync → silent no-op | DbContext NoTracking; entity fetched via `GetByIdAsync` | Handler calls `SaveChangesAsync` only | `SaveChangesAsync` returns 0; nothing persists (HTTP 200 envelope `Data=false`) |
| 6c | Full-column UPDATE safe | Fresh entity with current DB values; body specifies a subset of fields | Tri-state guards apply | Unchanged columns written back with existing values; no data destruction |

### Verification Criteria

- [ ] Guard returns `Failure(NotFound, 404)` for non-owner, non-admin actor; envelope-404, not HTTP 403
- [ ] Tri-state: absent keeps / `""` clears / value assigns for CellPhone and Email
- [ ] `User?` null branch returns `Failure(NotFound, 404)` — no 500
- [ ] `bool? IsActive`; applied only when admin && `HasValue`
- [ ] `UpdateAsync` KEPT (required under NoTracking) followed by single `SaveChangesAsync` — with NoTracking rationale comment
- [ ] `cancellationToken` forwarded where the repository signature allows

---

## Delta for command-handler: DeleteUserCommandHandler

**Change**: `delete-user-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: CH-D1 — Auth Guard Returns Real HTTP 403 (D2)

The handler MUST throw `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` when `!_httpContextService.IsSuperAdminOrOwnerAdmin`, evaluated FIRST in `Handle`. Permission failures MUST NOT surface as 400 `UserNotFound`. The guard is RETAINED — it is NOT redundant with the `[HasPermission]` filter: a feature-granted StoreUser passes the filter and MUST still be blocked here. Mirrors `DeactivateStoreCommand.cs:37-38`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Feature-granted StoreUser blocked | Actor from `SeedStoreUserAsync((int)FeatureType.Users)`; victim user | DELETE issued | HTTP 403 + `DontHavePermission` |
| 1b | Admin bypass | SuperAdmin/OwnerAdmin actor | DELETE issued | Guard passes; handler continues |
| 1c | No 400 mask | Non-admin actor | DELETE issued | 403 thrown — NOT 400 `UserNotFound` |

#### Requirement: CH-D2 — Self-Delete Guard Returns 400 (D3)

Immediately after the auth guard and BEFORE any repository call, the handler MUST compare `request.Id` with `_httpContextService.UserExternalId.ToGuid()` (`using Domain.Common.Extensions;`) and MUST throw `ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest)` on match.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Self-delete blocked | SuperAdmin sends own user id | DELETE issued | HTTP 400 + `CannotDeleteSelf`; no DB write |
| 2b | Different user proceeds | Actor deletes another user's id | DELETE issued | Guard passes; handler continues |

#### Requirement: CH-D3 — Non-Existent User Returns Real HTTP 404 (D1)

The handler MUST fetch via `GetByIdAsync(request.Id)` — NO CancellationToken (no token overload exists, `IGenericRepository.cs:22`; design Decision 1(a)); when the result is null, MUST throw `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` (mirrors `DeactivateStoreCommand.cs:41-42`). Contract row lives in main spec `users-e2e` R4 (reads 404).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Non-existent id | Well-formed GUID not in DB | DELETE issued | HTTP 404 + `UserNotFound` |
| 3b | Existing user | User exists (active or inactive) | Handler fetches | Non-null; proceeds to soft-delete |

#### Requirement: CH-D4 — Soft-Delete Persistence + Token Propagation

On a non-null user, the handler MUST set `IsActive = false`, call `UpdateAsync(user)` (REQUIRED — DbContext is NoTracking, `ApplicationDbContext.cs:45`; see CH-U6), and persist via `SaveChangesAsync(cancellationToken)` returning > 0. The `cancellationToken` MUST be forwarded to `SaveChangesAsync` (token flows to EF); `GetByIdAsync` accepts no token.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Soft-delete | Active victim | DELETE issued | 200; IsActive=false; change persisted |
| 4b | Already inactive | Inactive victim | DELETE issued | 200; IsActive stays false |
| 4c | Token reaches EF | Any request | Handler executes | Token flows into repository calls |

### Verification Criteria

- [x] Guard order: 403 auth → 400 self-delete → `GetByIdAsync` → null 404 → soft-delete; all real HTTP statuses via `ApiException`
- [x] Single DB existence check (handler only) — 1 round-trip total
- [x] `DontHavePermission` / `CannotDeleteSelf` / `UserNotFound` keys resolve via localizer

---

## Delta for command-handler: ActivateUserCommandHandler

**Change**: `activate-user-endpoint-fixes`

> **Scope amendment (user decision)**: the proposal's "Bonus" item (`ActivateStoreCommand` guard + validator fixes) is **OUT OF SCOPE**. `ActivateStoreCommand` is left untouched; its guard bug (`ApiException(UserNotFound, BadRequest)` at `ActivateStoreCommand.cs:46-47`) is recorded as pending debt in the plan doc only. No requirement below targets it.

---

### MODIFIED Requirements

#### Requirement: CH-A1 — Auth Guard Returns Real HTTP 403 (F2)

The handler MUST throw `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` when `!_httpContextService.IsSuperAdminOrOwnerAdmin`, evaluated FIRST in `Handle` — exact mirror of `DeleteUserCommand.cs:39`. Permission failures MUST NOT surface as 400 `UserNotFound`. The guard is RETAINED — not redundant with the `[HasPermission(UsersAdmin)]` filter: a feature-granted StoreUser passes the filter and MUST still be blocked here.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Feature-granted StoreUser blocked | Actor from `SeedStoreUserAsync((int)FeatureType.Users)`; victim user | Activate issued | HTTP 403 + `DontHavePermission` |
| 1b | Admin bypass | SuperAdmin/OwnerAdmin actor | Activate issued | Guard passes; handler continues |
| 1c | No 400 mask | Non-admin actor | Activate issued | 403 thrown — NOT 400 `UserNotFound` |

#### Requirement: CH-A2 — IsActive Flag Honored (F1)

The handler MUST set `user.IsActive = request.IsActive;` — replacing the hardcoded `true`. The endpoint SHALL activate AND deactivate per the request body. Frontend verified activate-only today (never sends `false`) — zero-risk contract change.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Deactivate | Body `IsActive:false` | Handler assigns | 200; user.IsActive == false; persisted |
| 2b | Activate | Body `IsActive:true` | Handler assigns | 200; user.IsActive == true; persisted |
| 2c | Re-activate active | `IsActive:true`, already active | Handler assigns | 200 `data:true` — EF marks Modified on no-op (expected, not a bug) |

#### Requirement: CH-A3 — Non-Existent User Returns Real HTTP 404 (F3)

The handler MUST fetch via `GetByIdAsync(request.Id)` — NO CancellationToken (no token overload exists, `IGenericRepository.cs:22`); when null, MUST throw `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` — exact mirror of `DeleteUserCommand.cs:46`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Non-existent id | Well-formed GUID not in DB | Activate issued | HTTP 404 + `UserNotFound` |
| 3b | Existing user | User exists | Handler fetches | Non-null; proceeds to assign + persist |

#### Requirement: CH-A4 — Persistence REQUIRES UpdateAsync (NoTracking)

On a non-null user, the handler MUST keep `UpdateAsync(user)` followed by `SaveChangesAsync(cancellationToken)` returning > 0. `UpdateAsync` is REQUIRED — `ApplicationDbContext.cs:45` sets `QueryTrackingBehavior.NoTracking`; dropping it makes `SaveChangesAsync` detect zero changes → silent no-op. The `cancellationToken` MUST be forwarded to `SaveChangesAsync` (`GetByIdAsync` accepts none).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Persistence | Victim; body `IsActive:false` | Handler executes | UpdateAsync attaches entity; SaveChangesAsync > 0; change persisted |
| 4b | No silent no-op | NoTracking context | Handler executes | `UpdateAsync` NEVER removed; real change never returns 0 |
| 4c | Token reaches EF | Any request | Handler executes | Token flows into `SaveChangesAsync` |

### Verification Criteria

- [x] Guard order: 403 auth (`DontHavePermission`) FIRST → `GetByIdAsync` → null 404 (`UserNotFound`) → `user.IsActive = request.IsActive` → `UpdateAsync` + `SaveChangesAsync(ct)`
- [x] Single DB existence check (handler only) — 1 round-trip total
- [x] `ActivateStoreCommand` untouched (out of scope — debt noted in plan doc)

---

## Delta for command-handler: AddUserRoles Handler + GetUserRolesByUserId Query + VisibleRoleService

**Change**: `user-roles-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: CH-R1 — AddUserRoles Handler Uses request.UserId, No User Load

The handler MUST NOT load the User entity (no `_userRepository.GetByIdAsync`); `UserRole.Create` MUST use `request.UserId`. User-existence is guaranteed by the validator (VL-R1 → 400); dropping the load eliminates the `user.Id` NRE at the root and removes one DB query per request. If `IUserRepository` becomes unused in the handler, the dependency MUST be removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | No user query | Any AddUserRoles request | Handler executes | Zero User repository queries; `request.UserId` used for creation |
| 1b | No NRE path | User deleted mid-request (race) | Handler executes | No `user.Id` dereference exists — no 500 |

#### Requirement: CH-R2 — Duplicate RoleIds Deduplicated

The handler MUST process `request.RoleIds` deduplicated (`.Distinct()`). Duplicate RoleIds MUST NOT create duplicate `UserRole` rows (composite-PK conflict → 500 today); the response MUST be 200 with no duplicate rows.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Duplicates | `RoleIds = [5, 5]` | Handler processes | One row created; `SaveChangesAsync` succeeds; 200 |
| 2b | Idempotent repeat | Role already active, repeated in batch | Handler processes | No duplicate row; still 200 |

#### Requirement: CH-R3 — Single Materialized User-Role Lookup (N+1 Killed)

The handler MUST load the user's existing `UserRole` rows ONCE via the new `IUserRoleRepository.GetByUserIdAsync(request.UserId)` (RR-R1) and resolve per-role state in memory. Zero repository queries inside the `foreach` over `RoleIds`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Single batch query | N role IDs; M existing rows | Handler processes | Exactly 1 roles query; per-role state from in-memory lookup |
| 3b | Role already active | Existing row found in batch | Handler processes | Row reactivated (`IsActive = true`) via in-memory match |

#### Requirement: CH-R4 — VisibleRoleService Null-Guard Returns False

`IsVisibleRoleToCurrentUser` MUST return `false` when the role fetch yields null (non-existent roleId) — never dereference `role.Name` (500 today). The grant rules MUST be preserved exactly: ordinary role visible iff `role.IsActive`; SuperAdmin role visible only to a super-admin actor; OwnerAdmin role visible to a super-admin actor or an owner-admin actor with the role active.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Null role | Non-existent roleId | Visibility check | Returns false → validation 400 `RoleNotFound` (VL-R3) |
| 4b | Ordinary role | Active / inactive role | Visibility check | Visible iff `role.IsActive` (unchanged) |
| 4c | SuperAdmin role | SuperAdmin / non-super actor | Visibility check | Visible only to super-admin actor (unchanged) |
| 4d | OwnerAdmin role | OwnerAdmin / other actor | Visibility check | Visible to super-admin or active owner-admin (unchanged) |

#### Requirement: CH-R5 — VisibleRoleService Single Batched Query

`AreVisibleRolesToCurrentUserAsync` MUST issue ONE query for the whole `RoleIds` batch; zero per-role `GetByIdAsync` calls.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Batch query | N role IDs | `AreVisibleRolesToCurrentUserAsync` runs | 1 query; N in-memory rule evaluations |

#### Requirement: CH-R6 — GetUserRolesByUserId Query Cleanup

The query handler MUST NOT load the User entity (no `GetByIdAsync`; use `query.UserId` for `GetActiveRoleIdsByUser` — no NRE), MUST return the result directly (no redundant `Task.FromResult`), and MUST set `Selected` by numeric id comparison (`activeRoleIds.Contains(roleId)`), not string comparison (`r.ToString() == role.Id`). Unused dependencies MUST be removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | No user load | Any query | Handler executes | Zero User repository queries; no NRE |
| 6b | Selected correct | User has role X | Handler maps | `Selected == true` for role X via int compare |
| 6c | Sync return | Any query | Handler returns | Direct `ResponseResult.Success(...)` — no `Task.FromResult` |

### Verification Criteria

- [x] Handler: zero User queries; `request.UserId` in `UserRole.Create`; `.Distinct()`; single roles query (RR-R1)
- [x] VisibleRoleService: null-guard → false; single batch query; grant rules byte-identical
- [x] Query handler: no user load; no `Task.FromResult`; `Selected` int compare
- [x] No 500 on: deleted-user race, non-existent RoleId, duplicate RoleIds — UsersRolesTests 11/11 GREEN (verify re-run 2026-08-01)

---

## Delta for command-handler: UpdateUserPasswordCommand Handler Contract

**Change**: `change-password-endpoint-fixes`

### ADDED Requirements

#### Requirement: CH-CPW1 — Null-Guard Returns Envelope 404 (No NRE)

The handler MUST null-check the user fetched via `GetByIdAsync(request.UserId)`; a null user MUST return `ResponseResult.Failure<bool>(UserErrors.NotFound, 404)` (mirrors `UpdateUserCommand.cs:46-48`). Today the handler dereferences `user.Password` on a null race (validated-then-deleted) → 500.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Null guard | User deleted mid-request | Handler executes | Envelope 404 `UserNotFound`; no 500 |
| 1b | Live user | User exists | Handler executes | Proceeds to branch logic |

#### Requirement: CH-CPW2 — Self Branch Verifies Old Password with VerifyPassword

For `request.UserId == _httpContextService.UserExternalId` (self-service), the handler MUST call `_hashPasswordService.VerifyPassword(request.OldPassword, user.Password)` (mirrors `AuthenticationService.cs:44`) and MUST NOT compare two `HashPassword` outputs (the current random-salt compare at `:49-53` can NEVER match — dead code). A failed verify MUST return a failure with ActionCode 400 (wrong old password → real HTTP 400 via UC-CPW3).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Correct old password | `VerifyPassword` returns true | Self branch runs | Proceeds to hash + persist new password |
| 2b | Wrong old password | `VerifyPassword` returns false | Self branch runs | Failure envelope; ActionCode 400 |
| 2c | No hash-of-hash compare | Any self request | Handler executes | Zero `HashPassword` calls against `OldPassword` |

#### Requirement: CH-CPW3 — Admin Branch Tenant-Scope Check (Anti-Enumeration)

For non-self targets, the handler MUST keep the admin gate (`IsSuperAdminOrOwnerAdmin`) AND MUST add a tenant-scope check: if the actor is NOT a SuperAdmin and `user.TenantId` != the `TenantId` claim (`_httpContextService.TenantId`), return envelope 404 (`UserNotFound`) — anti-enumeration, decision D4. SuperAdmin MUST bypass the tenant check (any tenant). Closes the cross-tenant IDOR via `FindAsync` filter-skip (`GenericRepository.cs:84`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Cross-tenant OwnerAdmin | OwnerAdmin actor; target TenantId ≠ claim | Admin branch runs | Envelope 404; no password change |
| 3b | Same-tenant OwnerAdmin | Target TenantId == claim | Admin branch runs | Resets password; 200 |
| 3c | SuperAdmin cross-tenant | SuperAdmin actor; any target tenant | Admin branch runs | Resets password; 200 |
| 3d | Non-admin non-self | StoreUser+Profile, target ≠ self | Admin branch runs | Envelope 404 (unchanged gate) |

#### Requirement: CH-CPW4 — Real Failure Statuses via ActionCode (No 200+Envelope)

The handler MUST return `ResponseResult.Failure<T>` with the correct `ActionCode` (400 wrong-old-password / invalid; 404 null-race or out-of-tenant) so the controller's ActionCode switch (UC-CPW3) maps them to REAL HTTP statuses. Business failures MUST NOT be silently returned as `Ok(...)` 200+envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Wrong old password | Verify fails | Handler returns | Failure ActionCode 400 |
| 4b | Out-of-tenant | Tenant-scope check fails | Handler returns | Failure ActionCode 404 |
| 4c | Success | All guards pass; persist OK | Handler returns | `ResponseResult.Success(SaveChanges > 0)` |

#### Requirement: CH-CPW5 — UpdateAsync + SaveChangesAsync Semantics Preserved (Untracked Entity)

The handler MUST keep `_userRepository.UpdateAsync(user)` before `_applicationUnitOfWork.SaveChangesAsync(ct)` and MUST set `user.Password = _hashPasswordService.HashPassword(request.NewPassword)` before persisting. `ApplicationDbContext` uses `QueryTrackingBehavior.NoTracking`, so `GetByIdAsync` (`FindAsync`) returns an UNTRACKED entity — `UpdateAsync` (`Entry.State = Modified`) is what attaches it; without it `SaveChangesAsync` sees no changes (same note as `UpdateUserCommand.cs:59-62`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | New password hashed | Guards pass | Handler persists | `user.Password` = BCrypt hash of NewPassword |
| 5b | Change persists | Untracked entity from `GetByIdAsync` | `UpdateAsync` runs | Entity attached; `SaveChangesAsync` persists |
| 5c | Result truth | Save affects 1 row | Handler returns | `Success(true)` |

### Verification Criteria

- [x] Null user → envelope 404 (no NRE/500)
- [x] Self branch uses `VerifyPassword`; zero hash-of-hash compare; wrong old → ActionCode 400
- [x] Cross-tenant non-SuperAdmin admin → 404; SuperAdmin crosses tenants; same-tenant admin reset works
- [x] `UpdateAsync` + `SaveChangesAsync` retained; NewPassword hashed before persist — E2E 8/8 GREEN (apply evidence)

---

## Delta for command-handler: UpdateOwnerCommandHandler

**Change**: `owners-update-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: OU-CH1 — Null Guard Returns Envelope 404 (No NRE/500)

The handler MUST fetch via `GetOwnerWithUserTrackedAsync(request.Id)` into `Owner? owner` and MUST return `ResponseResult.Failure<OwnerDto>(OwnerErrors.NotFound, 404)` when null (controller maps to HTTP 404) — never dereference `owner.User`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Nonexistent owner | Owner absent | Handler fetches | Envelope 404; no 500 |
| 1b | Existing owner | Owner present | Handler fetches | Non-null; proceeds |

#### Requirement: OU-CH2 — Tenant-Scope Check (SuperAdmin Bypass)

Non-SuperAdmin actors MUST be blocked when `owner.TenantId != _httpContextService.TenantId` → envelope 404 (anti-enumeration). SuperAdmin MUST bypass.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Cross-tenant OwnerAdmin | OwnerAdmin; TenantId ≠ claim | Handler checks | 404 envelope; no write |
| 2b | Same-tenant OwnerAdmin | TenantId == claim | Handler checks | Proceeds |
| 2c | SuperAdmin cross-tenant | SuperAdmin; any tenant | Handler checks | Proceeds |

#### Requirement: OU-CH3 — Auth Gate Denies Non-Granted Actors, Denial → 403

The gate MUST accept only actors granted `OwnersAdmin` (roles SuperAdmin + ReSeller, per `StoreRoleFeatures.OwnersAdmin` annotations) and MUST return 403 on denial — not 400 `OwnerNotFound`. NOTE: an OwnerAdmin-role actor is NOT granted the Owners feature, so the class-level `[HasPermission]` filter returns 403 before the handler runs.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | OwnerAdmin denied | OwnerAdmin actor | Gate evaluates | 403 `ForbidResult`; handler never runs |
| 3b | Denied actor | Actor lacks OwnersAdmin feature | Gate evaluates | 403; no 400 `OwnerNotFound` |

#### Requirement: OU-CH4 — Tracked Persistence (NoTracking Fix)

The handler MUST persist via the `AsTracking()`-loaded entity so `User.FullName/CellPhone/Email` changes are tracked and saved by `SaveChangesAsync` — no silent drop.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | User nav persists | Owner+User loaded tracked | Field changes + `SaveChangesAsync` | DB row reflects FullName/CellPhone/Email |
| 4b | Single query | Any update | Handler executes | Exactly 1 DB round-trip (handler), 0 from validator |

#### Requirement: OU-CH5 — OwnerDto Return

`UpdateOwnerCommand` MUST be `ICommand<OwnerDto>`; handler MUST return `ResponseResult<OwnerDto>` via AutoMapper projection (IMapper + OwnerProfile).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | OwnerDto envelope | Valid update | Handler returns | `Data` is `OwnerDto` with updated fields |

#### Requirement: OU-CH6 — ReSeller Null Guard + Redundant Guard Removal

The handler MUST null-check `GetByIdAsync(reSellerId.Value)` before touching `.DiscountPrice` (ApiException 400, no NPE) and MUST remove the nested `if (reSellerId.HasValue)` inside the outer block.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | ReSeller missing | reSellerId set; ReSeller absent | `UpdateReSellerOwnerAsync` | 400; no NRE/500 |
| 6b | Redundant guard gone | reSellerId set; reSellerOwner exists | Inner branch runs | Updates run without inner HasValue check |

#### Requirement: OU-CH7 — ReSellerOwner Tri-State

Provided reSellerId + existing reSellerOwner → update existing; provided + none → create new; null + existing → delete; null + none → no-op.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Update existing | reSellerId set; reSellerOwner exists | Handler runs | reSellerOwner updated (active, ids, prices) |
| 7b | Create new | reSellerId set; no reSellerOwner | Handler runs | ReSellerOwner row created |
| 7c | Delete | reSellerId null; reSellerOwner exists | Handler runs | ReSellerOwner deleted |
| 7d | No-op | reSellerId null; no reSellerOwner | Handler runs | Nothing created/deleted |
