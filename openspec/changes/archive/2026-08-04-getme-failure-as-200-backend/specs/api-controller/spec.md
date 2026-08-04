# Delta for api-controller: GetMeAsync (`/auth/me`)

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

- [ ] `GetMeAsync` returns 404 + envelope on failure and 200 on success — no `Ok(failure)` on the wire
- [ ] E2E RED: `AuthMeFailureTests` unknown-user (:32) and inactive-user (:50) assertions flipped from `HttpStatusCode.OK` to 404
- [ ] E2E: second call with a blacklisted token returns 401 (middleware)
- [ ] E2E regression: `AuthMeTests`, `AuthMePermissionsTests`, `GetMeBillingTests`, `GetMeBillingStatesTests` pass unchanged (all assert 200 + `Succeeded`)
- [ ] `dotnet test backend/src/SMCA.sln` green — online auth suite stays green
- [ ] Other 63 actions untouched; no shared mapper added
