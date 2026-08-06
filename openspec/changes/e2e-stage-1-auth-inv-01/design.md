# Design: Refresh-Token Lifetime E2E Coverage (35d, documented RED)

## Technical Approach

ADD-ONLY E2E coverage (AUTH-INV-01) pinning the 35-day refresh-token lifetime invariant. The refresh token is opaque Base64 (`JwtProvider.GenerateRefreshToken`, no JWT `exp`), so its lifetime is observable only via the response field `RefreshTokenExpiresAt` and the persisted `RefreshTokens.ExpiresAt` row — both asserted against `DateTimeOffset.UtcNow.AddDays(35)` within a 1h window (precedent `AuthTokenLifetimeTests.cs:24-27`). Both tests are **documented RED today**: the environment inherits 7 days from `AuthenticationSettings.cs:16` / `appsettings.json:92` (no override in `appsettings.Tests.json`). Red is the defect, not the test; verify records a documented fail and the change is NOT blocked. Per spec R1/R2.

## Architecture Decisions

| # | Decision | Options / Tradeoffs | Choice |
|---|----------|--------------------|--------|
| D1 | Response DTO | (a) add nullable `RefreshToken`+`RefreshTokenExpiresAt` to `AuthData` (proposal-locked); (b) test-local DTO | **(a)** — `TestDtos.cs` exists to mirror `AuthDto`; System.Text.Json ignores missing members → zero impact on existing tests |
| D2 | Assert surface | (a) response field only; (b) DB row only; (c) both | **(c)** — field pins what the API reports (`LoginCommand.cs:65`), DB row pins the persisted gate for `IsActive` (`RefreshToken.cs:16-18`); DB read via `Set<RefreshToken>().IgnoreQueryFilters()` (repo hygiene) |
| D3 | Time reference | (a) `MutableDateTimeProvider`; (b) real `UtcNow` + 1h window | **(b)** — handlers use `DateTimeOffset.UtcNow` directly (`LoginCommand.cs:56`, `RefreshCommand.cs:67`), the fixture clock cannot pin refresh expiry; no `IOptions<AuthenticationSettings>` mutation (shared `"e2e"` collection → cross-test pollution) |
| D4 | Cleanup | (a) user cleanup only; (b) delete `RefreshTokens` rows then user | **(b)** — migration/entity config has **no FK** on `RefreshTokens.UserId` (only PK + 2 indexes) → no cascade; rows must be deleted explicitly via a test-local `RemoveWhere<T>` (precedent `ExportOfflineRosterTests.cs:667-672`, `AuthzSeed.cs:125-129`) then `DbTestHelpers.CleanupUserAsync` |
| D5 | RED value | (a) assert 35d (documented RED); (b) assert 7d to pass | **(a)** — 7→35 is a separate future production change; these tests flip green UNTOUCHED and MUST NOT be weakened |

## Data Flow

```
SeedSuperAdminAsync(unique login)
        │
        ▼
POST /api/v1/auth/login  ──► 200 + { data.refreshToken, data.refreshTokenExpiresAt }
        │                        │                                │
        │   DB: RefreshTokens row (TokenHash = HashToken(raw))    │
        │                        └── ExpiresAt ───────────────────┘
        ▼
POST /api/v1/auth/refresh {refreshToken=old} ──► 200 + new token ≠ old + refreshTokenExpiresAt
        │   DB: new row (hash of new) + old row revoked (observed, not asserted)
        ▼
finally: RemoveWhere<RefreshToken>(r => r.UserId == userId)  →  CleanupUserAsync(userId)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` | Create | `[Collection("e2e")]`, 2 RED tests (login + rotation), local `RemoveWhere<T>` cleanup |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | Additive `string? RefreshToken`, `DateTimeOffset? RefreshTokenExpiresAt` on `AuthData` (mirror `AuthDto.cs:7-8`); zero behavior change for existing tests |

## Interfaces / Contracts

```csharp
// AuthData additions (TestDtos.cs) — camelCase deserialized via ApiResponse.Json
public string? RefreshToken { get; set; }
public DateTimeOffset? RefreshTokenExpiresAt { get; set; }

// Endpoints (AuthController v1, AllowAnonymous)
POST /api/v1/auth/login   body { Login, Password }                 → 200 envelope
POST /api/v1/auth/refresh body { RefreshToken = old }              → 200 envelope

// DB lookup & cleanup
RefreshToken.HashToken(raw)                        // SHA256 → Base64 (RefreshToken.cs:38-39)
db.Set<RefreshToken>().IgnoreQueryFilters().Where(x => x.TokenHash == hash)
RemoveWhere<RefreshToken>(db, r => r.UserId == userId)  // then CleanupUserAsync
```

Scope guard: do NOT assert the refresh response's `ExpiresIn` (H-2 two-section divergence, out of scope); do NOT assert rotation details (`RevokedAt`, `ReplacedByToken`) beyond new ≠ old; `LoginPolicy` rate limit applies to the login path — tests reuse the proven `AuthTokenLifetimeTests` pattern.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | Login returns `refreshTokenExpiresAt` ≈ `UtcNow+35d` (1h) + DB `ExpiresAt` row | `BeCloseTo(expectedOffset, TimeSpan.FromHours(1))`; RED today (7d) |
| E2E | Refresh rotates: new ≠ old, ≈35d in response + new DB row | Same window + hash lookup; RED today |
| E2E | Cleanup leaves no orphan `RefreshTokens` rows | userId-scoped `RemoveWhere` in `finally` before user cleanup |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Pure HTTP + DB E2E test additions.

## Migration / Rollout

No migration required. Additive test file + 2 nullable DTO properties; rollback = delete file, revert properties.

## Open Questions

- None blocking. Verify phase must record the documented RED (both tests fail with 7d-vs-35d delta) — expected, NOT a defect in the change.
