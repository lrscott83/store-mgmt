# Delta for api-controller: ChangePasswordAsync Route + Real Status Codes

**Domain**: `api-controller` — `UsersController.cs:140-146`
**Change**: `change-password-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## MODIFIED Requirements

### Requirement: UC-CPW1 — Route `change-password/{id}` + `[FromBody]`, Id From Route

`ChangePasswordAsync` MUST change its route from `[HttpPost("change-password")]` to `[HttpPost("change-password/{id}")]`, take `Guid id` from the route, and bind the command body with `[FromBody]`, setting `command.UserId = id` (mirrors `UpdatedAsync` — the ONLY shape both frontends call: Angular `user.service.ts:65-66`, React `profile-http-service.ts:28-37`; the current body-`UserId` route is unreachable, finding #6). The `[HasPermission(StoreRoleFeatures.ProfileAdmin)]` filter MUST be retained.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Route shape | Controller source inspected | `ChangePasswordAsync` declaration | `change-password/{id}`; `[FromBody]` on command |
| 1b | Id mapped | Request `POST /change-password/xyz` | Action executes | `command.UserId == xyz` |
| 1c | Filter kept | Non-ProfileAdmin actor | Action invoked | 403 (filter-level, unchanged) |
| 1d | Angular consumer | `user.service.ts` changePassword | Request sent | URL `change-password/${id}` matches route |
| 1e | React consumer | `profile-http-service.ts` changePassword | Request sent | URL `/v1/users/change-password/${userId}` matches route |

### Requirement: UC-CPW2 — Swagger Documents 200, 400, 401, 403, 404

`ChangePasswordAsync` MUST declare `[ProducesResponseType(typeof(ResponseResult<bool>), 200)]` plus `[ProducesResponseType]` for 400, 401, 403, and 404 (mirrors `AddUserRolesAsync:108-113` / `DeleteUserAsync`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | 200 documented | Swagger generated | `ChangePasswordAsync` inspected | 200 `ResponseResult<bool>` listed |
| 2b–2e | 400/401/403/404 documented | Swagger generated | `ChangePasswordAsync` inspected | All four error statuses listed |

### Requirement: UC-CPW3 — ActionCode Switch Maps Failures to REAL HTTP Statuses

When `result.Succeeded == false`, `ChangePasswordAsync` MUST map `result.ActionCode` to real HTTP statuses with the envelope as the body, mirroring `AuthController.cs:35-41`: `400 => BadRequest(result)`, `401 => Unauthorized(result)`, `403 => StatusCode(403, result)`, `404 => NotFound(result)`, default `=> BadRequest(result)`; on success `Ok(result)`. Business failures MUST NOT return `Ok(...)` 200+envelope (finding #3 — required by the React consumer which rejects on non-2xx and logs out on ANY resolved 200 failure).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Wrong old password | Handler failure ActionCode 400 | Action returns | HTTP 400 + envelope body |
| 3b | Out-of-tenant / null race | Handler failure ActionCode 404 | Action returns | HTTP 404 + envelope body |
| 3c | Auth-route parity | Any non-success | Switch evaluated | Real status per ActionCode; no 200+envelope |
| 3d | Success | `Succeeded == true` | Action returns | HTTP 200 + envelope |

## Verification Criteria

- [ ] Route `change-password/{id}` + `[FromBody]` + `command.UserId = id`
- [ ] ProducesResponseType 200/400/401/403/404 documented in Swagger
- [ ] All handler failure ActionCodes map to real statuses (400/401/403/404); zero `Ok(failure)`
- [ ] E2E green: re-login new → 200; wrong old → 400; cross-tenant admin → 404; weak → 400
