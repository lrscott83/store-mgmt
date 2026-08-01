# Delta for user-repository: IUserRoleRepository.GetByUserIdAsync

**Domain**: `user-repository` — `IUserRoleRepository.cs` + `UserRoleRepository.cs`
**Change**: `user-roles-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-01

---

## ADDED Requirements

### Requirement: RR-R1 — GetByUserIdAsync Single-Query Contract

`IUserRoleRepository` MUST add `Task<IEnumerable<UserRole>> GetByUserIdAsync(Guid userId)`, and `UserRoleRepository` MUST implement it as a single `Where(ur => ur.UserId == userId).ToListAsync()` query (no `.Include`). It MUST return ALL rows for the user (active and inactive) — the caller decides activation. Sole caller: `AddUserRolesCommandHandler` (CH-R3), replacing the deferred per-role `Where(...)` re-queries.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Rows exist | User with 2 UserRole rows | `GetByUserIdAsync(userId)` | 1 query; 2 rows returned |
| 1b | No rows | User with no UserRole rows | `GetByUserIdAsync(userId)` | 1 query; empty result |
| 1c | No Include | Any call | Query executes | No Role navigation loaded; row state decided by handler |

## Verification Criteria

- [ ] Interface method + implementation exist
- [ ] Single query; no `.Include`; no per-row re-query
- [ ] Used by AddUserRoles handler (N+1 killed)
