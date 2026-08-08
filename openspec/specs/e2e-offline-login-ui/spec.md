# e2e-offline-login-ui Capability Specification

**Capability**: e2e-offline-login-ui — cobertura Playwright de negocio (browser) para [S1-03] Login offline en dispositivo aprovisionado, `frontend-react/e2e/login-offline.spec.ts`
**Origin**: SDD change `e2e-playwright-offline-login-s1-03`
**Fuente**: `docs/testing/e2e-stage-1/S1-03.md`, escenario [S1-03]
**Status**: Active

## Purpose

Definir, como criterios de aceptación verificables, las 12 aserciones de UI de [S1-03] (`S1-03.md:33-44`). Esta spec describe QUÉ debe ser observable; no diseña mecánica de Playwright (forma exacta del fixture de roster, cómputo del verifier PBKDF2, nombre del observer genérico) — eso es de `sdd-design`.

**El insight que gobierna todo el archivo**: el interruptor de modo es el ARCHIVO de roster, nunca la conectividad (`login.tsx:109-110`, retorno en `:123`, antes de `ConnectivityService.isOnline()` en `:128`). Por eso 11 de las 12 aserciones corren con el navegador ONLINE; solo la de bundle vencido necesita cortar la red de verdad.

## Capability Scope

### In Scope
- Las 12 aserciones de UI de [S1-03] (`S1-03.md:33-44`).
- Siembra del dispositivo aprovisionado por escritura directa a `localStorage` vía `page.evaluate()` — precedente `e2e/support/session.ts:132-143`, `login.offline.e2e.test.tsx:53-64`. Ningún test pasa por `importRoster()` ni por `provision.tsx`.
- Cero logins reales para todo el spec: `authenticateOffline` no hace red; la única aserción que demuestra la rama online usa `page.route()` para interceptar antes del backend.
- Corrección de las citas `archivo:línea` desactualizadas de `docs/testing/e2e-stage-1/S1-03.md`.

### Out of Scope
- El round-trip real de `provision.tsx` (`.smcabundle`, `deserializeRoster`, ZIP cifrado) — alcance de **S3-01**, hoy `PENDIENTE`.
- `plan-frontend.md` F-2..F-5.
- `e2e/support/session.ts` y `createPersonaCache` — ninguna persona de `signedInPage` importa jamás un roster.
- La capa .NET — N/A, cero HTTP.
- Cualquier edición a un `*.spec.ts` existente.

### Supuestos operativos
El spec corre en la suite por defecto (`pnpm test:e2e`), sin tag `@rate-limit`, y no depende de un backend levantado: ninguna petición de **autenticación** sale en el camino de éxito. La única aserción con una petición de auth sale por `page.route()` interceptada, nunca hacia el backend real.

### La excepción de telemetría — hallazgo H-14, no permiso adquirido
El camino de éxito **no es HTTP-cero en sentido literal**, y este spec no puede afirmar que lo sea. `login.tsx` llama `armTracking()` en las dos ramas de éxito —offline `:114` y online `:140`, importado en `:11`—, y ni `store-usage-tracker.ts` ni `use-store-usage-tracker.ts` consultan la conectividad en ningún punto: cero referencias a `isOnline`, `ConnectivityService` o `navigator.onLine`. Así que tras un login offline exitoso sale un `POST /v1/usages/store-daily-usage` de background al renderizar la ruta siguiente (`store-usage-tracker.ts:104-107`).

Se descubrió implementando esta cobertura y quedó registrado como **H-14** en `docs/testing/e2e-stage-1/README.md`. Consecuencias que este spec impone:

- La tolerancia se declara por endpoint conocido y vive en el spec de test (`expectOnlyKnownTelemetry()`), **nunca dentro de `any-request-observer.ts`**, que MUST quedar genérico. Un observer que tolerara esto por dentro escondería el hallazgo en vez de declararlo.
- La tolerancia aplica SOLO a los escenarios que completan un login. Los que nunca lo completan MUST seguir exigiendo cero peticiones sin excepción alguna.

## Requirements

### Requirement: REQ-1 — Cero peticiones de autenticación durante el submit offline exitoso (A1)
Un submit exitoso en un dispositivo aprovisionado MUST NOT emitir ninguna petición de autenticación — ni a `/v1/auth/login` ni a `/v1/auth/me`. (`login.tsx:109-123` retorna antes de cualquier rama online, `:128`)

La única petición HTTP admitida en el camino de éxito es el `POST /v1/usages/store-daily-usage` de telemetría de background descrito arriba (H-14), y MUST declararse explícitamente por endpoint. Cualquier otra petición MUST hacer fallar el test.

#### Scenario: Login offline exitoso no emite tráfico de autenticación
- GIVEN un dispositivo con roster provisionado no vencido y un usuario válido en `bundle.users`
- WHEN se envía login+password correctos
- THEN no se observa ninguna petición de autenticación durante todo el flujo
- AND la única petición tolerada es la de telemetría conocida, nombrada por su endpoint

#### Scenario: Un submit que falla no emite ninguna petición, sin excepciones
- GIVEN un dispositivo con roster provisionado y credenciales que no autentican
- WHEN se envía el formulario
- THEN no se observa NINGUNA petición HTTP — la tolerancia de telemetría no aplica, porque el tracker nunca se arma

### Requirement: REQ-2 — Roster provisionado + navegador online igual usa la vía offline (A2)
Con roster provisionado, el navegador MUST tomar la vía offline incluso estando online — mismo `return` de REQ-1. (`login.tsx:109-110,123`)

#### Scenario: Online no cambia la rama tomada
- GIVEN un dispositivo con roster provisionado y el navegador en estado online
- WHEN se envía login+password válidos del roster
- THEN se autentica por `loginOffline`, no por `login` online, sin ninguna petición de autenticación

### Requirement: REQ-3 — Login ausente y contraseña incorrecta producen el mismo mensaje (A3)
Un login ausente del roster MUST mostrar el mismo mensaje `AUTH.INVALID_CREDENTIALS` que una contraseña incorrecta — indistinguibles. (`login.tsx:39-41`; `offline-auth-service.ts:102,117`)

#### Scenario: Login inexistente
- GIVEN un `login` que no existe en `bundle.users`
- WHEN se envía con cualquier password
- THEN se muestra `AUTH.INVALID_CREDENTIALS`

#### Scenario: Contraseña incorrecta
- GIVEN un `login` existente en el roster
- WHEN se envía con la contraseña equivocada
- THEN se muestra el mismo `AUTH.INVALID_CREDENTIALS`, texto idéntico al escenario anterior

### Requirement: REQ-4 — Usuario inactivo → AUTH.ACCOUNT_INACTIVE (A4)
Un usuario del roster con `isActive:false` y contraseña correcta MUST mostrar `AUTH.ACCOUNT_INACTIVE`. (`login.tsx:42-44`; `offline-auth-service.ts:119-121`)

#### Scenario: Usuario inactivo con contraseña correcta
- GIVEN un usuario del roster con `isActive:false`
- WHEN se envía con su contraseña correcta
- THEN se muestra `AUTH.ACCOUNT_INACTIVE`

### Requirement: REQ-5 — Verifier malformado → AUTH.SERVER_ERROR (A5)
Un `verifier` con forma inválida (falta `hash`/`salt`/`iterations`, o tipo incorrecto) MUST mostrar `AUTH.SERVER_ERROR`. (`login.tsx:52`, catch-all de `offlineErrorMessageId`; `offline-auth-service.ts:105-112`)

#### Scenario: Verifier con forma inválida
- GIVEN un usuario del roster cuyo `verifier` tiene un campo faltante o de tipo incorrecto
- WHEN se envía cualquier contraseña
- THEN se muestra `AUTH.SERVER_ERROR`

### Requirement: REQ-6 — DekUnwrapError → AUTH.UNLOCK_FAILED, nunca "contraseña incorrecta" (A6)
Un fallo de desenvuelto de DEK MUST mostrar `AUTH.UNLOCK_FAILED`, MUST NOT mostrar `AUTH.INVALID_CREDENTIALS`. (`login.tsx:48-50`; unwrap ocurre DESPUÉS del verifier, `offline-auth-service.ts:127-143`)

#### Scenario: DEK corrupta con password correcta
- GIVEN un usuario v2 con `wrappedDek` corrupto (1 byte alterado) del KAT `docs/contracts/offline-roster-dek-kat.json`
- WHEN se envía la contraseña correcta del KAT
- THEN se muestra `AUTH.UNLOCK_FAILED`, no `AUTH.INVALID_CREDENTIALS`

### Requirement: REQ-7 — Bundle vencido cae a la vía online; offline+vencido muestra AUTH.OFFLINE_LOGIN (A7)
Un bundle con `expiresAt` pasado MUST tratarse como no provisionado (`isRosterProvisioned()` falso) y el flujo MUST caer a la vía online. Si además el navegador está offline, MUST mostrar el banner `AUTH.OFFLINE_LOGIN`. (`roster-store.ts:148`; `login.tsx:109-110`)

#### Scenario: Bundle vencido, navegador online, toma la vía online
- GIVEN un bundle de roster con `expiresAt` en el pasado
- WHEN se envía login+password con el navegador online, interceptando `POST /v1/auth/login` con `page.route()` antes de que llegue al backend
- THEN se observa que la rama online fue tomada (se disparó el intento de login), sin consumir cupo de `LoginPolicy`

#### Scenario: Bundle vencido, navegador offline, banner AUTH.OFFLINE_LOGIN
- GIVEN el mismo bundle vencido y el navegador puesto offline tras cargar `/login`
- WHEN se envía login+password
- THEN no sale ninguna petición y se muestra el banner `AUTH.OFFLINE_LOGIN`

### Requirement: REQ-8 — Reload con roster v2 y DEK en null redirige a /login?unlock=1 (A8)
Tras un reload en un dispositivo con roster `formatVersion >= 2` y el DEK en memoria perdido, los loaders MUST redirigir a `/login?unlock=1` y la UI MUST mostrar el banner `AUTH.UNLOCK_REQUIRED`. (`loaders.ts:29-32`; `login.tsx:63,205-209`; `unlock-gate.ts:10-22`)

#### Scenario: Reload sin DEK en memoria muestra el banner de desbloqueo
- GIVEN una sesión ya hidratada (`AUTH_MODEL`/`currentUser` en `localStorage`) con roster v2 y entrada `wrappedDek` no vacía para ese login
- WHEN se recarga la página (el DEK en memoria se pierde en cualquier reload)
- THEN el navegador aterriza en `/login?unlock=1` y se muestra `AUTH.UNLOCK_REQUIRED`

### Requirement: REQ-9 — Orden de verificación: verifier → contraseña → isActive (A9)
El orden MUST ser verifier, luego contraseña, luego `isActive`; un usuario inactivo con contraseña incorrecta MUST mostrar `AUTH.INVALID_CREDENTIALS`, no `AUTH.ACCOUNT_INACTIVE`. (`offline-auth-service.ts:105-121`)

#### Scenario: Inactivo con contraseña incorrecta ve credenciales inválidas
- GIVEN un usuario del roster con `isActive:false`
- WHEN se envía con una contraseña incorrecta
- THEN se muestra `AUTH.INVALID_CREDENTIALS`, no `AUTH.ACCOUNT_INACTIVE`

### Requirement: REQ-10 — localStorage queda hidratado igual que en login online (A10)
Tras un login offline exitoso, `localStorage` MUST contener `AUTH_MODEL`/`token`/`currentUser` por el mismo seam `setUser` que usa el login online. (`auth-store.ts:194-201`, `loginOffline` en `auth-store.ts:332-350`)

#### Scenario: Las mismas claves quedan escritas
- GIVEN un login offline exitoso
- WHEN se completa el flujo
- THEN `localStorage` contiene `AUTH_MODEL` con `authToken`/`expiresIn` no vacíos, igual que tras un login online

### Requirement: REQ-11 — Destino post-login offline idéntico al online (A11)
El destino post-login offline MUST resolverse con la misma `resolveUserHomePath(user)` que el login online: con productos → `/sales/new`, sin productos → `/sales/products`, para OwnerAdmin y StoreUser. (`login.tsx:116` offline vs `:144` online; `user-home.ts:19-26`)

#### Scenario: OwnerAdmin del roster sin productos
- GIVEN un OwnerAdmin del roster cuya tienda no tiene productos vendibles
- WHEN inicia sesión offline con éxito
- THEN aterriza en `/sales/products`

#### Scenario: StoreUser del roster con productos
- GIVEN un StoreUser del roster cuya tienda tiene productos vendibles
- WHEN inicia sesión offline con éxito
- THEN aterriza en `/sales/new`, misma rama que un OwnerAdmin en el mismo estado de tienda

### Requirement: REQ-12 — Dispositivo aprovisionado sin conexión aterriza en la misma ruta (A12)
Un dispositivo aprovisionado y offline MUST aterrizar en el mismo destino que uno con conexión, para el mismo estado de tienda; ninguna rama de `resolveUserHomePath` MUST consultar conectividad. (`user-home.ts:19-26`, ninguna referencia a conectividad)

#### Scenario: Mismo destino online y offline
- GIVEN el mismo usuario del roster y el mismo estado de tienda observado en REQ-11
- WHEN se repite el login offline con el navegador puesto offline
- THEN el destino final es idéntico al observado en REQ-11

### Requirement: REQ-13 — Siembra por localStorage, cero logins reales
El dispositivo aprovisionado MUST sembrarse escribiendo el bundle directo a `localStorage` vía `page.evaluate()` bajo `ROSTER_KEY`, MUST NOT usar `importRoster()` ni el round-trip de `provision.tsx`. El spec completo MUST consumir cero logins reales contra `LoginPolicy` (5/min). (Precedente `e2e/support/session.ts:132-143`, `login.offline.e2e.test.tsx:53-64`)

#### Scenario: Ningún test del spec deja salir un login real
- GIVEN toda la suite `login-offline.spec.ts` ya corrida
- WHEN se audita el tráfico observado
- THEN ningún `POST /v1/auth/login` llegó al backend real (el único intento, en REQ-7, fue interceptado por `page.route()`)

### Requirement: REQ-14 — Citas de línea de S1-03.md verificadas y corregidas
Toda cadena de cita de línea en `docs/testing/e2e-stage-1/S1-03.md` MUST apuntar al código real vigente, verificado por lectura directa antes de escribirse, no asumido de una versión previa del documento.

#### Scenario: Ninguna cita queda desfasada
- GIVEN las citas verificadas por lectura directa: `login.tsx:109-110` (rama), `:123` (return), `:128` (conectividad), `:37-52` (mapeo de errores), `:63,205-209` (banner unlock), `:116` vs `:144` (resolveUserHomePath), `auth-store.ts:194-201` (setUser, no `:291`)
- WHEN se revisa cada cadena de cita de `S1-03.md`
- THEN cada una coincide con el rango real del fichero citado

## Verification Criteria
- [ ] REQ-1..REQ-12 implementadas en `e2e/login-offline.spec.ts` y corren en la corrida por defecto (`pnpm test:e2e`)
- [ ] REQ-13 verificado: cero `POST /v1/auth/login` reales atribuibles a este spec
- [ ] REQ-14 verificado por lectura de `S1-03.md` tras la corrección
- [ ] `pnpm test:e2e` (31 tests preexistentes) y `pnpm test:e2e:rate-limit` (2 tests) permanecen verdes, sin una sola línea modificada en ningún `*.spec.ts` existente
- [ ] `docs/testing/e2e-stage-1/README.md:32` pasa S1-03 de `PENDIENTE` a `CUBIERTO`
