# Design: register-endpoint-fixes

## Technical Approach

Seven targeted fixes across the register flow: (1) return `AuthDto` instead of `bool` to expose the already-generated JWT, (2–3) proper REST semantics + rate limiting on the controller, (4) real async in `IsUniqueLoginAsync`, (5–6) batch N+1 elimination and `AddRangeAsync` in store creation, (7) logging in ReSeller catch. Each fix is self-contained; the contract change (AD1) is the only breaking one.

## Architecture Decisions

| # | Decision | Choice | Rationale | Files |
|---|----------|--------|-----------|-------|
| AD1 | Return type | `ICommand<AuthDto>` | JWT already generated in handler, discarded by `bool` return — eliminates extra `/auth/login` call | `RegisterCommand.cs`, `RegisterCommandHandler.cs` |
| AD2 | HTTP status | `201 Created` | REST semantics for resource creation; follows `CreatedAtAction` pattern | `AuthController.cs` |
| AD3 | Rate limiting | `RegisterPolicy`: 10 req / 10 min sliding window | More permissive than login (5/min) because registration is less frequent; long window prevents batch abuse | `Program.cs`, `AuthController.cs` |
| AD4 | Fake async → real | `AnyAsync` instead of `Task.FromResult(All(...))` | `AnyAsync` is truly async, short-circuits on first match; no caller change | `UserRepository.cs` |
| AD5 | N+1 in module loop | `GetModulesByIdsAsync` + `Dictionary<int, Module>` + `AddRangeAsync` | Eliminates N round trips; `GetModulesByIdsAsync` already exists in `IModuleRepository` | `CreateStoreService.cs` |
| AD6 | Batch insert | `AddRangeAsync` on `IGenericRepository` + `GenericRepository` | EF Core batches internally; no chunking per requirement | `IGenericRepository.cs`, `GenericRepository.cs` |
| AD7 | Swallowed exception | `ILogger` + `LogWarning` in ReSeller catch | Silent catch hides DB issues; logging provides observability without breaking flow | `RegisterCommandHandler.cs` |
| AD8 | Controller hygiene | `[FromBody]`, `[EnableRateLimiting]`, correct `[ProducesResponseType]` | Missing attributes cause binding/routing/doc issues | `AuthController.cs` |

## Data Flow

```
Client → POST /api/v1/auth/register [RateLimiter: RegisterPolicy]
  → AuthController.RegisterAsync([FromBody] RegisterCommand)
    → MediatR → RegisterCommandHandler
      → CreateOwnerService.CreateOwnerAsync()
      → ModuleRepository.GetAvailableModulesToStore()
      → CreateStoreService.CreateStoreAsync()
          ├── StoreRepository.AddAsync(store)
          ├── ModuleRepository.GetModulesByIdsAsync(moduleIds)  ← N+1 fix
          ├── StoreModuleRepository.AddRangeAsync(storeModules) ← new
          └── FeatureRepository + StoreRoleFeatureGenerator
      → JwtProvider.GenerateToken(userId, login)
      → ReSeller lookup (with logging on failure)
      → UnitOfWork.SaveChangesAsync()
    ← ResponseResult<AuthDto> { Login, AuthToken, ExpiresIn }
  ← 201 Created + Location header
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/Application/Features/Authentication/Commands/Register/RegisterCommand.cs` | Modify | `ICommand<bool>` → `ICommand<AuthDto>` + inject `ILogger<RegisterCommandHandler>` |
| `src/Application/Features/Authentication/Commands/Register/RegisterCommandHandler.cs` | Modify | Return `AuthDto` from generated token; add ReSeller logging |
| `src/SMCA.WebApi/Controllers/v1/AuthController.cs` | Modify | 201 Created, `[FromBody]`, `[EnableRateLimiting]`, fix `[ProducesResponseType]` |
| `src/SMCA.WebApi/Program.cs` | Modify | Add `RegisterPolicy` (10 req / 10 min sliding window) |
| `src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modify | `Task.FromResult(All(...))` → `!await AnyAsync(...)` |
| `src/Application/Services/Stores/CreateStoreService.cs` | Modify | Replace N+1 `foreach` with `GetModulesByIdsAsync` + `AddRangeAsync` |
| `src/Domain/Common/Repositories/IGenericRepository.cs` | Modify | Add `Task AddRangeAsync(IEnumerable<TEntity> entities)` |
| `src/Infrastructure/Persistence/Repositories/GenericRepository.cs` | Modify | Implement `AddRangeAsync` via `await _dbSet.AddRangeAsync(entities)` |
| `src/Application.Tests/Authentication/Commands/Register/RegisterCommandHandlerTests.cs` | Modify | Update `result.Data.Should().BeTrue()` → check `AuthDto` |
| `src/Application.Tests/Authentication/Commands/Register/RegisterCommandHandlerTestFixture.cs` | Modify | May need fixture adjustments for new dependencies |
| `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md` | Already exists | Frontend contract doc (created separately) |

## Interfaces / Contracts

### IGenericRepository (new method)
```csharp
// Add to Domain/Common/Repositories/IGenericRepository.cs
Task AddRangeAsync(IEnumerable<TEntity> entities);
```

### GenericRepository (implementation)
```csharp
// Add to Infrastructure/Persistence/Repositories/GenericRepository.cs
public async Task AddRangeAsync(IEnumerable<TEntity> entities)
{
    await _dbContext.Set<TEntity>().AddRangeAsync(entities);
}
```

### RegisterCommand return type
```csharp
// Changed from
public sealed record RegisterCommand(...) : ICommand<bool>
// To
public sealed record RegisterCommand(...) : ICommand<AuthDto>

// Handler changes:
// Task<ResponseResult<bool>> → Task<ResponseResult<AuthDto>>
// return ResponseResult.Success(true) → return ResponseResult.Success(
//     new AuthDto(request.Login, token, expiresAt))
```

### AuthController register endpoint contract
```
POST /api/v1/auth/register
Body: RegisterCommand (JSON)
Rate limit: 10 req / 10 min per IP
Response 201: ResponseResult<AuthDto> { data: { login, authToken, expiresIn, refreshToken? } }
Response 400: ResponseResult (validation)
Response 500: ResponseResult (internal)
Response 429: Too Many Requests (rate limit)
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Handler returns `AuthDto` instead of `bool` | Update assertions from `result.Data.Should().BeTrue()` to verify `result.Data.Login`, `result.Data.AuthToken` |
| Unit | `AddRangeAsync` on generic repo | Verify method exists, delegates to `DbSet.AddRangeAsync` |
| Unit | ReSeller logging | Inject `ILogger` mock, verify `LogWarning` called on exception |
| Unit | `CreateStoreService` batch query | Verify `GetModulesByIdsAsync` called once, `AddRangeAsync` called once |
| Unit | `IsUniqueLoginAsync` real async | Verify `AnyAsync` is used, not `Task.FromResult` |

## Migration / Rollout

No data migration required. Frontend must be deployed in lockstep (or before) to handle the new `AuthDto` response. The existing frontend plan at `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md` documents the new contract.

## Open Questions

- None — all decisions are resolved in the AD log above.
