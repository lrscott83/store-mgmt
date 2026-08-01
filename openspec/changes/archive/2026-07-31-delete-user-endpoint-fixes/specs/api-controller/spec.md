# Delta for api-controller: DeleteUserAsync

**Domain**: `api-controller` — `UsersController.cs` (`DeleteUserAsync`, `DELETE /api/v1/users/{id}`)
**Change**: `delete-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: UC-D1 — Swagger Documents 400, 401, 403, 404

`DeleteUserAsync` MUST declare `[ProducesResponseType]` for 400, 401, 403, and 404 in addition to the existing 200, mirroring the uncommitted `UpdatedAsync` diff verbatim.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | All four documented | Swagger/OpenAPI generated | Endpoint inspected | 400, 401, 403, 404 listed as possible responses |
| 1b | 200 preserved | Swagger/OpenAPI generated | Endpoint inspected | 200 OK remains in the response list |

### Requirement: UC-D2 — `[FromRoute]` on `id` Parameter

The `id` parameter of `DeleteUserAsync(Guid id)` MUST be decorated with `[FromRoute]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `id` parameter declaration | `[FromRoute]` attribute present |

### Requirement: UC-D3 — XML `<param>` Doc for `id`

`DeleteUserAsync` MUST carry `<param name="id">User Id</param>` XML doc (mirrors `GetUserAsync:43`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Param doc present | Controller source inspected | `DeleteUserAsync` declaration | `<param name="id">User Id</param>` present |

## Verification Criteria

- [ ] `DeleteUserAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`; 200 remains
- [ ] `id` parameter has `[FromRoute]` attribute
- [ ] `<param name="id">User Id</param>` XML doc present
- [ ] All existing E2E tests pass unchanged (additive metadata only)
