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

---

## Delta for api-controller: ChangePasswordAsync Route + Real Status Codes

**Change**: `change-password-endpoint-fixes`

### MODIFIED Requirements

#### Requirement: UC-CPW1 — Route `change-password/{id}` + `[FromBody]`, Id From Route

`ChangePasswordAsync` MUST change its route from `[HttpPost("change-password")]` to `[HttpPost("change-password/{id}")]`, take `Guid id` from the route, and bind the command body with `[FromBody]`, setting `command.UserId = id` (mirrors `UpdatedAsync` — the ONLY shape both frontends call: Angular `user.service.ts:65-66`, React `profile-http-service.ts:28-37`; the current body-`UserId` route is unreachable, finding #6). The `[HasPermission(StoreRoleFeatures.ProfileAdmin)]` filter MUST be retained.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Route shape | Controller source inspected | `ChangePasswordAsync` declaration | `change-password/{id}`; `[FromBody]` on command |
| 1b | Id mapped | Request `POST /change-password/xyz` | Action executes | `command.UserId == xyz` |
| 1c | Filter kept | Non-ProfileAdmin actor | Action invoked | 403 (filter-level, unchanged) |
| 1d | Angular consumer | `user.service.ts` changePassword | Request sent | URL `change-password/${id}` matches route |
| 1e | React consumer | `profile-http-service.ts` changePassword | Request sent | URL `/v1/users/change-password/${userId}` matches route |

#### Requirement: UC-CPW2 — Swagger Documents 200, 400, 401, 403, 404

`ChangePasswordAsync` MUST declare `[ProducesResponseType(typeof(ResponseResult<bool>), 200)]` plus `[ProducesResponseType]` for 400, 401, 403, and 404 (mirrors `AddUserRolesAsync:108-113` / `DeleteUserAsync`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | 200 documented | Swagger generated | `ChangePasswordAsync` inspected | 200 `ResponseResult<bool>` listed |
| 2b–2e | 400/401/403/404 documented | Swagger generated | `ChangePasswordAsync` inspected | All four error statuses listed |

#### Requirement: UC-CPW3 — ActionCode Switch Maps Failures to REAL HTTP Statuses

When `result.Succeeded == false`, `ChangePasswordAsync` MUST map `result.ActionCode` to real HTTP statuses with the envelope as the body, mirroring `AuthController.cs:35-41`: `400 => BadRequest(result)`, `401 => Unauthorized(result)`, `403 => StatusCode(403, result)`, `404 => NotFound(result)`, default `=> BadRequest(result)`; on success `Ok(result)`. Business failures MUST NOT return `Ok(...)` 200+envelope (finding #3 — required by the React consumer which rejects on non-2xx and logs out on ANY resolved 200 failure).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Wrong old password | Handler failure ActionCode 400 | Action returns | HTTP 400 + envelope body |
| 3b | Out-of-tenant / null race | Handler failure ActionCode 404 | Action returns | HTTP 404 + envelope body |
| 3c | Auth-route parity | Any non-success | Switch evaluated | Real status per ActionCode; no 200+envelope |
| 3d | Success | `Succeeded == true` | Action returns | HTTP 200 + envelope |

### Verification Criteria

- [x] Route `change-password/{id}` + `[FromBody]` + `command.UserId = id`
- [x] ProducesResponseType 200/400/401/403/404 documented in Swagger
- [x] All handler failure ActionCodes map to real statuses (400/401/403/404); zero `Ok(failure)`
- [x] E2E green: re-login new → 200; wrong old → 400; cross-tenant admin → 404; weak → 400 — 8/8 GREEN (apply evidence)

---

## Delta for api-controller: UpdatedAsync (OwnersController)

**Change**: `owners-update-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: OC-OU1 — Swagger Documents 200, 400, 401, 403, 404, 500

`UpdatedAsync` MUST declare 200 typed `ResponseResult<OwnerDto>` + `[ProducesResponseType]` for 400, 401, 403, 404, 500 (mirrors `GetOwnerAsync:42-48`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 200 typed | Swagger generated | `UpdatedAsync` inspected | 200 `ResponseResult<OwnerDto>` listed |
| 1b | Five errors | Swagger generated | `UpdatedAsync` inspected | 400, 401, 403, 404, 500 listed |

#### Requirement: OC-OU2 — XML Doc Corrected

Summary MUST read "Updates an owner by id" (was "Updated user by id"); `<param name="id">` and `<returns>` MUST be present.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary + docs | Source inspected | `UpdatedAsync` declaration | Correct summary; `<param>` and `<returns>` present |

#### Requirement: OC-OU3 — ActionCode Switch Maps Failures to Real HTTP Statuses

When `Succeeded == false`, `UpdatedAsync` MUST map ActionCode to real HTTP statuses (mirrors `AuthController.cs:35-41`): 400→BadRequest, 401→Unauthorized, 403→Forbidden, 404→NotFound, default→BadRequest; success → `Ok(result)`. Business failures MUST NOT return 200+envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 404 mapped | Handler failure ActionCode 404 | Action returns | HTTP 404 + envelope |
| 3b | 400 mapped | Validation/handler failure 400 | Action returns | HTTP 400 + envelope |
| 3c | 403 mapped | Auth denial | Action returns | HTTP 403 + envelope |
| 3d | Success | `Succeeded == true` | Action returns | HTTP 200 + `OwnerDto` envelope |

---

## Delta for api-controller: CreateOwnerAsync (OwnersController)

**Change**: `owners-create-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: OC-CT1 — Swagger Documents 201, 400, 401, 403, 409, 500

`CreateOwnerAsync` MUST declare `[ProducesResponseType(typeof(ResponseResult<OwnerDto>), StatusCodes.Status201Created)]` plus `[ProducesResponseType]` for 400, 401, 403, 409, and 500.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 201 documented | Swagger/OpenAPI document generated | `CreateOwnerAsync` endpoint inspected | 201 with `ResponseResult<OwnerDto>` listed |
| 1b–1f | 400/401/403/409/500 documented | Swagger/OpenAPI document generated | `CreateOwnerAsync` endpoint inspected | All five error statuses listed |

#### Requirement: OC-CT2 — XML Documentation

`CreateOwnerAsync` MUST carry an XML `<summary>` reading "Create a new owner", a `<param>` doc for each parameter, and a `<returns>` doc describing the created-owner envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary | Controller source inspected | `CreateOwnerAsync` declaration | `<summary>` reads "Create a new owner" |
| 2b | Param/returns | Controller source inspected | XML doc of `CreateOwnerAsync` | `<param>` per parameter and `<returns>` present |

#### Requirement: OC-CT3 — Location Header on 201 Created

On success, `CreateOwnerAsync` MUST return HTTP 201 with a `Location` header pointing to the created resource (`GET /api/v1/Owners/{id}`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Location present | Valid `POST` succeeds | Response returned | 201; `Location` header resolves to `GET /api/v1/Owners/{id}` |

### Verification Criteria

- [ ] `CreateOwnerAsync` declares 201 (typed `ResponseResult<OwnerDto>`) + 400, 401, 403, 409, 500
- [ ] XML `<summary>` reads "Create a new owner"; `<param>`/`<returns>` docs present
- [ ] 201 response includes `Location` header

---

## Delta for api-controller: GetOwnerAsync (OwnersController)

**Change**: `owners-getbyid-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: OC-CT1 — Swagger Documents 400, 401, 403, 404, 500 for GetOwner

`GetOwnerAsync` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, `[ProducesResponseType(StatusCodes.Status404NotFound)]`, and `[ProducesResponseType(StatusCodes.Status500InternalServerError)]` in addition to the existing 200 (mirrors `GetAllOwnersAsync:27-31`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a–1e | Five error statuses documented | Swagger/OpenAPI generated | `GetOwnerAsync` endpoint inspected | 400, 401, 403, 404, 500 listed as possible responses |
| 1f | 200 preserved | Swagger/OpenAPI generated | `GetOwnerAsync` endpoint inspected | 200 OK with `ResponseResult<OwnerDto>` remains |

#### Requirement: OC-CT2 — XML Doc Corrected + Param Documented

The XML `<summary>` on `GetOwnerAsync` MUST read "Get owner by id" — it currently reads "Get user by id". The action MUST carry `<param name="id">` documenting the route parameter.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary corrected | Controller source inspected | `GetOwnerAsync` declaration | `<summary>` text is "Get owner by id" |
| 2b | Param documented | Controller source inspected | `GetOwnerAsync` declaration | `<param name="id">` present |

### Verification Criteria

- [ ] `GetOwnerAsync` has `[ProducesResponseType]` for 400, 401, 403, 404, 500; 200 remains
- [ ] XML summary says "Get owner by id"; `<param name="id">` present
- [ ] Existing E2E tests pass unchanged (additive metadata only)

---

## Delta for api-controller: GetAllOwnersAsync (OwnersController)

**Change**: `owners-getall-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: OC-CT1 — Swagger Documents 400, 401, 403, 500 for GetAllOwners

`GetAllOwnersAsync` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status500InternalServerError)]` in addition to the existing 200, mirroring prior endpoint-fixes deltas (`GetAllUsersAsync`, `GetUserByIdAsync`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a–1d | Four error statuses documented | Swagger/OpenAPI generated | `GetAllOwnersAsync` endpoint inspected | 400, 401, 403, 500 listed as possible responses |
| 1e | 200 preserved | Swagger/OpenAPI generated | `GetAllOwnersAsync` endpoint inspected | 200 OK with `ResponseResult<List<OwnerDto>>` remains |

#### Requirement: OC-CT2 — XML Doc Corrected + Param Documented

The XML `<summary>` on `GetAllOwnersAsync` MUST read "Get all owners" — it currently reads "Get all users", incorrect copy referencing users instead of owners. The action MUST also carry `<param name="includeInactive">` documenting the route parameter.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary corrected | Controller source inspected | `GetAllOwnersAsync` declaration | `<summary>` text is "Get all owners" |
| 2b | Param documented | Controller source inspected | `GetAllOwnersAsync` declaration | `<param name="includeInactive">` present |

### Verification Criteria

- [ ] `GetAllOwnersAsync` has `[ProducesResponseType]` for 400, 401, 403, 500; 200 remains
- [ ] XML summary says "Get all owners"; `<param name="includeInactive">` present
- [ ] All existing E2E tests (`OwnersListTests`, `OwnersListGapTests`) pass unchanged (additive metadata only)

---

## Delta for api-controller: GetMeAsync (`/auth/me`)

**Domain**: `api-controller` — `AuthController.GetMeAsync`  
**Change**: `getme-failure-as-200-backend`  
**Status**: Draft  
**Last Updated**: 2026-08-04

---

## ADDED Requirements

### Requirement: AU-ME1 — GetMeAsync Maps ActionCode to Real HTTP Status (Failure → 404, Success → 200)

`AuthController.GetMeAsync` MUST read `ResponseResult<CurrentUserDto>.ActionCode` (`int?`) and map it onto the HTTP status instead of returning `Ok(...)` unconditionally. When `Succeeded == false`, the action MUST return HTTP 404 with the `ResponseResult` envelope as the body — all three `GetMeQuery` failure paths (no external id, user not found, inactive account) pass `ActionCode = 404`, and the null `ActionCode` case MUST default to 404. When `Succeeded == true`, the action MUST return HTTP 200 with the envelope (`succeeded: true`, populated `Data`). The `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` attribute MUST be retained — 401 remains reachable via the blacklist middleware (`JwtBearerOptionsSetup.OnTokenValidated`), which rejects the request BEFORE the action executes. The action MUST carry a comment documenting the intentional asymmetry: `/auth/me` maps status because failure means "session over", while the other 63 actions keep the 200 + envelope convention (a terminated session MUST NOT look like a successful fetch). No shared mapper MUST be introduced; no other action MAY be changed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Unknown user → 404 | Valid JWT minted for a non-existent user id | `GET /api/v1/auth/me` | HTTP 404; envelope `succeeded=false`, `ActionCode=404`, error `User.NotFound` |
| 1b | Inactive user → 404 | Valid JWT for a seeded inactive user (`IsActive=false`) | `GET /api/v1/auth/me` | HTTP 404; envelope `succeeded=false`, `ActionCode=404`, error `Auth.AccountInactive`; token blacklisted |
| 1c | Active user → 200 | Valid JWT for an active seeded user | `GET /api/v1/auth/me` | HTTP 200; envelope `succeeded=true`; `Data.Id` and `Data.Login` populated |
| 1d | Blacklisted token → 401 | Token blacklisted by the prior inactive-user call | Second `GET /api/v1/auth/me` with the same token | HTTP 401 from middleware; action NOT executed |
| 1e | Asymmetry documented | `GetMeAsync` source inspected | Action body and attributes reviewed | Asymmetry comment present; 401 ProducesResponseType retained; status mapping limited to this action |

### Verification Criteria

- [x] `GetMeAsync` returns 404 + envelope on failure and 200 on success — no `Ok(failure)` on the wire
- [x] E2E RED: `AuthMeFailureTests` unknown-user (:32) and inactive-user (:50) assertions flipped from `HttpStatusCode.OK` to 404
- [x] E2E: second call with a blacklisted token returns 401 (middleware)
- [x] E2E regression: `AuthMeTests`, `AuthMePermissionsTests`, `GetMeBillingTests`, `GetMeBillingStatesTests` pass unchanged (all assert 200 + `Succeeded`)
- [x] `dotnet test backend/src/SMCA.sln` green — online auth suite stays green
- [x] Other 63 actions untouched; no shared mapper added
