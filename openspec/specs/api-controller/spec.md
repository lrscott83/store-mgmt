# Delta for api-controller: StoresController

**Domain**: `api-controller` — `StoresController.cs` (`UpdateStoreAsync` action)  
**Change**: `update-store-endpoint-fixes`  
**Status**: Draft  
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: CT1 — Swagger Documents 400, 401, 403 for UpdateStore

The `UpdateStoreAsync` action in `StoresController` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]` as additional response metadata.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 200 still documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 200 OK remains in the response list |

## Verification Criteria

- [ ] `UpdateStoreAsync` has `[ProducesResponseType(StatusCodes.Status400BadRequest)]` attribute
- [ ] `UpdateStoreAsync` has `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` attribute
- [ ] `UpdateStoreAsync` has `[ProducesResponseType(StatusCodes.Status403Forbidden)]` attribute
- [ ] Swagger UI renders all 4 response codes for the endpoint

---

## Delta for api-controller: GetUserByIdAsync

**Change**: `get-user-by-id-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: UC-G1 — Swagger Documents 400, 401, 403 for GetUserById

The `GetUserAsync` action MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]` in addition to the existing `[ProducesResponseType(typeof(ResponseResult<UserDto>), StatusCodes.Status200OK)]`, mirroring `GetAllUsersAsync` (`UsersController.cs:29-32`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 200 preserved | Swagger/OpenAPI document generated | `GetUserAsync` endpoint inspected | 200 OK with `ResponseResult<UserDto>` remains in the response list |

#### Requirement: UC-G2 — `[FromRoute]` on `id` Parameter

The `id` parameter of `GetUserAsync(Guid id)` MUST be decorated with `[FromRoute]`, matching `GetAllUsersAsync`'s `[FromRoute] bool includeInactive` (`UsersController.cs:35`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `id` parameter declaration | `[FromRoute]` attribute present |

### Verification Criteria

- [ ] `GetUserAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`; 200 remains
- [ ] `id` parameter has `[FromRoute]` attribute
- [ ] All existing E2E tests pass unchanged (additive metadata only)

---

## Delta for api-controller: ApproveStore + DisapproveStore

**Change**: `approve-store-endpoint-fixes`

---

### ADDED Requirements

#### SM-CA1 — XML `<summary>` Doc on Both Actions

Each action (`ApproveStoreAsync`, `DisapproveStoreAsync`) MUST have an XML `<summary>` comment describing its purpose.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Approve doc present | Source file inspected | `ApproveStoreAsync` declaration | `<summary>` exists with meaningful description |
| 1b | Disapprove doc present | Source file inspected | `DisapproveStoreAsync` declaration | `<summary>` exists with meaningful description |

#### SM-CA2 — `[FromBody]` Attribute on Command Parameter

Both action parameters of type `ApproveStoreCommand` / `DisapproveStoreCommand` MUST be decorated with `[FromBody]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Approve has [FromBody] | Controller source inspected | `ApproveStoreAsync(ApproveStoreCommand command)` | `[FromBody]` present on `command` parameter |
| 2b | Disapprove has [FromBody] | Controller source inspected | `DisapproveStoreAsync(DisapproveStoreCommand command)` | `[FromBody]` present on `command` parameter |

#### SM-CA3 — `[ProducesResponseType]` for 400, 401, 403, 404

Both actions MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status404NotFound)]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 400 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 400 BadRequest listed as possible response |
| 3b | 401 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 401 Unauthorized listed |
| 3c | 403 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 403 Forbidden listed |
| 3d | 404 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 404 NotFound listed |
| 3e | 200 remains | Swagger doc inspected | ApproveStoreAsync endpoint | 200 OK still listed |
| 3f–3j | Same 5 for Disapprove | Swagger doc inspected | DisapproveStoreAsync endpoint | All 4 new + 200 listed |

#### SM-CA4 — Same 3 Changes Mirror to DisapproveStoreAsync

SM-CA1 through SM-CA3 SHALL be applied identically to `DisapproveStoreAsync`. No behavioral difference between the two actions.

### Verification Criteria

- [ ] `ApproveStoreAsync` has XML `<summary>` doc
- [ ] `ApproveStoreAsync` has `[FromBody]` on command param
- [ ] `ApproveStoreAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`
- [ ] Same 3 checks pass for `DisapproveStoreAsync`
- [ ] All existing E2E tests pass unchanged (controller changes are additive only)

---

## Delta for api-controller: GetAllUsersAsync

**Change**: `2026-07-30-get-users-all-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: UC1 — Swagger Documents 400, 401, 403 for GetAllUsers

`GetAllUsersAsync` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger doc generated | Endpoint inspected | 400 BadRequest listed as possible response |
| 1b | 401 documented | Swagger doc generated | Endpoint inspected | 401 Unauthorized listed |
| 1c | 403 documented | Swagger doc generated | Endpoint inspected | 403 Forbidden listed |
| 1d | 200 remains | Swagger doc generated | Endpoint inspected | 200 OK still listed |

#### Requirement: UC2 — `[FromRoute]` on `includeInactive`

The `includeInactive` parameter of `GetAllUsersAsync(bool includeInactive)` MUST be decorated with `[FromRoute]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `includeInactive` parameter declaration | `[FromRoute]` attribute present |

### Verification Criteria

- [ ] `GetAllUsersAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`
- [ ] `includeInactive` parameter has `[FromRoute]` attribute
- [ ] All existing tests pass unchanged (additive changes only)

---

## Delta for api-controller: SetMyStoreIdAsync

**Change**: `2026-07-30-set-my-store-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: SM-CT1 — Swagger Documents 400, 401, 403 for SetMyStore

The `SetMyStoreIdAsync` action in `StoresController` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]` as additional response metadata. Currently only `200 OK` is documented.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `SetMyStoreIdAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `SetMyStoreIdAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `SetMyStoreIdAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 200 preserved | Swagger/OpenAPI document generated | `SetMyStoreIdAsync` endpoint inspected | 200 OK remains in the response list |

### Verification Criteria

- [ ] `SetMyStoreIdAsync` has `[ProducesResponseType(StatusCodes.Status400BadRequest)]` attribute
- [ ] `SetMyStoreIdAsync` has `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` attribute
- [ ] `SetMyStoreIdAsync` has `[ProducesResponseType(StatusCodes.Status403Forbidden)]` attribute
- [ ] Swagger UI renders all 4 response codes for the endpoint

---

## Delta for api-controller: UpdatedAsync

**Change**: `update-user-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: UC-U1 — Swagger Documents 400, 401, 403, 404 for UpdatedAsync

The `UpdatedAsync` action MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status404NotFound)]` in addition to the existing `[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]`, mirroring `GetAllUsersAsync` (`UsersController.cs:29-32`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 404 documented | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 404 NotFound listed as possible response |
| 1e | 200 preserved | Swagger/OpenAPI document generated | `UpdatedAsync` endpoint inspected | 200 OK with `ResponseResult<bool>` remains in the response list |

#### Requirement: UC-U2 — `[FromRoute]` on `id` Parameter

The `id` parameter of `UpdatedAsync(Guid id, ...)` MUST be decorated with `[FromRoute]`, matching `GetAllUsersAsync`'s `[FromRoute] bool includeInactive` (`UsersController.cs:35`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `id` parameter declaration | `[FromRoute]` attribute present |

#### Requirement: UC-U3 — Response Contract: HTTP 200 + Envelope (ActionCode 404 Possible)

The `UpdatedAsync` action MUST return HTTP 200 with a `ResponseResult<bool>` envelope for all handled outcomes. Handler-level denials (ownership guard, race guard) SHALL surface as `succeeded=false` + `ActionCode=404` inside the 200 envelope — NOT as HTTP 404 or 403 status codes.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Success | Legit actor updates own or admin-authorized target | PUT issued | HTTP 200; envelope `succeeded=true` |
| 3b | IDOR denial | Non-admin actor PUTs another user's id | Handler guard fires | HTTP 200; envelope `succeeded=false`, ActionCode 404 |
| 3c | Race denial | User deleted between validation and handler | Handler runs | HTTP 200; envelope `succeeded=false`, ActionCode 404 |

### Verification Criteria

- [ ] `UpdatedAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`; 200 with `ResponseResult<bool>` remains
- [ ] `id` parameter has `[FromRoute]` attribute
- [ ] All existing E2E tests pass unchanged (additive metadata only)

---

## Delta for api-controller: DeleteUserAsync

**Change**: `delete-user-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: UC-D1 — Swagger Documents 400, 401, 403, 404

`DeleteUserAsync` MUST declare `[ProducesResponseType]` for 400, 401, 403, and 404 in addition to the existing 200, mirroring the uncommitted `UpdatedAsync` diff verbatim.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | All four documented | Swagger/OpenAPI generated | Endpoint inspected | 400, 401, 403, 404 listed as possible responses |
| 1b | 200 preserved | Swagger/OpenAPI generated | Endpoint inspected | 200 OK remains in the response list |

#### Requirement: UC-D2 — `[FromRoute]` on `id` Parameter

The `id` parameter of `DeleteUserAsync(Guid id)` MUST be decorated with `[FromRoute]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | FromRoute present | Controller source inspected | `id` parameter declaration | `[FromRoute]` attribute present |

#### Requirement: UC-D3 — XML `<param>` Doc for `id`

`DeleteUserAsync` MUST carry `<param name="id">User Id</param>` XML doc (mirrors `GetUserAsync:43`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Param doc present | Controller source inspected | `DeleteUserAsync` declaration | `<param name="id">User Id</param>` present |

### Verification Criteria

- [x] `DeleteUserAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`; 200 remains
- [x] `id` parameter has `[FromRoute]` attribute
- [x] `<param name="id">User Id</param>` XML doc present
- [x] All existing E2E tests pass unchanged (additive metadata only — 5/5 GREEN)

---

## Delta for api-controller: ActivateUserAsync + Namespace Move

**Change**: `activate-user-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: UC-A1 — Swagger Documents 400, 401, 403, 404 (F5)

`ActivateUserAsync` MUST add `[ProducesResponseType]` for 400, 401, 403, and 404 after the existing 200 (mirror `DeleteUserAsync:77-87`). The `[FromBody] ActivateUserCommand command` signature and its XML doc MUST be kept. Additive edit only — MUST NOT clobber the uncommitted `UpdatedAsync` (:59-70) or post-archive `DeleteUserAsync` (:77-87) metadata blocks.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | All four documented | Swagger/OpenAPI generated | ActivateUserAsync inspected | 400, 401, 403, 404 listed as possible responses |
| 1b | 200 preserved | Swagger/OpenAPI generated | Endpoint inspected | 200 OK remains in the response list |
| 1c | Signature intact | Controller source inspected | `ActivateUserAsync` declaration | `[FromBody]` + command param + XML doc unchanged |

#### Requirement: UC-A2 — Namespace Move to UserManagement (NS-D1)

The command and validator namespaces MUST move from `Application.Features.Management.Users.Commands.ActivateUser` to `Application.Features.UserManagement.Users.Commands.ActivateUser`, and the `using` in `UsersController.cs:3` MUST be updated to match. Exactly 3 references exist (command file, validator file, controller using — grep-verified). Zero behavioral change.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | All refs moved | Change applied | Build project | 3/3 references on new namespace; compile succeeds |

### Verification Criteria

- [x] `ActivateUserAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`; 200 remains
- [x] `[FromBody]` + XML doc preserved; `UpdatedAsync`/`DeleteUserAsync` metadata untouched
- [x] Namespace migrated in exactly 3 places; backend compiles (verified via `dotnet test` compile, task 4.1)
- [x] Existing E2E tests pass unchanged (additive metadata + namespace only)

---

## Delta for api-controller: AddUserRolesAsync + RemoveUserRolesAsync

**Change**: `user-roles-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: UC-R1 — `[FromBody]` on Both Command Parameters

`AddUserRolesAsync(AddUserRolesCommand command)` and `RemoveUserRolesAsync(DeleteUserRolesCommand command)` MUST decorate the command parameter with `[FromBody]` (mirrors `UpdatedAsync:66` / `ActivateUserAsync:99`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | AddUserRoles | Controller source inspected | `AddUserRolesAsync` declaration | `[FromBody]` present on command param |
| 1b | DeleteUserRoles | Controller source inspected | `RemoveUserRolesAsync` declaration | `[FromBody]` present on command param |

#### Requirement: UC-R2 — Swagger Documents 400, 401, 403, 404 on Both Actions

Both actions MUST declare `[ProducesResponseType]` for 400, 401, 403, and 404 in addition to the existing 200 (`ResponseResult<IEnumerable<ListViewDto>>`), mirroring `DeleteUserAsync:78-82`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | 400 documented | Swagger doc generated | AddUserRolesAsync inspected | 400 BadRequest listed |
| 2b | 401 documented | Swagger doc generated | AddUserRolesAsync inspected | 401 Unauthorized listed |
| 2c | 403 documented | Swagger doc generated | AddUserRolesAsync inspected | 403 Forbidden listed |
| 2d | 404 documented | Swagger doc generated | AddUserRolesAsync inspected | 404 NotFound listed |
| 2e | 200 preserved | Swagger doc generated | AddUserRolesAsync inspected | 200 with `ResponseResult<IEnumerable<ListViewDto>>` remains |
| 2f–2j | Same 5 for DeleteUserRoles | Swagger doc generated | RemoveUserRolesAsync inspected | All 4 new + 200 listed |

### Verification Criteria

- [x] `[FromBody]` on both command parameters
- [x] Both actions declare 400/401/403/404 + existing 200
- [x] Existing E2E tests pass unchanged (additive metadata only) — UsersRolesTests 11/11 GREEN, 5-class Users regression 47/47 GREEN (verify re-run 2026-08-01)
