# Delta for api-controller: UpdatedAsync

**Domain**: `api-controller` — `UsersController.cs` (`UpdatedAsync` action, `PUT /api/v1/users/{id}`)
**Change**: `update-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: UC-U1 — Swagger Documents 400, 401, 403, 404 for UpdatedAsync

The `UpdatedAsync` action MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status404NotFound)]` in addition to the existing `[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]`, mirroring `GetAllUsersAsync` (`UsersController.cs:29-32`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 404 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 404 NotFound listed as possible response |
| 1e | 200 preserved | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 200 OK with `ResponseResult<bool>` remains in the response list |

### Requirement: UC-U2 — `[FromRoute]` on `id` Parameter

The `id` parameter of `UpdatedAsync(Guid id, ...)` MUST be decorated with `[FromRoute]`, matching `GetAllUsersAsync`'s `[FromRoute] bool includeInactive` (`UsersController.cs:35`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `id` parameter declaration | `[FromRoute]` attribute present |

### Requirement: UC-U3 — Response Contract: HTTP 200 + Envelope (ActionCode 404 Possible)

The `UpdatedAsync` action MUST return HTTP 200 with a `ResponseResult<bool>` envelope for all handled outcomes. Handler-level denials (ownership guard, race guard) SHALL surface as `succeeded=false` + `ActionCode=404` inside the 200 envelope — NOT as HTTP 404 or 403 status codes.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Success | Legit actor updates own or admin-authorized target | PUT issued | HTTP 200; envelope `succeeded=true` |
| 3b | IDOR denial | Non-admin actor PUTs another user's id | Handler guard fires | HTTP 200; envelope `succeeded=false`, ActionCode 404 |
| 3c | Race denial | User deleted between validation and handler | Handler runs | HTTP 200; envelope `succeeded=false`, ActionCode 404 |

## Verification Criteria

- [ ] `UpdatedAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`; 200 with `ResponseResult<bool>` remains
- [ ] `id` parameter has `[FromRoute]` attribute
- [ ] All existing E2E tests pass unchanged (additive metadata only)
