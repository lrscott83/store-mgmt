# Delta for command-handler: GetAllUsersQueryHandler

**Domain**: `command-handler` — `GetAllUsersQuery.cs`
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: CH1 — CancellationToken Propagation Through FindUsersIncludingRoles

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

## Verification Criteria

- [ ] `FindUsersIncludingRoles` signature includes `CancellationToken cancellationToken`
- [ ] All 3 `_userRepository` calls pass `cancellationToken` as final argument
