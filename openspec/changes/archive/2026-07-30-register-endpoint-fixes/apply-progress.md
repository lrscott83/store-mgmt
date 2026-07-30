# Apply Progress: register-endpoint-fixes

**Date**: 2026-07-30
**Status**: 16/16 tasks complete

## What Was Done

All 5 phases implemented and building successfully (0 errors).

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. Foundation | 1.1–1.4 (4 tasks) | ✅ Complete |
| 2. Core Implementation | 2.1–2.5 (5 tasks) | ✅ Complete |
| 3. Controller Wiring | 3.1–3.4 (4 tasks) | ✅ Complete |
| 4. Testing | 4.1–4.4 (4 tasks) | ✅ Complete |
| 5. Documentation | 5.1 (1 task) | ✅ Complete |

## Deviations from Design

1. **Task 2.3 (Remove unused deps)**: Removed `IUserRepository` and `IHttpContextService` from handler + constructor as they were unused. Added `IAuthTokenConfig` to calculate `ExpiresIn` from configured `TokenLifetimeDays` (following the same pattern as `LoginCommandHandler`). Design mentioned removing unused deps but didn't specify `IAuthTokenConfig` — this was necessary to avoid hardcoding the token expiry.
2. **Task 1.3 (UserRepository)**: Design said "no caller change" and "no CancellationToken parameter" — the method signature was kept unchanged (no CancellationToken added), just replaced `Task.FromResult(All(...))` with `!AnyAsync(...)`.
3. **Task 5.1 (Frontend doc)**: File already existed with old contract info; updated it with the new `AuthDto` shape and rate limit details.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/Domain/Common/Repositories/IGenericRepository.cs` | Modified | Added `Task AddRangeAsync(IEnumerable<TEntity> entities)` |
| `src/Infrastructure/Persistence/Repositories/GenericRepository.cs` | Modified | Implemented `AddRangeAsync` via `await _dbContext.Set<TEntity>().AddRangeAsync(entities)` |
| `src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modified | Replaced `Task.FromResult(All(...))` with `!await AnyAsync(...)` |
| `src/SMCA.WebApi/Program.cs` | Modified | Added `RegisterPolicy` (10 req / 10 min sliding window) |
| `src/Application/Services/Stores/CreateStoreService.cs` | Modified | N+1 fix: `GetModulesByIdsAsync` + `Dictionary` + `AddRangeAsync` |
| `src/Application/Features/Authentication/Commands/Register/RegisterCommand.cs` | Modified | `ICommand<AuthDto>`, `ILogger`, ReSeller logging, removed unused deps |
| `src/SMCA.WebApi/Controllers/v1/AuthController.cs` | Modified | `[FromBody]`, 201 Created, `[EnableRateLimiting]`, `[ProducesResponseType]` |
| `src/Application.Tests/.../RegisterCommandHandlerTestFixture.cs` | Modified | Added `Mock<ILogger<RegisterCommandHandler>>`, `Mock<IAuthTokenConfig>` |
| `src/Application.Tests/.../RegisterCommandHandlerTests.cs` | Modified | Updated assertions for `AuthDto` fields |
| `src/Application.Tests/.../RegisterCommandHandlerPerformanceTests.cs` | Modified | Updated assertions for `AuthDto` fields |
| `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md` | Updated | New contract: 201 Created, `ResponseResult<AuthDto>`, rate limits |

## Issues Found

None. Build succeeded with 0 errors.

---

## Archive Status

**Archived**: 2026-07-30
**Status**: ✅ Complete
**Tasks**: 16/16 complete
**Tests**: 52 unit + 11 E2E — all passing
**Archive path**: `openspec/changes/archive/2026-07-30-register-endpoint-fixes/`

### Specs Synced to Main
- `auth-http/spec.md` — S2/S3 updated for AuthDto return type and auto-login flow
- `rate-limiting/spec.md` — Created (new domain)
- `user-repository/spec.md` — Created (new domain)
- `store-service/spec.md` — Created (new domain)
- `generic-repository/spec.md` — Created (new domain)
