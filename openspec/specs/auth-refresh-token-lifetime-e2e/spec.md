# auth-refresh-token-lifetime-e2e Capability Specification

**Capability**: auth-refresh-token-lifetime-e2e — E2E coverage pinning the 35-day refresh-token lifetime invariant at login and refresh rotation
**Origin**: SDD change `e2e-stage-1-auth-inv-01`
**Source**: `docs/testing/e2e-stage-1/AUTH-INV-01.md` (declared E2E coverage gap)
**Status**: Active
**Last Updated**: 2026-08-06

## Purpose

Coverage-only capability spec. Change `e2e-stage-1-auth-inv-01` adds NO new production
behavior and MODIFIES NO existing behavior: the 35-day refresh-token lifetime is the
requirement from AUTH-INV-01, but production today ships 7 days
(`AuthenticationSettings.cs:16` / `appsettings.json:92`). The refresh token is opaque
Base64 (no JWT `exp` claim), so its lifetime is observable only through the response
field `RefreshTokenExpiresAt` and the persisted `RefreshTokens.ExpiresAt` row. Both
requirements below are **documented RED today** — the env yields 7 days; the red is the
defect, not the test. When the future 7→35 production change ships, both tests flip
green UNTOUCHED and MUST NOT be weakened to 7.

## Capability Scope

### In Scope

- Two new `[Fact]`s in `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` (`[Collection("e2e")]`, `WebAppFixture` ctor): login lifetime (R1) and refresh rotation lifetime (R2).
- Additive nullable `RefreshToken`/`RefreshTokenExpiresAt` on `AuthData` (`backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`) — mirrors `AuthDto.cs:7-8`; System.Text.Json ignores missing members, zero impact on existing tests.
- Cleanup: `finally` deletes ALL `RefreshTokens` rows for the seeded `userId` via local `RemoveWhere<T>` (no FK cascade on `RefreshTokens.UserId`), then `DbTestHelpers.CleanupUserAsync`.

### Out of Scope

- Production fix of the 7→35 defect: separate future change; the RED documents it.
- Edits to existing E2E tests and any production code changes: prohibited (CLAUDE.md non-negotiable rule).
- Access-token `ExpiresIn` assertion (H-2 two-section divergence) and rotation/revocation details (`RevokedAt`, `ReplacedByToken`): observed, not asserted.
- No `IOptions`/settings mutation; no `MutableDateTimeProvider` clock pinning (handlers use `DateTimeOffset.UtcNow` directly).

## Requirements

### Requirement: R1: Login returns a refresh token expiring in 35 days

After a successful login, the system MUST return a refresh token whose `RefreshTokenExpiresAt` equals `DateTimeOffset.UtcNow.AddDays(35)` within a 1-hour tolerance, AND MUST persist a `RefreshTokens` row (keyed by `TokenHash == HashToken(token)`) whose `ExpiresAt` matches within the same tolerance. **Status: documented RED today** — the env yields 7 days; when the 7→35 fix ships, this requirement flips green UNTOUCHED and MUST NOT be weakened to 7.

#### Scenario: Login_returns_refresh_token_expiring_in_35_days

- GIVEN a SuperAdmin seeded with a unique login via `SeedSuperAdminAsync` (no store graph)
- WHEN `POST /api/v1/auth/login` returns 200 with `Succeeded`
- THEN `Data.RefreshToken` is non-empty AND `Data.RefreshTokenExpiresAt` equals `UtcNow + 35 days` within a 1-hour tolerance (RED today: 7 days)
- AND a `RefreshTokens` row where `TokenHash == HashToken(returned token)` has `ExpiresAt` equal to `UtcNow + 35 days` within a 1-hour tolerance (RED today)
- AND cleanup in `finally` deletes the seeded user's `RefreshTokens` rows (no FK cascade) and the user

### Requirement: R2: Refresh returns a new refresh token expiring in 35 days

After a successful refresh rotation, the system MUST return a new refresh token different from the old one whose `RefreshTokenExpiresAt` equals `UtcNow.AddDays(35)` within a 1-hour tolerance, AND MUST persist a new `RefreshTokens` row for the new token with the same expiry. **Status: documented RED today** — the env yields 7 days; the red is the defect, not the test.

#### Scenario: Refresh_returns_new_refresh_token_expiring_in_35_days

- GIVEN a logged-in SuperAdmin holding an old refresh token
- WHEN `POST /api/v1/auth/refresh` sends `{ refreshToken: old }` and returns 200 with `Succeeded`
- THEN the new `RefreshToken` differs from the old AND its `RefreshTokenExpiresAt` equals `UtcNow + 35 days` within a 1-hour tolerance (RED today: 7 days)
- AND a new `RefreshTokens` row where `TokenHash == HashToken(new token)` has `ExpiresAt` equal to `UtcNow + 35 days` within a 1-hour tolerance (RED today)
- AND cleanup in `finally` deletes ALL of the seeded user's `RefreshTokens` rows (including the revoked old row) and the user

## Verification Criteria

- [x] New file `AuthRefreshTokenLifetimeTests.cs` with exactly 2 tests (commit `7017962e`), ADD-ONLY (+143 test file / +8 `TestDtos.cs`); existing Facts untouched
- [x] Focused run `FullyQualifiedName~AuthRefreshTokenLifetimeTests`: documented RED held — 2 failed / 0 passed, both `off by 28d` (35d expected, 7d actual) at `:62` (Login) and `:113` (Refresh); no 401
- [x] Auth-area regression: 45 passed / 2 failed (only the 2 new) / 47 total — no regression (precedent drift note: tasks.md forecast 44/46, one additional pre-existing Auth case now covered)
- [x] Build `SMCA.sln` exit 0; verify PASS with documented-RED evidence (`evidence_revision sha256:7bd1b45f...`, `test_exit_code: 0`, blockers 0, requirements 2/2, scenarios 2/2)
- [x] Cleanup leaves 0 orphaned `RefreshTokens` rows for the seeded userId
- [ ] Future 7→35 production change: flips R1/R2 green UNTOUCHED — MUST NOT weaken assertions to 7 (coupling carried, never closed silently)
