# Tareas — `e2e-playwright-login-s1-02`

## Regla innegociable del proyecto (textual, gobierna toda tarea de abajo)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Agregar tests E2E **nuevos**: permitido. Tocar tests E2E **existentes** de cualquier forma: requiere autorización explícita, cada vez. Aplica también a sub-agentes: cualquier delegación que pueda tocar E2E lleva esta regla textual en su prompt.

`register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`, `api-health.spec.ts` y **todo** fichero `vitest` son intocables por este documento. **Ninguna tarea de abajo los edita, renombra, skipea, debilita ni les cambia cómo corren.**

Las ediciones a `support/test.ts` y `support/network-observer.ts` son **estrictamente aditivas**: `registerNetwork` conserva `auto: true`, su cuerpo y su posición; `RegisterFixtures` se **extiende**, no se reescribe. `network-observer.ts` **no se toca en absoluto** — el observador de login va a un archivo propio (`login-network-observer.ts`), decisión de diseño §4/§9 para no arriesgar una regresión sobre los specs de registro por una ganancia cosmética de DRY.

Si en cualquier punto de `sdd-apply` parece necesario tocar un fichero de los de arriba de un modo no aditivo, **detenerse y preguntar**, no asumir que el diseño lo autoriza.

## Nota sobre TDD estricto aplicado a este cambio

Strict TDD está activo para el proyecto. Para código de soporte sin backend disponible al agente (D2 de la propuesta: el usuario corre todo localmente, el agente nunca ejecuta `dotnet`), el ciclo RED→GREEN se prueba en dos niveles:

- **Compile-time** (todas las fases): `pnpm --filter store-mgmt-frontend typecheck` (vía turbo). RED = referencia a un módulo/export que aún no existe (se redacta primero el consumidor —`session.ts` importando los tres archivos de soporte, o `login.spec.ts` importando fixtures/page objects— y falla la resolución de tipos); GREEN = el mismo comando limpio tras implementar el archivo.
- **Resolución estática de specs** (fases 3 y 4 únicamente): `pnpm exec playwright test e2e/<archivo> --list`. Prueba que el spec compila y Playwright puede enumerar sus tests sin arrancar un browser ni pegarle a un backend.
- **Verificación en vivo** (contra backend real): es del usuario, no del agente — mismo criterio D2 que S1-01. La sección "Hand-off" al final fija los comandos exactos.

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Estimated changed lines | ~950–1050 (6 archivos nuevos de soporte/spec + 1 edit aditivo chico + docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No — entrega es commits-only en una sola rama, ya asentada en la propuesta (D3), no hay PRs que dividir |
| Suggested split | No aplica — ver Unidades de Trabajo abajo, se entregan como commits secuenciales |
| Delivery strategy | commits-only (asentada; no es ask-on-risk/auto-chain/single-pr/exception-ok) |
| Chain strategy | no aplica — sin PR, solo work-unit commits |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

El "High" es real en volumen de líneas pero **informativo únicamente**: no dispara guard de PR porque la entrega es commits-only sobre `feat/e2e-playwright-login-s1-02` (ya creada desde `main`, checked out). `sdd-apply` sigue `work-unit-commits`: un commit por unidad, no por tipo de archivo.

## Rama y entrega

Rama `feat/e2e-playwright-login-s1-02`. Commits-only, conventional commits, **sin** "Co-Authored-By" ni atribución de IA. `sdd-apply` NO abre PR. `sdd-apply` NO ejecuta `dotnet`, NO levanta el backend, y NO afirma que un test pasó en vivo si no lo vio pasar — esa verificación es del usuario (D2).

## Dependencias entre unidades

```
WU-A (login-page.ts + login-network-observer.ts + store-seed.ts)
  └──> WU-B (session.ts: motor de personas + signedInPage)
         └──> WU-C (test.ts: costura de fixtures)
                ├──> WU-D (login.spec.ts: A1–A7 + D1–D6)
                └──> WU-E (login-rate-limit.spec.ts: A8)
                       └──> WU-F (README.md)
```

Dentro de WU-A, los 3 archivos son independientes entre sí (pueden implementarse en cualquier orden). WU-B depende de los 3 (usa `LoginPage`, `seedCategoryAndProduct`, y el tipo `LoginRateLimitError`/observador para leer respuestas de login). WU-C depende de WU-B. WU-D y WU-E dependen de WU-C, son independientes entre sí. WU-F depende de que WU-A..WU-E existan.

---

## Fase 0 — Capa de soporte, parte 1: page object + observador + siembra (WU-A)

- [x] 0.0 **RED**: redactar `support/session.ts` (borrador, sin commitear) con los `import` de `./login-page`, `./login-network-observer` y `./store-seed` + las firmas de `PersonaKind`/`SignedInSession` (design.md §3). `pnpm typecheck` falla: los tres módulos no existen.
- [x] 0.1 `frontend-react/e2e/support/login-page.ts` — page object de `/login`, misma política de selectores que `register-page.ts` (`#id` primero, rol+nombre accesible después, nunca clases Tailwind ni `data-testid` nuevo en producción): `email` (`#email`), `password` (`#password`), `togglePasswordVisibility` (rol `button`, nombre "Mostrar contraseña"), `submitButton` (rol `button`, nombre "Iniciar sesión"), `goto()`, `fill(identity)`, `submit()`.
  - **Trampa verificada #1** (`login.tsx:185-186` + `root.tsx:102`): `loadingOverlay = page.getByRole('status').first()` — **`.first()` es obligatorio**, hay DOS overlays con `role="status"` en pantalla (H4 del diseño); sin desambiguar, Playwright tira violación de modo estricto.
- [x] 0.2 `frontend-react/e2e/support/login-network-observer.ts` — fixture `loginNetwork` (no exportada aún como fixture de `test`, eso es WU-C): observa `POST .../v1/auth/login` y `GET .../v1/auth/me` con un solo `page.on('request')`/`page.on('response')` alimentando un array append-only `{kind, phase, at}`; expone `expectLoginThenMe()` (orden **causal**: `meRequest.at >= loginResponse.at`, no solo "ambas ocurrieron" — design.md §4), `waitForLoginResponse()` (cuerpo capturado en el evento `response`, no releído después de navegar), `expectNoLoginAttempt()`, `expectNoProductApiCall()` (acotado a pathname que matchee `/product/i`, no "ninguna otra petición" — el usage-tracker puede emitir su propio POST), y `LoginRateLimitError` tipado en 429.
  - **Trampa verificada #2**: los umbrales de este archivo son los de `LoginPolicy` — **5 intentos/minuto, ventana de 3 segmentos** (`RateLimitPolicies.cs:15-24`) — nunca los de `RegisterPolicy` (10/10min/10 segmentos) del `network-observer.ts` existente. Las constantes se **encogen**, no se copian.
  - Guard de backend equivocado + diagnóstico de `requestfailed`: se **duplican** desde `network-observer.ts:87-97,130-139` (~40 líneas) en vez de extraerse a un núcleo compartido — `network-observer.ts` no se toca (deuda anotada, disparador = "cuando aparezca un tercer observador", design.md §4).
- [x] 0.3 `frontend-react/e2e/support/store-seed.ts` — `seedCategoryAndProduct(page, name)`, 100% selectores `[data-testid]` **ya existentes** en producción (`add-category-button`, `category-name-input`, `category-save-button`, `category-actions-toggle-{id}`, `add-product-button`, `product-name-input`, `product-price-input`, `create-product-submit` — design.md §6), sin agregar ninguno nuevo. Cero peticiones a la API (`GlobalConfig.USE_ONLINE_SERVICE = false`).
  - Cada paso envuelto y re-lanzado con la etiqueta de fallo distinguible (REQ-16): `[persona:<kind>] la siembra falló en el paso "<paso>": <causa>. Esto NO es un fallo de login: revisá /sales/products y el modal de categoría.`
- [x] 0.4 **GREEN**: `pnpm typecheck` limpio para los tres módulos nuevos (el borrador de 0.0 sigue sin commitear — su rol fue solo forzar el RED).

Commit: `test(e2e): add login page object, login network observer, and UI seed helper`

## Fase 1 — Motor de acuñación de personas: `signedInPage` (WU-B)

- [x] 1.1 `frontend-react/e2e/support/session.ts` — tipos `PersonaKind` (`'owner-admin' | 'owner-admin-with-products' | 'store-user' | 'store-user-with-products'`) y `SignedInSession { page, identity, selectedStoreId, homePath }` (design.md §3).
- [x] 1.2 Fixture de **scope worker** con caché `Map<PersonaKind, StorageState>`: acuña la cadena de 4 personas **una sola vez por worker** (design.md §3 "La cadena de acuñación, en orden" — registro+login real de `owner-admin` [1 login], `POST /v1/users` para el StoreUser [0 login], login del StoreUser [1 login], siembra por UI sobre `owner-admin` [0 red] → `owner-admin-with-products`, merge de snapshots → `store-user-with-products` [0 login]).
- [x] 1.3 Restaurar snapshot **sobre el `page` del propio test** (nunca un `page`/contexto nuevo, nunca `context.addInitScript`): `page.goto('/login')` → `page.evaluate()` escribe las entradas del snapshot → `page.goto(homePath)` → `initialize()` hidrata. Invariante a mantener y a asertar: `signedInPage.page === page` (design.md §3 "Composición").
- [x] 1.4 **Gate de parada — R2/persona `store-user` (STOP AND ASK, no footnote)**: tras `goto('/management/users/create')`, assertar que la URL **no** es `/login`. Si aterrizó ahí, `user-create.tsx:11` usa `adminFeatureLoader([EFeatures.Users])`, que encadena `featureGate` **sin** el bypass de OwnerAdmin que sí tiene `featureLoader` plano (`loaders.ts:107-112` vs `:89-91`) — el OwnerAdmin auto-registrado sin la feature `Users` queda **deslogueado y rebotado a `/login`** (H-8). En ese caso, lanzar exactamente:
  > `[persona:store-user] El OwnerAdmin auto-registrado NO tiene la feature Users: adminFeatureLoader deslogueó y rebotó a /login (loaders.ts:107-112 + H-8). Esto es el riesgo R3 de la propuesta materializándose. PARAR y preguntarle al usuario si crear el StoreUser por API directa o diferir D3. No lo resuelvas por tu cuenta.`
  >
  > La aserción D3 (StoreUser) **nunca** se descarta ni se debilita en silencio si este gate dispara — se detiene la implementación y se espera la respuesta del usuario.
- [x] 1.5 Invariante "sin roster": ningún paso de la acuñación llama `importRoster`; documentar en comentario por qué (`isRosterProvisioned()` debe quedar falso — si no, S1-02 se convierte en S1-03 sin querer).
- [x] 1.6 **GREEN**: `pnpm typecheck` limpio para `session.ts` con sus tres imports de la Fase 0 ya resueltos.

Commit: `test(e2e): add session.ts persona-minting engine for signedInPage`

## Fase 2 — Costura de fixtures en `test.ts` (WU-C)

- [x] 2.1 **RED**: redactar el borrador de `login.spec.ts` (sin commitear, ver Fase 3) importando `test`/`expect` de `./support/test` y usando `test.use({ persona: 'owner-admin' })` + la fixture `signedInPage`. `pnpm typecheck` falla: `test.ts` todavía no expone ni `persona` ni `signedInPage`.
- [x] 2.2 Editar `frontend-react/e2e/support/test.ts` — **solo adiciones**: opción `persona` (option fixture, default `'owner-admin'`, nunca `auto`), fixture `signedInPage` (scope worker, cablea `session.ts`), fixture `loginNetwork` (**`auto: true`**, mismo criterio que `registerNetwork` — una salvaguarda que se puede olvidar no es salvaguarda). `RegisterFixtures` se **extiende**, no se reescribe. `registerNetwork` conserva línea a línea su `auto: true`, cuerpo y posición.
- [x] 2.3 **GREEN**: `pnpm typecheck` limpio con el borrador de 2.1 resolviendo. Gate de verificación cruzado (regla de blast radius, design.md §9): `pnpm exec playwright test e2e/register.spec.ts --list` sigue enumerando los mismos tests que antes de esta edición.

Commit: `test(e2e): wire signedInPage and loginNetwork fixtures into test.ts`

## Fase 3 — Suite principal, corre por defecto (WU-D)

`describe.serial` sobre el bloque que consume login (design.md §2: acuña la cadena de personas **una sola vez** por worker en vez de una vez por worker en paralelo — H2, no es para "evitar la ráfaga"). A4 y A5 no consumen login: `describe` aparte, sigue corriendo en paralelo.

- [x] 3.1 REQ-1 (A1) — dos muestras ancladas a eventos de red (`waitForLoginRequest()` y el `request` de `/me`), nunca a timeouts: formulario desmontado (`toHaveCount(0)` en `#email`) + overlay visible con `.first()` (H4).
- [x] 3.2 REQ-2 (A2) — `loginNetwork.expectLoginThenMe()`: orden causal, no solo "ambas ocurrieron".
- [x] 3.3 REQ-3 (A3) — contraseña incorrecta contra el login ya existente → 200 + `succeeded:false` → banner con `errors[0].description` **literal** interpolado en `AUTH.INVALID_ERROR`; control negativo: el banner **no** es "Email o contraseña inválidos" (eso sería la rama 401, no la de cuerpo).
- [x] 3.4 REQ-4 (A4) — campos vacíos → mensajes locales + `expectNoLoginAttempt()`. Vive en el `describe` paralelo, sin `signedInPage`.
- [x] 3.5 REQ-5 (A5) — orden obligatorio `goto` → llenar → `setOffline(true)` → submit → banner `AUTH.OFFLINE_LOGIN` + `expectNoLoginAttempt()`. Vive en el `describe` paralelo.
- [x] 3.6 REQ-6 (A6) — **trampa verificada #3**: la clave `AUTH_MODEL` es version-prefijada (`storage-keys.ts:5`); el test **escanea** `localStorage` buscando la entrada cuyo nombre termina en `-authf496fc5a9f17` (el sufijo es lo estable), nunca hardcodea la clave completa. Assert `authToken` string no vacío + `expiresIn` numérico futuro.
- [x] 3.7 REQ-7 (A7) — `signedInPage('owner-admin')` → `goto('/login')` → `toHaveURL(/\/sales\/products$/)`, 0 peticiones nuevas.
- [x] 3.8 REQ-9 (D1) — `signedInPage('owner-admin-with-products')` → `logout()` desde la UI → envío de credenciales **real** con `identity` → `toHaveURL(/\/sales\/new$/)`. `logout()` borra solo `AUTH_MODEL`, la siembra sobrevive.
- [x] 3.9 REQ-10 (D2) — comparte el aterrizaje del login S1 (`owner-admin` sin sembrar → `/sales/products`).
- [x] 3.10 REQ-11 (D3) — mitad sin productos: login real de `store-user` → `/sales/products`. Mitad con productos: `signedInPage('store-user-with-products')` → `goto('/login')` → rebote → `/sales/new`. Depende del gate 1.4 (R2) para poder acuñar `store-user`.
- [x] 3.11 REQ-12 (D4) — aserción negativa sobre las URLs ya observadas en S1/D1/D3: ninguna es `/admin/owners`. 0 navegaciones nuevas.
- [x] 3.12 REQ-13 (D5) — `loginNetwork.expectNoProductApiCall()` sobre el flujo de S1 y el de D1.
- [x] 3.13 REQ-14 (D6) — el destino del rebote de guard (A7) coincide con el destino del login explícito (D2) para la misma persona; ídem `store-user-with-products` (rebote) vs. D1 (login explícito) para la misma tienda sembrada.
- [x] 3.14 REQ-15 — invariante negativa transversal: ningún test de este archivo escribe una clave de `localStorage` de productos/categorías vía `page.evaluate()`; la siembra (3.8/3.10) pasa siempre por `store-seed.ts`.
- [x] 3.15 **GREEN**: `pnpm typecheck` limpio + `pnpm exec playwright test e2e/login.spec.ts --list` enumera los 13 tests sin error de fixture/import. (Verificación en vivo contra backend real: del usuario, sección Hand-off.)

Archivo: `frontend-react/e2e/login.spec.ts`.
Commit: `test(e2e): add login.spec.ts covering A1-A7 and D1-D6`

## Fase 4 — Aislamiento del límite de intentos de login (WU-E)

- [x] 4.1 `frontend-react/e2e/login-rate-limit.spec.ts` — REQ-8 (A8), `describe(..., { tag: '@rate-limit' })` (excluida de la corrida por defecto vía el `--grep-invert @rate-limit` que **ya existe** en `test:e2e`; `package.json` **no se toca**). `test.setTimeout(60_000)` — no 120_000, la ventana de login es 10 veces más corta que la de registro.
  - **Trampa verificada #4 / constantes que se encogen, no se copian**: `MAX_ATTEMPTS = 7` (no 11 — `PermitLimit=5` + 2 de margen por si un segmento libera a mitad de bucle), umbral **5 intentos/minuto** (no 10/10min), banner esperado `AUTH.TOO_MANY_ATTEMPTS` (no `REGISTRATION.TOO_MANY_ATTEMPTS`).
  - Credenciales de `newTestIdentity()` **nunca registradas** — el servidor contesta `succeeded:false` y consume permiso igual (limitador es middleware previo al endpoint, `Program.cs:157`); **cero filas** quedan en la base (mejora sobre el hermano, que deja 1).
  - Bucle corta apenas `waitForLoginResponse()` lanza `LoginRateLimitError`; assert el banner ahí.
- [x] 4.2 **GREEN**: `pnpm typecheck` limpio + `pnpm exec playwright test e2e/login-rate-limit.spec.ts --list` enumera el test sin error de fixture/import.

Commit: `test(e2e): isolate the login rate-limit assertion behind its own spec`

## Fase 5 — Documentación (WU-F)

- [x] 5.1 `frontend-react/e2e/README.md` — agregar sección `signedInPage`: qué entrega, las 4 personas, invariante `page === page`, invariante "sin roster", costo amortizado (4 logins reales en la corrida por defecto: 1 owner-admin + 1 store-user + 1 fallido A3 + 1 D1 tras logout).
  - **Margen de exactamente 1 login — visible, no una nota al pie**: dos corridas de `pnpm test:e2e` dentro del mismo minuto suman 8 logins contra un techo de 5/min y **se ponen rojas por cuota**, no por defecto. Redactar como advertencia destacada (no enterrada en prosa), igual de visible que la advertencia de datos de la suite de registro.
  - Documentar `pnpm test:e2e:rate-limit` de login: agota la cuota ~1 minuto, deja 0 filas nuevas, y que correrlo justo antes de `pnpm test:e2e` va a chocar (ventana corta, orden inverso al hermano de registro).
  - Actualizar la tabla de datos dejados por corrida: +1 `User` (StoreUser) sobre lo que ya documentaba S1-01.
- [x] 5.2 **GREEN**: revisión de lectura — la advertencia de margen de 1 login es localizable sin buscar, y ningún comando nuevo falta de la tabla de "Cómo correr".

Commit: `docs(e2e): document signedInPage, the login quota budget, and coverage`

---

## Notas de implementación (`sdd-apply`) — dos desviaciones deliberadas, documentadas

**1. Comando de prueba RED/GREEN real: NO `pnpm typecheck`.** Verificado antes de tocar código:
`pnpm typecheck` (`turbo run typecheck`) solo corre `tsc` dentro de cada paquete del workspace
(`apps/web-store-pos`, `packages/*`); `frontend-react/e2e/` no es un paquete del workspace y
ningún `tsconfig.json` lo incluye — confirmado agregando un archivo `.ts` con un import roto
dentro de `e2e/support/` y viendo `pnpm typecheck` seguir en verde (cache hit, ni se re-evalúa).
El comando que **sí** valida `e2e/` es el que `e2e-playwright-register-s1-01` ya usó y dejó
documentado en su `verify-report.md`: `pnpm exec tsc --noEmit --strict --lib ES2022,DOM --types
node --typeRoots ./apps/web-store-pos/node_modules/@types --moduleResolution bundler --module
ES2022 --target ES2022 --skipLibCheck e2e/*.ts e2e/support/*.ts playwright.config.ts
playwright.api.config.ts`. Cada ciclo RED→GREEN de este documento (0.0/0.4, 1.6, 2.1/2.3,
3.15, 4.2) se probó con ESTE comando, no con `pnpm typecheck`.

**2. `login.spec.ts` tiene 8 tests, no 13.** El presupuesto de login (design.md §2: exactamente 4
logins reales/minuto contra un techo de 5) hace IMPOSIBLE que cada uno de los 13 REQs numerados
(3.1-3.13) sea su propio test aislado: A1/A2 necesitan OBSERVAR el mismo envío de formulario en
vivo (un `restoreSignedInSession` no dispara ningún `POST /v1/auth/login`, así que no sirve para
esas dos), y ese mismo login es, por diseño (§2, tabla de presupuesto: "Ese mismo login ES el
sujeto de A1/A2/A6/D2/D5"), el sujeto de A6/D2/D5 también. Ídem para REQ-11 (D3), cuya mitad "sin
productos" también exige un login en vivo del StoreUser. La implementación agrupa REQs que
comparten el mismo evento de red observable en el MISMO test (nombrado con los REQs que cubre,
mismo criterio que register.spec.ts's REQ-8/REQ-6 compartiendo identidad), y separa en tests
propios todo lo que sí es gratis vía `signedInPage`/`restoreSignedInSession` (REQ-7, REQ-9,
REQ-12+REQ-14). Consecuencia arquitectónica: `PersonaCache` ganó `primeOwnerAdmin()` y
`primeStoreUser()` (no estaban en el diseño original de Fase 1) para que el login en vivo que un
test YA observó alimente la caché en vez de pagarse dos veces. `pnpm exec playwright test
e2e/login.spec.ts --list` enumera **8** tests (verificado), cubriendo los 13 REQs vía comentarios
`REQ-N` en cada bloque `test()`. Presupuesto real verificado por conteo de código: 4 logins totales
(1 owner-admin compartido con A1/A2/A6/D2/D5/A7[parcial]/D4[parcial]/D6[parcial], 1 store-user
compartido con REQ-11 sin-productos, 1 REQ-3, 1 REQ-9/D1) — igual al de design.md §2, no más.

---

## Hand-off para el usuario — el agente NO ejecuta nada de esto

Comandos, en este orden exacto (D2 de la propuesta):

```bash
# Terminal 1 — backend (requiere PostgreSQL en 127.0.0.1:5432, base smca)
dotnet run --project backend/src/SMCA.WebApi --launch-profile http
# NUNCA --launch-profile https (certificado autofirmado) NI ASPNETCORE_ENVIRONMENT=Testing
# (apagaría el limitador de login y con él A8 — H1 del diseño).

# Terminal 2 — suite por defecto (A1-A7 + D1-D6, 4 logins reales, 1 registro Owner+Store+User)
cd frontend-react && pnpm test:e2e

# A demanda, sabiendo el costo (agota la cuota de login de la IP por ~1 minuto)
cd frontend-react && pnpm test:e2e:rate-limit

# Gate de regresión — los specs de registro no se enteraron de nada
cd frontend-react && pnpm exec playwright test e2e/register.spec.ts
```

### Verde vs. fallo legítimo — checklist de verificación (design.md §10)

- [ ] `pnpm test:e2e` verde con el backend arriba.
- [ ] `pnpm test:e2e` **falla ruidosamente** con el backend abajo (nunca saltea en silencio).
- [ ] `pnpm exec playwright test e2e/register.spec.ts` sigue verde.
- [ ] `pnpm test:e2e:rate-limit` verde por separado, 0 filas nuevas.
- [ ] `pnpm test:e2e` **dos veces dentro del mismo minuto**: si se pone rojo por cuota, es el margen de 1 login manifestándose (§2 del diseño), **no** un defecto — el mensaje lo dice con esas palabras.

### Fallo de entorno, no de comportamiento

Backend caído, cuota de login agotada (429 con el texto de umbral), o CORS mal configurado en la respuesta 429 (R8 del diseño — hallazgo de backend, no del test) — el diagnóstico de `loginNetwork` lo reporta como texto legible, nunca como `expect` mudo.

### Puntos de parada explícitos, sin resolver por cuenta propia

1. **R2 (§ Fase 1.4)**: si acuñar `store-user` rebota a `/login` por falta de la feature `Users`, la implementación **para y pregunta** — no crea el StoreUser por API directa ni difiere D3 sin que el usuario lo decida.
2. **Cualquier tensión con un mock de `vitest`** de los ficheros de login, si una corrida de Playwright expone una discrepancia — vuelve como pregunta, nunca se resuelve editando el mock o el fichero `vitest`.

---

## Review Workload Forecast

- Estimated changed lines: ~1000
- 400-line budget risk: High
- Chained PRs recommended: No
- Decision needed before apply: No
