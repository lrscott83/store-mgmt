# Delta for api-controller: GetUserByIdAsync

**Domain**: `api-controller` — `UsersController.cs` (`GetUserAsync` action, `GET /api/v1/users/{id}`)
**Change**: `get-user-by-id-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: UC-G1 — Swagger Documents 400, 401, 403 for GetUserById

The `GetUserAsync` action MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]` in addition to the existing `[ProducesResponseType(typeof(ResponseResult<UserDto>), StatusCodes.Status200OK)]`, mirroring `GetAllUsersAsync` (`UsersController.cs:29-32`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 200 preserved | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 200 OK with `ResponseResult<UserDto>` remains in the response list |

### Requirement: UC-G2 — `[FromRoute]` on `id` Parameter

The `id` parameter of `GetUserAsync(Guid id)` MUST be decorated with `[FromRoute]`, matching `GetAllUsersAsync`'s `[FromRoute] bool includeInactive` (`UsersController.cs:35`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `id` parameter declaration | `[FromRoute]` attribute present |

## Verification Criteria

- [ ] `GetUserAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`; 200 remains
- [ ] `id` parameter has `[FromRoute]` attribute
- [ ] All existing E2E tests pass unchanged (additive metadata only)
