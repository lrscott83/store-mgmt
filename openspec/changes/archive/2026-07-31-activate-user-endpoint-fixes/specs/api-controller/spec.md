# Delta for api-controller: ActivateUserAsync + Namespace Move

**Domain**: `api-controller` — `UsersController.cs` (`ActivateUserAsync`, `POST /api/v1/users/activate`)
**Change**: `activate-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: UC-A1 — Swagger Documents 400, 401, 403, 404 (F5)

`ActivateUserAsync` MUST add `[ProducesResponseType]` for 400, 401, 403, and 404 after the existing 200 (mirror `DeleteUserAsync`:77-87). The `[FromBody] ActivateUserCommand command` signature and its XML doc MUST be kept. Additive edit only — MUST NOT clobber the uncommitted `UpdatedAsync` (:59-70) or post-archive `DeleteUserAsync` (:77-87) metadata blocks.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | All four documented | Swagger/OpenAPI generated | ActivateUserAsync inspected | 400, 401, 403, 404 listed as possible responses |
| 1b | 200 preserved | Swagger/OpenAPI generated | Endpoint inspected | 200 OK remains in the response list |
| 1c | Signature intact | Controller source inspected | `ActivateUserAsync` declaration | `[FromBody]` + command param + XML doc unchanged |

### Requirement: UC-A2 — Namespace Move to UserManagement (NS-D1)

The command and validator namespaces MUST move from `Application.Features.Management.Users.Commands.ActivateUser` to `Application.Features.UserManagement.Users.Commands.ActivateUser`, and the `using` in `UsersController.cs:3` MUST be updated to match. Exactly 3 references exist (command file, validator file, controller using — grep-verified). Zero behavioral change.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | All refs moved | Change applied | Build project | 3/3 references on new namespace; compile succeeds |

## Verification Criteria

- [ ] `ActivateUserAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`; 200 remains
- [ ] `[FromBody]` + XML doc preserved; `UpdatedAsync`/`DeleteUserAsync` metadata untouched
- [ ] Namespace migrated in exactly 3 places; backend compiles
- [ ] Existing E2E tests pass unchanged (additive metadata + namespace only)
