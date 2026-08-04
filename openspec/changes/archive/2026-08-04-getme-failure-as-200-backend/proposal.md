# Proposal: `/auth/me` Reports Failure as HTTP Status

## Intent

`GetMeAsync` (`AuthController.cs:78-81`) wraps every result in `Ok(...)` (line 80). The inactive-user failure path blacklists the token, yet the client gets HTTP 200 `succeeded:false` — treated as success: `null` data overwrites the cached profile, `isAuthenticated` stays true. A terminated session must not look like a successful fetch.

## Scope

### In Scope
- `GetMeAsync` (line 80): read `result.ActionCode` → 404 on failure, `Ok` on success; KEEP the 401 attribute (reachable via blacklist middleware `JwtBearerOptionsSetup.cs:37-51`); asymmetry comment (this action maps status because failure means "session over"; neighbours keep the 200 convention).
- Flip existing E2E assertions `AuthMeFailureTests.cs:32,50` from 200 → 404 (they ARE the RED — no new happy-path test needed; `AuthMeTests.cs` covers it).
- Add E2E: second call, same deactivated token → 401 from middleware.
- Optional unit test: inactive+blacklist path in `GetMeQueryHandlerTests`.

### Out of Scope
- Other 63 actions keep the 200 convention (deliberate).
- Shared `ResponseResultExtensions` mapper (YAGNI; `int? ActionCode`).
- Frontend — Task 4 already implemented (`auth-store` logs out on 401/404).
- Blacklist/token logic, `GetMeQuery` handler logic, online endpoints.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `api-controller`: `GetMeAsync` MUST map `ActionCode` to a real HTTP status (404 + envelope on failure, `Ok` on success), mirroring UC-CPW3/OC-OU3; 401 stays reachable.

## Approach

Inline switch (pattern `AuthController.cs:35-41`): `Succeeded ? Ok(result) : ActionCode switch { 404 => NotFound(result), _ => NotFound(result) }` — read, never re-derive. Asymmetry comment explains the exception.

**Rejected**: shared `ResponseResultExtensions` (one caller), map all 64 (breaking), auth-critical set (b) (`/auth/me` is the only session-verdict endpoint worth it).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs` | Modified | Line 80 status mapping; asymmetry comment; 401 attr kept |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs` | Modified | Flip :32/:50 to 404; second-call 401 test |
| `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeQueryHandlerTests.cs` | Optional | Inactive+blacklist unit test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Suite asserts the bug; flip skipped | Med | Flip first; watch RED |
| 404-then-401 same verdict, different status | Low | Document; frontend logs out on both |
| `ActionCode` is `int?` | Low | Default arm covers null |
| Second-call 401 needs `jti` | Low | Logout E2Es prove blacklisting |

## Rollback Plan

Revert line 80 to `Ok(...)`; restore the two assertions to 200. Single-action; frontend unaffected either way.

## Dependencies

None — standalone backend change.

## Success Criteria

- [ ] Inactive/unknown user → 404, `succeeded:false`, ActionCode 404
- [ ] Active user → 200, `succeeded:true`, populated `data`
- [ ] Same blacklisted token, second call → 401
- [ ] `dotnet test backend/src/SMCA.sln` green
