# Delta for auth-refresh-token-lifetime-e2e

**Purpose**: ADD-ONLY E2E coverage (AUTH-INV-01) pinning the 35-day refresh-token lifetime invariant at `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh`. The refresh token is opaque Base64 (no JWT `exp` claim), so its lifetime is observable only through the response field `RefreshTokenExpiresAt` and the persisted `RefreshTokens.ExpiresAt` row. Both requirements are **documented RED today**: the environment inherits 7 days from `AuthenticationSettings.cs:16` / `appsettings.json:92`. The red is the defect, not the test — verify records a documented fail and the change is NOT blocked. No production code changes; no existing E2E test is touched.

## ADDED Requirements

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

## Explicitly Out of Scope (do not drift)

- No production fix of the 7→35 defect — it is a separate future change; the RED documents it.
- No edits or weakening of any existing E2E test (ADD-ONLY); no `IOptions`/settings mutation.
- The refresh response's access-token `ExpiresIn` (two-section divergence, H-2) and revocation details (`RevokedAt`, `ReplacedByToken`) are observed, not asserted.
