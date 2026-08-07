# Proposal: Refresh-Token Lifetime E2E Coverage (35d, documented RED)

## Intent

AUTH-INV-01 requires refresh tokens to expire in **35 days**; production today issues **7 days** (`AuthenticationSettings.cs:16` + `appsettings.json:92`), with **zero** E2E coverage of `/auth/refresh` or `RefreshToken` — the defect is invisible to the suite. This change adds the missing coverage in one new file: two tests asserting the 35-day invariant, **intentionally RED today** (user-approved); the red documents the defect.

## Scope

### In Scope
- NEW `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` (`[Collection("e2e")]`), 2 tests: `Login_returns_refresh_token_expiring_in_35_days`, `Refresh_returns_new_refresh_token_expiring_in_35_days`
- Additive nullable `RefreshToken`/`RefreshTokenExpiresAt` on `AuthData` (`Infrastructure/TestDtos.cs`)
- Seed: `DbTestHelpers.SeedSuperAdminAsync` (unique Guid login); cleanup in `finally`: delete `RefreshTokens` rows for the seeded `userId` (no FK cascade — mandatory) + `CleanupUserAsync`

### Out of Scope
- NO production fix — 7→35 is a separate future change; the RED documents the defect
- No edits/weakening of existing E2E tests (ADD-ONLY); no `IOptions`/settings mutation; no Playwright; frontend gap owned by later `e2e-stage-1-frontend-plans`

## Capabilities

### New Capabilities
- `auth-refresh-token-lifetime-e2e`: 35-day refresh-token lifetime assertions (login + rotation; response `refreshTokenExpiresAt` + persisted `RefreshTokens.ExpiresAt`)

### Modified Capabilities
- None — additive coverage only

## Approach

Refresh token is opaque Base64 (not JWT) — lifetime observable only via `refreshTokenExpiresAt` + DB `ExpiresAt`. Assert `UtcNow.AddDays(35)` within 1h tolerance (pattern `AuthTokenLifetimeTests.cs:24-27`); no settings manipulation.

- **Test 1**: seed → login → 200 → assert `RefreshToken` non-empty + `RefreshTokenExpiresAt` ≈35d 🔴 → DB row (`TokenHash == HashToken(token)`, `IgnoreQueryFilters()`) `ExpiresAt` ≈35d 🔴
- **Test 2**: seed + login, capture old → refresh `{RefreshToken=old}` → 200 + new ≠ old + `RefreshTokenExpiresAt` ≈35d 🔴 → new DB row ≈35d 🔴
- Both: `finally` deletes all `RefreshTokens` rows for `userId` (covers revoked old row) + user cleanup

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` | New | 2 RED tests |
| `E2ETests/Infrastructure/TestDtos.cs` | Modified | Additive nullable props |

## Documented-RED Decision (user-approved)

Both tests FAIL today (7d config). Verify phase records a **documented fail**; the change is **NOT blocked**. The future 7→35 production change flips these tests green **UNTOUCHED** — they MUST NOT be edited to 7.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Orphaned rows (no FK cascade) | Med | Explicit `userId`-scoped row deletion |
| Test weakened to 7d | Low | RED user-approved; coupling documented |

## Rollback Plan

Delete the new test file; revert the two additive `AuthData` properties. No production or existing-test code touched — revert is file-removal only.

## Dependencies

- PostgreSQL `smca_test` + existing `WebAppFixture`; existing `DbTestHelpers`, `RefreshToken.HashToken`

## Success Criteria

- [ ] New file compiles; both tests present with exact names
- [ ] Both fail with the 7d-vs-35d delta (RED confirmed in verify)
- [ ] No orphaned `RefreshTokens` rows after run; no existing test modified
