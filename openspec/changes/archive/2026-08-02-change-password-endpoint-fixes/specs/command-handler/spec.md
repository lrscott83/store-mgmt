# Delta for command-handler: UpdateUserPasswordCommand Handler Contract

**Domain**: `command-handler` — `UpdateUserPasswordCommand.cs` (handler)
**Change**: `change-password-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: CH-CPW1 — Null-Guard Returns Envelope 404 (No NRE)

The handler MUST null-check the user fetched via `GetByIdAsync(request.UserId)`; a null user MUST return `ResponseResult.Failure<bool>(UserErrors.NotFound, 404)` (mirrors `UpdateUserCommand.cs:46-48`). Today the handler dereferences `user.Password` on a null race (validated-then-deleted) → 500.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Null guard | User deleted mid-request | Handler executes | Envelope 404 `UserNotFound`; no 500 |
| 1b | Live user | User exists | Handler executes | Proceeds to branch logic |

### Requirement: CH-CPW2 — Self Branch Verifies Old Password with VerifyPassword

For `request.UserId == _httpContextService.UserExternalId` (self-service), the handler MUST call `_hashPasswordService.VerifyPassword(request.OldPassword, user.Password)` (mirrors `AuthenticationService.cs:44`) and MUST NOT compare two `HashPassword` outputs (the current random-salt compare at `:49-53` can NEVER match — dead code). A failed verify MUST return a failure with ActionCode 400 (wrong old password → real HTTP 400 via UC-CPW3).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Correct old password | `VerifyPassword` returns true | Self branch runs | Proceeds to hash + persist new password |
| 2b | Wrong old password | `VerifyPassword` returns false | Self branch runs | Failure envelope; ActionCode 400 |
| 2c | No hash-of-hash compare | Any self request | Handler executes | Zero `HashPassword` calls against `OldPassword` |

### Requirement: CH-CPW3 — Admin Branch Tenant-Scope Check (Anti-Enumeration)

For non-self targets, the handler MUST keep the admin gate (`IsSuperAdminOrOwnerAdmin`) AND MUST add a tenant-scope check: if the actor is NOT a SuperAdmin and `user.TenantId` != the `TenantId` claim (`_httpContextService.TenantId`), return envelope 404 (`UserNotFound`) — anti-enumeration, decision D4. SuperAdmin MUST bypass the tenant check (any tenant). Closes the cross-tenant IDOR via `FindAsync` filter-skip (`GenericRepository.cs:84`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Cross-tenant OwnerAdmin | OwnerAdmin actor; target TenantId ≠ claim | Admin branch runs | Envelope 404; no password change |
| 3b | Same-tenant OwnerAdmin | Target TenantId == claim | Admin branch runs | Resets password; 200 |
| 3c | SuperAdmin cross-tenant | SuperAdmin actor; any target tenant | Admin branch runs | Resets password; 200 |
| 3d | Non-admin non-self | StoreUser+Profile, target ≠ self | Admin branch runs | Envelope 404 (unchanged gate) |

### Requirement: CH-CPW4 — Real Failure Statuses via ActionCode (No 200+Envelope)

The handler MUST return `ResponseResult.Failure<T>` with the correct `ActionCode` (400 wrong-old-password / invalid; 404 null-race or out-of-tenant) so the controller's ActionCode switch (UC-CPW3) maps them to REAL HTTP statuses. Business failures MUST NOT be silently returned as `Ok(...)` 200+envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Wrong old password | Verify fails | Handler returns | Failure ActionCode 400 |
| 4b | Out-of-tenant | Tenant-scope check fails | Handler returns | Failure ActionCode 404 |
| 4c | Success | All guards pass; persist OK | Handler returns | `ResponseResult.Success(SaveChanges > 0)` |

### Requirement: CH-CPW5 — UpdateAsync + SaveChangesAsync Semantics Preserved (Untracked Entity)

The handler MUST keep `_userRepository.UpdateAsync(user)` before `_applicationUnitOfWork.SaveChangesAsync(ct)` and MUST set `user.Password = _hashPasswordService.HashPassword(request.NewPassword)` before persisting. `ApplicationDbContext` uses `QueryTrackingBehavior.NoTracking`, so `GetByIdAsync` (`FindAsync`) returns an UNTRACKED entity — `UpdateAsync` (`Entry.State = Modified`) is what attaches it; without it `SaveChangesAsync` sees no changes (same note as `UpdateUserCommand.cs:59-62`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | New password hashed | Guards pass | Handler persists | `user.Password` = BCrypt hash of NewPassword |
| 5b | Change persists | Untracked entity from `GetByIdAsync` | `UpdateAsync` runs | Entity attached; `SaveChangesAsync` persists |
| 5c | Result truth | Save affects 1 row | Handler returns | `Success(true)` |

## Verification Criteria

- [ ] Null user → envelope 404 (no NRE/500)
- [ ] Self branch uses `VerifyPassword`; zero hash-of-hash compare; wrong old → ActionCode 400
- [ ] Cross-tenant non-SuperAdmin admin → 404; SuperAdmin crosses tenants; same-tenant admin reset works
- [ ] `UpdateAsync` + `SaveChangesAsync` retained; NewPassword hashed before persist
