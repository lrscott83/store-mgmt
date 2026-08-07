# Exploration: e2e-stage-1-auth-inv-01

**Change**: `e2e-stage-1-auth-inv-01`
**Phase**: explore
**Date**: 2026-08-06
**Branch**: `feat/e2e-auth-inv-01`
**Artifact store**: openspec (this file only)
**User story**: [AUTH-INV-01](docs/testing/e2e-stage-1/AUTH-INV-01.md) — refresh-token lifetime invariant: **35 days**. The E2E test MUST assert 35 days and therefore FAIL today (documented RED — the red is the defect, not the test). NO production code change in this change.

## 1. Current state (verified against code, file:line)

### 1.1 Refresh-token lifetime configuration — the defect

| Setting | Value | Where |
|---|---|---|
| `AuthenticationSettings.RefreshTokenExpirationDays` | **7** (class default) | `backend/src/Application/Abstractions/Authentication/AuthenticationSettings.cs:16` — note: actual line is **:16**, the user story cites `:12` (doc line drift, value identical) |
| `Authentication.RefreshTokenExpirationDays` in config | **7** | `backend/src/SMCA.WebApi/appsettings.json:92` |
| `Authentication.TokenLifetimeDays` (access token, Authentication section) | 35 | `appsettings.json:91`; `AuthenticationSettings.cs:15` |
| `Jwt.TokenLifetimeDays` (access token, Jwt section) | 35 | `appsettings.json:79`; fallback 35 in `JwtProvider.cs:37` and `JwtAuthTokenConfig.cs:15` |

DI registration: `services.Configure<AuthenticationSettings>(configuration.GetSection(AuthenticationSettings.SectionName))` — `backend/src/Application/DependencyInjection.cs:60-61`. Class defaults (7) back any unbound key.

**Naming**: access-token lifetime = `TokenLifetimeDays`; refresh-token lifetime = `RefreshTokenExpirationDays`. Two distinct names, two distinct config sections consumed for the same access-token value (H-2: `LoginCommand.cs:63` reads the `Jwt` section via `IAuthTokenConfig`; `RefreshCommand.cs:80` reads the `Authentication` section via `AuthenticationSettings`).

### 1.2 Where the refresh expiry is produced and consumed

- **Issue (login)**: `LoginCommand.cs:55-58` — `GenerateRefreshToken()` → `refreshExpiry = DateTimeOffset.UtcNow.AddDays(_authSettings.RefreshTokenExpirationDays)` (**today 7d**) → persists `RefreshToken` → returned in `AuthDto`.
- **Issue (refresh rotation)**: `RefreshCommand.cs:66-68` — same formula with `_authSettings.RefreshTokenExpirationDays` (**today 7d**) → persists new row, revokes old (`existingToken.Revoke(rawRefreshToken)` at `:71`).
- **Response surface**: `AuthDto` (`backend/src/Application/Dtos/Authentication/AuthDto.cs:7-8`) — `RefreshToken` (string?) and `RefreshTokenExpiresAt` (DateTimeOffset?). Non-null in both login and refresh success responses; serialized camelCase (`refreshToken`, `refreshTokenExpiresAt`).
- **DB row**: `Domain/Entities/Authentication/RefreshToken.cs:12` — `ExpiresAt` (DateTimeOffset). The refresh token is **opaque** (`JwtProvider.GenerateRefreshToken()` = Base64 of 32 random bytes, `SMCA.WebApi/Authentication/JwtProvider.cs:51-57`) — it is **NOT a JWT**, carries **no claims and no exp claim**. Its lifetime lives **only** in the DB `ExpiresAt` column and in the response `refreshTokenExpiresAt` field. → The exp-claim decode technique (`AuthTokenLifetimeTests.cs:59`) CANNOT be reused for the refresh token.

### 1.3 Test-environment settings

`backend/src/SMCA.WebApi.E2ETests/appsettings.Tests.json` overrides the `Authentication` section but **only** `Pepper` + Argon2 params (lines 5-12). It does NOT override `RefreshTokenExpirationDays` or `TokenLifetimeDays` → in the `Testing` environment the app-under-test inherits **7d** for refresh tokens (from prod `appsettings.json:92`, chain order: main json then tests json; class default is also 7). A test asserting 35d **fails today, deterministically**. The fixture's `MutableDateTimeProvider` (`AppTestFactory.cs:13,27-31`) is registered as `IDateTimeProvider`, but `LoginCommand`/`RefreshCommand`/`RefreshToken` use `DateTimeOffset.UtcNow` **directly** (not the provider) — the mutable clock cannot pin refresh expiry; assertions must use real `UtcNow` + a tolerance window (pattern already proven by `AuthTokenLifetimeTests.cs:24-27,52-60`).

### 1.4 Existing E2E coverage touching refresh tokens

**ZERO.** Grep of the entire `backend/src/SMCA.WebApi.E2ETests` suite for `auth/refresh`, `RefreshToken`, `RefreshTokenExpiresAt`, and `refresh` (case-insensitive) → **no matches**. The closest neighbor is `Auth/AuthTokenLifetimeTests.cs` (96 lines), which asserts the **access-token JWT** 35d (`ExpiresIn` + decoded `ValidTo`) for login and register — it never reads `RefreshToken`/`RefreshTokenExpiresAt` and never calls `/auth/refresh`. **No existing test asserts the refresh-token lifetime; there is NO 7-day assertion anywhere in the E2E suite → no conflict.** (Unit tests `LoginCommandHandlerTests.cs:41` and `RefreshCommandHandlerTests.cs:40,57,81,104,125` use `RefreshTokenExpirationDays = 7` / `AddDays(7)` as *fixtures* that hand-build tokens; none asserts config-derived lifetime — no conflict either.)

### 1.5 Harness and seed/cleanup patterns

- **Harness**: `WebAppFixture` (env var connstring → `AppTestFactory` → `MigrateAsync`), `[Collection("e2e")]`. Route prefix `api/v1/[controller]` (`SMCA.WebApi/Controllers/BaseApiController.cs:11`) → `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` (`AuthController.cs:20,44`; refresh body = `{ "refreshToken": "..." }`, validator `RefreshCommandValidator.cs`).
- **Seed**: `DbTestHelpers.SeedSuperAdminAsync(factory, login, "Password123")` (unique `login`, SuperAdmin role, no store graph needed — proven by `AuthTokenLifetimeTests.cs:42` and `AuthLoginSuccessTests.cs:25`). `UserSeed.SeedOwnerAdminWithStoreAsync` exists but is unnecessary here.
- **Response DTO**: `ApiResponse<T>` envelope (`Infrastructure/ApiResponse.cs`); `AuthData` (`Infrastructure/TestDtos.cs:5-10`) currently mirrors only `Login/AuthToken/ExpiresIn` — it **lacks** `RefreshToken`/`RefreshTokenExpiresAt` and must be extended (additive) or mirrored by a test-local DTO (see §3).
- **Cleanup gotcha (critical)**: migration `20260806024450_Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays.cs:21-37` creates `RefreshTokens` with **PK and indexes only — NO FK constraint on `UserId`**. Deleting a `User` (via `DbTestHelpers.CleanupUserAsync`, `AuthzSeed.CleanupStoreGraphAsync`) does **NOT** cascade to `RefreshTokens`. Any test that calls login and cleans only the user **leaves orphaned refresh-token rows** in `smca_test` (pre-existing condition affecting even today's `AuthTokenLifetimeTests`/`AuthLoginTests` — observation for the user, NOT an action). The new test MUST delete its own `RefreshTokens` rows explicitly.

## 2. Approaches for the RED assertion

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Decode the refresh token's `exp` claim | **Impossible** — refresh token is opaque Base64 (`JwtProvider.cs:51-57`), no claims. Only the access JWT has `ValidTo` (already covered by `AuthTokenLifetimeTests`). |
| 2 | Assert response body `refreshTokenExpiresAt` (login + refresh) ≈ `UtcNow + 35d` | **Feasible and required** — it is the exact value the API reports (`LoginCommand.cs:65`, `RefreshCommand.cs:82`). Mirrors the `ExpiresIn` assertion pattern in `AuthTokenLifetimeTests.cs:55`. |
| 3 | Assert DB row `RefreshTokens.ExpiresAt` ≈ `UtcNow + 35d` (row keyed by `TokenHash = RefreshToken.HashToken(raw)`) | **Feasible and required** — pins the persisted truth (`LoginCommand.cs:56-57`, `RefreshCommand.cs:67-68`), which is the actual gate for `IsActive` (`RefreshToken.cs:16-18`). Uses `IgnoreQueryFilters()` + scope per the repo's DB-assert hygiene. |
| 4 | Override `AuthenticationSettings.RefreshTokenExpirationDays` at runtime (mutate `IOptions<AuthenticationSettings>` singleton, or a custom `ConfigureWebHost`/`ConfigureTestServices` in a new factory) | **Possible but NOT recommended** — the factory is shared across the whole `"e2e"` collection; mutating the singleton pollutes parallel tests, and a second factory adds a second DB-migration host. The user story wants the live config pinned at 35; the intended RED is the live 7d config, documented, not overridden away. |

**Assert mechanism (locked)**: combination of #2 + #3 against `DateTimeOffset.UtcNow.AddDays(35)` with `TimeSpan.FromHours(1)` tolerance (window pattern from `AuthTokenLifetimeTests.cs:24-27`). No settings manipulation — the RED is the defect, and the fixture cannot (and should not) hide it.

## 3. Recommended RED test shape

**New file only** (no existing test touched): `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs`, namespace `SMCA.WebApi.E2ETests.Auth`, `[Collection("e2e")]`. Does NOT duplicate `AuthTokenLifetimeTests` (no `ExpiresIn`/JWT-decode assertions beyond what is needed to identify rows).

- **Dto**: extend `AuthData` (`TestDtos.cs`) with two additive nullable properties `RefreshToken` and `RefreshTokenExpiresAt` (System.Text.Json ignores missing members — zero impact on existing tests; this is an infra DTO, not a test). Safer zero-touch alternative: a test-local DTO in the new file. Either is acceptable; the additive extension is preferred because `TestDtos.cs` already exists to mirror `AuthDto`.

- **Test 1 — login** (`Login_returns_refresh_token_expiring_in_35_days`):
  1. `login = $"admin-{Guid.NewGuid():N}@test.com"`; `userId = SeedSuperAdminAsync(_factory, login, "Password123")`.
  2. `POST /api/v1/auth/login` → assert 200 + `Succeeded`.
  3. Assert `body.Data.RefreshToken` non-empty; assert `body.Data.RefreshTokenExpiresAt` ≈ `DateTimeOffset.UtcNow.AddDays(35)` within 1h. **🔴 RED today: 7d.**
  4. DB assert: scope → `RefreshTokens` `.IgnoreQueryFilters()` row where `TokenHash == RefreshToken.HashToken(body.Data.RefreshToken)` → `ExpiresAt` ≈ `UtcNow + 35d` within 1h. **🔴 RED today.**
  5. `finally`: delete `RefreshTokens` rows for `userId` (IgnoreQueryFilters + RemoveRange, the `RemoveWhere<T>` shape from `AuthzSeed.cs:125-129`), then `DbTestHelpers.CleanupUserAsync(_factory, userId)`.

- **Test 2 — refresh rotation** (`Refresh_returns_new_refresh_token_expiring_in_35_days`):
  1. Seed + login as above; capture `oldRefreshToken`.
  2. `POST /api/v1/auth/refresh` body `{ RefreshToken = oldRefreshToken }` → assert 200 + `Succeeded`.
  3. Assert new `RefreshToken` ≠ old; assert `RefreshTokenExpiresAt` ≈ `UtcNow + 35d` within 1h. **🔴 RED today.**
  4. DB assert: new row by `TokenHash == HashToken(newRefreshToken)` → `ExpiresAt` ≈ `UtcNow + 35d`. **🔴 RED today.**
  5. `finally`: same cleanup (all rows for `userId` — covers the revoked old row too, since no FK cascade).

- **Not asserted** (scope guard): the refresh response's `ExpiresIn` (access-token field) — it reads the *Authentication* section (`RefreshCommand.cs:80`) while login reads the *Jwt* section; that's H-2's two-section divergence and is out of scope for this change. Rotation/revocation details (`RevokedAt`, `ReplacedByToken`) are observed, not asserted — the user story's three RED assertions are exactly the ones above.

**Seed/cleanup plan summary**: seed via existing `DbTestHelpers.SeedSuperAdminAsync` (untouched); cleanup = (1) NEW refresh-token-row deletion scoped to the seeded `userId` (mandatory — no FK cascade), (2) existing `DbTestHelpers.CleanupUserAsync` (untouched).

## 4. Conflict statement

**No existing test asserts 7 days, and no existing test touches refresh tokens at all** (verified: zero matches for `refresh`/`RefreshToken` in the E2E suite). The new test cannot collide with `AuthTokenLifetimeTests` (access-token JWT only) nor with any login test. It also does not touch, modify, weaken, or delete any existing test: new file, additive DTO properties, and self-contained cleanup. The only "7" is the **production defect** in `AuthenticationSettings.cs:16` / `appsettings.json:92` — which is precisely what the RED documents.

## 5. Risks

- **Orphaned rows**: `RefreshTokens` has no FK on `UserId`; the new test must delete its own rows or `smca_test` accumulates orphans. (Pre-existing: today's login tests already orphan rows — observation for the user, no action proposed.)
- **Intentional RED**: test asserts 35d, env config yields 7d → fails by design. It must NOT be "fixed" by changing the assertion to 7d; the fix is the future 7→35 production change (`AuthenticationSettings.cs:16` + `appsettings.json:92`), owned by a later change. When that fix lands, this test flips green without modification.
- **Harness limitations**: the mutable clock cannot pin refresh expiry (`DateTimeOffset.UtcNow` used directly in handlers) → rely on the 1h window tolerance; do NOT attempt `IOptions<AuthenticationSettings>` mutation (shared collection factory, cross-test pollution).
- **AuthData extension**: additive change to a shared infra DTO; zero behavioral impact (missing members ignored), but flagged for user awareness — a test-local DTO is the zero-touch alternative.
- **Doc line drift**: user story cites `AuthenticationSettings.cs:12`; the actual line is `:16` (same value). Minor doc mismatch, no code impact.

## 6. Ready for Proposal

**Yes.** The orchestrator should tell the user: a new test file `Auth/AuthRefreshTokenLifetimeTests.cs` with two RED tests (login + refresh rotation), each asserting `RefreshTokenExpiresAt` in the response AND the persisted `RefreshTokens.ExpiresAt` row against `UtcNow + 35d` (1h window). The tests fail today (7d defect) exactly as the user story specifies; `AuthData` gets two additive properties; cleanup deletes the seeded user's refresh-token rows explicitly (no FK cascade) before the existing user cleanup. No production code changes, no existing tests touched, no 7-day assertion exists anywhere to conflict.
