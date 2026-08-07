# e2e-session-hydration Capability Specification

**Capability**: e2e-session-hydration — cobertura Playwright (browser) de la hidratación de sesión en arranque/reload [S1-04], `frontend-react/e2e/login.spec.ts`
**Origin**: SDD change `e2e-playwright-session-hydration-s1-04`
**Fuente**: `docs/testing/e2e-stage-1/S1-04.md`, `proposal.md` §§1-4
**Status**: Draft — nueva capability, sin spec previo

## Purpose

Definir, como criterios verificables, las 8 aserciones de [S1-04] (Bloque A) más el invariante de resiliencia offline pedido por el usuario (Bloque B), aditivos al `describe.serial` de `login.spec.ts` con **cero logins nuevos**. Esta spec describe QUÉ debe ser observable; no diseña la mecánica de Playwright (`page.route()`, `page.clock`, `setOffline` vs. `page.route` para R1) — eso es de `sdd-design`.

**Nota sobre el instrumento (R8).** Varios requisitos de abajo piden escribir `AUTH_MODEL`/`CURRENT_USER` en `localStorage` a mano. Esto no contradice `e2e-session-fixture` REQ-2 (que prohíbe tokens inventados): esa prohibición rige la **construcción** de una sesión que un test va a observar como si fuera real. Acá el objetivo es lo opuesto — fabricar el **estado de precondición** (caché corrupta, `AUTH_MODEL` vencido) que el sistema bajo prueba debe manejar. Es manipulación de precondición, no invención de sesión.

## Capability Scope

### In Scope
- Las 8 aserciones de [S1-04] (T1-T8).
- El invariante de resiliencia offline: 3 aserciones aditivas (T9-T11).
- Un método aditivo `expectMeRequestCount(expected)` en `LoginNetworkObserver`.
- La lista cerrada de 6 disparadores de logout y la superficie que no cierra sesión, documentada en `docs/testing/README.md` y `docs/testing/e2e-stage-1/README.md`.
- Corrección de citas de línea desfasadas en `docs/testing/e2e-stage-1/S1-04.md`.
- Restricción dura: todo test nuevo restaura una persona ya primeada; ninguno acuña una persona nueva.

### Out of Scope
- Cualquier cambio al comportamiento de producción (`auth-store.ts`, `api-client.ts`) — el invariante ya existe, estos tests lo pinean.
- Modificar cualquier test existente, incluido el título del `describe.serial` (P1, sin autorización).
- El 404 real de `GET /me` — depende de H-6 (ninguna pantalla llama `activate(false)`); T4 solo cubre la rama de cliente que un 404 recorrería.
- Disparadores de logout #3 (rol, H-8), #5 (idle 1h, H-4) y #6 (post-cambio de contraseña) — se documentan, su cobertura E2E es de S2-03/S3-03/S4-02.
- `network-observer.ts` (el de register) y S1-03 (login offline con roster).
- La capa .NET — S1-04 ya está cubierto ahí (`AuthMeTests`, `AuthMeFailureTests`, `AuthMePermissionsTests`).

### Supuestos operativos
Mismo backend real que `e2e-login-ui`/`e2e-session-fixture`; ningún requisito asume mocks salvo donde se declara explícitamente (T5, T9) como pregunta de cliente, no de servidor.

## Requirements

### Requirement: REQ-1 — Caché válida en reload evita todo tráfico a /me (T1)
Con un `AUTH_MODEL` vigente cuyo `cachedProfile.authToken` coincide, un `page.reload()` MUST resultar en **cero** peticiones `GET /v1/auth/me`. (`auth-store.ts:127-139`)

#### Scenario: Reload con caché válida no llama a /me
- GIVEN una persona ya autenticada con caché de perfil válida
- WHEN se recarga la página
- THEN se observan cero peticiones `GET /v1/auth/me`

### Requirement: REQ-2 — Sin caché usable, exactamente un /me y sesión best-effort (T2)
Cuando `cachedProfile.authToken` no coincide con `AUTH_MODEL.authToken`, un reload MUST emitir **exactamente una** petición `GET /v1/auth/me` y MUST mantener al usuario autenticado por la vía best-effort. (`auth-store.ts:142-151`)

#### Scenario: Mismatch de caché dispara una sola llamada
- GIVEN `AUTH_MODEL` vigente pero `currentUser.authToken` desincronizado
- WHEN se recarga la página
- THEN se observa exactamente una petición `GET /v1/auth/me`
- AND el usuario permanece autenticado

### Requirement: REQ-3 — Servidor inalcanzable sin caché preserva la sesión (T3)
Ante el mismatch de REQ-2 y `GET /v1/auth/me` inalcanzable, el arranque MUST retener el usuario hidratado sincrónicamente y MUST NOT redirigir a `/login`. (`auth-store.ts:173-190`)

#### Scenario: Sin red, la sesión best-effort sobrevive
- GIVEN el mismatch de caché de REQ-2 y `/me` abortado por la red
- WHEN se recarga la página
- THEN `AUTH_MODEL` permanece intacto y el usuario sigue autenticado, sin rebote a `/login`

### Requirement: REQ-4 — 401 real de /me cierra sesión y redirige (T4)
Un `AUTH_MODEL.authToken` inválido que el backend real rechaza con 401 MUST disparar `logout()` y MUST terminar en `/login`. (`isSessionRejection:39-45`, `auth-store.ts:185-187`)

#### Scenario: Token inválido produce 401 real y logout
- GIVEN `AUTH_MODEL.authToken` corrupto con un JWT inválido y `expiresIn` futuro
- WHEN se recarga la página
- THEN el backend responde 401 a `GET /v1/auth/me`
- AND la sesión termina y el navegador aterriza en `/login`

### Requirement: REQ-5 — 500 de /me no cierra sesión (T5)
Una respuesta 500 a `GET /v1/auth/me` MUST NOT disparar `logout()`; el usuario MUST permanecer autenticado. (`auth-store.ts:189-190`)

#### Scenario: Error de servidor no desloguea
- GIVEN el mismatch de caché de REQ-2 y `/me` mockeado a responder 500
- WHEN se recarga la página
- THEN el usuario sigue autenticado y `AUTH_MODEL` permanece

### Requirement: REQ-6 — Límite de expiración inclusivo (T6)
Con `expiresIn` congelado exactamente en `Date.now()`, la sesión MUST tratarse como expirada. (`auth-store.ts:117-122`)

#### Scenario: Igualdad exacta cuenta como vencida
- GIVEN `page.clock` congelado y `AUTH_MODEL.expiresIn` igual al instante congelado
- WHEN se recarga la página
- THEN la sesión se trata como expirada y se dispara `logout()`

### Requirement: REQ-7 — logout() borra únicamente AUTH_MODEL (T7)
Invocar `logout()` MUST remover solo la clave `AUTH_MODEL`; `token` y `currentUser` MUST permanecer presentes y obsoletos a propósito. (`auth-store.ts:352-356`)

#### Scenario: Solo AUTH_MODEL desaparece
- GIVEN una sesión autenticada con las tres claves en `localStorage`
- WHEN se hace clic en "Salir"
- THEN `AUTH_MODEL` está ausente y `token`/`currentUser` siguen presentes

### Requirement: REQ-8 — logout() no navega si ya está en /login (T8)
Cuando `logout()` se dispara estando en `/login`, el sistema MUST NOT generar una navegación adicional. (`auth-store.ts:364-369`)

> **P2 RESUELTA por `sdd-design` (D7).** La mitad `/` es alcanzable: `/` es `index('home/routes/landing-deep.tsx')` (`routes.ts:20`), **sin loader**, y `guestOnlyLoader` vive solo en `/login` y `/register`. Pero la guarda de pathname **no es discriminable desde Playwright**: `initialize()` corre en evaluación de módulo (`auth-store.ts:392`) y `registerAuthRedirect(navigate)` en un `useEffect` (`root.tsx:89-91`), así que en arranque en frío `authRedirect?.()` es no-op cualquiera sea el pathname. Un test de arranque en frío pasaría igual con la guarda borrada. Queda como **brecha G2**, con la cobertura discriminante en `auth-store.test.ts:297-315` (un spy real). REQ-8 afirma solo lo observable.

#### Scenario: Sesión vencida en /login no navega dos veces
- GIVEN `AUTH_MODEL` vencido escrito estando en `/login`
- WHEN se navega a `/login` y `initialize()` corre
- THEN no se observa ninguna navegación (`framenavigated`) adicional a la de la carga inicial

### Requirement: REQ-9 — 401 fuera de /me deja la sesión intacta (T9)
Un 401 del interceptor HTTP compartido en una llamada que NO es `/v1/auth/me` MUST NOT cerrar la sesión ni redirigir. (`api-client.ts:84-86`)

#### Scenario: 401 en PUT de perfil no desloguea
- GIVEN una persona autenticada en `/profile/edit`
- WHEN `PUT /v1/users/{id}` responde 401 (mockeado — pregunta de cliente, no de servidor)
- THEN la sesión permanece intacta y una ruta protegida sigue accesible

### Requirement: REQ-10 — Arranque sin red preserva la sesión (T10)
Con el contexto de navegador offline al arrancar, la app MUST retener al usuario best-effort y MUST NOT redirigir a `/login`. (`auth-store.ts:189-190`)

#### Scenario: Sin conectividad, la sesión sobrevive al arranque
- GIVEN una persona ya autenticada y el contexto puesto offline
- WHEN se dispara el camino de arranque
- THEN `AUTH_MODEL` permanece y no hay rebote a `/login`

### Requirement: REQ-11 — AUTH_MODEL malformado pero parseable no borra nada (T11)
Un JSON parseable que no tiene la forma de `AUTH_MODEL` MUST NOT disparar `logout()` ni remover ninguna clave. (`auth-store.ts:112-115`)

#### Scenario: Objeto ajeno parseable no limpia storage
- GIVEN `AUTH_MODEL` reemplazado por `{"foo":1}`
- WHEN se recarga la página
- THEN `AUTH_MODEL` sigue presente en `localStorage` y `logout()` no corrió

### Requirement: REQ-12 — Conteo observable de peticiones a /me
`LoginNetworkObserver` MUST exponer un método que afirme el número exacto de peticiones `GET /v1/auth/me` observadas, sin alterar el listener existente ni el comportamiento de `expectNoLoginAttempt` u otros métodos. (`login-network-observer.ts:332`)

#### Scenario: El método existe y es aditivo
- GIVEN `login.spec.ts` y `login-rate-limit.spec.ts` ya verdes antes del cambio
- WHEN se agrega `expectMeRequestCount(expected)`
- THEN ambos specs siguen verdes sin modificaciones a su código

### Requirement: REQ-13 — Lista cerrada de disparadores de logout documentada
`docs/testing/README.md` y `docs/testing/e2e-stage-1/README.md` MUST enumerar los 6 disparadores de cierre de sesión (automáticos y por usuario) y la superficie que explícitamente no cierra sesión, marcando cuáles quedan pineados por este cambio.

#### Scenario: Los dos READMEs listan los 6 disparadores
- GIVEN los tests T1-T11 ya verdes
- WHEN se actualizan ambos READMEs
- THEN cada uno de los 6 disparadores aparece con su sitio de código y su estado de cobertura

### Requirement: REQ-14 — Citas de línea de S1-04.md verificadas y corregidas
Toda cadena de cita de línea en `docs/testing/e2e-stage-1/S1-04.md` MUST apuntar al código real vigente, verificado por lectura directa, no asumido del mapa de la exploración.

#### Scenario: Ninguna cita queda desfasada
- GIVEN el mapa de líneas corregido de la exploración más las dos citas sin mapear
- WHEN se revisa cada cadena de cita en `S1-04.md`
- THEN cada una coincide con el rango real del fichero citado

## Preguntas heredadas — las tres cerradas
- **P1 — CERRADA, sin cambio.** El título del `describe.serial` queda desactualizado a propósito: renombrarlo es tocar una línea existente y la autorización era solo aditiva. La inexactitud queda declarada, no corregida.
- **P2 — CERRADA por `sdd-design` (D7).** Ver la nota bajo REQ-8: brecha **G2** declarada.
- **P3 — CERRADA: PARCIAL.** Con G1 (el 404 real de `/me`, atado a H-6) y G2 abiertas y nombradas, la convención de `docs/testing/e2e-stage-1/README.md:19-22` manda PARCIAL. Aplicado en la tabla del plan.

## Brechas declaradas
- **G1** — la rama del 404 real de `GET /me` no se ejerce contra el backend: depende de H-6 (¿devuelve 404 para cuenta desactivada?). La rama de cliente SÍ queda cubierta por REQ-4, porque `isSessionRejection` (`auth-store.ts:39-45`) evalúa 401 y 404 en la misma expresión.
- **G2** — la guarda de pathname de `logout()` no es discriminable en Playwright (ver REQ-8). Cubierta en vitest.

## Verification Criteria
- [x] REQ-1..REQ-11 corren dentro del `describe.serial` existente, apendeados al final, sin alterar tests previos — `login.spec.ts` +263/-0 en el diff de este cambio
- [x] REQ-12 verificado: `login.spec.ts` y `login-rate-limit.spec.ts` verdes sin diff en su propio código — corrida en vivo 2026-08-07, backend real, **31 passed**
- [x] La corrida por defecto sigue gastando exactamente 4 logins reales (sin `personaCache.prime*()` nuevo)
- [x] REQ-13 y REQ-14 verificados por lectura de los ficheros de documentación tras WU-7/WU-8

- [x] **Verificación de mordida de los 11 tests** — el CRITICAL que `sdd-verify` levantó, cerrado el 2026-08-07. T8 y T10 ya se habían visto rojos por causas genuinas; los otros 9 se verificaron en una sola corrida invirtiendo su aserción final y marcándolos `test.fail()`, que evita que `describe.serial` corte el bloque. Resultado: 31 passed, **ninguno** reportado como "expected to fail, but passed". Detalle en `tasks.md` → "Estado de la mordida".
