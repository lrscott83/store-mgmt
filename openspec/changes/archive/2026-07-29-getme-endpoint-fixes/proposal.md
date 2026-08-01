# Proposal: getme-endpoint-fixes

**Change ID**: `2026-07-29-getme-endpoint-fixes`  
**Date**: 2026-07-29  
**Author**: API endpoint review of `GET /api/v1/auth/me`

## Intent

Corregir todos los bugs y code smells identificados en la `api-endpoint-review` del endpoint `GET /api/v1/auth/me`, más las mejoras encontradas al leer el código completo.

## Scope

| # | Item | Tipo | Archivos afectados |
|---|------|------|--------------------|
| 1 | `SignOutAsync()` en GetMeQueryHandler: reemplazar con JWT blacklist real (como logout) | Bug seguridad | `GetMeQuery.cs`, `IHttpContextService.cs`? |
| 2 | `FilterForBilling` duplicado en GetMeQueryHandler y HasPermissionAttribute → mover a `StoreBillingUtils` | Bug duplicación | `GetMeQuery.cs`, `HasPermissionAttribute.cs`, `StoreBillingUtils.cs`, tests |
| 3 | Typo `_storeModuleRepositorytory` en GetMeQueryHandler y HasPermissionAttribute | Bug naming | `GetMeQuery.cs`, `HasPermissionAttribute.cs` |
| 4 | HasPermissionAttribute: `.Result` sync-over-async → `IAsyncAuthorizationFilter` | Bug performance/deadlock | `HasPermissionAttribute.cs` |
| 5 | Missing `[ProducesResponseType]` para errores en `GET /auth/me` | Documentación | `AuthController.cs` |
| 6 | BillingService: cachear config del sistema (grace/due-soon/trial) para reducir DB round trips | Optimización | `BillingService.cs`, nuevo `IConfigurationCacheService` o similar |

## Out of Scope

- HTTP status codes del controller (dejamos 200 + `Succeeded=false` como está)
- Creación de queries optimizadas con JOINs (requiere análisis más profundo)
- Refactor mayor del handler (7 dependencias)

## Assumptions & Risks

- `ITokenBlacklistService` ya existe y está registrado en DI (usado por logout) — verificar
- `IAsyncAuthorizationFilter` es soportado por la versión de ASP.NET Core del proyecto
- Los E2E tests existentes no cambian su comportamiento esperado (HTTP 200 sigue siendo 200)
