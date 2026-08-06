# Tasks: Fix Refresh-Token Persistence

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300 (280–380) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Persist Login/Refresh/Revoke writes via `IApplicationUnitOfWork` + 7 RED unit tests | PR 1 | `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~LoginCommandHandlerTests\|FullyQualifiedName~RefreshCommandHandlerTests\|FullyQualifiedName~RevokeCommandHandlerTests"` | Manual: run WebApi, `POST /api/v1/auth/login` then `/auth/refresh` returns 200 (E2E untouched; unit-level change) | `git revert` PR commit — 3 handlers + 3 test files + UnitOfWorkBehaviour comment; returns to 401 baseline |

## Phase 1: RED — Write Failing Tests (strict TDD)

- [x] 1.1 `Application.Tests/Authentication/Commands/Login/LoginCommandHandlerTests.cs` — add `Mock<IApplicationUnitOfWork>` field + ctor mock (pass to handler, `ReturnsAsync(1)`); add `Handle_WithValidCredentials_ShouldCallAdd_AndSaveChangesAsync` (`Add` Times.Once + `SaveChangesAsync` Times.Once)
- [x] 1.2 Same file — add `Handle_WithInvalidCredentials_ShouldNotSave` (save never) + `Handle_WithValidCredentials_ShouldStageRefreshTokenWithExpiryFromSettings` (`ExpiresAt` ≈ UtcNow+7d)
- [x] 1.3 `Application/Features/Authentication/Commands/Login/LoginCommand.cs` — compile shim only: `using Application.UnitOfWorks;` + `_applicationUnitOfWork` field + LAST ctor param + assignment (no save yet)
- [x] 1.4 `Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs` — ctor mock wiring; add `Refresh_rotatesToken_persistsChanges` (save once after Update+Add)
- [x] 1.5 Same file — add `Refresh_withInvalidToken_ShouldNotSave` Theory (null/revoked/expired → save never, spec R4)
- [x] 1.6 `Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs` — compile shim: field + LAST ctor param (no save yet)
- [x] 1.7 `Application.Tests/Authentication/Commands/Revoke/RevokeCommandHandlerTests.cs` — ctor mock wiring; add `Revoke_specificToken_persistsRevocation` (save once) + extend `Revoke_alreadyRevoked_isIdempotent` (no Update, save never)
- [x] 1.8 `Application/Features/Authentication/Commands/Revoke/RevokeCommand.cs` — compile shim: field + LAST ctor param (no save yet)
- [x] 1.9 Run filter test command → 7 save assertions FAIL (RED proven; ctor shims + handler signature change land in the same change per oracle)

## Phase 2: GREEN — Production Fix

- [x] 2.1 `Login/LoginCommand.cs:58` — after `_refreshTokenRepository.Add(refreshToken);` add `await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);`
- [x] 2.2 `Refresh/RefreshCommand.cs:73-75` — replace false comment with `// Persist rotation explicitly — do NOT rely on UnitOfWorkBehaviour: it never saves.`; save after `_refreshTokenRepository.Add(newRefreshToken);`
- [x] 2.3 `Revoke/RevokeCommand.cs` — save inside specific-token guard (after `Update(token)` line 44); revoke-all: `if (activeTokens.Count > 0)` save after loop (line 59)
- [x] 2.4 `Application/Behaviours/UnitOfWorkBehaviour.cs:36-40` — comment-only dead-code warning on `IsQuery()` (`// Do not rely on this pipeline behaviour...`); behavior unchanged

## Phase 3: Green Verification

- [x] 3.1 Re-run Phase-1 filter command → 7 new + all existing handler tests PASS
- [x] 3.2 `dotnet test backend/src/SMCA.sln` → full suite green (E2E not executed/touched)

## Phase 4: Hygiene

- [x] 4.1 `git status` — confirm only 3 handlers + 1 comment-only file + 3 test files changed; zero E2E files modified; no docs changed
