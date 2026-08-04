# Tasks: `/auth/me` Reports Failure as HTTP Status

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~40–60 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (flip→fix in one PR; owners-* precedent) |
| Delivery strategy | single-pr — session override: NO commits/PRs |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | 404 failure mapping + 401 second-call guard + unit guard | PR 1 (single) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMe"` | E2E WebApplicationFactory in-process HTTP pipeline — real JWT blacklist middleware exercised | Revert `AuthController.cs:80` to `Ok(...)` + restore :32/:50 assertions to `OK` |

## Phase 1: E2E RED — Flip to 404

- [x] **1.1** Unknown-user — `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs`: :32 `Be(HttpStatusCode.OK)` → `NotFound`; rename :25 → `Me_with_token_for_unknown_user_returns_404_with_NotFound_body`. DEP: none. ACCEPT: RED while controller unchanged.
- [x] **1.2** Inactive-user — same file: :50 `Be(HttpStatusCode.OK)` → `NotFound`; rename :40 → `Me_with_token_for_inactive_user_returns_404_with_Inactive_body`. DEP: 1.1. ACCEPT: RED.

## Phase 2: Controller Fix (GREEN)

- [x] **2.1** `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs` `GetMeAsync` (:78-81): `var result = await Sender.Send(new GetMeQuery()); if (result.Succeeded) return Ok(result); return result.ActionCode switch { 404 => NotFound(result), _ => NotFound(result) };` + asymmetry comment (session-over; 63 neighbours keep 200; 401 via blacklist middleware). Keep :76-77 `ProducesResponseType` (401/404 present). DEP: 1.1, 1.2. ACCEPT: both flips GREEN; happy path 200 unchanged.

## Phase 3: Guard Tests

- [x] **3.1** Second-call 401 — `AuthMeFailureTests.cs`: seed inactive (`DbTestHelpers.SeedInactiveUserAsync`), mint (`AuthTestHelpers.MintToken`, Logout E2E pattern), same `BearerClient`; first call →404 (blacklists), second call same token → `Be(HttpStatusCode.Unauthorized)`, empty body; comment 404-then-401 intended. DEP: 2.1. ACCEPT: second call 401, action not executed.
- [x] **3.2** Unit guard — `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeQueryHandlerTests.cs`: inactive+blacklist via real `UserRepository` over EF InMemory (seeded inactive), mocked `IHttpContextService` (valid `UserExternalId`, hand-built JWT with `jti`/`exp` in `AccessToken`); assert `Succeeded=false`, `ActionCode=404`, `Auth.AccountInactive`, `BlacklistAsync` called once with `jti`. DEP: none — GREEN immediately, pins behavior, not RED (D4). ACCEPT: passes; `BlacklistAsync` coverage added.

## Phase 4: Verification

- [x] **4.1** `dotnet test backend/src/SMCA.sln` green. ACCEPT: all pass; regression `AuthMeTests`, `AuthMePermissionsTests`, `GetMeBillingTests`, `GetMeBillingStatesTests` unchanged (200 + `Succeeded`). — VERIFIED: Application.Tests 314/314, Domain.UnitTests 22/22, E2E 285/285.
- [x] **4.2** No mapper added — `backend/src/SMCA.WebApi/Extensions/` untouched; other 63 actions unchanged. ACCEPT: git diff limited to 3 files. — DEVIATION (discovered gap): `Extensions/ServiceExtensions.cs` +22 lines required — the blacklist `OnTokenValidated` in `JwtBearerOptionsSetup` never ran (plain `IConfigureOptions` is skipped for the named "Bearer" options; the `AddJwtBearer` lambda replaced `Events`). Without the fix, spec 1d / task 3.1 (second call → 401) is impossible. Diff: 4 files, 160+/5-. No shared mapper; 63 actions untouched.

No commit/PR/push tasks — session override defers delivery.
