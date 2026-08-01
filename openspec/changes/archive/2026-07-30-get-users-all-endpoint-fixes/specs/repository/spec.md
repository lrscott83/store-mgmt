# Delta for repository: IUserRepository + UserRepository

**Domain**: `repository` — `IUserRepository.cs` + `UserRepository.cs`
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: RR1 — `.ThenInclude(o => o.User)` in All 3 Include Chains

Each of the 3 methods in `UserRepository` SHALL add `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` on the StoreUser → Store → Owner chain. This eliminates the NRE when AutoMapper accesses `Owner.User.FullName` (`UserProfile.cs` line 15).

**Affected methods:**
- `GetAllUsersByStoreIdIncludingStoreAndRolesAsync`
- `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync`
- `GetAllUsersIncludingStoreAndRolesAsync`

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | NPE prevented | User with Owner but Owner.User lazy-loaded | AutoMapper maps `Owner.User.FullName` | `Owner.User` is eagerly loaded — no NRE, correct name returned |

### Requirement: RR2 — `.Take(1000)` Safety Limit on All 3 Queries

Each of the 3 repository methods MUST append `.Take(1000)` before `.ToListAsync()` to prevent unbounded result sets.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Limit applied | DB has 5000+ users | Query executes | SQL includes TOP(1000) / LIMIT 1000, exactly 1000 rows returned |
| 2b | Small result unaffected | DB has 50 users | Query executes | SQL includes LIMIT 1000, all 50 rows returned |

### Requirement: RR3 — CancellationToken Parameter on Interface + Implementation

All 3 repository methods in `IUserRepository` MUST add `CancellationToken cancellationToken = default` as the final parameter. The corresponding implementations in `UserRepository` MUST accept and pass the token to `ToListAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Token passed to EF | Request with cancellation token | Query executes | `ToListAsync(cancellationToken)` called with the provided token |
| 3b | Default when omitted | Existing callers not passing token (legacy) | Same method called | `cancellationToken = default` applies, no compile errors |

### Requirement: RR4 — Private `IncludeStoreAndRoles()` Helper Method

A private helper method SHALL be extracted in `UserRepository` to eliminate the duplicated Include/ThenInclude chain (`StoreUser → Store → Owner` + `UserRoles → Role`) across the 3 methods.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | DRY applied | All 3 query methods inspected | Include chain examined | Single helper called instead of inline duplicates |
| 4b | Semantic equivalence | Any of the 3 query methods | Query executes | Generated SQL is identical to inline version |

## Verification Criteria

- [ ] All 3 Include chains have `.ThenInclude(o => o.User)` on the Owner navigation
- [ ] All 3 queries have `.Take(1000)` before `ToListAsync`
- [ ] All 3 interface signatures include `CancellationToken cancellationToken = default`
- [ ] All 3 implementations pass token to `ToListAsync(cancellationToken)`
- [ ] Private `IncludeStoreAndRoles()` helper eliminates duplicated Include chains
