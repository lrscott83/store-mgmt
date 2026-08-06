# Design: Fix Refresh-Token Persistence

## Technical Approach

Option B (proposal): inject `IApplicationUnitOfWork` into `LoginCommandHandler`, `RefreshCommandHandler`, `RevokeCommandHandler` and call `SaveChangesAsync` after repository staging, mirroring `RegisterCommand.cs:122` and the 37/40 explicit-save convention. `UnitOfWorkBehaviour.IsQuery()` stays dead code (comment-only warning added). Satisfies R1–R4 from `specs/refresh-token-persistence/spec.md`.

## Architecture Decisions

| # | Decision | Options | Tradeoff | Decision |
|---|----------|---------|----------|----------|
| D1 | Save mechanism | A: uncomment `IsQuery()` | Double-saves 37 commands, TransactionScope on all 63 actions, partial flush on early returns — "unacceptable blast radius" (explore) | B: explicit save in the 3 handlers — narrow, unit-verifiable, repo-consistent |
| D2 | Ctor param position | First (Register precedent) vs append | Reorder = 6-line churn per ctor; append = pure 1-line insertion ("small diff" per proposal) | Append as LAST param; note Register's first-position as non-binding precedent |
| D3 | Revoke save placement | Unconditional vs guard | Unconditional save breaks idempotency pin (no save when nothing staged) | Specific-token: save inside `!token.IsRevoked` guard; revoke-all: one save after loop when `Count > 0` — invariant "save iff staged" |
| D4 | Dead pipeline | Fix vs document | Fixing = D1-A blast radius | Comment-only warning on `IsQuery()` (lines 36-40); corrected false comment at `RefreshCommand.cs:73` |

## Data Flow

    Login:   creds → IsValidUserAsync → GenerateRefreshToken → repo.Add(rt) → UoW.Save
    Refresh: hash → GetByTokenHashAsync → validate → existing.Revoke() → repo.Update(old)
             + repo.Add(new) → UoW.Save
    Revoke:  hash → GetByTokenHashAsync → token.Revoke() → repo.Update(token) → UoW.Save
             (revoke-all: per-token Update, ONE save after loop)

Repository `Add`/`Update` stage on the scoped `ApplicationDbContext`; `ApplicationUnitOfWork.SaveChangesAsync` flushes the SAME context (explore §Persistence plumbing). No new EF mechanics; NoTracking is already handled (`Update` sets `Entry.State = Modified`).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/Features/Authentication/Commands/Login/LoginCommand.cs` | Modify | `using Application.UnitOfWorks;`, UoW field + ctor param; save after `Add` (line 58) |
| `backend/src/Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs` | Modify | `using Application.UnitOfWorks;`, UoW; replace false comment (line 73); save after `Add(newRefreshToken)` (line 75) |
| `backend/src/Application/Features/Authentication/Commands/Revoke/RevokeCommand.cs` | Modify | `using Application.UnitOfWorks;`, UoW; save inside specific-token guard (line 44); save after loop when `Count > 0` (lines 55-59) |
| `backend/src/Application/Behaviours/UnitOfWorkBehaviour.cs` | Modify | Comment-only dead-code warning at `IsQuery()` (lines 36-40); behavior unchanged |
| `backend/src/Application.Tests/Authentication/Commands/{Login,Refresh,Revoke}/*HandlerTests.cs` | Modify | Ctor gains `Mock<IApplicationUnitOfWork>` (compile-forced, 1 site per file); 7 RED tests/assertions |

## Interfaces / Contracts

Constructor additions (LAST param each; field `_applicationUnitOfWork`; `using Application.UnitOfWorks;`):

```csharp
public LoginCommandHandler(IAuthenticationService, IJwtProvider, IAuthTokenConfig,
    IRefreshTokenRepository, IOptions<AuthenticationSettings>, ILogger<LoginCommandHandler>,
    IApplicationUnitOfWork applicationUnitOfWork);
public RefreshCommandHandler(IRefreshTokenRepository, IJwtProvider, IUserRepository,
    IOptions<AuthenticationSettings>, ILogger<RefreshCommandHandler>,
    IApplicationUnitOfWork applicationUnitOfWork);
public RevokeCommandHandler(IRefreshTokenRepository, IHttpContextService,
    ILogger<RevokeCommandHandler>, IApplicationUnitOfWork applicationUnitOfWork);
```

Call sites:

```csharp
// LoginCommand.cs — after line 58: _refreshTokenRepository.Add(refreshToken);
await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

// RefreshCommand.cs — replace line 73 comment, save after line 75:
// 6. Persist rotation explicitly — do NOT rely on UnitOfWorkBehaviour: it never saves.
_refreshTokenRepository.Update(existingToken);
_refreshTokenRepository.Add(newRefreshToken);
await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

// RevokeCommand.cs — specific token (inside existing guard, line 41-45):
token.Revoke();
_refreshTokenRepository.Update(token);
await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
// revoke-all (after foreach, lines 55-59):
if (activeTokens.Count > 0)
    await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

// UnitOfWorkBehaviour.cs:36-40 — precede IsQuery() body with:
// Do not rely on this pipeline behaviour to persist changes: it is intentionally
// dead code. Handlers MUST call IApplicationUnitOfWork.SaveChangesAsync explicitly
// (auth cluster broke by trusting this — see fix-refresh-token-persistence).
```

## Testing Strategy

Strict TDD (RED → GREEN): RED step adds the `Mock<IApplicationUnitOfWork>` ctor wiring AND the unused ctor param to each handler so the suite compiles; the 7 new save assertions FAIL (no save yet). GREEN step adds the 3 save sites + comment fixes; `dotnet test backend/src/SMCA.sln` goes green. Precedent: `RegisterCommandHandlerTests.Handle_ShouldCallSaveChangesAsync_WithCancellationToken` (`Times.Once` Verify).

| File | Test | Assertion |
|------|------|-----------|
| Login | `Handle_WithValidCredentials_ShouldCallAdd_AndSaveChangesAsync` | `Add(rt.UserId == userId)` once + `SaveChangesAsync` once |
| Login | `Handle_WithInvalidCredentials_ShouldNotSave` | `SaveChangesAsync` never |
| Login | `Handle_WithValidCredentials_ShouldStageRefreshTokenWithExpiryFromSettings` | Added `rt.ExpiresAt` ≈ `UtcNow.AddDays(7)` |
| Refresh | `Refresh_rotatesToken_persistsChanges` | `SaveChangesAsync` once after Update+Add |
| Refresh | `Refresh_withInvalidToken_ShouldNotSave` (Theory: null/revoked/expired) | `SaveChangesAsync` never (R4) |
| Revoke | `Revoke_specificToken_persistsRevocation` | `SaveChangesAsync` once after Update |
| Revoke | `Revoke_alreadyRevoked_isIdempotent` (extend) | + `SaveChangesAsync` never |

E2E: none added; zero existing E2E tests touched. Mock setup `ReturnsAsync(1)` added in the 3 ctors (fixture precedent) so success paths mirror `RegisterCommandHandlerTestFixture.cs:138-140`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration, no schema change, no feature flag. Single PR; rollback = `git revert` the 3 handler diffs + test updates (proposal §Rollback Plan). Behavior returns to today's baseline.

## Open Questions

None blocking.
