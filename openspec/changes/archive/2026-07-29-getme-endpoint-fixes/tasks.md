# Tasks: getme-endpoint-fixes

6 tareas de implementación + 1 de verificación. Orden secuencial basado en dependencias.

---

## Task 1: Mover FilterForBilling a StoreBillingUtils + eliminar duplicado

**Dependencias**: Ninguna  
**Archivos**: `StoreBillingUtils.cs`, `GetMeQuery.cs`, `HasPermissionAttribute.cs`, `GetMeOverdueDowngradeTests.cs`

### Pasos:

1.1 Agregar `FilterForBilling` como método `public static` en `StoreBillingUtils`:
```csharp
public static List<int> FilterForBilling(IEnumerable<Module> modules, StoreBillingSummary billing)
```
Con la misma lógica y XML doc del método actual en `GetMeQueryHandler`.

1.2 En `GetMeQueryHandler`, eliminar el método `FilterForBilling` y reemplazar la llamada interna con `StoreBillingUtils.FilterForBilling(...)`.

1.3 En `HasPermissionAttribute`, eliminar el método `FilterForBilling` y reemplazar la llamada con `StoreBillingUtils.FilterForBilling(...)`.

1.4 En `GetMeOverdueDowngradeTests.cs`, cambiar todas las referencias de `GetMeQueryHandler.FilterForBilling` a `StoreBillingUtils.FilterForBilling` (10 ocurrencias). Agregar `using Domain.Common.Utils;`.

**Verify**: `dotnet test --filter "GetMeOverdueDowngradeTests"` pasa.

---

## Task 2: HasPermissionAttribute — fix typo + async + FilterForBilling

**Dependencias**: Task 1 (FilterForBilling movido)  
**Archivos**: `HasPermissionAttribute.cs`

### Pasos:

2.1 Cambiar implementación de `IAuthorizationFilter` a `IAsyncAuthorizationFilter`:
```csharp
public class HasUserPermissionRequirementFilter : IAsyncAuthorizationFilter
```

2.2 Renombrar método:
```csharp
public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
```

2.3 Reemplazar cada `.Result` con `await`:
- Line 86: `GetAvailableModulesByStoreIdAsync(...).Result` → `await GetAvailableModulesByStoreIdAsync(...)`
- Line 87: `GetStoreBillingSummaryAsync(...).Result` → `await GetStoreBillingSummaryAsync(...)`
- Line 91: `GetAllowedFeatureIdsForCurrentUserAsync(...).Result` → `await GetAllowedFeatureIdsForCurrentUserAsync(...)`
- Line 100-101: `HasUserAnyFeatureInStoreAsync(...).Result` → `await HasUserAnyFeatureInStoreAsync(...)` (if present)

2.4 Renombrar `_storeModuleRepositorytory` → `_storeModuleRepository` en todo el archivo (3 ocurrencias: field, constructor param, constructor assignment, usage).

2.5 Reemplazar llamada a `FilterForBilling` local con `StoreBillingUtils.FilterForBilling(...)`. Agregar `using Domain.Common.Utils;` si no está.

**Verify**: `dotnet build SMCA.sln` compila.

---

## Task 3: GetMeQueryHandler — JWT blacklist + typo + FilterForBilling

**Dependencias**: Task 1 (FilterForBilling movido)  
**Archivos**: `GetMeQuery.cs`

### Pasos:

3.1 Agregar `ITokenBlacklistService` al constructor y field:
```csharp
private readonly ITokenBlacklistService _tokenBlacklistService;
```
Y agregarlo al constructor.

3.2 Agregar `using Application.Abstractions.Authentication;` al tope del archivo.

3.3 Renombrar `_storeModuleRepositorytory` → `_storeModuleRepository` en todo el archivo (3 ocurrencias).

3.4 Reemplazar la llamada a `FilterForBilling` local con `StoreBillingUtils.FilterForBilling(...)`. Eliminar el método `FilterForBilling` del handler.

3.5 Reemplazar el bloque `if (!user.IsActive)`:
```csharp
// ANTES:
if (!user.IsActive)
{
    await _httpContextService.SignOutAsync();
    return ResponseResult.Failure<CurrentUserDto>(UserErrors.AccountInactive, (int)HttpStatusCode.NotFound);
}

// DESPUÉS:
if (!user.IsActive)
{
    await BlacklistCurrentTokenAsync();
    return ResponseResult.Failure<CurrentUserDto>(UserErrors.AccountInactive, (int)HttpStatusCode.NotFound);
}
```

3.6 Agregar el método privado `BlacklistCurrentTokenAsync`:
```csharp
private async Task BlacklistCurrentTokenAsync()
{
    var accessToken = _httpContextService.AccessToken;
    if (string.IsNullOrEmpty(accessToken)) return;

    try
    {
        var handler = new JwtSecurityTokenHandler();
        var jsonToken = handler.ReadJwtToken(accessToken);
        var jti = jsonToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value;

        if (!string.IsNullOrEmpty(jti))
        {
            var expClaim = jsonToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Exp)?.Value;
            if (!string.IsNullOrEmpty(expClaim) && long.TryParse(expClaim, out var expSeconds))
            {
                var expDate = DateTimeOffset.FromUnixTimeSeconds(expSeconds);
                var remaining = expDate - DateTimeOffset.UtcNow;
                await _tokenBlacklistService.BlacklistAsync(jti, remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero);
            }
        }
    }
    catch
    {
        // Malformed token — skip blacklisting
    }
}
```

3.7 Agregar usings necesarios:
- `using Application.Abstractions.Authentication;`
- `using System.IdentityModel.Tokens.Jwt;`
- (verificar si ya están)

**Verify**: `dotnet build SMCA.sln` compila.

---

## Task 4: AuthController — agregar ProducesResponseType faltantes

**Dependencias**: Ninguna  
**Archivos**: `AuthController.cs`

### Pasos:

4.1 Agregar `[ProducesResponseType]` para errores en `GET /me`:
```csharp
[HttpGet("me")]
[ProducesResponseType(typeof(ResponseResult<CurrentUserDto>), StatusCodes.Status200OK)]
[ProducesResponseType(typeof(ResponseResult), StatusCodes.Status401Unauthorized)]
[ProducesResponseType(typeof(ResponseResult), StatusCodes.Status404NotFound)]
public async Task<IActionResult> GetMeAsync()
```

**Verify**: `dotnet build SMCA.sln` compila.

---

## Task 5: BillingService — cache de configuración del sistema ✅

**Dependencias**: Ninguna  
**Archivos**: `BillingService.cs`, `BillingServiceTests.cs`

### Pasos:

5.1 ✅ Inyectar `IMemoryCache` en `BillingService`:
```csharp
private readonly IMemoryCache _cache;
```
Y agregarlo al constructor con `using Microsoft.Extensions.Caching.Memory;`.

5.2 ✅ Crear método privado `GetCachedConfigAsync<T>`:
```csharp
private async Task<T> GetCachedConfigAsync<T>(string key, Func<Task<T>> factory, int expirationMinutes = 5)
{
    if (_cache.TryGetValue(key, out T? cached)) return cached!;
    var value = await factory();
    _cache.Set(key, value, TimeSpan.FromMinutes(expirationMinutes));
    return value;
}
```

5.3 ✅ Envolver las 3 llamadas a config en cache:
```csharp
var graceDays = await GetCachedConfigAsync("PaymentGraceDays", _configRepository.GetPaymentGraceDaysAsync);
var dueSoonDays = await GetCachedConfigAsync("DueSoonDays", _configRepository.GetDueSoonDaysAsync);
var trialMonths = Math.Max(1, await GetCachedConfigAsync("TestingPeriodInMonths", _configRepository.GetTestingPeriodInMonthsAsync));
```

5.4 ✅ Fix: agregar mock de `IMemoryCache` en `BillingServiceTests.cs` para compilar

**Verify**: `dotnet build SMCA.sln` compila ✅ — 0 errors

---

## Task 6: Actualizar GetMeQueryHandlerTests — agregar mock de ITokenBlacklistService

**Dependencias**: Task 3 (GetMeQueryHandler cambia constructor)  
**Archivos**: `GetMeQueryHandlerTests.cs`

### Pasos:

6.1 Agregar `Mock<ITokenBlacklistService>` al `TestMocks` helper:
```csharp
public Mock<ITokenBlacklistService> TokenBlacklistService { get; set; } = new();
```

6.2 Actualizar la creación del handler en cada test para pasar el nuevo mock:
```csharp
var handler = new GetMeQueryHandler(
    mocks.HttpContextService.Object,
    mocks.UserRepository.Object,
    mocks.StoreRoleFeatureRepository.Object,
    mocks.AllowedFeaturesService.Object,
    mocks.StoreModuleRepository.Object,
    mocks.BillingService.Object,
    mocks.DateTimeProvider.Object,
    mocks.TokenBlacklistService.Object);  // NEW
```

6.3 Agregar `using Application.Abstractions.Authentication;`.

6.4 Agregar setup opcional para `IHttpContextService.AccessToken` (necesario por el blacklist en inactive user):
En el test `Handle_ShouldReturnNotFound_WhenUserExternalIdIsNull` y `Handle_ShouldReturnNotFound_WhenUserExternalIdIsEmpty`, agregar:
```csharp
mocks.HttpContextService.Setup(x => x.AccessToken).Returns(string.Empty);
```
Esto evita que el blacklist intente parsear un token nulo cuando el handler se ejecuta (en estos tests el UserExternalId es null, así que el blacklist no se ejecuta, pero es buena práctica tener el setup).

**Verify**: `dotnet test --filter "GetMeQueryHandlerTests"` pasa.

---

## Verify

```bash
# 1. Build completo
dotnet build SMCA.sln

# 2. Unit tests del handler + FilterForBilling
dotnet test --filter "GetMeQueryHandlerTests|GetMeOverdueDowngradeTests"

# 3. E2E tests del endpoint /me
dotnet test --filter "AuthMeTests|AuthMeFailureTests|AuthMePermissionsTests|GetMeBillingTests|GetMeBillingStatesTests"
```
