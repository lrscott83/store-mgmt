# Design: `/auth/me` Reports Failure as HTTP Status

## Technical Approach

One action, one inline status mapping. `GetMeAsync` currently returns `Ok(...)` unconditionally (`AuthController.cs:80`), so all three `GetMeQuery` failure paths (each passing `ActionCode = 404`, `GetMeQuery.cs:52-53,60-61,63-67`) hit the wire as HTTP 200 `succeeded:false`. The action reads `ResponseResult<CurrentUserDto>.ActionCode` (`int?`, `ResponseResult.cs:35`) and maps failure → 404, success → 200 — mirroring the controller's existing `AuthAsync`/`RegisterAsync` switch precedent. 401 stays reachable via the blacklist middleware (`JwtBearerOptionsSetup.cs:37-51`). No shared mapper, no other endpoint (spec AU-ME1).

## Architecture Decisions

| # | Option | Tradeoff | Decision |
|---|--------|----------|----------|
| D1 | Inline switch in `GetMeAsync` vs shared `ResponseResultExtensions` vs map all 64 | Inline = 1 call site, no new abstraction; shared = YAGNI (1 caller); all-64 = breaking, out of scope | **Inline** (Approach 1, per proposal) |
| D2 | Switch shape: `{ 404 => NotFound, _ => NotFound }` vs bare `NotFound(result)` | Switch reads `ActionCode` (spec letter: "MUST read"), null-safe via `_` arm; bare return skips the read | **Switch with explicit 404 + `_` default** — identical arms are the existing style (`RegisterAsync.cs:97-101`) |
| D3 | Second-call 401 E2E: reuse seed/mint/use/cleanup cycle | Logout E2Es never verify post-call blacklisting — this is a new assertion, mechanics verified | **Reuse helpers; new 401 assertion** (see test strategy) |
| D4 | Optional unit test: real `UserRepository` + EF InMemory vs async-queryable mock helper | InMemory uses existing package (`Microsoft.EntityFrameworkCore.InMemory 8.0.1`); mock helper = ~60 new lines, no benefit | **Add test, real repo + InMemory** — pins `BlacklistAsync` invocation, currently uncovered |
| D5 | Test ordering | Flipped assertions must be RED before the fix, else suite is green against the bug | **Flip RED → fix GREEN → guards** |

## Data Flow

```
Client ── GET /api/v1/auth/me (Bearer token with jti)
   └─ JwtBearer OnTokenValidated: IsBlacklistedAsync(jti)? ──→ 401 (middleware, action NOT executed)
   └─ GetMeQueryHandler
        ├─ no external id ──→ Failure(NotFound, 404)
        ├─ user is null ────→ Failure(NotFound, 404)
        ├─ !IsActive ───────→ Blacklist(jti) ──→ Failure(AccountInactive, 404)
        └─ active ──────────→ Success(CurrentUserDto)
   └─ GetMeAsync: Succeeded ? Ok(result) : ActionCode switch { 404 → 404, _ → 404 }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs` | Modify | `GetMeAsync` (:80): status mapping + asymmetry comment; 401/404 `ProducesResponseType` retained |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs` | Modify | Flip :32/:50 `OK` → `NotFound`; rename both test methods (`returns_200_` → `returns_404_`); add second-call 401 test |
| `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeQueryHandlerTests.cs` | Modify | Add inactive-user + blacklist unit test (guard) |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeTests.cs` | — | No change (happy path, regression guard) |
| `backend/src/SMCA.WebApi/Extensions/` | — | No mapper added (verified: only `ServiceExtensions`, `MigrationExtensions`) |

## Interfaces / Contracts

`GetMeAsync` exact shape (D1/D2):

```csharp
var result = await Sender.Send(new GetMeQuery());

if (result.Succeeded)
    return Ok(result);

// Asymmetry: /auth/me maps ActionCode to a real HTTP status because failure
// here means "session over" — a terminated session must not look like a
// successful fetch. The other 63 actions keep the 200 + envelope convention.
// 401 stays reachable via the blacklist middleware (JwtBearerOptionsSetup).
return result.ActionCode switch
{
    404 => NotFound(result), // GetMeQuery: no external id / user not found / inactive
    _ => NotFound(result)    // ActionCode is int? — null falls to the default arm
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E (RED) | `AuthMeFailureTests` :32/:50 assert 404 + envelope (`Succeeded=false`, `ActionCode=404`, `User.NotFound` / `Auth.AccountInactive`) | Flip first, run RED against current code (Standard-mode precedent for E2E) |
| E2E (guard) | Second call, same token → 401, empty body (middleware `context.Fail` → action NOT executed) | Seed inactive (`DbTestHelpers.SeedInactiveUserAsync`), mint (`AuthTestHelpers.MintToken`), same `BearerClient` for both calls; comment documents 404-then-401 as intended — same verdict "session over" |
| E2E (regression) | `AuthMeTests`, `AuthMePermissionsTests`, `GetMeBillingTests`, `GetMeBillingStatesTests` | No change; assert 200 + `Succeeded` |
| Unit (guard) | Handler inactive path: `Succeeded=false`, `ActionCode=404`, `Auth.AccountInactive`, `BlacklistAsync` called once with jti | Real `UserRepository` over EF InMemory (seeded inactive user), mocked `IHttpContextService` with valid `UserExternalId` + hand-built JWT in `AccessToken` (jti+exp claims); GREEN immediately — pins existing behavior, not a behavior-change RED |

Ordering: Task 1 E2E flip (RED) → Task 2 controller fix (GREEN) → Task 3 second-call test → Task 4 unit guard. All edits compile independently — the controller change is additive and never breaks test compilation.

## Threat Matrix

`N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.` Existing route modified only; blacklist middleware and token logic untouched.

## Migration / Rollout

No migration required. Rollback: revert line 80 to `Ok(...)`; restore the two assertions to 200 (per proposal).

## Open Questions

- [ ] None blocking — Task 4 unit test confirmed feasible (EF InMemory package already referenced).
