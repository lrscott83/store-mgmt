# Delta for command-handler: ActivateUserCommandHandler

**Domain**: `command-handler` — `ActivateUserCommand.cs` (ActivateUserCommandHandler)
**Change**: `activate-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

> **Scope amendment (user decision)**: the proposal's "Bonus" item (`ActivateStoreCommand` guard + validator fixes) is **OUT OF SCOPE**. `ActivateStoreCommand` is left untouched; its guard bug (`ApiException(UserNotFound, BadRequest)` at `ActivateStoreCommand.cs:46-47`) is recorded as pending debt in the plan doc only. No requirement below targets it.

---

## MODIFIED Requirements

### Requirement: CH-A1 — Auth Guard Returns Real HTTP 403 (F2)

The handler MUST throw `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` when `!_httpContextService.IsSuperAdminOrOwnerAdmin`, evaluated FIRST in `Handle` — exact mirror of `DeleteUserCommand.cs:39`. Permission failures MUST NOT surface as 400 `UserNotFound`. The guard is RETAINED — not redundant with the `[HasPermission(UsersAdmin)]` filter: a feature-granted StoreUser passes the filter and MUST still be blocked here.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Feature-granted StoreUser blocked | Actor from `SeedStoreUserAsync((int)FeatureType.Users)`; victim user | Activate issued | HTTP 403 + `DontHavePermission` |
| 1b | Admin bypass | SuperAdmin/OwnerAdmin actor | Activate issued | Guard passes; handler continues |
| 1c | No 400 mask | Non-admin actor | Activate issued | 403 thrown — NOT 400 `UserNotFound` |

### Requirement: CH-A2 — IsActive Flag Honored (F1)

The handler MUST set `user.IsActive = request.IsActive;` — replacing the hardcoded `true`. The endpoint SHALL activate AND deactivate per the request body. Frontend verified activate-only today (never sends `false`) — zero-risk contract change.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Deactivate | Body `IsActive:false` | Handler assigns | 200; user.IsActive == false; persisted |
| 2b | Activate | Body `IsActive:true` | Handler assigns | 200; user.IsActive == true; persisted |
| 2c | Re-activate active | `IsActive:true`, already active | Handler assigns | 200 `data:true` — EF marks Modified on no-op (expected, not a bug) |

### Requirement: CH-A3 — Non-Existent User Returns Real HTTP 404 (F3)

The handler MUST fetch via `GetByIdAsync(request.Id)` — NO CancellationToken (no token overload exists, `IGenericRepository.cs:22`); when null, MUST throw `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` — exact mirror of `DeleteUserCommand.cs:46`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Non-existent id | Well-formed GUID not in DB | Activate issued | HTTP 404 + `UserNotFound` |
| 3b | Existing user | User exists | Handler fetches | Non-null; proceeds to assign + persist |

### Requirement: CH-A4 — Persistence REQUIRES UpdateAsync (NoTracking)

On a non-null user, the handler MUST keep `UpdateAsync(user)` followed by `SaveChangesAsync(cancellationToken)` returning > 0. `UpdateAsync` is REQUIRED — `ApplicationDbContext.cs:45` sets `QueryTrackingBehavior.NoTracking`; dropping it makes `SaveChangesAsync` detect zero changes → silent no-op. The `cancellationToken` MUST be forwarded to `SaveChangesAsync` (`GetByIdAsync` accepts none).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Persistence | Victim; body `IsActive:false` | Handler executes | UpdateAsync attaches entity; SaveChangesAsync > 0; change persisted |
| 4b | No silent no-op | NoTracking context | Handler executes | `UpdateAsync` NEVER removed; real change never returns 0 |
| 4c | Token reaches EF | Any request | Handler executes | Token flows into `SaveChangesAsync` |

## Verification Criteria

- [ ] Guard order: 403 auth (`DontHavePermission`) FIRST → `GetByIdAsync` → null 404 (`UserNotFound`) → `user.IsActive = request.IsActive` → `UpdateAsync` + `SaveChangesAsync(ct)`
- [ ] Single DB existence check (handler only) — 1 round-trip total
- [ ] `ActivateStoreCommand` untouched (out of scope — debt noted in plan doc)
