# Design: getme-endpoint-fixes

## Architecture Decisions

### AD-1: JWT Blacklist en GetMeQueryHandler

**Contexto**: Cuando un usuario está inactivo, el handler llama a `SignOutAsync()` que solo remueve el header `Authorization` de la response — no invalida el JWT. El logout real usa `ITokenBlacklistService` para blacklistear el JTI.

**Decisión**: Inyectar `ITokenBlacklistService` en `GetMeQueryHandler` y reemplazar el `SignOutAsync()` con la misma lógica de blacklist que usa `LogoutQueryHandler`. Esto asegura que un usuario inactivo no pueda reutilizar su token.

**Detalle técnico**:
- Agregar `ITokenBlacklistService` como dependencia del handler
- Obtener `AccessToken` de `IHttpContextService`
- Parsear el JWT, extraer JTI y exp, blacklistear por el tiempo restante
- Eliminar la llamada a `SignOutAsync()` del handler
- `SignOutAsync()` se mantiene en la interfaz (la usa logout todavía)

### AD-2: FilterForBilling → StoreBillingUtils

**Contexto**: El método `FilterForBilling` está duplicado en `GetMeQueryHandler` y `HasPermissionAttribute` con exactamente la misma lógica.

**Decisión**: Mover a `StoreBillingUtils` como método estático público. Ambos call sites llaman al mismo método. Los tests existentes se actualizan para apuntar a `StoreBillingUtils.FilterForBilling`.

**Impacto en tests**: `GetMeOverdueDowngradeTests.cs` referencia `GetMeQueryHandler.FilterForBilling` — se actualiza a `StoreBillingUtils.FilterForBilling`.

### AD-3: HasPermissionAttribute async fix

**Contexto**: `HasUserPermissionRequirementFilter` implementa `IAuthorizationFilter` (sync), pero llama a métodos async con `.Result` (puede causar deadlocks).

**Decisión**: Cambiar a `IAsyncAuthorizationFilter` con `OnAuthorizationAsync`. Esto permite `await` real en lugar de `.Result`.

**Detalle técnico**: 
- Cambiar la implementación de `IAuthorizationFilter` a `IAsyncAuthorizationFilter`
- Renombrar `OnAuthorization` a `OnAuthorizationAsync`
- Reemplazar cada `.Result` con `await`
- No cambiar `TypeFilterAttribute` ni `HasPermissionAttribute` (la base)

### AD-4: Config caching en BillingService

**Contexto**: `GetStoreBillingSummaryAsync` hace 3 llamadas DB para leer configuraciones del sistema (grace days, due soon days, trial months).

**Decisión**: Cachear en memoria con `IMemoryCache` con expiración de 5 minutos. Estas configuraciones raramente cambian.

**Alternativa considerada**: Usar `IOptionsSnapshot` + `appsettings.json` — pero las configuraciones están en DB, no en JSON.

### AD-5: No tocar HTTP status codes

El controller sigue devolviendo `Ok()` siempre. Los tests existentes no se modifican en su comportamiento de HTTP status.

## Files Changed

### Create
- `Application/Abstractions/Caching/IConfigurationCacheService.cs` — interfaz para cache de config

### Modify
- `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` — blacklist + typo + FilterForBilling
- `Domain/Common/Utils/StoreBillingUtils.cs` — agregar FilterForBilling
- `SMCA.WebApi/Filters/HasPermissionAttribute.cs` — typo + async + FilterForBilling
- `Application/Services/Billing/BillingService.cs` — cache de config
- `SMCA.WebApi/Controllers/v1/AuthController.cs` — ProducesResponseType
- `Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` — apuntar a StoreBillingUtils

### No change
- `IHttpContextService.cs` — SignOutAsync se mantiene (lo usa logout)
- `HttpContextService.cs` — SignOutAsync se mantiene
- `LogoutQuery.cs` — sin cambios

## Test Impact

| Test File | Cambio esperado |
|-----------|-----------------|
| `GetMeOverdueDowngradeTests.cs` | Referencia a `StoreBillingUtils.FilterForBilling` en vez de `GetMeQueryHandler.FilterForBilling` |
| `GetMeQueryHandlerTests.cs` | Verificar que el mock de `ITokenBlacklistService` no rompa tests existentes |
| `GetMeBillingTests.cs` | Sin cambios (HTTP 200) |
| `GetMeBillingStatesTests.cs` | Sin cambios (HTTP 200) |
| `AuthMeTests.cs` | Sin cambios |
| `AuthMeFailureTests.cs` | Sin cambios |
| `AuthMePermissionsTests.cs` | Sin cambios |

## Sequence of Implementation

1. StoreBillingUtils + FilterForBilling (AD-2) — cambio base, permite que todo lo demás referencie el método compartido
2. HasPermissionAttribute typo + async (AD-3)
3. GetMeQueryHandler blacklist + typo + FilterForBilling (AD-1 + AD-2)
4. BillingService config cache (AD-4)
5. AuthController ProducesResponseType (AD-5)
6. Tests actualizados (GetMeOverdueDowngradeTests + verificar mocks)
7. Build + E2E tests
