# Tasks: [S1-03] Playwright — login offline en dispositivo aprovisionado

**Change**: `e2e-playwright-offline-login-s1-03`
**Rama**: `feat/e2e-playwright-offline-login-s1-03` (ya checked out; no crear rama nueva, no commitear desde acá)
**Entrega**: commits por unidad de trabajo sobre la rama, **sin PR, sin push**. `chain_strategy` N/A.
**Fuente de la arquitectura**: `openspec/changes/e2e-playwright-offline-login-s1-03/design.md` — esta lista es la baja mecánica de ese diseño; ninguna decisión de arquitectura se reabre acá.

## Nota sobre "test-first" en este cambio

Este cambio **no toca `app/` ni `backend/`** — es cobertura nueva sobre comportamiento de producción ya existente (proposal.md §Rollback Plan, design.md §Migración/rollout). Por eso "escribir el test primero" no significa rojo-por-falta-de-feature: significa que cada test se escribe y se corre ANTES de asumir que el fixture/observer que consume está bien, y un rojo en WU3 es señal de un bug en el fixture (WU2) o un defecto de producción no documentado — nunca una señal de "falta código de app por escribir". Si un test de WU3 sale rojo contra código de `app/` sin modificar, **se detiene y se pregunta**, no se toca `app/`.

## Orden obligatorio (gate de seguridad del diseño)

Los corre el usuario (backend real levantado para los 31+2 preexistentes; el spec nuevo no lo necesita). Nunca invertir `test:e2e` y `test:e2e:rate-limit` — al revés choca por cupo de login (`e2e/README.md:179-181`).

```
WU0 (baseline, no commit) → WU1 (refactor aislado) → WU2 (fixtures aditivos) → WU3 (spec nuevo) → WU4 (docs)
```

---

## WU0 — Línea base (no es commit)

| Campo | Detalle |
|---|---|
| Intención | Confirmar que la suite está verde ANTES de tocar nada, para poder atribuir cualquier rojo posterior al cambio, no al entorno |
| Archivos | Ninguno |
| Gate | `cd frontend-react && pnpm test:e2e` ⇒ **31 verdes**. Esperar ≥1 minuto (cuota de login). `cd frontend-react && pnpm test:e2e:rate-limit` ⇒ **2 verdes** |
| Rollback | N/A — no se escribe nada |

Si WU0 no da 31+2 verdes, **detenerse y preguntar** antes de avanzar — cualquier refactor posterior sobre una base roja es indistinguible de "lo rompí yo".

---

## Commit 1 — WU1: `refactor(e2e): extract shared network-observer core`

Único commit **aislado y revertible** (`git revert` sin tocar el spec nuevo). Es una unidad atómica: un estado intermedio (core creado pero un solo observer migrado) deja el otro observer duplicando lógica sin motivo — no tiene sentido como commit propio, así que no se subdivide más allá de lo mecánico de abajo.

### T-WU1-1 — Crear el núcleo compartido
- **Satisface**: `e2e-network-observer-core` REQ-3 (extraer solo lo idéntico), REQ-4 (cero umbrales en el núcleo)
- **Archivo**: `frontend-react/e2e/support/network-observer-core.ts` — **NUEVO**
- **Contenido** (D1 del design, ya verificado por lectura directa de ambos observers):
  - Cola `Outcome`/`pushOutcome` de entrega-a-un-solo-consumidor — idéntica en `network-observer.ts:119-126` y `login-network-observer.ts:166-173` (verificado: mismo comentario, misma lógica `shift() ?? push`)
  - `createDeferred<T>` — hoy solo en `login-network-observer.ts:47-53`, genérico por construcción
  - Matcher de sufijo de pathname con `try/catch` — `network-observer.ts:54-64` ≡ `login-network-observer.ts:102-109`
  - `wrongBackendMessage(subject, url)` parametrizado por `subject: 'registro' | 'login'` — preserva el texto byte a byte, **incluido el typo `Parná`** (`network-observer.ts:87-97` vs `login-network-observer.ts:136-145`, verificado idéntico salvo el sustantivo)
  - Mensaje de backend caído en `requestfailed` — `network-observer.ts:147-156` ≡ `login-network-observer.ts:206-217`
  - Diagnóstico 404 — `network-observer.ts:222-227` ≡ `login-network-observer.ts:294-299`
  - `resolveCapture(outcome, { subject, rateLimitError })` con orden `failed → 429 → origen equivocado → 404`, recibiendo `rateLimitError: () => Error` (las clases NO se mueven al núcleo — D1 "rechazado")
- **Test escrito antes**: ninguno propio — el núcleo se prueba por transitividad vía T-WU1-2/3 y el gate de abajo, porque no hay tsconfig para `e2e/` (design.md §Riesgos, fila 1) y el único consumidor verificable es el comportamiento observable de los dos observers existentes
- **Gate**: no corre solo; se valida junto con T-WU1-2/3

### T-WU1-2 — Reescribir `network-observer.ts` sobre el núcleo
- **Satisface**: `e2e-network-observer-core` REQ-1 (API pública byte-a-byte)
- **Archivo**: `frontend-react/e2e/support/network-observer.ts` — **MODIFICADO** (helper de soporte, NO test — autorizado por decisión 5 del usuario)
- **Debe seguir exportando, misma firma y mismo comportamiento observable**: `installRegisterNetworkObserver`, `RegisterNetworkObserver`, `RegisterAttempt`, `RegisterResponseCapture`, `RegisterRateLimitError` (`network-observer.ts:6,28,34,99` actuales)
- `RegisterRateLimitError` queda **construida en este módulo**, nunca en el núcleo (`resolveCapture` recibe `() => new RegisterRateLimitError(...)`)
- Actualizar comentarios que citaban líneas internas que se movieron (p. ej. cualquier "(see wrongBackendMessage() above)" — ya no está arriba, está importada del núcleo)
- **Gate**: `cd frontend-react && pnpm exec playwright test e2e/register.spec.ts e2e/api-health.spec.ts e2e/smoke.spec.ts`

### T-WU1-3 — Reescribir `login-network-observer.ts` sobre el núcleo
- **Satisface**: `e2e-network-observer-core` REQ-2 (API pública byte-a-byte)
- **Archivo**: `frontend-react/e2e/support/login-network-observer.ts` — **MODIFICADO** (helper de soporte, NO test — autorizado por decisión 5)
- **Debe seguir exportando, misma firma**: `installLoginNetworkObserver`, `LoginNetworkObserver` con sus 7 métodos (`waitForLoginRequest`, `waitForMeRequest`, `waitForLoginResponse`, `expectLoginThenMe`, `expectNoLoginAttempt`, `expectNoProductApiCall`, `expectMeRequestCount`), `LoginRateLimitError` (`login-network-observer.ts:27,55,147` actuales)
- `LoginRateLimitError` queda **construida en este módulo**, umbral 5/1min intacto, nunca unificado con `RegisterRateLimitError` (`login-network-observer.ts:22-26`, spec REQ-4)
- El comentario de deuda actual (`login-network-observer.ts:129-134`, *"extract a shared core when a THIRD observer appears"*) pasa a **"deuda pagada — ver `network-observer-core.ts`"**
- Corregir la cita cruzada de `login-network-observer.ts:235` (`// network-observer.ts:141-157`, sobre el bloque de lectura inmediata del body) para que apunte a donde vive esa lógica después del refactor
- **Gate**: `cd frontend-react && pnpm exec playwright test e2e/login.spec.ts`

### T-WU1-4 — Corregir la cita cruzada de `auth-storage.ts:14`
- **Satisface**: pedido explícito del orquestador ("Also in scope"), no un REQ de spec — es una corrección de exactitud documental en un archivo de soporte
- **Archivo**: `frontend-react/e2e/support/auth-storage.ts` — **MODIFICADO** (soporte, NO test)
- Verificado por lectura directa: la línea 14 hoy cita `login-network-observer.ts:123-129` para la deuda de la regla de tres; el comentario real vive en `:129-134` (`:123-129` es el cuerpo de `isProductApiRequest`, verificado línea por línea arriba). Corregir a `:129-134` — o, si T-WU1-3 ya reescribió ese comentario a "deuda pagada", apuntar a la nueva ubicación/nombre
- **Gate**: ninguno propio (es un comentario); se revisa a ojo en el diff del commit

### T-WU1-5 — Revisar (sin editar si no aplica) `backend-url.ts:20` y `playwright.config.ts:94`
- **Archivos**: `frontend-react/e2e/support/backend-url.ts`, `frontend-react/playwright.config.ts` — revisar, **probablemente sin cambios**
- **Evidencia**: leídos ambos de punta a punta. Ninguna de las dos líneas cita un número de línea interno de `network-observer.ts` — solo nombran el archivo (`backend-url.ts:20`: *"by `e2e/support/network-observer.ts` (the wrong-backend guard)"*; `playwright.config.ts:94`: *"vía el guard de `e2e/support/network-observer.ts`"*). Como el archivo sigue existiendo con el mismo guard exportado, **ninguna de las dos cadenas queda desfasada** — el riesgo que design.md señalaba en su tabla no se materializa en línea de comentario, solo en identidad de módulo, que T-WU1-2 preserva
- **Gate**: ninguno — verificación de lectura, no edición

### Gate de cierre de WU1 (obligatorio, exacto)
```bash
cd frontend-react && pnpm test:e2e            # 31 verdes — MISMO conteo que WU0
cd frontend-react && pnpm test:e2e:rate-limit # 2 verdes — MISMO conteo que WU0
git diff --stat -- e2e/*.spec.ts e2e/support/test.ts   # DEBE salir vacío (o solo aditivo en test.ts)
```
- **Rollback**: `git revert <sha-de-WU1>` — un solo commit, no toca `login-offline.spec.ts` porque ese archivo todavía no existe en este punto del orden

---

## Commit 2 — WU2: `test(e2e): add roster fixture and any-request observer`

Aditivo, **sin consumidor todavía** — `pnpm test:e2e` debe seguir en 31 (design.md, tabla de WU). El consumo real llega en WU3; por diseño explícito estos dos módulos no tienen spec propio en este commit.

### T-WU2-1 — Fixture de roster
- **Satisface**: `e2e-offline-login-ui` REQ-13 (siembra por `localStorage`, cero `importRoster`); consumido transitivamente por REQ-1..REQ-12 vía WU3
- **Archivo**: `frontend-react/e2e/support/roster-fixture.ts` — **NUEVO**
- **Contenido exacto** (D3 del design — API ya fijada, no reabrir):
  - `ROSTER_STORAGE_KEY = 'lizoft.offline-roster'` — verificado `roster-store.ts:19` (`const ROSTER_KEY = 'lizoft.offline-roster'`)
  - `KAT_PASSWORD = 'Password123'` — verificado `docs/contracts/offline-roster-dek-kat.json:2` (`"password": "Password123"`)
  - Interfaces `RosterUserSpec`, `RosterSpec` tal como las fija D3
  - `buildRosterBundle(spec)`: verifier vía `webcrypto.subtle` de `node:crypto` (Node ≥22, `package.json:26` confirma `"node": ">=22"`), SHA-256 → PBKDF2-HMAC-SHA256 210 000 iteraciones, memoizado por `password|salt|iterations`
  - **Tripwire obligatorio**: `sha256Base64('Password123')` MUST igualar `AIxwOS46v70PpHu8LtlqqZvUnhWXJ/y6Dy5qvrOp1gE=` — verificado que ese es el valor exacto de `offline-roster-dek-kat.json:3` (`passwordPreHash`). Si no matchea, throw inmediato con mensaje explícito — este es el "test primero" real de este módulo: falla ruidoso antes de sembrar nada
  - `wrap: 'kat'` copia `wrapSalt`/`wrapIv`/`wrappedDek`/`storeId` del KAT tal cual (`DEK_WRAP_ITERATIONS` está hardcodeada fuera del bundle — D3); `wrap: 'tampered'` invierte 1 byte de `wrappedDek`
  - `plantRoster(page, spec)`: escribe con `page.evaluate`, **relee la clave y valida `bundleId`/`expiresAt` como precondición** antes de devolver el control (D4 paso 4)
  - Lectura del KAT vía `readFileSync(resolve(__dirname, '../../../docs/contracts/offline-roster-dek-kat.json'))`, mismo precedente que `playwright.config.ts:18-32`
- **Test escrito antes**: el tripwire de arriba ES el test-first de este módulo (falla si el paso 1 de la derivación está mal, antes de que cualquier test de WU3 llegue a correr)
- **Gate**: `cd frontend-react && pnpm test:e2e` ⇒ sigue en **31** (nadie más lo importa todavía)

### T-WU2-2 — Observer genérico "cero peticiones a cualquier endpoint"
- **Satisface**: `e2e-network-observer-core` REQ-5; consumido por `e2e-offline-login-ui` REQ-1
- **Archivo**: `frontend-react/e2e/support/any-request-observer.ts` — **NUEVO**
- **Contenido exacto** (D2 del design):
  - `installAnyRequestObserver(page)` con `requests()` y `expectNoRequests(context?)`
  - **No** reusa la cola del núcleo — solo afirma un negativo
  - Cuenta una request si `new URL(url).origin !== 'http://localhost:3333'` (baseURL, `playwright.config.ts:79`) **o** mismo origen pero pathname matchea `/(^|\/)(api|v1)\//`
  - Excluye `origin === 'null'` (`data:`/`blob:`)
  - `resourceType()`/`method()` se reportan en el mensaje de fallo, nunca filtran
- **Gate**: `cd frontend-react && pnpm test:e2e` ⇒ sigue en **31**

### Gate de cierre de WU2
```bash
cd frontend-react && pnpm test:e2e   # 31 verdes — sin cambio de conteo respecto de WU1
```
- **Rollback**: `git rm e2e/support/roster-fixture.ts e2e/support/any-request-observer.ts` — dos archivos nuevos sin consumidor, cero residuo

---

## Commit 3 — WU3: `test(e2e): cover S1-03 offline login in Playwright`

**Archivo**: `frontend-react/e2e/login-offline.spec.ts` — **NUEVO**. Importa `test`/`expect` de `./support/test` (precedente `README.md:81`). Instala `installAnyRequestObserver` **dentro de este spec** (no en `support/test.ts` — fuera de la frontera de autorización, D2 "alternativa rechazada"), una vez al principio del test, sin ventanas (design.md §Enfoque técnico: la recarga de T10 cuesta cero HTTP por la rama de caché de `auth-store.ts:127-139`).

Orden de los 11 tests — mismo orden que la tabla "Mapa aserción → test" del design, de más simple/fundamental a más específico:

### T1 — Golden path: cero HTTP, online-igual-offline, `localStorage` hidratado, destino sin productos
- **Satisface**: REQ-1, REQ-2, REQ-10, REQ-11 (mitad "sin productos")
- **Precondición**: roster con 1 `OwnerAdmin`, wrap `'none'`, verifier `'valid'`, sin vencer
- **Pasos**: D4 completo, navegador **online** todo el tiempo
- **Aserciones**: `anyRequest.expectNoRequests()`; `localStorage` tiene `AUTH_MODEL.authToken`/`expiresIn`; destino `/sales/products`
- **Gate**: `cd frontend-react && pnpm exec playwright test e2e/login-offline.spec.ts -g "golden path"` (o el título literal que se le dé)

### T2 — Destino con productos
- **Satisface**: REQ-11 (mitad "con productos")
- **Precondición**: siembra con `support/store-seed.ts` (precedente ya usado por `login.spec.ts`), logout por UI, 2º submit offline
- **Aserciones**: destino `/sales/new`, misma rama que T1 con tienda distinta
- **Gate**: igual patrón, filtrado por el título del test

### T3 — Login ausente ≡ password incorrecta (mismo string)
- **Satisface**: REQ-3
- Dos sub-escenarios en el mismo test: login que no existe en `bundle.users`; login existente con password errónea. Ambos MUST mostrar `AUTH.INVALID_CREDENTIALS`, texto idéntico

### T4 — `isActive:false` ⇒ `AUTH.ACCOUNT_INACTIVE`
- **Satisface**: REQ-4

### T5 — Inactivo + password incorrecta ⇒ credenciales inválidas (orden verifier→password→isActive)
- **Satisface**: REQ-9

### T6 — Verifier malformado ⇒ `AUTH.SERVER_ERROR`
- **Satisface**: REQ-5
- `verifier: 'malformed'` del fixture (falta `hash`/`salt`/`iterations` o tipo incorrecto)

### T7 — `DekUnwrapError` ⇒ `AUTH.UNLOCK_FAILED`
- **Satisface**: REQ-6
- `wrap: 'tampered'` + `KAT_PASSWORD` correcta. Debe mostrar `AUTH.UNLOCK_FAILED`, **nunca** `AUTH.INVALID_CREDENTIALS`

### T8 — Bundle vencido ⇒ rama online (corte de cupo con `page.route`)
- **Satisface**: REQ-7 (mitad "online")
- `expiresInMs` negativo. `page.route('**/v1/auth/login', route => route.fulfill({status: 429, ...}))` — precedente `login.spec.ts:351,369`
- **Doble prueba** (D5): (a) el handler corrió exactamente 1 vez y `anyRequest.requests()` tiene 1 entrada al endpoint de login; (b) banner `AUTH.TOO_MANY_ATTEMPTS`, inalcanzable desde la rama offline (`offlineErrorMessageId` solo produce 4 ids)
- Esta es la única petición de red de TODO el spec — interceptada, nunca sale al backend real. **0 de los 5/min del `LoginPolicy`** (REQ-13)
- **Red**: no se corta — se intercepta

### T9 — Bundle vencido + navegador offline ⇒ banner `AUTH.OFFLINE_LOGIN`
- **Satisface**: REQ-7 (mitad "offline")
- **Red**: `context.setOffline(true)` tras `plantRoster`, **sin navegar después** (D4 paso 6, patrón `login.spec.ts:74-80`)
- Cero peticiones observadas (`anyRequest.expectNoRequests()`)

### T10 — Recarga con roster v2 y DEK perdida ⇒ `/login?unlock=1` + `AUTH.UNLOCK_REQUIRED`
- **Satisface**: REQ-8
- `wrap: 'kat'` + `KAT_PASSWORD` ⇒ login offline exitoso (DEK seteada) → `page.reload()` **online** → DEK en null → `authLoader` → `unlockGate` → `redirect('/login?unlock=1')` → banner `AUTH.UNLOCK_REQUIRED`
- Sigue costando 0 HTTP por la rama de caché de `getUserByToken` (`auth-store.ts:127-139`)
- **Red**: no se corta

### T11 — Sin conexión aterriza en la misma ruta que con conexión
- **Satisface**: REQ-12
- Mismo usuario/estado de tienda que T2 (o T1), repetido con `context.setOffline(true)` antes del submit
- **Aserción**: destino idéntico al observado en el escenario "con conexión" equivalente
- **Red**: `context.setOffline(true)`, sin navegar después

### REQ-13 (cero logins reales) y REQ-14 (citas verificadas)
- REQ-13 se verifica **auditando la suite completa** al cierre de WU3, no con un test propio: ningún test de T1-T11 usa `signedInPage`; T8 es el único con una petición y va interceptada por `page.route()`
- REQ-14 (citas de `S1-03.md`) se resuelve en WU4 — ver abajo

### Gate de cierre de WU3 (obligatorio, exacto — dos pasos, en este orden)
```bash
cd frontend-react && pnpm exec playwright test e2e/login-offline.spec.ts   # SIN backend levantado — cero HTTP esperado
cd frontend-react && pnpm test:e2e                                         # 31 preexistentes + 11 nuevos = 42, todos verdes
```
- **Rollback**: `git rm e2e/login-offline.spec.ts` — un archivo nuevo, ningún otro módulo lo importa

---

## Commit 4 — WU4: `docs(testing): mark S1-03 as covered`

Solo documentación. Usar la fecha real de la corrida de WU3 (no una fecha inventada).

### T-WU4-1 — Corregir citas desactualizadas de `S1-03.md`
- **Satisface**: `e2e-offline-login-ui` REQ-14
- **Archivo**: `docs/testing/e2e-stage-1/S1-03.md` — **MODIFICADO** (doc, no test)
- Citas confirmadas por lectura directa (a re-verificar de nuevo en `apply`, el código puede moverse entre WU1-WU3):
  | Cita actual en `S1-03.md` | Real verificado (a la fecha de esta tarea) |
  |---|---|
  | `login.tsx:105-120` (rama) | `login.tsx:109-110` |
  | `login.tsx:119` (return) | `login.tsx:123` |
  | conectividad implícita en `:124` | `login.tsx:128` (`ConnectivityService.isOnline()`) |
  | `:35-37`, `:38-40`, `:44-46`, `:47-48` (mapeo de errores) | `login.tsx:37-52` (bloque único; `AUTH.SERVER_ERROR` cae por el `return` final de `:52`, no por rama propia) |
  | `auth-store.ts:291` (hidratación) | `auth-store.ts:194-201` (`setUser`) |
  | `login.tsx:59,201-205` (banner unlock) | `login.tsx:63,205-209` |
  | `login.tsx:112` vs `:140` (destino) | `login.tsx:116` vs `:144` |
- **Gate**: ninguno automatizado — revisión manual del diff línea por línea contra el código vigente en ese punto de la rama

### T-WU4-2 — Estado de cobertura en `docs/testing/e2e-stage-1/README.md`
- **Archivo**: `docs/testing/e2e-stage-1/README.md` — **MODIFICADO** (doc)
- Fila S1-03 (hoy `README.md:32`, verificado: `| [S1-03](S1-03.md) | ... | **PENDIENTE** | **N/A** — cero HTTP; la contraparte de servidor es S3-01 |`) pasa de `PENDIENTE` a `CUBIERTO`, con la fecha real de la corrida de WU3 y la cuenta de tests (11 nuevos, 12 aserciones)
- **Gate**: ninguno automatizado — revisión manual

### T-WU4-3 — `frontend-react/e2e/README.md`
- **Archivo**: `frontend-react/e2e/README.md` — **MODIFICADO** (doc)
- Agregar sección para `login-offline.spec.ts` (patrón de las secciones existentes "Suite de registro"/"Suite de login", `README.md:75-181`): qué cubre, que corre en la suite por defecto (nueva cuenta de tests default: 31 → 42), que no necesita backend levantado, mención del núcleo compartido `network-observer-core.ts` y de `roster-fixture.ts`/`any-request-observer.ts`
- Actualizar la tabla de comandos (`README.md:56`) si el conteo de `pnpm test:e2e` se documenta ahí (verificar al escribir: hoy dice "31 verdes" en varias secciones — actualizar cada mención real que lo diga, no solo una)
- **Gate**: ninguno automatizado — revisión manual

### Gate de cierre de WU4
```bash
cd frontend-react && pnpm test:e2e   # 42 verdes — línea final del cambio completo
cd frontend-react && pnpm test:e2e:rate-limit   # 2 verdes, sin cambios
```
- **Rollback**: revertir el commit de docs solo, no afecta código

---

## Comandos que el usuario corre (no delegables a este agente)

Todos los gates de arriba requieren backend real levantado (excepto el primer paso del gate de WU3). Ver `CLAUDE.md` raíz: no correr `dotnet` desde este agente; el usuario levanta el backend y corre los comandos citados.

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http   # en otra terminal, SOLO el usuario
cd frontend-react && pnpm test:e2e
cd frontend-react && pnpm test:e2e:rate-limit
```

## Frontera E2E intocable — recordatorio explícito

Ningún task de esta lista edita un `*.spec.ts` existente (`register.spec.ts`, `register-rate-limit.spec.ts`, `login.spec.ts`, `login-rate-limit.spec.ts`). Los únicos archivos existentes que se tocan son dos helpers de soporte ya autorizados (`network-observer.ts`, `login-network-observer.ts`) más `auth-storage.ts` (comentario) y tres docs. Si en `apply` aparece una necesidad real de tocar un spec existente: **detenerse y preguntar**, `status: blocked_question`, nombrando el archivo y la línea exactos — no se debilita ni se "arregla" nada.

**Discrepancia conocida, NO tocar**: `login-rate-limit.spec.ts:6` cita `es.ts:83` para `AUTH.TOO_MANY_ATTEMPTS`; la línea real es `es.ts:85`. Es un archivo de test. Se deja anotada acá como nota para el usuario, requiere su autorización explícita si algún día se corrige.

---

## Review Workload Forecast

Informativo — la entrega es commits-only sobre la rama de feature, sin PR ni chained PRs en este cambio.

| Commit | Archivos | Líneas estimadas cambiadas (⚠️ estimación, no medida) | Riesgo sobre presupuesto de 400 líneas |
|---|---|---|---|
| WU1 | 1 nuevo (`network-observer-core.ts` ≈160) + 2 reescritos (`network-observer.ts` ≈232→~110, `login-network-observer.ts` ≈371→~220) + 1 comentario (`auth-storage.ts`) | ≈480-550 | **Alto** — el más pesado de los 4, por ser una reescritura de dos archivos existentes sobre un núcleo nuevo |
| WU2 | 2 nuevos (`roster-fixture.ts` ≈130-160, `any-request-observer.ts` ≈60-90) | ≈200-250 | Medio |
| WU3 | 1 nuevo (`login-offline.spec.ts`, 11 tests) | ≈350-450 | Medio-Alto |
| WU4 | 3 docs modificados | ≈60-90 | Bajo |
| **Total del cambio** | 8 archivos tocados (4 nuevos + 2 reescritos + 1 comentario + 3 docs — 7 más docs README ya contados) | **≈1090-1340** | — |

Ningún commit individual necesita partirse en PRs porque la entrega es commits-only; se deja el detalle por si el usuario decide más adelante promover WU1 o WU3 a una revisión aislada por su tamaño.

---

## Checklist de verificación final (antes de dar el cambio por aplicado)

- [ ] WU0: 31+2 verdes como línea base — ⚠️ NO VERIFICADO por este agente (sin backend disponible); queda documentado al 2026-08-07 (`docs/testing/e2e-stage-1/README.md:88`), no re-corrido. Diferido al usuario.
- [x] WU1 (parcial): `git diff --stat -- 'e2e/*.spec.ts' e2e/support/test.ts` vacío — VERIFICADO. Comentario de deuda de `login-network-observer.ts` actualizado a "deuda pagada" — VERIFICADO. `auth-storage.ts:14` corregido — VERIFICADO. ⚠️ "mismos 31+2 verdes después del refactor" NO VERIFICADO (sin backend) — diferido al usuario.
- [x] WU2 (parcial): tripwire de `roster-fixture.ts` corrido dos veces con éxito — VERIFICADO (`sha256Base64('Password123')` matchea el KAT; pipeline completo de unwrap de DEK contra `expectedDek` del KAT también verificado con `node:crypto`). ⚠️ "31 verdes sin cambio" NO VERIFICADO (sin backend) — diferido al usuario.
- [x] WU3 (parcial): `login-offline.spec.ts` corre solo sin backend (cero HTTP real) — VERIFICADO, 11/11 verdes en dos corridas (`pnpm exec playwright test e2e/login-offline.spec.ts`, sin proceso `dotnet` activo). Cero `POST /v1/auth/login` reales atribuibles al spec nuevo — VERIFICADO por lectura del propio spec (T8 es la única petición, interceptada por `page.route()`). ⚠️ "42 verdes en `pnpm test:e2e`" NO VERIFICADO (necesita el backend real que sostiene los 31 preexistentes) — diferido al usuario, es aritmética (31+11), no una corrida observada.
- [x] WU4: `docs/testing/e2e-stage-1/README.md` S1-03 en `CUBIERTO` con fecha real (2026-08-08) — VERIFICADO. Citas de `S1-03.md` re-verificadas contra el código vigente en este punto de la rama (no copiadas de la tabla de design.md sin revisar) — VERIFICADO por lectura directa de `login.tsx`, `auth-store.ts`, `loaders.ts`.
