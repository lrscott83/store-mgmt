# Proposal: Get Users All Endpoint Fixes

## Intent

Fix 8 issues in `GET /api/v1/users/all/{includeInactive}`: potential NRE (missing `.ThenInclude(o => o.User)`), no CancellationToken propagation, unbounded queries, missing OpenAPI metadata, DRY violations, and convention breaks.

## Scope

### In Scope

1. **NRE fix** — Add `.ThenInclude(o => o.User)` to all 3 Include chains
2. **CancellationToken propagation** — Pass token to 3 repo methods; update interface + impl
3. **ProducesResponseType** — Add `[ProducesResponseType(401/403/400)]` to controller
4. **Unbounded query safety** — Add `.Take(1000)` to all 3 repository queries
5. **Missing validator** — Create `GetAllUsersQueryValidator` per project pattern
6. **DRY Include chains** — Extract shared chain into private `IncludeStoreAndRoles()`
7. **Null-safety in DTO** — `RoleNames = []` in `UserListDto.cs`
8. **Missing [FromRoute]** — Add attribute to `includeInactive` parameter

### Out of Scope

- Pagination (Skip/Take parameters) — deferred for future feature
- New unit/integration tests — covered separately
- Fixing same issues in other endpoints (e.g., `GetUserById`) — separate change

## Approach

Per-file targeted fixes, no behavioral changes beyond described:

| File | Change |
|------|--------|
| `UserRepository.cs` | Add `.ThenInclude(o => o.User)`, `.Take(1000)`, CancellationToken, extract shared Include |
| `IUserRepository.cs` | Add `CancellationToken cancellationToken = default` to 3 signatures |
| `GetAllUsersQuery.cs` | Pass `cancellationToken` to repo calls |
| `GetAllUsersQueryValidator.cs` | **New** — minimal validator for consistency |
| `UsersController.cs` | Add `[FromRoute]` + `[ProducesResponseType]` attributes |
| `UserListDto.cs` | Initialize `RoleNames = []` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DRY refactor if Include chains differ | Low | Verify identical chain before extracting |
| CancellationToken breaks other implementations | Low | Search all IUserRepository usages |
| `.Take(1000)` truncates large results | Medium | Only affects this endpoint; pagination tracked in future |

## Rollback Plan

Revert files via `git checkout`. No migrations or DB changes.

## Dependencies

None.

## Success Criteria

- [ ] All 3 queries include `.ThenInclude(o => o.User)` on the Owner chain
- [ ] CancellationToken propagates to all 3 repo calls
- [ ] `.Take(1000)` active on all 3 queries
- [ ] Swagger shows 400, 401, 403 response codes
- [ ] `GetAllUsersQueryValidator` exists
- [ ] `RoleNames = []` (not null)
- [ ] `[FromRoute]` declared on `includeInactive`
