# Delta for dto: UserListDto

**Domain**: `dto` — `UserListDto.cs`
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## MODIFIED Requirements

### Requirement: DT1 — RoleNames Default Initialization

The `RoleNames` property in `UserListDto` MUST be initialized with `= []` (empty collection) to guarantee non-null even when AutoMapper's `ForMember` projection yields no matching roles.

| Aspect | Before | After |
|--------|--------|-------|
| Declaration | `IEnumerable<string> RoleNames { get; set; }` | `IEnumerable<string> RoleNames { get; set; } = []` |
| Default value | `null` | `[]` (empty `IEnumerable<string>`) |
| Caller NRE risk | Yes, if user has zero roles | None |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User has roles | User with 2 active roles | `GetAllUsers` executes | `RoleNames` contains 2 role name strings |
| 1b | User has no roles | User with zero active roles | `GetAllUsers` executes | `RoleNames` is empty enumerable, not null (iteration is safe) |

## Verification Criteria

- [ ] `RoleNames` declaration includes `= []` initializer
- [ ] No null-reference path exists when iterating `RoleNames` on a user with zero roles
