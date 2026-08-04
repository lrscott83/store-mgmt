# Exploration: getme-failure-as-200-backend

> Explore artifact — read-only investigation of `docs/plans/2026-08-02-getme-failure-as-200-backend.md` against current code.
> Branch `main_backend` @ `691c6fb6`. Date: 2026-08-04.

## Current State

`AuthController.GetMeAsync` (`backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs:74-81`) returns `Ok(await Sender.Send(new GetMeQuery()))` **unconditionally** (line 80). The three `[ProducesResponseType]` attributes (200/401/404, lines 75-77) document behavior the action does not have: all handler failures arrive on the wire as HTTP 200 with a `succeeded: false` envelope.

`GetMeQueryHandler` (`backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`) has three failure paths, all returning `ResponseResult.Failure<CurrentUserDto>(..., (int)HttpStatusCode.NotFound)`:
- no external id → 404 (`GetMeQuery.cs:52-53`)
- user not found → 404 (`GetMeQuery.cs:60-61`)
- `!user.IsActive` → blacklists the caller's token via `BlacklistCurrentTokenAsync()` then 404 (`GetMeQuery.cs:63-67`)

`ResponseResult<T>` **does carry `ActionCode`** — `int? ActionCode` property at `backend/src/Application/ResponseModels/ResponseResult.cs:35`, set by the `Failure` factories (lines 14-17). The plan's constraint "ActionCode already carries the intended status" **holds**.

Status mapping exists **only in AuthController**: login switch (`AuthController.cs:35-41`), refresh → `Unauthorized` (line 54), register switch (`AuthController.cs:97-101`). **No shared status-mapping helper exists** — `SMCA.WebApi/Extensions/` contains only `ServiceExtensions.cs` and `MigrationExtensions.cs`; the plan's "possibly add `ResponseResultExtensions.cs`" would be a genuinely new file.

Blacklist enforcement: `JwtBearerOptionsSetup.cs:37-51` — `OnTokenValidated` checks `ITokenBlacklistService.IsBlacklistedAsync(jti)` and calls `context.Fail("Token has been revoked")` → **subsequent requests with a blacklisted token return 401** (JWT bearer rejects before the action runs). `TokenBlacklistService` is `IMemoryCache`-backed singleton (`Services/TokenBlacklistService.cs:6-9`, registered `Program.cs:48`).

## Plan Defects vs Verified Current State

| # | Plan claim | Verified reality | Severity |
|---|---|---|---|
| 1 | AuthMeFailureTests.cs "list it but found MISSING" | **EXISTS** at `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs` — 3 tests, **two of which ASSERT THE BUG**: `Me_with_token_for_unknown_user_returns_200_with_NotFound_body` (line 32 asserts `HttpStatusCode.OK`) and `Me_with_token_for_inactive_user_returns_200_with_Inactive_body` (line 50 asserts `HttpStatusCode.OK`). Task 2 is "update these to expect 404" (flip = RED, then fix = GREEN), **not** "write the failing E2E from scratch" | HIGH |
| 2 | Task 2: "Add the sibling E2E for the happy path" | **Already exists**: `AuthMeTests.cs` (`Me_with_valid_minted_token_returns_current_user`, asserts 200 + `Succeeded` + `Data.Id`/`Data.Login`) and `AuthMePermissionsTests.cs` (6 tests, all assert 200 + `Succeeded`). `GetMeBillingTests.cs` + `GetMeBillingStatesTests.cs` also hit `/auth/me` on happy paths (200 + `Succeeded`) — regression guards, no change needed | HIGH |
| 3 | E2E folder `SMCA.WebApi.E2ETests/Authentication/` | Actual folder is **`Auth/`** (all 3 AuthMe files there) | MEDIUM |
| 4 | "66 occurrences across 13 controllers" | **64 raw / 63 active** occurrences (1 commented out at `ProductCategoriesController.cs:51`) across **13 controllers (exact)**. Only AuthController maps status — the systemic-convention claim holds; count is off by 2-3 | LOW |
| 5 | "Only AuthController maps status at all (5 sites)" | True that only AuthController maps; mapping statements are login switch (400/401/403), refresh (401), register switch (400) = 3 sites + register `Created` | LOW |
| 6 | Task 4 frontend gap (hand-rolled `{ data: UserModel }`, catch returns bestEffortUser) | **Task 4 is effectively ALREADY IMPLEMENTED** (see Frontend Note below). The plan's Task 4 analysis describes a state that no longer exists; `auth-store.ts:30-33` explicitly anticipates the 404 fix | HIGH (for the plan doc; not for scope) |
| 7 | Task 2: "If 401 is not actually reachable, delete that attribute" | **401 IS reachable**: blacklisted token → middleware `context.Fail` → 401 before the action. **Keep all three `[ProducesResponseType]` attributes** | INFO |
| 8 | Plan says AuthController `GetMeAsync` ~78-81 | Exact: action spans 74-81 (attributes) / 78-81 (body); `return Ok(...)` at **line 80** | INFO |
| 9 | Task 3: "assert whichever the middleware actually produces, and if the two disagree, say so" | Middleware produces **401** (verified). First call after deactivation → 404 (post-fix), second call with same token → 401. Statuses disagree but meaning agrees ("session over") — both are frontend session verdicts; document the intentional difference | INFO |

## Touchpoint Map (Tasks 1-3)

| File | State | Change |
|---|---|---|
| `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs` | `return Ok(await Sender.Send(new GetMeQuery()))` at **line 80**; ProducesResponseType 200/401/404 at 75-77 | MODIFY: map `ResponseResult.ActionCode` → HTTP status (404); add asymmetry comment (Task 1); KEEP the 401 attribute (reachable via middleware) |
| `backend/src/SMCA.WebApi/Extensions/ResponseResultExtensions.cs` | **Does not exist** (only ServiceExtensions, MigrationExtensions) | NEW (optional) if Task 1 chooses reusable `ToActionResult()`; note `ActionCode` is `int?` — define null default |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs` | 3 tests; 2 assert `HttpStatusCode.OK` (lines 32, 50) + `Succeeded=false` + `ActionCode=404` + error code | MODIFY: flip unknown-user and inactive-user to expect **404** (RED); ADD Task 3 second-call test (same token → 401) |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeTests.cs` | Happy path, asserts 200/`Succeeded`/`Data` | No change (Task 2 sibling already satisfied) |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMePermissionsTests.cs` | 6 happy-path tests, all 200 | No change (regression guard) |
| `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeQueryHandlerTests.cs` | 2 tests (null/empty `UserExternalId` → NotFound); **no unit coverage of the inactive+blacklist path** | OPTIONAL: add inactive-user test verifying 404 + `BlacklistAsync` called |
| `backend/src/SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs`, `GetMeBillingStatesTests.cs` | Happy-path `/auth/me` callers (200 + `Succeeded`) | No change (regression guard) |

E2E infra verified: `WebAppFixture` (Postgres `smca_test`, EF migrate, `Collection("e2e")`), `AppTestFactory`, `AuthTestHelpers.MintToken` (real `IJwtProvider.GenerateToken`) / `.BearerClient`, `DbTestHelpers.SeedInactiveUserAsync` (sets `IsActive=false`), `.SeedSuperAdminAsync`, `.AuthedClient`, `AuthzSeed` (owner-admin/store-user graphs), `ApiResponse<T>` test DTO (`Succeeded`/`Data`/`Errors`/`ActionCode`).

## Approaches

1. **Fix `/auth/me` only (plan recommendation a)** — map `ResponseResult.ActionCode` onto HTTP status in `GetMeAsync`, inline switch (pattern: `AuthController.cs:35-41`) or new `ResponseResultExtensions.ToActionResult()`.
   - Pros: smallest blast radius; the one endpoint whose failure means "session over"; frontend already handles 401/404 (verified); E2E + happy-path guards exist
   - Cons: leaves the 200-for-failures convention in place for 62 other actions (documented, deliberate)
   - Effort: **Low**

2. **Shared `ResponseResultExtensions.ToActionResult()` + apply to `/auth/me`** — extract the login/register switch pattern into `SMCA.WebApi/Extensions/ResponseResultExtensions.cs`, use it in `GetMeAsync` only.
   - Pros: reusable, single place for the `int? ActionCode` → status rule; future-proofs the auth-critical set (option b)
   - Cons: new abstraction for one call site today (YAGNI); touches more code; needs a null-default decision
   - Effort: **Low-Medium**

3. **Map all 64** (option c) — breaking change for every frontend call site (resolved 200s become rejected), requires companion frontend migration + coordinated release.
   - Pros: removes the systemic lie
   - Cons: out of scope; needs its own plan; explicitly rejected by the plan's Global Constraints
   - Effort: **High** — NOT recommended

## Recommendation

**Approach 1 (fix `/auth/me` only), inline, reading `ResponseResult.ActionCode`** — matches the plan's Task 1 recommendation (a) and the defect's actual shape: a terminated session must not look like a successful fetch. Optionally pair with the shared extension only if the proposal expects option (b) growth soon — otherwise YAGNI wins.

Rewrite Task 2 to say: **flip the two existing assertions** in `AuthMeFailureTests.cs` from 200 → 404 (they are the RED), then change `GetMeAsync` line 80 to map status. Task 3's second-call E2E: expect **401** (middleware `context.Fail`), and state in the design that 404-then-401 are intentionally different statuses with the same verdict.

## Risks

- **E2E mutation of existing assertions is the core risk**: `AuthMeFailureTests.cs` and `AuthMePermissionsTests.cs` currently encode 200-on-failure; a careless apply could "fix" the wrong files or skip the flip, leaving the suite asserting the bug (tests would then fail after the fix — they are the guard, not the enemy).
- **`ActionCode` is `int?`**: any mapper must define a null default (current code path always sets it on failure; success paths leave it null and return `Ok`).
- **Second-call 401 depends on IMemoryCache singleton + jti in minted tokens**: `IJwtProvider.GenerateToken` must emit a `jti` for blacklisting to bite; verify in the first E2E run (Logout E2Es suggest it works).
- **Frontend compatibility**: verified NON-issue — `auth-store.ts` already logs out on 401/404 (`isSessionRejection`, lines 39-45/147-165); the fix cannot regress the offline path (bestEffortUser retained for transport failures only).
- **Plan doc is stale in 6 places** (table above); the proposal/spec must not inherit the "write from scratch" framing or the `Authentication/` folder path.

## Frontend Note (Task 4 — RECORD ONLY, **OUT OF SCOPE** for this change)

Task 4 is **effectively already implemented** on `frontend-react` (main_backend):

- `apps/web-store-pos/app/shared/lib/http/auth-http-service.ts` (note: `lib/http/`, not `lib/services/` as the plan states) — `getMe()` (lines 47-53) types the response as `BaseResponseModel<UserModel>`, guards `succeeded`, throws `SessionRejectedError`, returns `response.data.data`. The plan's "hand-rolled `{ data: UserModel }` at :44-46" no longer exists.
- `apps/web-store-pos/app/shared/lib/stores/auth-store.ts` — `isSessionRejection()` (39-45) treats `SessionRejectedError` name OR status 401/404 as verdicts; catch block (147-165) calls `logout()` on rejection, retains `bestEffortUser` only for transport failures. Comment at :30-33 explicitly documents "404 is the code `GetMeQuery` passes for both `NotFound` and `AccountInactive`".
- Regression tests already exist: `__tests__/auth-http-service.session-rejected.test.ts`, `__tests__/auth-store.session-rejected.test.ts` (mock `'La cuenta está inactiva.'` rejection → logout).
- Plan's remaining Task 4 items that may still be open: confirm the offline-path retention regression test exists (partially covered by the session-rejected tests) and the `roster-http-service.ts:12` latent typing hole — both frontend follow-up, NOT this change.

## Ready for Proposal

**Yes.** Single-change feasibility: **confirmed**. The change is small (one action + test assertion flips + one new E2E) and the frontend already anticipates it. Open questions for the proposal:

1. Task 1 scope confirmation: (a) `/auth/me` only (recommended) — explicit sign-off that the other 62 actions keep the 200 convention.
2. Inline switch vs new `ResponseResultExtensions.ToActionResult()` — pick before design; recommendation: inline for one call site.
3. Include the optional `GetMeQueryHandlerTests` inactive+blacklist unit test (currently uncovered at unit level)?
4. Task 3 wording: record 404-then-401 as intended (statuses differ, verdict identical).
