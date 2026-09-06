# Invariante de redirección de sesión autenticada + huecos E2E (2026-09-06)

Estado: **plan/investigación — sin implementar**. Mandato del usuario registrado también en `CLAUDE.md` ("Auth redirect invariant") y en `docs/contracts/authenticated-session-redirect.md`.

---

## 1. El invariante (la regla que no se puede romper)

Un usuario autenticado — **online** (`POST /v1/auth/login`) u **offline** (roster, `loginOffline`) — con autenticación **no expirada**:

- **Al recargar la página** → debe quedar en su vista (nunca `/login`).
- **Al visitar `/login`** → debe ser redirigido a la vista que corresponde según su rol.

Home por rol (`resolveUserHomePath`, `app/shared/lib/auth/user-home.ts`):
- SuperAdmin / ReSeller → `/admin/owners`
- OwnerAdmin / StoreUser → `/sales/new` si la tienda tiene productos vendibles, si no `/sales/products`

Únicas salidas legítimas a `/login`:
1. Expiración (`AUTH_MODEL.expiresIn <= now`).
2. Veredicto del servidor: 401/404 de `/v1/auth/me` (usuario inactivo, tienda inactiva, owner inactivo, token en blacklist).
3. Logout explícito.
4. Sin red y sin caché usable → formulario de login normal (nunca estuvo autenticado).

Un error de red o servidor caído **sin veredicto NO desautentica** (offline-first).

---

## 2. ¿Qué tiene que ver el DEK con la autenticación?

**Respuesta corta: nada, y ahí está el problema.** Son dos candados independientes:

| Candado | Pregunta que responde | Dónde vive |
|---|---|---|
| **Sesión (JWT)** | ¿Quién eres? (el servidor te conoce) | `AUTH_MODEL` en localStorage |
| **DEK (clave de datos)** | ¿Este dispositivo puede LEER los datos locales cifrados? | Solo en memoria (RAM) + copias envueltas ("wraps") en el dispositivo |

El DEK es la clave que descifra los datos de negocio guardados en el navegador (productos, órdenes, inventario — guardados como `enc:v1:...`). Por seguridad **nunca se guarda en texto plano**: solo se persiste *envuelta* (con la clave de dispositivo en IndexedDB, o con la contraseña del usuario). El DEK en claro vive en un `let` de módulo → **muere en cada recarga**.

**"Si ya está autenticado, ¿para qué buscarlo?"** — No se busca una clave nueva: se *desenvuelve* la copia que el dispositivo ya tiene. Cada arranque de página es un contexto JS nuevo sin la clave en RAM, así que hay que abrirla otra vez: silenciosamente con la clave de dispositivo (IndexedDB), o pidiéndole la contraseña al usuario si eso falla. Eso es todo el `bootstrapDeviceDek()`.

**El bug de diseño:** el código actual **acopla** los dos candados. Cuando el DEK no se puede recuperar, `authLoader`/`guestOnlyLoader` mandan al usuario a **`/login`** — la pantalla de "no estás autenticado" — aunque su sesión JWT esté perfectamente válida. Eso hace que "parezca que la autenticación se perdió" cuando en realidad lo único que falló es abrir los datos locales. La corrección conceptual es **desacoplar**:

- Sesión válida → jamás `/login`, redirigir al home por rol (invariante §1).
- Datos no abribles con sesión válida → pantalla **propia de desbloqueo de datos** (o manejo en el home), nunca la pantalla de login.

---

## 3. Mapa de dónde vive el comportamiento actual

- `app/auth/routes/loaders.ts` — `authLoader` (recarga; redirige a `/login?unlock=1` si `needsUnlock`), `guestOnlyLoader` (visita a /login; si `needsUnlock` devuelve `null` y te deja en el formulario), `denyAccess`.
- `app/shared/lib/stores/auth-store.ts` — `getUserByToken` (hidratación cold-boot: expiración, veredictos 401/404, rama best-effort), `login` / `loginOffline`, `logout`.
- `app/shared/lib/offline/unlock-gate.ts` — `needsUnlock(user)`.
- `app/shared/lib/storage/dek-bootstrap.ts` — recuperación silenciosa del DEK al recargar.
- `app/shared/lib/auth/user-home.ts` — home por rol.

---

## 4. Tests E2E que faltan para cubrir 100% el invariante

(E2E existentes que ya cubren parte: `login.spec.ts` REQ-1/REQ-7/REQ-14, `superadmin-login.spec.ts`, `login-offline.spec.ts` T10, `offline-session-expiry.spec.ts`, `auth-me-session-rejection.spec.ts`. Todos intocables — los huecos se cubren con tests NUEVOS.)

| # | Escenario | Given / When / Then | Prioridad |
|---|---|---|---|
| 1 | Recarga offline con DEK irrecuperable | Sesión offline (roster) válida + device wrap dañado o IndexedDB bloqueada → recargar → **debe seguir en su vista** (hoy cae en `/login?unlock=1` = violación) | ⭐ Alta |
| 2 | Superadmin con wrap ajeno en el dispositivo | Superadmin autenticado + material de wrap de OTRO usuario en localStorage → recargar y visitar `/login` → debe ir a `/admin/owners` (hoy solo cubierto por unit tests) | ⭐ Alta |
| 3 | Autenticado offline visita /login | Sesión nacida del roster → navegar a `/login` sin red → debe redirigir a `/sales/new` o `/sales/products` sin tocar la red (hoy NO hay ninguna prueba offline de este camino) | ⭐ Alta |
| 4 | Hidratación con `CURRENT_USER` obsoleto/ausente | `AUTH_MODEL` válido + `CURRENT_USER` vacío o de esquema viejo → recargar → sesión válida → home por rol (camino best-effort de `auth-store`; hoy sin fijar) | Media |
| 5 | Matriz de recarga por rol | Recargar como StoreUser y como SuperAdmin → cada uno cae en SU home (REQ-1 solo prueba OwnerAdmin) | Media |
| 6 | Espiración exacta durante recarga offline | Recargar offline 1s antes de `expiresAt` → se mantiene; después → `/login` | Baja |

---

## 5. Qué NO está así hoy (violaciones y huecos reales)

1. **El escenario 1 viola el invariante HOY**: recuperación de DEK fallida + sesión válida → `/login?unlock=1`, y desde `0d7b2a56` sin banner que lo explique (parece "no pasa nada").
2. **El escenario 3 no tiene ninguna prueba**: nadie garantiza que un autenticado offline que visita `/login` sea redirigido.
3. **El escenario 4 tiene un hueco real**: si `CURRENT_USER` falta, `selectedStoreId` llega `undefined` a `needsUnlock` y la exclusión de usuarios sin tienda no aplica → un SuperAdmin en ese estado se volvería a atorar.

---

## 6. Propuesta de diseño para el desacoplamiento (pendiente de aprobar)

1. **Separar las dos preguntas** en los loaders: `isAuthenticated` decide login vs. app; `needsUnlock` decide app normal vs. **pantalla de desbloqueo de datos** (ruta dedicada, no `/login`).
2. Ruta nueva p. ej. `/unlock-data` (con su propio guard que exige sesión válida).
3. `guestOnlyLoader` deja de mirar `needsUnlock`: autenticado → home por rol, siempre.
4. `authLoader`: sesión válida → deja pasar; si `needsUnlock` → redirige a `/unlock-data`.
5. Los E2E nuevos de la tabla §4 fijan el comportamiento objetivo antes de mover el código (TDD).
