# Delta for dto: UserListDto

**Domain**: `dto` — `UserListDto.cs`
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Active
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

---

## Delta for dto: UserDto

**Change**: `get-user-by-id-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: DT-G1 — `OwnerName` / `StoreName` Nullable

`OwnerName` and `StoreName` in `UserDto` MUST be declared as `string?` (nullable reference types). A user without an Owner or Store link is legal; the DTO MUST serialize `null` rather than throw or emit a default.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User has owner/store | User with full graph | DTO mapped | `ownerName`/`storeName` populated with `FullName`/store name |
| 1b | User has no owner | User with no Owner row | DTO mapped | `ownerName` is `null` — no NRE, no empty-string default |

#### Requirement: DT-G2 — `RoleNames` Default Initialization

`RoleNames` MUST be initialized with `= []` (empty collection) to guarantee non-null when projection yields no matching roles. Mirrors the `UserListDto` precedent (dto spec DT1).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | User has roles | User with active roles | DTO mapped | `RoleNames` contains the role name strings |
| 2b | User has no roles | User with zero matching roles | DTO mapped | `RoleNames` is empty enumerable, not null — iteration is safe |

### Verification Criteria

- [ ] `OwnerName`/`StoreName` declared `string?`
- [ ] `RoleNames` declaration includes `= []` initializer
- [ ] No null-reference path when serializing a user with no owner/store/roles
