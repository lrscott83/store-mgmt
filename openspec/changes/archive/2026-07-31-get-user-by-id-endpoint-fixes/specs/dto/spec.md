# Delta for dto: UserDto

**Domain**: `dto` — `UserDto.cs`
**Change**: `get-user-by-id-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: DT-G1 — `OwnerName` / `StoreName` Nullable

`OwnerName` and `StoreName` in `UserDto` MUST be declared as `string?` (nullable reference types). A user without an Owner or Store link is legal; the DTO MUST serialize `null` rather than throw or emit a default.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User has owner/store | User with full graph | DTO mapped | `ownerName`/`storeName` populated with `FullName`/store name |
| 1b | User has no owner | User with no Owner row | DTO mapped | `ownerName` is `null` — no NRE, no empty-string default |

### Requirement: DT-G2 — `RoleNames` Default Initialization

`RoleNames` MUST be initialized with `= []` (empty collection) to guarantee non-null when projection yields no matching roles. Mirrors the `UserListDto` precedent (dto spec DT1).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | User has roles | User with active roles | DTO mapped | `RoleNames` contains the role name strings |
| 2b | User has no roles | User with zero matching roles | DTO mapped | `RoleNames` is empty enumerable, not null — iteration is safe |

## Verification Criteria

- [ ] `OwnerName`/`StoreName` declared `string?`
- [ ] `RoleNames` declaration includes `= []` initializer
- [ ] No null-reference path when serializing a user with no owner/store/roles
