# e2e-login-ui Capability Specification

**Capability**: e2e-login-ui — cobertura Playwright de negocio (browser) para [S1-02] Login online, `frontend-react/e2e/`
**Origin**: SDD change `e2e-playwright-login-s1-02`
**Fuente**: `docs/testing/e2e-stage-1/S1-02.md`, escenario [S1-02]
**Status**: Draft

## Purpose

Definir, como criterios de aceptación verificables, las 14 aserciones de [S1-02]: las 8 de UI (A1-A8, `S1-02.md:31-38`) y las 6 de destino post-login (D1-D6, `S1-02.md:60-65`). Esta spec describe QUÉ debe ser cierto; no diseña mecánica de Playwright (observador de dos endpoints, serial vs. paralelo, forma exacta de la siembra) — eso es de `sdd-design`.

## Capability Scope

### In Scope
- Las 8 aserciones A1-A8 (`S1-02.md:31-38`).
- Las 6 aserciones de destino D1-D6 (`S1-02.md:60-65`).
- La restricción de que la siembra de categoría/producto para D1/D3 pasa por la UI real, nunca por `localStorage` escrito a mano.
- El aislamiento de A8 (429) en spec file y script propios, con los umbrales de `LoginPolicy` (5/1min/3 segmentos) — no los de `RegisterPolicy`.
- El diagnóstico legible que distingue un fallo de siembra de un fallo de login.

### Out of Scope
- El contrato de la fixture `signedInPage` — capacidad propia `e2e-session-fixture`.
- Mecánica de paralelismo/serialización de Playwright para controlar la cuota de login (Q1) — decisión de `sdd-design`.
- Todo trabajo .NET — tienda inactiva → 403 sigue sin cobertura (`S1-02.md:72`).
- Ficheros `vitest` de login (`login.test.tsx`, `login.offline.test.tsx`, `login.offline.e2e.test.tsx`, `auth-store.test.ts`) — no se tocan.
- Cualquier edición a `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`, `api-health.spec.ts`.
- [S1-03] (login offline con roster) — la precondición de S1-02 es sin roster.

### Supuestos operativos (implícitos en cada GIVEN de abajo)
Backend real en `http://localhost:5019`, perfil `http`/Development (no `Testing`), levantado manualmente por el usuario. Ningún requirement asume backend provisto por CI o por el agente.

## Requirements

### Requirement: REQ-1 — Overlay único durante todo el flujo (A1)
Durante login → me → resolver home → navegar, la UI MUST mostrar únicamente el overlay de carga; el formulario MUST NOT reaparecer entre llamadas. (`login.tsx:76,185-187`, `S1-02.md:31`)

#### Scenario: El formulario no parpadea entre las dos peticiones
- GIVEN credenciales válidas cargadas en el formulario
- WHEN se envía y la app encadena `POST /v1/auth/login` y `GET /v1/auth/me`
- THEN solo se observa el overlay de carga durante todo el tramo
- AND el formulario no vuelve a aparecer hasta la navegación final

### Requirement: REQ-2 — Dos peticiones en orden (A2)
Un login exitoso MUST emitir exactamente dos peticiones, en este orden: `POST /v1/auth/login`, luego `GET /v1/auth/me`. (`auth-store.ts:197,230`, `getUserByToken:129`, `S1-02.md:32`)

#### Scenario: Orden observado en la red
- GIVEN credenciales válidas
- WHEN se envía el formulario
- THEN se observa `POST /v1/auth/login` seguido de `GET /v1/auth/me`, en ese orden, sin peticiones adicionales de autenticación

### Requirement: REQ-3 — Credenciales inválidas: 401 con envelope y texto literal (A3)
Con credenciales inválidas el backend MUST responder HTTP 401 llevando el envelope habitual (`LoginCommand.MapErrorToStatusCode` mapea `Auth.InvalidCredentials` a `Unauthorized`), y la UI MUST mostrar `AUTH.INVALID_ERROR` interpolando literalmente `errors[0].description`. (`auth-store.ts`, `login.tsx:158-168`, `S1-02.md:33`)

#### Scenario: El texto de error es el literal del backend
- GIVEN credenciales incorrectas para una cuenta existente
- WHEN se envía el formulario
- THEN la respuesta HTTP es 401 y su cuerpo trae `errors[0].description`
- AND la UI muestra ese texto exacto dentro de `AUTH.INVALID_ERROR`
- AND la UI MUST NOT mostrar el mensaje estático `AUTH.INVALID_CREDENTIALS`

> **Corregido tras la primera corrida real.** Este requisito decía "HTTP 200 con `succeeded:false`", premisa heredada de `S1-02.md:33` y del comentario de `auth-store.ts`, y contradicha por la aserción de dato del propio catálogo (*"Contraseña incorrecta → 401"*), ya cubierta y en verde por `AuthLoginFailureTests.cs:31`. El 401 esquivaba la rama `loginRejectionDescription`, así que la UI mostraba un mensaje estático donde Angular mostraba el del servidor. Se corrigió el código para restaurar la paridad; la intención del requisito —**texto literal del backend**— no cambió.

### Requirement: REQ-4 — Campos vacíos bloquean sin red (A4)
Con campos vacíos, la validación MUST ser local y MUST NOT emitir ninguna petición. (`login.tsx:78-98`, `S1-02.md:34`)

#### Scenario: Envío vacío no sale a la red
- GIVEN el formulario de login vacío
- WHEN se intenta enviar
- THEN no sale ninguna petición HTTP

### Requirement: REQ-5 — Offline sin roster: sin petición, banner AUTH.OFFLINE_LOGIN (A5)
En un dispositivo sin roster y offline, el envío MUST NOT emitir ninguna petición y MUST mostrar el banner `AUTH.OFFLINE_LOGIN`. (`login.tsx:124-127,195-199`, `S1-02.md:35`)

#### Scenario: Offline sin roster bloquea antes de la red
- GIVEN el navegador en estado offline y sin roster provisionado
- WHEN se intenta enviar el formulario con datos válidos
- THEN no sale ninguna petición de red
- AND se muestra el banner `AUTH.OFFLINE_LOGIN`

### Requirement: REQ-6 — AUTH_MODEL persistido tras éxito (A6)
Tras un login exitoso, `localStorage` MUST contener `AUTH_MODEL` con `{ authToken, expiresIn }`. (`auth-store.ts:223-226`, `S1-02.md:36`)

#### Scenario: El token queda persistido
- GIVEN un login exitoso
- WHEN se completa el flujo
- THEN `localStorage` contiene `AUTH_MODEL` con `authToken` y `expiresIn` no vacíos

### Requirement: REQ-7 — Usuario autenticado en /login rebota a su home, no a / (A7)
Un usuario ya autenticado que visita `/login` MUST ser redirigido a su home resuelto y MUST NOT aterrizar en `/`. (`loaders.ts:42-58`, `S1-02.md:37`)

#### Scenario: El guard redirige, no muestra el formulario
- GIVEN una sesión ya autenticada
- WHEN se navega a `/login`
- THEN el navegador aterriza en el home resuelto del usuario, nunca en `/`

### Requirement: REQ-8 — 429 aislado, con los umbrales de LoginPolicy (A8)
HTTP 429 MUST mostrar `AUTH.TOO_MANY_ATTEMPTS`. Esta aserción MUST vivir en un spec file y un script npm propios, EXCLUIDA de la corrida por defecto, y MUST usar el umbral de `LoginPolicy`: 5 intentos por minuto por IP, ventana deslizante de 3 segmentos — no el de `RegisterPolicy`. (`login.tsx:175-176`, `RateLimitPolicies.cs:15-24`, `AuthController.cs:27`, `S1-02.md:38`)

#### Scenario: 429 muestra el mensaje de cuota agotada
- GIVEN 5 intentos de login ya consumidos en la ventana de 1 minuto desde la misma IP
- WHEN se realiza un 6º intento
- THEN la respuesta HTTP es 429
- AND la UI muestra `AUTH.TOO_MANY_ATTEMPTS`

#### Scenario: Aislamiento de la corrida por defecto
- GIVEN la corrida por defecto de la suite
- WHEN se ejecuta
- THEN el escenario 429 no corre como parte de esa corrida
- AND solo corre mediante su propio comando dedicado

### Requirement: REQ-9 — OwnerAdmin con productos aterriza en /sales/new (D1)
Un OwnerAdmin cuya tienda tiene al menos un producto disponible para venta MUST aterrizar en `/sales/new` tras login. (`user-home.ts:25`, `S1-02.md:60`)

#### Scenario: Login con productos sembrados
- GIVEN un OwnerAdmin cuya tienda tiene una categoría y un producto activos, sembrados por la UI real
- WHEN inicia sesión con credenciales válidas
- THEN el navegador aterriza en `/sales/new`

### Requirement: REQ-10 — OwnerAdmin sin productos aterriza en /sales/products (D2)
Un OwnerAdmin sin productos vendibles MUST aterrizar en `/sales/products` tras login. (`user-home.ts:25`, `S1-02.md:61`)

#### Scenario: Login de una tienda recién registrada
- GIVEN un OwnerAdmin recién registrado sin categorías ni productos
- WHEN inicia sesión con credenciales válidas
- THEN el navegador aterriza en `/sales/products`

### Requirement: REQ-11 — StoreUser sigue la misma rama que OwnerAdmin (D3)
Un StoreUser MUST seguir exactamente la misma rama de resolución que un OwnerAdmin: con productos → `/sales/new`, sin productos → `/sales/products`. (`user-home.ts:24-25`, `S1-02.md:62`)

#### Scenario: StoreUser con productos aterriza en /sales/new
- GIVEN un StoreUser en una tienda con productos vendibles, creado vía UI real por un OwnerAdmin con la feature `Users`
- WHEN inicia sesión con credenciales válidas
- THEN el navegador aterriza en `/sales/new`, igual que un OwnerAdmin en el mismo estado de tienda

### Requirement: REQ-12 — Ningún OwnerAdmin ni StoreUser aterriza en /admin/owners (D4)
Ni un OwnerAdmin ni un StoreUser MUST NOT aterrizar jamás en `/admin/owners`; esa rama es exclusiva de ReSeller/SuperAdmin. (`user-home.ts:20-22`, `S1-02.md:63`)

#### Scenario: Ninguna combinación aterriza en /admin/owners
- GIVEN las aserciones de S1, D1 y D3 ya ejecutadas
- WHEN se observa el destino final de cada una
- THEN ninguna aterriza en `/admin/owners`

### Requirement: REQ-13 — La resolución de destino consulta datos locales, no la API (D5)
`resolveUserHomePath` MUST resolver el destino consultando el servicio de productos local (offline) y MUST NOT emitir una petición a la API para esa resolución. (`user-home.ts:2,24`, `S1-02.md:64`)

#### Scenario: Sin petición adicional durante la resolución del destino
- GIVEN el login ya autenticado (`POST /v1/auth/login` y `GET /v1/auth/me` ya observados)
- WHEN se resuelve el destino post-login
- THEN no sale ninguna petición HTTP adicional atribuible a esa resolución

### Requirement: REQ-14 — Misma función gobierna login explícito y rebote del guard (D6)
`resolveUserHomePath` MUST ser la misma función que gobierna tanto el login explícito (D1-D3) como el rebote del guard de un usuario ya autenticado (REQ-7/A7); MUST producir el mismo destino para el mismo estado de tienda en ambos caminos. (`loaders.ts:56`, `S1-02.md:65`)

#### Scenario: El rebote del guard coincide con el destino del login explícito
- GIVEN un usuario ya autenticado cuyo destino de login explícito ya se observó
- WHEN visita `/login` y el guard lo rebota
- THEN el destino del rebote es idéntico al destino observado en su login explícito

### Requirement: REQ-15 — Siembra de D1/D3 por el camino real de la UI, nunca por localStorage escrito a mano
La categoría y el producto que habilitan D1 y D3 MUST crearse navegando la UI real (registro → login → crear categoría desde `/sales/products` → crear producto), y MUST NOT escribirse directamente en `localStorage` vía `page.evaluate()` u otro mecanismo que reproduzca a mano el formato de cable del repositorio. (Propuesta §3, decisión D1)

#### Scenario: La siembra pasa por los servicios reales
- GIVEN una sesión de OwnerAdmin autenticada
- WHEN se siembra una categoría y un producto para D1/D3
- THEN la categoría se crea vía `categoryService.createProductCategory` y el producto vía `productService.createProduct`, ambos disparados desde la UI
- AND ningún test escribe una clave de `localStorage` de productos/categorías directamente

### Requirement: REQ-16 — Fallo de siembra distinguible de fallo de login
Cuando la siembra de categoría/producto (REQ-15) falla, el mensaje de fallo reportado MUST ser distinguible de un fallo de las aserciones de login (A1-A8), de modo que un fallo en D1/D3 no se confunda con un defecto del propio login. (Propuesta §6, R7)

#### Scenario: El mensaje de fallo identifica la etapa
- GIVEN un fallo durante la creación de categoría o producto previo a D1/D3
- WHEN el test reporta el error
- THEN el mensaje identifica que el fallo ocurrió en la etapa de siembra, no en el login

## Verification Criteria
- [ ] REQ-1..REQ-7, REQ-9..REQ-14 corren en la corrida por defecto (`pnpm test:e2e`)
- [ ] REQ-8 corre solo mediante su propio script (`pnpm test:e2e:rate-limit`), con umbrales 5/1min — nunca los de `RegisterPolicy`
- [ ] REQ-15 verificado: ningún test escribe `localStorage` de productos/categorías a mano
- [ ] REQ-16 verificado manualmente por el usuario forzando un fallo de siembra
- [ ] `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`, `api-health.spec.ts` permanecen sin cambios
- [ ] Ningún fichero `vitest` de login fue tocado
