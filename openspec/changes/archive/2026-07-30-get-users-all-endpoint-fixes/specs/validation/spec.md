# Delta for validation: GetAllUsersQueryValidator (NEW)

**Domain**: `validation` — `GetAllUsersQueryValidator.cs` (new file)
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: VL1 — New Validator Class at Project Conventional Path

A new `GetAllUsersQueryValidator` class SHALL be created at:
`Application/Features/UserManagement/Users/Queries/GetAllUsers/GetAllUsersQueryValidator.cs`

The class MUST extend `AbstractValidator<GetAllUsersQuery>` and follow the project convention (same namespace, same pattern as `GetUserByIdQueryValidator`). Since `GetAllUsersQuery` has only a non-nullable `bool IncludeInactive` property, the validator body MAY be empty or contain a structural `NotNull()` rule for consistency — no async DB existence check is needed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Validator exists | File system inspected | `GetAllUsers` query directory | `GetAllUsersQueryValidator.cs` present |
| 1b | Validation pipeline passes | Request with `includeInactive=true` | MediatR pipeline runs validator | No validation error (bool is always valid) |
| 1c | No DB query on validation | Any valid request | Validator executes | Zero DB queries from validator |

## Verification Criteria

- [ ] `GetAllUsersQueryValidator.cs` exists at the conventional path
- [ ] Class extends `AbstractValidator<GetAllUsersQuery>`
- [ ] No async existence check queries the database
