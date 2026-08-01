# Delta for command-handler: DeleteUserCommandHandler

**Domain**: `command-handler` — `DeleteUserCommand.cs` + `DeleteUserCommandHandler.cs`
**Change**: `delete-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: CH-D1 — Auth Guard Returns Real HTTP 403 (D2)

The handler MUST throw `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` when `!_httpContextService.IsSuperAdminOrOwnerAdmin`, evaluated FIRST in `Handle`. Permission failures MUST NOT surface as 400 `UserNotFound`. The guard is RETAINED — it is NOT redundant with the `[HasPermission]` filter: a feature-granted StoreUser passes the filter and MUST still be blocked here. Mirrors `DeactivateStoreCommand.cs:37-38`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Feature-granted StoreUser blocked | Actor from `SeedStoreUserAsync((int)FeatureType.Users)`; victim user | DELETE issued | HTTP 403 + `DontHavePermission` |
| 1b | Admin bypass | SuperAdmin/OwnerAdmin actor | DELETE issued | Guard passes; handler continues |
| 1c | No 400 mask | Non-admin actor | DELETE issued | 403 thrown — NOT 400 `UserNotFound` |

### Requirement: CH-D2 — Self-Delete Guard Returns 400 (D3)

Immediately after the auth guard and BEFORE any repository call, the handler MUST compare `request.Id` with `_httpContextService.UserExternalId.ToGuid()` (`using Domain.Common.Extensions;`) and MUST throw `ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest)` on match.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Self-delete blocked | SuperAdmin sends own user id | DELETE issued | HTTP 400 + `CannotDeleteSelf`; no DB write |
| 2b | Different user proceeds | Actor deletes another user's id | DELETE issued | Guard passes; handler continues |

### Requirement: CH-D3 — Non-Existent User Returns Real HTTP 404 (D1)

The handler MUST fetch via `GetByIdAsync(request.Id, cancellationToken)`; when the result is null, MUST throw `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` (mirrors `DeactivateStoreCommand.cs:41-42`). Code moves TO main spec `users-e2e` R4 (row already reads 404).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Non-existent id | Well-formed GUID not in DB | DELETE issued | HTTP 404 + `UserNotFound` |
| 3b | Existing user | User exists (active or inactive) | Handler fetches | Non-null; proceeds to soft-delete |

### Requirement: CH-D4 — Soft-Delete Persistence + Token Propagation

On a non-null user, the handler MUST set `IsActive = false`, call `UpdateAsync(user)`, and persist via `SaveChangesAsync(cancellationToken)` returning > 0. The `cancellationToken` MUST be forwarded to the repository calls (`GetByIdAsync`, `SaveChangesAsync`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Soft-delete | Active victim | DELETE issued | 200; IsActive=false; change persisted |
| 4b | Already inactive | Inactive victim | DELETE issued | 200; IsActive stays false |
| 4c | Token reaches EF | Any request | Handler executes | Token flows into repository calls |

## Verification Criteria

- [ ] Guard order: 403 auth → 400 self-delete → `GetByIdAsync` → null 404 → soft-delete; all real HTTP statuses via `ApiException`
- [ ] Single DB existence check (handler only) — 1 round-trip total
- [ ] `DontHavePermission` / `CannotDeleteSelf` / `UserNotFound` keys resolve via localizer
