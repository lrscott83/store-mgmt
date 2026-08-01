# Delta for command-handler: UpdateUserCommandHandler

**Domain**: `command-handler` — `UpdateUserCommand.cs` + `UpdateUserCommandHandler.cs`
**Change**: `update-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: CH-U1 — Ownership Guard Returns Envelope 404 (IDOR Fix)

The handler MUST reject updates to a user the actor does not own, unless the actor is SuperAdmin or OwnerAdmin: `if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404)`. The response SHALL be HTTP 200 + envelope ActionCode 404 (anti-enumeration — NOT real 403, NOT HTTP 404). Mirrors `UpdateUserPasswordCommand.cs:49-56`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Self-edit allowed | Actor PUTs own id | Guard evaluates | Guard passes; handler continues |
| 1b | Admin edits any | SuperAdmin/OwnerAdmin PUTs another user | Guard evaluates | Guard passes (admin bypass) |
| 1c | IDOR denied | StoreUser+Profile PUTs another user | Guard evaluates | Envelope `Failure(NotFound, 404)` returned; no DB write |

### Requirement: CH-U2 — Tri-State Partial Update for CellPhone and Email

CellPhone and Email MUST follow tri-state semantics: `null` (absent) → field UNCHANGED; `""` → cleared to null; non-empty → assigned. FullName remains required (validator) and is always assigned.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Absent keeps | Body omits cellPhone/email | Handler assigns | Existing values untouched |
| 2b | Empty clears | Body has `cellPhone: ""` | Handler assigns | CellPhone set to null |
| 2c | Value assigns | Body has `email: "x@y.z"` | Handler assigns | Email set to value |
| 2d | FullName applied | Body has FullName | Handler assigns | FullName updated |

### Requirement: CH-U3 — Null Race Guard Returns Envelope 404

The handler MUST fetch the user into a nullable reference (`User? user = ...`) and MUST check for null immediately after the fetch; if null (deleted between validation and handler execution), MUST return `ResponseResult.Failure<bool>(UserErrors.NotFound, 404)` — never an NRE/500. Mirrors `GetUserByIdQuery.cs:27-28`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Race window hit | User deleted after validation, before handler fetch | Handler fetches user | Fetch returns null; envelope `Failure(NotFound, 404)`; no 500 |
| 3b | Normal flow | User exists and is not deleted | Handler fetches user | Non-null; handler proceeds |

### Requirement: CH-U4 — IsActive Applied Only by Admin When Explicitly Present

`IsActive` on the command MUST be `bool?`. The handler MUST apply it ONLY when `_httpContextService.IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue`. Explicit `false` from an admin SHALL still deactivate; absent → unchanged; non-admin → NEVER applied (even if present in the body).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Admin explicit false | SuperAdmin body `isActive: false` | Handler applies | User deactivated (IsActive=false) |
| 4b | Admin absent | SuperAdmin body omits isActive | Handler applies | IsActive unchanged (self-deactivate bug eliminated) |
| 4c | Admin explicit true | OwnerAdmin body `isActive: true` | Handler applies | User reactivated (IsActive=true) |
| 4d | Non-admin never | StoreUser+Profile self body `isActive: false` | Handler applies | IsActive ignored; unchanged |

### Requirement: CH-U5 — CancellationToken Propagated to Repository Calls

The `cancellationToken` received in `Handle(UpdateUserCommand request, CancellationToken cancellationToken)` MUST be forwarded to repository calls whose signature accepts a token (e.g., `ExistsAsync`, `GetByIdAsync`, `SaveChangesAsync`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Token reaches EF | Any request processed | Handler executes | Token flows into repository calls accepting it |
| 5b | Token cancelled mid-write | Request cancelled | Save in progress | `OperationCanceledException` propagates; no partial save committed |

## MODIFIED Requirements

### Requirement: CH-U6 — Single Persistence Path: SaveChangesAsync Only

The handler MUST remove the `await _userRepository.UpdateAsync(user)` call. The entity is already tracked by the fetch; field changes MUST be persisted via `SaveChangesAsync` alone. (`UpdateAsync` forces `Entry.State=Modified` on ALL columns → redundant full-column UPDATE.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | No full UPDATE | Tracked user edited | Handler saves | Single `SaveChangesAsync`; `UpdateAsync` NOT called |
| 6b | Tracking persists changes | Entity loaded via FindAsync/fetch | Fields assigned | EF tracks changes; `SaveChangesAsync` persists them |

## Verification Criteria

- [ ] Guard returns `Failure(NotFound, 404)` for non-owner, non-admin actor; envelope-404, not HTTP 403
- [ ] Tri-state: absent keeps / `""` clears / value assigns for CellPhone and Email
- [ ] `User?` null branch returns `Failure(NotFound, 404)` — no 500
- [ ] `bool? IsActive`; applied only when admin && `HasValue`
- [ ] No `UpdateAsync` call; single `SaveChangesAsync`
- [ ] `cancellationToken` forwarded where the repository signature allows
