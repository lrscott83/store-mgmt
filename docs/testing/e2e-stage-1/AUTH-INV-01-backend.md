# AUTH-INV-01 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [AUTH-INV-01](AUTH-INV-01.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

**Este fichero es el más desactualizado de la etapa, y se contradice con el catálogo.**

| | Dice |
|---|---|
| Fila del [README](README.md) | **CUBIERTO** — 2 tests E2E, verdes |
| `AUTH-INV-01.md:11` | **PENDIENTE — 🔴 el test especificado hoy falla** |
| `AUTH-INV-01.md:48` | **PENDIENTE** |
| `AUTH-INV-01.md:53` | *"No hay test E2E de `POST /v1/auth/refresh` en absoluto"* |

**El README tiene razón.** Verificado en el código, no en el mensaje de un commit:

- Producción emite **35 días**: `Application/Abstractions/Authentication/AuthenticationSettings.cs` (default `= 35`) y `SMCA.WebApi/appsettings.json`.
- `Auth/AuthRefreshTokenLifetimeTests.cs` afirma los 35 días en las **dos** superficies: `:44` sobre el login (respuesta **y** fila en base) y `:86` sobre `POST /api/v1/auth/refresh`.
- El propio test lo dejó anticipado: *"when the 7→35 production change ships, these tests flip green UNTOUCHED"*. Ese cambio es el commit `b5587bf`, que entró con el merge.

## Aserciones a corregir

Las tres marcadas `[ ] 🔴` con la nota **"Hoy da 7 días"** ya no describen la realidad:

1. Tras `POST /v1/auth/login`, la fila `RefreshToken` expira en `UtcNow + 35 días` → cubierta (`:44`, aserción sobre `stored.ExpiresAt`).
2. Tras `POST /v1/auth/refresh`, el nuevo refresh token expira en `UtcNow + 35 días` → cubierta (`:86`).
3. `AuthDto.RefreshTokenExpiresAt` de la respuesta de login es `UtcNow + 35 días` → cubierta (`:62`).

## Qué hacer

Reescribir la cabecera de estado, la sección "Estado de cobertura" y los 3 checkboxes. Es el fichero el que quedó atrás, no el catálogo.

⚠️ **Límite de esta auditoría**: verifiqué que el código de producción dice 35 y que los tests afirman 35. **No corrí la suite .NET** — el backend lo corre el usuario. El verde real sigue sin registrarse en un artefacto, igual que pasaba con el rate limit antes de [F-1](plan-frontend.md#f-1).

**Alcance.** Solo documentación. No toca ningún test.
