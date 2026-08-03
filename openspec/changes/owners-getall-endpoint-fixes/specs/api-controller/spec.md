# Delta for api-controller: OwnersController.GetAllOwnersAsync

**Domain**: `api-controller` — `SMCA.WebApi/Controllers/v1/OwnersController.cs:21-31`
**Change**: `owners-getall-endpoint-fixes`
**Source**: proposal.md → Modified Capabilities → `api-controller`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: OC-CT1 — Swagger Documents 400, 401, 403, 500 for GetAllOwners

`GetAllOwnersAsync` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status500InternalServerError)]` in addition to the existing 200, mirroring prior endpoint-fixes deltas (`GetAllUsersAsync`, `GetUserByIdAsync`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a–1d | Four error statuses documented | Swagger/OpenAPI generated | `GetAllOwnersAsync` endpoint inspected | 400, 401, 403, 500 listed as possible responses |
| 1e | 200 preserved | Swagger/OpenAPI generated | `GetAllOwnersAsync` endpoint inspected | 200 OK with `ResponseResult<List<OwnerDto>>` remains |

### Requirement: OC-CT2 — XML Doc Corrected + Param Documented

The XML `<summary>` on `GetAllOwnersAsync` MUST read "Get all owners" — it currently reads "Get all users", incorrect copy referencing users instead of owners. The action MUST also carry `<param name="includeInactive">` documenting the route parameter.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary corrected | Controller source inspected | `GetAllOwnersAsync` declaration | `<summary>` text is "Get all owners" |
| 2b | Param documented | Controller source inspected | `GetAllOwnersAsync` declaration | `<param name="includeInactive">` present |

## Verification Criteria

- [ ] `GetAllOwnersAsync` has `[ProducesResponseType]` for 400, 401, 403, 500; 200 remains
- [ ] XML summary says "Get all owners"; `<param name="includeInactive">` present
- [ ] All existing E2E tests (`OwnersListTests`, `OwnersListGapTests`) pass unchanged (additive metadata only)
