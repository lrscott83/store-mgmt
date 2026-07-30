# Proposal: register-endpoint-fixes

**Change ID**: `2026-07-30-register-endpoint-fixes`
**Date**: 2026-07-30
**Author**: API endpoint review of `POST /api/v1/auth/register` (score 5.5/10)

## Intent

Corregir 7 bugs críticos en el register endpoint. El más grave: el handler genera el JWT pero retorna `bool`, descartando el token. El frontend recibe `BaseResponseModel<boolean>` — no puede extraer el token para auto-login post-registro.

## Scope

### In Scope
1. `ICommand<bool>` → `ICommand<AuthDto>` en RegisterCommand — retornar el JWT generado
2. Controller: 201 Created, `[FromBody]`, `ProducesResponseType`, rate limiting
3. `Program.cs`: RegisterPolicy (10 req / 10 min)
4. `IsUniqueLoginAsync`: fake async → real async EF query
5. `CreateStoreService`: N+1 loop → `GetModulesByIdsAsync`
6. `IGenericRepository` + `GenericRepository`: agregar `AddRangeAsync`
7. `CreateStoreService`: usar `AddRangeAsync` + fix catch vacío en ReSeller lookup
8. Tests: actualizar expectations (`bool` → `AuthDto`)
9. `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md`: documentar nuevo contrato

### Out of Scope
- UnitOfWorkBehaviour/IsQuery fix (handler owns SaveChangesAsync)
- TOCTOU race on login uniqueness (requiere migration)
- Primitive obsession refactor

## Approach

| # | Bug | Fix |
|---|-----|-----|
| 1 | Retorna `bool` | Cambiar a `ICommand<AuthDto>`, el handler ya genera el token |
| 2 | 200 OK | `[ProducesResponseType(StatusCodes201Created)]` + `201 Created` |
| 3 | Sin rate limit | `[EnableRateLimiting("RegisterPolicy")]` — 10 req / 10 min |
| 4 | Fake async | `Task.FromResult(All(...))` → `!await AnyAsync(...)` |
| 5 | N+1 en modules | `foreach + GetByIdAsync` → `GetModulesByIdsAsync(storeTypeId)` |
| 6 | Sin batch insert | `AddRangeAsync` en generic repo + usar en CreateStoreService |
| 7 | Catch vacío | Agregar `ILogger`, loguear, re-lanzar |

## Affected Areas

| Area | Impact |
|------|--------|
| `RegisterCommand.cs` | Modified — return type |
| `AuthController.cs` | Modified — status, body, docs, rate limit |
| `Program.cs` | Modified — policy |
| `UserRepository.cs` | Modified — real async |
| `CreateStoreService.cs` | Modified — batch query/insert, logging |
| `IGenericRepository.cs` | Modified — AddRangeAsync |
| `GenericRepository.cs` | Modified — impl AddRangeAsync |
| `RegisterCommandHandlerTests.cs` | Modified — expectations |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Frontend breaks on new response | High | Frontend plan doc before deploy |
| AddRangeAsync misused for large sets | Low | Solo usado en CreateStoreService (lists pequeñas) |
| Rate limit too aggressive | Low | 10 req/10min cubre batch manual |

## Rollback Plan

Revert commits en todos los archivos. Rate limiting es solo config. El cambio de contrato requiere rollback coordinado con frontend.

## Success Criteria

- [ ] `POST /api/v1/auth/register` retorna `201` + `AuthDto` con JWT válido
- [ ] 7 bugs confirmados fixed en code review
- [ ] Rate limit devuelve `429` tras 10 requests en 10 min
- [ ] Sin N+1 en CreateStoreService (verificar con SQL log)
