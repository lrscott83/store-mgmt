# Exploración: Playwright para S1-03 — Login offline en dispositivo aprovisionado

## Estado actual (código real, con file:line)

**El interruptor de modo es el archivo de roster, nunca la conectividad.** `login.tsx:105-124`: en cada submit se hace `import()` dinámico de `roster-store` y se ramifica sobre `isRosterProvisioned()` (`login.tsx:109-110`). Si es verdadero se llama `loginOffline` y se retorna (`login.tsx:113-123`) — la verificación `ConnectivityService.isOnline()` (`login.tsx:128`) está DESPUÉS de ese `return`, así que un dispositivo aprovisionado toma la vía offline incluso online.

**Roster (`roster-store.ts`)**:

- Clave de storage: `ROSTER_KEY = 'lizoft.offline-roster'` (`roster-store.ts:19`), device-scoped, string cruda (no `StorageKeys.entityKey`).
- `getRoster(now)` = `getRawRoster()` + comparación de expiry en una sola función (`roster-store.ts:146-150`); `isRosterProvisioned(now) = getRoster(now) !== null` (`roster-store.ts:170-172`).
- `importRoster(bundle, now)` (`roster-store.ts:91-114`) valida forma (`hasValidShape`, `:60-69`), expiry y anti-replay, y solo entonces persiste con `localStorage.setItem`. **No es la única vía de escritura**: la vitest suite `login.offline.e2e.test.tsx:53-56` y la convención ya establecida en `e2e/support/session.ts` (`applySnapshot`, líneas 132-143) escriben `localStorage` DIRECTO, sin pasar por `importRoster` — precedente ya aceptado en este repo para plantar estado de dispositivo sin UI.
- Forma del bundle: `OfflineRosterBundle { bundleId, issuedAt, expiresAt, formatVersion, storeId, users: OfflineRosterUser[] }` (`roster-types.ts:43-50`); cada `OfflineRosterUser` lleva `verifier: OfflineVerifier | null` y opcionalmente `wrappedDek/wrapSalt/wrapIv` (`roster-types.ts:12-41`).

**Autenticación offline (`offline-auth-service.ts`)**: `authenticateOffline(login, password)` (líneas 91-146) hace UNA sola lectura de `getRoster()` (evita TOCTOU), busca en `bundle.users` (array-scan local, cero red), y el ORDEN de verificación es: `verifier` presente y con forma válida (si no, `OfflineVerifierError` → `AUTH.SERVER_ERROR`, `:105-112`) → `verifyOfflinePassword` (si falla, `OfflineInvalidPasswordError` → `AUTH.INVALID_CREDENTIALS`, `:114-116`) → `isActive` (si falso, `OfflineUserInactiveError` → `AUTH.ACCOUNT_INACTIVE`, `:119-121`). Un login ausente del roster tira `OfflineUserNotFoundError`, mapeado al MISMO mensaje que password incorrecta (`login.tsx:39-40`) — indistinguible para el atacante, tal como pide `S1-03.md:35`.

Si `user.wrappedDek/wrapSalt/wrapIv` están presentes, se desenvuelve el DEK DESPUÉS de que el verifier pasó (`offline-auth-service.ts:127-143`); un fallo ahí (`DekUnwrapError`) se mapea a `AUTH.UNLOCK_FAILED`, no a credenciales inválidas (`login.tsx:48-49`).

**Mismo seam de hidratación que el login online**: `loginOffline` en `auth-store.ts:332-350` llama `authenticateOffline` y luego `get().setUser(user, user.authToken)` (`:340`) — el MISMO `setUser` (`auth-store.ts:194-201`) que escribe `token` + `currentUser` + `AUTH_MODEL`, usado por el login online. `resolveUserHomePath` (`user-home.ts:19-26`) también es la MISMA función en ambos caminos (`login.tsx:116` offline vs `:144` online) y solo consulta el servicio de productos offline — cero red (confirmado por `expectNoProductApiCall` ya existente en `login-network-observer.ts:88-93,351-359`, que S1-03 puede reutilizar).

**Unlock gate tras reload** (`unlock-gate.ts:10-22`, `loaders.ts:29-32,53-54`): `needsUnlock(user)` es true solo si `getDek() === null` (el DEK vive en una variable de módulo en memoria, `data-key-store.ts:15` — se pierde en CUALQUIER reload, confirmado por lectura) Y el roster crudo (expiry-ignoring, `getRawRoster`) tiene `formatVersion >= 2` con `wrappedDek/wrapSalt/wrapIv` no vacíos para ESE login. `authLoader`/`guestOnlyLoader` redirigen a `/login?unlock=1` (`loaders.ts:31,54`), y `login.tsx:63,205-208` muestra el banner `AUTH.UNLOCK_REQUIRED`.

## Veredicto de factibilidad sobre el gotcha de `setOffline()`

**Factible al 100%, y de las 12 aserciones declaradas en `S1-03.md` solo UNA necesita cortar la red de verdad.** Razón estructural: la rama se decide por el ARCHIVO de roster (`isRosterProvisioned()`), nunca por conectividad — así que la mayoría de los escenarios se prueban con el navegador ONLINE y roster presente/ausente/vencido, sin tocar `setOffline()` en absoluto.

La única aserción genuinamente offline es: *"Bundle vencido ⇒ vía online; offline + bundle vencido ⇒ banner `AUTH.OFFLINE_LOGIN`"* (`S1-03.md:39`). Para esa, el gotcha YA tiene un patrón de solución **en producción, en este mismo repo**: `login.spec.ts:68-84` (REQ-5, "offline sin roster") hace `goto('/login')` ONLINE (carga el bundle SPA) → `fill()` → **`setOffline(true)`** → `submit()`. Funciona porque el submit es un handler client-side YA cargado — no dispara ninguna navegación ni fetch de módulo nuevo, así que el gotcha (que rompe la carga de módulos ES vía `page.goto()` tras cortar red) nunca se activa.

El mismo patrón aplica sin cambios a S1-03: plantar el roster vencido en `localStorage` DESPUÉS de `goto('/login')` (mientras el bundle ya cargó) y ANTES de `setOffline(true)`, después llenar y enviar. Precedente adicional del mismo gotcha con la técnica `goBack()` (nunca `goto()`) en `login.spec.ts:390-426` (REQ-10), para el caso en que sí hiciera falta navegar tras cortar la red — no es necesario en S1-03, pero queda documentado como opción B si algún diseño futuro lo pidiera.

Alternativa aún más liviana para esa misma aserción (⚠️ NO VERIFICADA como usada hoy en el repo, pero técnicamente válida): sobreescribir `navigator.onLine` vía `page.addInitScript()` antes de navegar, sin cortar la red real — evita el gotcha por construcción porque nunca hay corte de red. Se documenta como opción, pero se recomienda seguir el patrón YA establecido (`setOffline` + no-navegación) por consistencia con `login.spec.ts`, que es el spec hermano más cercano.

## Cómo se siembra un dispositivo aprovisionado (sin login real)

Verificado por lectura: **NO hace falta ningún login real para todo el spec.** `authenticateOffline` no hace ninguna llamada de red (`offline-auth-service.ts:91-146`, confirmado arriba), así que el escenario de éxito nunca toca el backend. Y el bundle en sí no necesita nacer de un login+export real:

- El patrón ya establecido en este repo para plantar estado de dispositivo es escritura DIRECTA a `localStorage` vía `page.evaluate()`, exactamente como `e2e/support/session.ts`'s `applySnapshot()` (líneas 132-143) hace hoy para las 4 personas de `signedInPage` — nunca vía `importRoster()`/UI real.
- La vitest suite `login.offline.e2e.test.tsx:53-64` hace lo mismo con el roster: escribe el bundle directo bajo la clave `ROSTER_KEY`, saltándose `importRoster()`.
- El verifier de password se construye con `sha256Base64` + `pbkdf2Base64` (PBKDF2-HMAC-SHA256, 210k iteraciones — `offline-crypto.ts:81-88`), computable en Node (`node:crypto`'s `webcrypto`) antes de escribir a `localStorage`, o in-browser vía `page.evaluate(() => crypto.subtle...)` replicando el mismo algoritmo — Web Crypto estándar, sin dependencias nuevas.
- Para los escenarios de DEK (unlock exitoso / `DekUnwrapError` / recarga con `unlock=1`) **ya existe un vector de prueba conocido, comprometido al repo y verificado contra el backend real**: `docs/contracts/offline-roster-dek-kat.json` — `password: "Password123"`, `wrapSalt`, `wrapIv`, `wrappedDek`, `expectedDek`, `storeId`, con `_header.provenance: "dotnet-backend"` y un `backendCommitSha` real. Es la MISMA fuente de verdad que usa `dek-unwrap.kat.test.ts` (vitest). Un `DekUnwrapError` deliberado se obtiene alterando 1 byte de `wrappedDek` / usando la password equivocada — cero crypto nueva que autorear.

**Consecuencia importante**: aprovisionar el dispositivo en Playwright cuesta **CERO logins reales** — no compite con el presupuesto de 4/5 logins por minuto que gobierna `login.spec.ts` (`e2e/README.md:161-172`, `docs/testing/e2e-stage-1/README.md:90`).

## La única aserción con interacción de presupuesto — y cómo evitarla

*"Bundle vencido ⇒ cae a la vía online"* (`S1-03.md:39`, `roster-store.ts:148`, `login.tsx:106`) exige demostrar que se llama al `login()` ONLINE en vez de `loginOffline()`. Si esa llamada llega de verdad al backend, consume 1 de los 5 intentos/minuto de `LoginPolicy` (`RateLimitPolicies.cs:15-24`, **H-12**) — y un intento fallido consume el cupo igual (confirmado en `e2e/README.md:175-181`, `plan-frontend.md` sección F-1). Correr esta aserción en la misma ventana de 1 minuto que `login.spec.ts` (que ya gasta 4/5) arriesga un 429 no relacionado con el comportamiento bajo prueba.

**Recomendación**: interceptar con `page.route()` (bloquear/abortar antes de que la petición real salga) para PROBAR que el intento se disparó (rama online tomada) sin dejarlo llegar al backend — cero costo de cupo, cero dependencia de un backend levantado para esa aserción puntual, consistente con "cero logins reales para todo el spec".

## Qué ya existe vs qué es nuevo

**Reusable sin cambios**:

- `e2e/support/login-page.ts` — page object de `/login` (mismo formulario, mismos ids).
- `e2e/support/login-network-observer.ts` — ya expone `expectNoProductApiCall()` (líneas 88-93, 351-359) útil para la aserción D-post-login; y el patrón de observador basado en `page.on('request'/'response')` como plantilla a duplicar (ver Riesgos).
- `e2e/playwright.config.ts` — sin cambios; el spec nuevo corre en la suite por defecto SIEMPRE que no lleve el tag `@rate-limit` (`package.json:11`, `--grep-invert @rate-limit`).
- `docs/contracts/offline-roster-dek-kat.json` — vector KAT ya comprometido y verificado contra backend real, reusable directo para los escenarios de DEK.
- El patrón `setOffline(true)` post-carga-sin-navegación de `login.spec.ts:68-84` (REQ-5) — a REPLICAR, no a importar (los dos observers de red ya están deliberadamente duplicados por diseño, ver `login-network-observer.ts:129-134`).

**Expresamente a NO tocar**: `e2e/support/session.ts` declara en su propio comentario (líneas 40-45) que NINGUNA persona de `signedInPage` importa jamás un roster — *"A roster would silently turn this change into [S1-03] ... which is out of scope"*. El nuevo spec de S1-03 no debe modificar `session.ts` ni `createPersonaCache` de ninguna forma; debe construir su propio fixture de roster en un archivo nuevo, separado.

**Nuevo (a escribir)**:

- Un spec Playwright nuevo, p. ej. `e2e/login-offline.spec.ts` (nombre no confirmado — ver preguntas abiertas).
- Un helper nuevo de fixture de roster (p. ej. `e2e/support/roster-fixture.ts`): construye un `OfflineRosterBundle` válido, con verifier calculado, expiry configurable, y wrap-DEK opcional reusando el KAT.
- Un observer de red nuevo, más genérico que `login-network-observer.ts` (que solo mira login/me/product): S1-03 necesita "cero peticiones a CUALQUIER endpoint" durante el submit offline exitoso, no solo login/me/product.

## Approaches comparados

### 1. Siembra directa a `localStorage` (recomendado)

Plantar el bundle (con verifier propio, y wrap-DEK del KAT cuando aplique) vía `page.evaluate()` tras `goto('/login')`, exactamente como `session.ts`'s `applySnapshot()` ya hace para las personas de login online.

- **Pros**: cero logins reales, cero dependencia de S3-01 (que también está PENDIENTE), determinístico, reutiliza el KAT ya comprometido, cero riesgo de tocar el gotcha `setOffline` salvo en la única aserción que lo necesita (con el patrón ya probado de `login.spec.ts` REQ-5).
- **Contras**: no ejercita el flujo real de `provision.tsx` (subida de archivo `.smcabundle`, `deserializeRoster`, ZIP cifrado) — pero eso es exactamente el alcance de **S3-01**, no de S1-03: la precondición de `S1-03.md:19` dice literalmente "el dispositivo importó un bundle... y no está vencido", sin exigir que el mecanismo de importación se pruebe otra vez acá.
- **Esfuerzo**: Bajo-Medio (un helper de fixture + una función PBKDF2).

### 2. Round-trip completo vía `provision.tsx` real + roster exportado por un backend real

Requeriría que S3-01 (hoy PENDIENTE en ambas capas) ya tuviera su propio Playwright, un OwnerAdmin autenticado (consume presupuesto de login), y la plomería de descarga/subida de archivo en Playwright.

- **Pros**: cubre el viaje end-to-end real de aprovisionamiento de dispositivo, cerraría S3-01 y S1-03 juntos.
- **Contras**: acopla dos User Stories PENDIENTES en un solo cambio (scope creep respecto de lo pedido), consume presupuesto de login real, bloqueado hasta que S3-01 exista, más piezas móviles.
- **Esfuerzo**: Alto.

**Recomendación**: Approach 1 para este cambio. Approach 2 queda para un futuro cambio de S3-01, que podría reusar el helper de fixture del approach 1 para verificar el round-trip (`deserializeRoster(serializeRoster(bundle)) === bundle`) sin duplicar trabajo.

## Riesgos

- Un tercer observer de red "genérico" duplica lógica de `network-observer.ts` / `login-network-observer.ts` — ya hay precedente de duplicación deliberada en este repo (`login-network-observer.ts:129-134`, *"extract a shared core when a THIRD observer appears"*), así que este cambio dispara esa regla de tres explícitamente. Vale la pena señalarlo, no bloquea.
- La aserción "cae a la vía online" con `page.route()` interceptando antes del backend real es un NEGATIVO declarado: nunca se observa un 401/429 real de esa rama en esta suite — es una decisión de diseño para no gastar cupo, no un hueco escondido.
- Ninguna aserción de S1-03 exige tocar `e2e/support/session.ts`, `login.spec.ts` ni `register.spec.ts` — leído explícitamente, no hay ningún punto donde este cambio necesite modificar un test E2E existente.

## Preguntas abiertas para el usuario

1. Nombre de archivo del spec nuevo: se propone `e2e/login-offline.spec.ts` (vecino alfabético de `login.spec.ts`) — ¿se confirma o se prefiere otro?
2. ¿El helper de fixture de roster (`roster-fixture.ts`) debería vivir bajo `e2e/support/` junto a los demás helpers, o en un lugar propio? (Por defecto se sigue la convención existente: `e2e/support/`.)
3. Confirmar que **no** se quiere, en este cambio, ejercitar también el flujo real de `provision.tsx` (approach 2) ni siquiera parcialmente — la lectura es que no, dado que S3-01 (su contraparte) sigue PENDIENTE y no fue pedida acá.
4. `plan-frontend.md` (F-2..F-5) — ninguno de los 4 ítems intersecta con S1-03 por lectura (F-2 es post-registro, F-3/F-4/F-5 son sobre `logout()` / `login.spec.ts`). Confirmar que quedan fuera de este cambio, tal como pedía el brief.

## Ready for Proposal

Sí. La investigación no encontró ningún punto donde el cambio necesite tocar un test E2E existente, ni ninguna dependencia bloqueante de S3-01 para el approach recomendado (1). Las 4 preguntas abiertas son de nomenclatura/alcance, no de factibilidad.
