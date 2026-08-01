# Delta for api-controller: AddUserRolesAsync + RemoveUserRolesAsync

**Domain**: `api-controller` — `UsersController.cs:108-126`
**Change**: `user-roles-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-01

---

## ADDED Requirements

### Requirement: UC-R1 — `[FromBody]` on Both Command Parameters

`AddUserRolesAsync(AddUserRolesCommand command)` and `RemoveUserRolesAsync(DeleteUserRolesCommand command)` MUST decorate the command parameter with `[FromBody]` (mirrors `UpdatedAsync:66` / `ActivateUserAsync:99`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | AddUserRoles | Controller source inspected | `AddUserRolesAsync` declaration | `[FromBody]` present on command param |
| 1b | DeleteUserRoles | Controller source inspected | `RemoveUserRolesAsync` declaration | `[FromBody]` present on command param |

### Requirement: UC-R2 — Swagger Documents 400, 401, 403, 404 on Both Actions

Both actions MUST declare `[ProducesResponseType]` for 400, 401, 403, and 404 in addition to the existing 200 (`ResponseResult<IEnumerable<ListViewDto>>`), mirroring `DeleteUserAsync:78-82`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | 400 documented | Swagger doc generated | AddUserRolesAsync inspected | 400 BadRequest listed |
| 2b | 401 documented | Swagger doc generated | AddUserRolesAsync inspected | 401 Unauthorized listed |
| 2c | 403 documented | Swagger doc generated | AddUserRolesAsync inspected | 403 Forbidden listed |
| 2d | 404 documented | Swagger doc generated | AddUserRolesAsync inspected | 404 NotFound listed |
| 2e | 200 preserved | Swagger doc generated | AddUserRolesAsync inspected | 200 with `ResponseResult<IEnumerable<ListViewDto>>` remains |
| 2f–2j | Same 5 for DeleteUserRoles | Swagger doc generated | RemoveUserRolesAsync inspected | All 4 new + 200 listed |

## Verification Criteria

- [ ] `[FromBody]` on both command parameters
- [ ] Both actions declare 400/401/403/404 + existing 200
- [ ] Existing E2E tests pass unchanged (additive metadata only)
