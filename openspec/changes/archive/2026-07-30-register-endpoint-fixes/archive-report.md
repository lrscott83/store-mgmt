# Archive Report: register-endpoint-fixes

**Change ID**: `2026-07-30-register-endpoint-fixes`
**Archived Date**: 2026-07-30
**Status**: ✅ Complete — 16/16 tasks

---

## Summary

8 fixes applied to `POST /api/v1/auth/register` following an API endpoint review that scored the endpoint 5.5/10. The most critical fix: the handler generated a JWT but returned `ICommand<bool>`, discarding the token. Changed to `ICommand<AuthDto>`, returning the JWT in the response for auto-login.

## Fixed Issues

| # | Issue | Fix |
|---|-------|-----|
| 1 | `ICommand<bool>` discards JWT | Changed to `ICommand<AuthDto>`, returns JWT token |
| 2 | `200 OK` instead of `201 Created` | `CreatedAtAction` → `Created("path")` due to API endpoint name resolution issues |
| 3 | No rate limiting | `RegisterPolicy` (10 req / 10 min sliding window) |
| 4 | Fake async: `Task.FromResult(All(...))` | `!await AnyAsync(...)` in `IsUniqueLoginAsync` |
| 5 | N+1 in module loop | Batch `GetModulesByIdsAsync` + `Dictionary<int, Module>` lookup |
| 6 | No batch insert | `AddRangeAsync` added to `IGenericRepository`/`GenericRepository` |
| 7 | Empty `catch(Exception)` in ReSeller | Added `ILogger<RegisterCommandHandler>`, `LogWarning`, removed generic catch |
| 8 | Missing controller attributes | Added `[FromBody]`, `[ProducesResponseType]`, `[EnableRateLimiting("RegisterPolicy")]` |

## Verification Results

- **52 unit tests**: All passing
- **11 E2E tests**: All passing
- **Build**: 0 errors

## Files Changed

| File | Action |
|------|--------|
| `src/Domain/Common/Repositories/IGenericRepository.cs` | Modified — added `AddRangeAsync` |
| `src/Infrastructure/Persistence/Repositories/GenericRepository.cs` | Modified — `AddRangeAsync` implementation |
| `src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modified — `AnyAsync` instead of `Task.FromResult(All(...))` |
| `src/SMCA.WebApi/Program.cs` | Modified — added `RegisterPolicy` |
| `src/Application/Services/Stores/CreateStoreService.cs` | Modified — N+1 fix, `AddRangeAsync`, logger |
| `src/Application/Features/Authentication/Commands/Register/RegisterCommand.cs` | Modified — `ICommand<AuthDto>`, `ILogger`, removed unused deps |
| `src/SMCA.WebApi/Controllers/v1/AuthController.cs` | Modified — 201, `[FromBody]`, `[EnableRateLimiting]`, `[ProducesResponseType]` |
| `src/Application.Tests/.../RegisterCommandHandlerTestFixture.cs` | Modified — new mocks |
| `src/Application.Tests/.../RegisterCommandHandlerTests.cs` | Modified — `AuthDto` assertions |
| `src/Application.Tests/.../RegisterCommandHandlerPerformanceTests.cs` | Modified — `AuthDto` assertions |
| `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md` | Updated — new contract |

## Main Specs Updated

| Domain | Action |
|--------|--------|
| `auth-http/spec.md` | Updated S2 (AuthDto return type), S3 (auto-login flow), Verification Criteria |
| `rate-limiting/spec.md` | Created — RegisterPolicy specification |
| `user-repository/spec.md` | Created — `IsUniqueLoginAsync` real async specification |
| `store-service/spec.md` | Created — batch operations + ReSeller fault tolerance |
| `generic-repository/spec.md` | Created — `AddRangeAsync` contract |

## Deviations from Design

1. **`CreatedAtAction` → `Created("path")`**: The initial design specified `CreatedAtAction(nameof(GetMeAsync))`, but E2E tests showed the minimal API endpoint name was not found during route generation. Used `Created("path")` instead.
2. **`IAuthTokenConfig` injection**: Added `IAuthTokenConfig` to calculate `ExpiresIn` from configured `TokenLifetimeDays` (not in original design but necessary to avoid hardcoding).
3. **Removed unused deps**: `IUserRepository` and `IHttpContextService` removed from handler (design mentioned removing unused deps but didn't specify which).

## Remaining Risks / Debt

| Risk | Severity | Notes |
|------|----------|-------|
| TOCTOU race on login uniqueness | Low | Requires DB migration (unique constraint) — deferred |
| `UnitOfWorkBehaviour`/`IsQuery` fix | Low | Handler owns `SaveChangesAsync` directly — deferred |
| Primitive obsession in command params | Low | Refactor deferred |
| Frontend auto-login not implemented | Medium | Requires frontend update per the frontend plan doc |

## SDD Cycle Complete

- [x] Proposal — `proposal.md`
- [x] Design — `design.md`
- [x] Specs — `specs/register-endpoint-fixes/spec.md`
- [x] Tasks — `tasks.md` (16/16 tasks complete)
- [x] Apply — `apply-progress.md` (all phases implemented)
- [x] Archive — `archive-report.md` ✅
