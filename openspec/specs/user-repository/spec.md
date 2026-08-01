# User Repository Specification

**Capability**: `IsUniqueLoginAsync` real async behavior  
**Origin**: SDD change `2026-07-30-register-endpoint-fixes`  
**Status**: Active  
**Last Updated**: 2026-07-31

---

## Purpose

Ensure the `UserRepository.IsUniqueLoginAsync` method performs a real async database query using `AnyAsync()` instead of faking async with `Task.FromResult()`.

---

## Specification

### UR1: IsUniqueLoginAsync Uses Real Async

**Requirement**: MUST use `AnyAsync()` — NOT `Task.FromResult(All(...))`, `ToList()`, sync `.Any()/.All()`. Returns `true` when the login is UNIQUE/absent (no row with that login), `false` when the login EXISTS (`!await AnyAsync(...)` — negation of "login present").

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Login exists | `"existingUser"` in DB | `IsUniqueLoginAsync("existingUser")` | Returns `false` (login already taken — not unique) |
| 4b | Login absent | `"newUser"` not in DB | `IsUniqueLoginAsync("newUser")` | Returns `true` (login is unique/available) |
| 4c | No sync EF | Any call | Implementation inspected | Uses `AnyAsync()` only — no `Task.FromResult`, `ToList`, sync `.Any()/.All()`, `.AsEnumerable`, `.ToArray` |

## Verification Criteria

- [ ] Unit test verifies `AnyAsync` is called (not `Task.FromResult`) — no dedicated repository-level test exists; verified via static analysis (see archived `2026-07-30-register-endpoint-fixes` verify-report, "Uses `AnyAsync()`, not `Task.FromResult`" row)
- [x] Integration test verifies correct true/false behavior with real DB — E2E duplicate-login tests (login exists → `IsUniqueLoginAsync` false → 400): `StoreUsersCrudTests.Create_duplicate_login_returns_400`, `AuthRegisterDuplicateTests.Register_with_duplicate_login_returns_400`, `OwnersCreateValidationTests.Create_duplicate_login_400_Login`; first-time creation (login absent → true → 200) in the same tests

## Related Specifications

- **auth-http** — Register contract (caller of `IsUniqueLoginAsync`)

---

## Delta for user-repository: IUserRoleRepository.GetByUserIdAsync

**Change**: `user-roles-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: RR-R1 — GetByUserIdAsync Single-Query Contract

`IUserRoleRepository` MUST add `Task<IReadOnlyList<UserRole>> GetByUserIdAsync(Guid userId)`, and `UserRoleRepository` MUST implement it as a single `Where(ur => ur.UserId == userId).ToListAsync()` query (no `.Include`). It MUST return ALL rows for the user (active and inactive) — the caller decides activation. Sole caller: `AddUserRolesCommandHandler` (CH-R3), replacing the deferred per-role `Where(...)` re-queries.

> **Archive alignment note (2026-08-01)**: spec text aligned to the implemented signature `IReadOnlyList<UserRole>` (+ `CancellationToken ct` per orchestrator instruction; `AsTracking()` added per `ApplicationDbContext` NoTracking default — see `user-roles-endpoint-fixes` verify-report, Coherence D3). The delta draft said `IEnumerable<UserRole>`; the implementation returns `IReadOnlyList<UserRole>`. Additive — zero behavior change for read-only callers.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Rows exist | User with 2 UserRole rows | `GetByUserIdAsync(userId)` | 1 query; 2 rows returned |
| 1b | No rows | User with no UserRole rows | `GetByUserIdAsync(userId)` | 1 query; empty result |
| 1c | No Include | Any call | Query executes | No Role navigation loaded; row state decided by handler |

### Verification Criteria

- [x] Interface method + implementation exist
- [x] Single query; no `.Include`; no per-row re-query
- [x] Used by AddUserRoles handler (N+1 killed) — verified statically + exercised at runtime by all `UsersRolesTests` Add flows (11/11 GREEN, verify re-run 2026-08-01)
