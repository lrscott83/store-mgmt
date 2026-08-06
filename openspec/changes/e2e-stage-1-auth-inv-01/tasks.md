# Tasks: Refresh-Token Lifetime E2E Coverage (35d, documented RED)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~110–150 (1 new file ~110, TestDtos +4) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk (default) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add `RefreshToken`/`RefreshTokenExpiresAt` to `AuthData` (TestDtos.cs) + create `AuthRefreshTokenLifetimeTests.cs` with 2 RED tests | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthRefreshTokenLifetimeTests"` — expect 2 failed / 0 passed (documented RED) | N/A — pure E2E change; runtime IS the E2E suite itself (PostgreSQL `smca_test`, `WebAppFixture` migrates) | Delete `AuthRefreshTokenLifetimeTests.cs` + revert the 2 `AuthData` props; no production or existing-test code touched |

## Phase 1: Foundation (DTO)

- [ ] 1.1 In `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`, add nullable `string? RefreshToken { get; set; }` and `DateTimeOffset? RefreshTokenExpiresAt { get; set; }` to `AuthData` (mirror `AuthDto.cs:7-8`; System.Text.Json ignores missing members — zero impact on existing tests)
- [ ] 1.2 Acceptance: existing E2E project still compiles (`dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`) with no edits to any other file

## Phase 2: Core — 2 documented-RED tests (ADD-ONLY)

- [ ] 2.1 Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` — namespace `SMCA.WebApi.E2ETests.Auth`, `[Collection("e2e")]`, ctor `(WebAppFixture fixture)` per `AuthTokenLifetimeTests.cs:32-36`; private `TimeSpan Tolerance = TimeSpan.FromHours(1)` and `int ExpectedLifetimeDays = 35`
- [ ] 2.2 Test 1 `Login_returns_refresh_token_expiring_in_35_days`: seed unique login via `DbTestHelpers.SeedSuperAdminAsync` → `POST /api/v1/auth/login` → assert 200 + `Succeeded` → assert `Data.RefreshToken` non-empty and `Data.RefreshTokenExpiresAt` `BeCloseTo(UtcNow.AddDays(35), Tolerance)` (RED: env yields 7d) → DB assert: `Set<RefreshToken>().IgnoreQueryFilters()` row with `TokenHash == RefreshToken.HashToken(token)` has `ExpiresAt` `BeCloseTo(UtcNow.AddDays(35), Tolerance)` (RED)
- [ ] 2.3 Test 2 `Refresh_returns_new_refresh_token_expiring_in_35_days`: seed + login, capture `oldRefreshToken` → `POST /api/v1/auth/refresh` body `{ RefreshToken = old }` → assert 200 + `Succeeded` → assert new token ≠ old and `RefreshTokenExpiresAt` ≈ `UtcNow+35d` (RED) → DB assert new row by `HashToken(new)` `ExpiresAt` ≈ 35d (RED); `RevokedAt`/`ReplacedByToken` observed only, NOT asserted (design scope guard)
- [ ] 2.4 Both tests: `finally` deletes ALL `RefreshTokens` rows where `UserId == seeded userId` via local `RemoveWhere<T>` (ignore query filters + RemoveRange, precedent `AuthzSeed.cs:125-129` — no FK cascade on `RefreshTokens.UserId`) THEN `DbTestHelpers.CleanupUserAsync(_factory, userId)`
- [ ] 2.5 Acceptance: NO production code edited; NO existing E2E test touched; scope guards held — no `ExpiresIn` assert (H-2), no `IOptions`/settings mutation, no 7-day weaken

## Phase 3: Verification (documented RED)

- [ ] 3.1 Run focused filter `--filter "FullyQualifiedName~AuthRefreshTokenLifetimeTests"` → record **2 failed / 0 passed**; acceptance: each failure message shows `RefreshTokenExpiresAt`/`ExpiresAt` differing by ~28 days (assert 35d vs env 7d) — failing for the RIGHT reason; do NOT change code to make them green
- [ ] 3.2 Run Auth-area regression `--filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Auth"` → all EXISTING Auth tests pass (incl. `AuthTokenLifetimeTests`); only the 2 new tests fail (documented RED)
- [ ] 3.3 Confirm no orphaned `RefreshTokens` rows remain for the seeded userId after each run (cleanup in `finally` executed)

## Non-goals (do NOT task)

No production fix (7→35 owned by later change); no README/AUTH-INV-01.md doc flips (owned by later `e2e-stage-1-frontend-plans`); no existing E2E edits; no `ExpiresIn` assertion.
