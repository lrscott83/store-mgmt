# Tasks: register-endpoint-fixes

## Phase 1: Foundation (Infrastructure + Async Fixes)

- [x] 1.1 Add `Task AddRangeAsync(IEnumerable<TEntity> entities)` to `Domain/Common/Repositories/IGenericRepository.cs`
- [x] 1.2 Implement `AddRangeAsync` via `_dbSet.AddRangeAsync(entities)` in `Infrastructure/Persistence/Repositories/GenericRepository.cs`
- [x] 1.3 Replace `Task.FromResult(_users.IgnoreQueryFilters().All(...))` with `!AnyAsync(...)` using caller's `cancellationToken` in `UserRepository.cs`
- [x] 1.4 Add `RegisterPolicy` (10 req / 10 min sliding window) after existing `LoginPolicy` in `SMCA.WebApi/Program.cs`

## Phase 2: Core Implementation (Handler + Services)

- [x] 2.1 Change `RegisterCommand` from `ICommand<bool>` to `ICommand<AuthDto>` in `RegisterCommand.cs`
- [x] 2.2 Update handler return type `ResponseResult<bool>` → `ResponseResult<AuthDto>`, return `ResponseResult.Success(new AuthDto(request.Login, token, expiresAt))`
- [x] 2.3 Inject `ILogger<RegisterCommandHandler>`, replace empty ReSeller `catch (Exception)` with `LogWarning` + set null, remove unused dependencies
- [x] 2.4 Fix N+1 in `CreateStoreService.cs`: replace `foreach + GetByIdAsync` loop with single `GetModulesByIdsAsync(storeTypeId)` + `Dictionary<int, Module>` lookup
- [x] 2.5 Replace individual `AddAsync` calls with `AddRangeAsync(storeModules)` in `CreateStoreService.cs`

## Phase 3: Controller Wiring

- [x] 3.1 Add `[FromBody]` to `RegisterCommand` parameter in `AuthController.cs`
- [x] 3.2 Change `Ok(result)` to `CreatedAtAction(nameof(GetMeAsync), null, result)` for 201 status
- [x] 3.3 Update `[ProducesResponseType]` from 200 to 201 with `ResponseResult<AuthDto>`; add 400, 429, 500
- [x] 3.4 Add `[EnableRateLimiting("RegisterPolicy")]` attribute on `RegisterAsync`

## Phase 4: Testing

- [x] 4.1 Add `Mock<ILogger<RegisterCommandHandler>>` in `RegisterCommandHandlerTestFixture.cs`
- [x] 4.2 Pass `loggerMock.Object` in handler creation across all 5 test files
- [x] 4.3 Update assertions: `result.Data.Should().BeTrue()` → verify `result.Data.Login`, `result.Data.AuthToken`, `result.Data.ExpiresIn`
- [x] 4.4 Verify error paths still return correct `ResponseResult<AuthDto>` type

## Phase 5: Documentation

- [x] 5.1 Update `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md` documenting new contract — 201 Created, `ResponseResult<AuthDto>`, rate limits
