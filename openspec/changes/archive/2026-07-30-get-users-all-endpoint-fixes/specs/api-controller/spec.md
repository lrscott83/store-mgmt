# Delta for api-controller: GetAllUsersAsync

**Domain**: `api-controller` — `UsersController.cs` (`GetAllUsersAsync` action)
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: UC1 — Swagger Documents 400, 401, 403 for GetAllUsers

`GetAllUsersAsync` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger doc generated | Endpoint inspected | 400 BadRequest listed as possible response |
| 1b | 401 documented | Swagger doc generated | Endpoint inspected | 401 Unauthorized listed |
| 1c | 403 documented | Swagger doc generated | Endpoint inspected | 403 Forbidden listed |
| 1d | 200 remains | Swagger doc generated | Endpoint inspected | 200 OK still listed |

### Requirement: UC2 — `[FromRoute]` on `includeInactive`

The `includeInactive` parameter of `GetAllUsersAsync(bool includeInactive)` MUST be decorated with `[FromRoute]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `includeInactive` parameter declaration | `[FromRoute]` attribute present |

## Verification Criteria

- [ ] `GetAllUsersAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`
- [ ] `includeInactive` parameter has `[FromRoute]` attribute
- [ ] All existing tests pass unchanged (additive changes only)
