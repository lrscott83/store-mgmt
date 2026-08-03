# Delta for api-controller: OwnersController.GetOwnerAsync

**Domain**: `api-controller` — `SMCA.WebApi/Controllers/v1/OwnersController.cs:37-47`
**Change**: `owners-getbyid-endpoint-fixes`
**Source**: proposal.md → Modified Capabilities → `api-controller`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: OC-CT1 — Swagger Documents 400, 401, 403, 404, 500 for GetOwner

`GetOwnerAsync` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, `[ProducesResponseType(StatusCodes.Status404NotFound)]`, and `[ProducesResponseType(StatusCodes.Status500InternalServerError)]` in addition to the existing 200 (mirrors `GetAllOwnersAsync:27-31`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a–1e | Five error statuses documented | Swagger/OpenAPI generated | `GetOwnerAsync` endpoint inspected | 400, 401, 403, 404, 500 listed as possible responses |
| 1f | 200 preserved | Swagger/OpenAPI generated | `GetOwnerAsync` endpoint inspected | 200 OK with `ResponseResult<OwnerDto>` remains |

### Requirement: OC-CT2 — XML Doc Corrected + Param Documented

The XML `<summary>` on `GetOwnerAsync` MUST read "Get owner by id" — it currently reads "Get user by id". The action MUST carry `<param name="id">` documenting the route parameter.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary corrected | Controller source inspected | `GetOwnerAsync` declaration | `<summary>` text is "Get owner by id" |
| 2b | Param documented | Controller source inspected | `GetOwnerAsync` declaration | `<param name="id">` present |

## Verification Criteria

- [ ] `GetOwnerAsync` has `[ProducesResponseType]` for 400, 401, 403, 404, 500; 200 remains
- [ ] XML summary says "Get owner by id"; `<param name="id">` present
- [ ] Existing E2E tests pass unchanged (additive metadata only)
