# [AUTH-INV-01] La expiración de autenticación debe ser 35 días

> Etapa 1 · Invariante transversal · [← plan general](README.md)

| | |
|---|---|
| **Prioridad** | CRÍTICA |
| **Personas** | OwnerAdmin y StoreUser |
| **Endpoint(s)** | `POST /v1/auth/login`, `POST /v1/auth/refresh` |
| **E2E frontend (Playwright)** | **N/A** |
| **E2E backend (.NET)** | **PENDIENTE** — 🔴 el test especificado hoy **falla** |

**Regla del usuario**: **35 días en todos los casos** — frontend y backend, online y offline.

## User Story

Como usuario de un punto de venta offline-first, quiero que **toda** mi ventana de autenticación dure 35 días, para que ningún componente me expulse antes que otro.

## Estado actual verificado

| Dónde | Valor | Evidencia (leída) |
|---|---|---|
| JWT access token | **35 d** ✅ | `backend/src/SMCA.WebApi/appsettings.json:79` (`Jwt.TokenLifetimeDays`); `backend/src/SMCA.WebApi/Authentication/JwtProvider.cs:34,41` (fallback 35) |
| `Authentication.TokenLifetimeDays` | **35 d** ✅ | `backend/src/Application/Abstractions/Authentication/AuthenticationSettings.cs:11`; `appsettings.json:87` |
| TTL del roster offline | **35 d** ✅ | semilla en `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs:38-39`; fallback en `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs:46-49`; consumo en `ExportOfflineRosterQuery.cs:147,153` |
| Sesión cacheada del frontend | **35 d** ✅ | `frontend-react/apps/web-store-pos/app/shared/lib/stores/auth-store.ts:16` (`THIRTY_FIVE_DAYS_MS`) |
| **Refresh token** | **7 d** ❌ | `AuthenticationSettings.cs:12`; `appsettings.json:88`; `LoginCommand.cs:56`; `RefreshCommand.cs:67` |

Ver **H-2** (el "35" son cuatro constantes independientes) y **H-3** (el frontend nunca lee el `expiresIn` del servidor).

## Aserciones — Playwright (UI)

— **(no aplica)**: el refresh token no es observable desde la UI. El cliente estampa su propia expiración de sesión (`auth-store.ts:220`) y nunca lee la del servidor.

## Aserciones — .NET E2E (dato)

> 🔴 **ESTE TEST HOY FALLA — DEFECTO DOCUMENTADO, NO LO "ARREGLES" TOCANDO EL TEST.**
> El rojo es intencional: registra el bug en lugar de esconderlo. La forma correcta de ponerlo en verde es **cambiar el código** (`AuthenticationSettings.cs:12` y `appsettings*.json`) a 35 días, nunca cambiar la aserción a 7.

- [ ] 🔴 Tras `POST /v1/auth/login`, la fila `RefreshToken` persistida expira en `UtcNow + 35 días` (`LoginCommand.cs:56-57`). **Hoy da 7 días** → `AuthenticationSettings.cs:12`.
- [ ] 🔴 Tras `POST /v1/auth/refresh`, el nuevo refresh token expira en `UtcNow + 35 días` (`RefreshCommand.cs:67-68`). **Hoy da 7 días**.
- [ ] 🔴 `AuthDto.RefreshTokenExpiresAt` de la respuesta de login es `UtcNow + 35 días` (`LoginCommand.cs:65`; `AuthDto.cs:8`). **Hoy da 7 días**.
- [x] ✅ El JWT emitido expira en `UtcNow + 35 días` (`JwtProvider.cs:34,41`). Ya en verde y ya cubierto.
- [x] ✅ El bundle de roster expira en `IssuedAt + 35 días` cuando no hay fila de configuración (`SystemConfigurationRepository.cs:46-49`). Ya en verde y ya cubierto.

## Estado de cobertura

**E2E backend (.NET) — PENDIENTE**

- **35 d del JWT: YA CUBIERTO** → `backend/src/Application.Tests/Authentication/JwtProviderTests.cs:21` (con `TokenLifetimeDays=35`, `ValidTo` cae dentro de 5 minutos de `UtcNow.AddDays(35)`), y `:37` prueba que es configurable, no fijo.
- **35 d del roster: YA CUBIERTO** → `Users/ExportOfflineRosterTests.cs:477` (`SuperAdmin_export_deletedTtlRow_usesDefault35`), `:443` (TTL configurado = 7).
- **35 d de la sesión frontend: YA CUBIERTO (`vitest`)** → `shared/lib/stores/__tests__/auth-store.test.ts:110`.
- **Vida del refresh token: NUEVO — no existe ningún test.** No hay test E2E de `POST /v1/auth/refresh` en absoluto (grep de `auth/refresh` en la suite E2E: cero resultados). Los tests unitarios en `Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs:53,77,99,121,148` construyen los `RefreshToken` **a mano** con `AddDays(7)` / `AddDays(-1)`; **ninguno** asevera que la vida derivada de la configuración se aplique.

> **Nota para el usuario**: esos tests unitarios usan `RefreshTokenExpirationDays = 7` como *fixture* (líneas 40-41). Si algún día el código pasa a 35, esos valores del fixture quedarán desalineados. Esto es información, no una propuesta de cambio: **no se tocó nada** y cualquier ajuste sobre tests existentes requiere autorización explícita.

**E2E frontend (Playwright) — N/A**
Sin superficie observable desde la UI.

Ver también **H-13**: `POST /v1/auth/refresh` y `POST /v1/auth/revoke` no tienen rate limit, a diferencia de `login` y `register`.
