# Contrato: redirección de sesión autenticada (online u offline)

**Invariante (mandato del usuario, 2026-09-06):** un usuario autenticado — sea por la vía **online** (`POST /v1/auth/login`) o por la vía **offline** (roster, `loginOffline`) — con autenticación **no expirada**, nunca debe caer en `/login`. Al **recargar la página** y al **visitar `/login`**, debe ser redirigido a la vista que corresponde según su rol.

## La regla

| Estado de la sesión | Recarga (ruta autenticada) | Visita a `/login` |
|---|---|---|
| Válida, no expirada (online u offline) | Redirige al home por rol | Redirige al home por rol |
| Expirada (`AUTH_MODEL.expiresIn <= now`) | Logout → `/login` | Formulario de login |
| Veredicto del servidor (401/404 de `/v1/auth/me`, usuario/tienda/owner inactivo, token en blacklist) | Logout → `/login` | Formulario de login |
| Logout explícito | `/login` | Formulario de login |
| Error de red/servidor caído (sin veredicto) | **Conserva la sesión** (offline-first) | — |

## Home por rol (`resolveUserHomePath`, `app/shared/lib/auth/user-home.ts`)

- SuperAdmin / ReSeller → `/admin/owners`
- Resto (OwnerAdmin, StoreUser) → `/sales/new` si la tienda tiene productos vendibles, si no `/sales/products`

## Por qué no es lo mismo que "sesión válida ⇒ entrar"

El gate de cifrado at-rest (`needsUnlock`) puede mostrar `/login?unlock=1` **con sesión válida** cuando el DEK no puede recuperarse en este boot. Ese camino es una excepción legítima del diseño de cifrado (nunca texto plano), pero **cualquier cambio en `authLoader`, `guestOnlyLoader`, `needsUnlock`, `auth-store` (hidratación) o los módulos de DEK/wrap puede violar el invariante de arriba**. Antes de tocarlos: releer este contrato y, si el cambio puede rebotar a un usuario autenticado válido hacia login, pedir aprobación explícita.

## Dónde vive la lógica

- `app/auth/routes/loaders.ts` — `authLoader` (recarga), `guestOnlyLoader` (visita a /login), `denyAccess`.
- `app/shared/lib/stores/auth-store.ts` — `getUserByToken` (hidratación cold-boot, expiración, veredictos), `login`/`loginOffline`, `logout`.
- `app/shared/lib/offline/unlock-gate.ts` — `needsUnlock`.
- `app/shared/lib/storage/dek-bootstrap.ts` — recuperación silenciosa del DEK al recargar.
- `app/shared/lib/auth/user-home.ts` — home por rol.

## Cobertura E2E existente que fija este comportamiento (intocable)

- `login.spec.ts` REQ-1 (recarga con caché válida → se queda en home), REQ-7 (autenticado visita /login → home), REQ-14 (rebote del guard = destino del login explícito, por rol).
- `superadmin-login.spec.ts` — superadmin autenticado visita /login → NO se queda en /login.
- `login-offline.spec.ts` T10 — recarga con roster v2 recupera el DEK silenciosamente y se queda en su vista.
- `offline-session-expiry.spec.ts` — la sesión offline muere con el `expiresAt` del roster.
- `auth-me-session-rejection.spec.ts` — veredictos 401/404 → logout; sin veredicto → conserva sesión.

Cualquier hueco se cubre con tests **nuevos**, nunca modificando estos.
