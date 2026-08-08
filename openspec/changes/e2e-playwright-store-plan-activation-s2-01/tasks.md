# Tareas: cobertura Playwright para S2-01 (DG-7)

> Insumos: `design.md` (fija toda la mecánica), `specs/e2e-store-plan-activation-ui/spec.md`, `specs/e2e-network-observer-core/spec.md`, `docs/testing/e2e-stage-1/S2-01.md`, `frontend-react/e2e/README.md`. Esta pasada re-verificó línea a línea `edit-store.tsx`, `store-form.tsx`, `plan-picker.tsx`, `network-observer-core.ts`, `auth-storage.ts`, `login-network-observer.ts`, `test.ts`, `session.ts:164-171`, `roster-fixture.ts:298-326`, `login.spec.ts:340-358,539-555`, `login-offline.spec.ts:1-27`, `store-seed.ts:1-40` y `OwnersController.cs:18`. Ningún número se copió sin abrir el fichero.
>
> Entrega: **commits-only** sobre `feat/e2e-playwright-store-plan-activation-s2-01`. Sin PR, sin push, sin slicing. Rama ya existe y ya está checked-out — ninguna unidad crea rama.
> Regla innegociable (`CLAUDE.md`): ningún `*.spec.ts` existente, ni `e2e/support/test.ts`, ni `e2e/support/session.ts` se tocan. Ninguna unidad de abajo lo requiere; si `sdd-apply` encuentra que sí, PARAR y preguntar — no ejecutar.

## 0. Decisión mecánica propia de esta fase (no viene de `design.md`, se declara así)

`design.md` §2 dibuja el flujo de las 11 aserciones como **una sola secuencia continua** (restaurar → guarda → degradar → `goto` → aserciones 1,2,3,8,9,10 → click+submit → aserción 4 → aserción 5 → recarga → aserciones 6,7). El diseño no fija cuántos bloques `test()` de Playwright materializan esa secuencia — esa granularidad es mecánica y se fija acá:

- **`test()` #1 — "OwnerAdmin activa el plan pago una sola vez"**: UN solo test que recorre la secuencia completa del diagrama de punta a punta (aserciones 1,2,3,4,5,6,7,8,9,10 + guarda REQ-13). Se construye incrementalmente a través de las unidades 4, 5 y 6 — cada commit **extiende el mismo `test()`**, nunca crea uno nuevo, y cada commit deja el fichero en estado válido y corrible (el test cierra su llave donde el commit lo deja).
- **`test()` #2 — "Fallo de carga bloquea el formulario"**: aserción 11, aislada. No comparte estado con el test #1 (D5: el `route.abort()` no toca el dato de la tienda), así que no importa el orden relativo entre los dos.

**Por qué no 3 tests separados** (alternativa descartada): partir 1,2,3,8,9,10 / 4,5 / 6,7 en tres `test()` independientes exigiría que cada uno pinee su propia precondición de plan sin depender del orden de ejecución del archivo — y sembrar el estado "ya en plan pago" sin reusar el propio flujo de guardado habría exigido un helper de "elevar a pago" que **no está en el contrato fijado por `design.md` §4** (`degradeStoreToFreePlan` es unidireccional a propósito, D1). Seguir el diagrama tal cual — un solo test continuo — evita inventar ese helper y no tiene ninguna dependencia de orden entre archivos.

**Total de tests nuevos: 2.** `docs/testing/e2e-stage-1/README.md:88` declara **42** en la corrida por defecto hoy. Aritmética: **42 + 2 = 44** tras este cambio (no una corrida observada — el apply agent no tiene backend para correrla).

## 1. Unidades de trabajo (una por commit)

### WU-1 — Ensanchar `ObserverSubject` + `readBearerToken` ✅

- **Intención**: habilitar que el cuarto observer use los helpers de `network-observer-core.ts` (diagnóstico de backend equivocado) y leer el Bearer token de la sesión ya autenticada.
- **Ficheros**:
  - `frontend-react/e2e/support/network-observer-core.ts:96` — MODIFICADO, aditivo. `export type ObserverSubject = 'registro' | 'login'` → `'registro' | 'login' | 'tienda'`. No es fichero de test. Verificado sin `switch` exhaustivo sobre `subject` en todo `e2e/support/` (grep confirmado en `design.md` D3); los dos productores existentes (`network-observer.ts:130,138` con `'registro'`, `login-network-observer.ts:231,284` con `'login'`) no cambian.
  - `frontend-react/e2e/support/auth-storage.ts` — MODIFICADO, aditivo. Nueva función `readBearerToken(page: Page): Promise<string | null>` que lee `window.localStorage.getItem('token')` (misma clave `TOKEN_KEY` ya definida en `:23`, la que `api-client.ts:37` usa para el header `Authorization`). No toca `mutateBearerToken` (`:97-102`) ni ningún export existente. No es fichero de test.
- **Tests primero (TDD)**: no hay un `.test.ts` de vitest para `e2e/support/*` en este repo (confirmado: `frontend-react/e2e/support/*.test.ts` no existe ningún fichero). La capa de prueba de este código ES el spec de Playwright que lo consume — por eso el "red" de esta unidad es: escribir primero, en un scratch/no-commiteado, la firma que WU-2/WU-3 van a importar (`ObserverSubject` con `'tienda'`, `readBearerToken`) y confirmar que **sin** el cambio el `import` no compila. El commit de esta unidad entrega el "green": `pnpm typecheck` pasa con el tipo ensanchado y la función nueva.
- **Gate**: `cd frontend-react && pnpm typecheck && pnpm lint` — **yo** (apply agent, no necesita backend).
- **Rollback**: revertir este commit solo — dos líneas aditivas, ningún consumidor existente las requiere todavía (WU-2/WU-3 son quienes las usan).
- **Commit**: `feat(e2e-support): widen ObserverSubject to admit 'tienda' and add readBearerToken`

### WU-2 — `store-fixture.ts`: `degradeStoreToFreePlan`, `readModuleCatalog`, `assertStoresFeature` ✅

- **Intención**: el helper de siembra que degrada una tienda real a plan gratuito por `PUT` real, y la aserción temprana de `featureIds`.
- **Fichero**: `frontend-react/e2e/support/store-fixture.ts` — NUEVO, no es fichero de test (es soporte, igual que `store-seed.ts`, `roster-fixture.ts`).
- **Contrato exacto** (`design.md` §4, D1, D9 — no se re-decide acá):
  ```ts
  export interface ModuleCatalog { freeIds: number[]; paidIds: number[]; allIds: number[] }
  export interface FreePlanPrecondition extends ModuleCatalog {
    storeId: string;
    paymentStartDate: string; // no-nulo por contrato, pineado en el paso 4
  }
  export function readModuleCatalog(page: Page): Promise<ModuleCatalog>;
  export function degradeStoreToFreePlan(page: Page, storeId: string): Promise<FreePlanPrecondition>;
  export function assertStoresFeature(page: Page): Promise<void>;
  ```
  Secuencia interna de `degradeStoreToFreePlan` (D1, 4 pasos — **el 4º es obligatorio, no opcional**):
  1. `GET /v1/modules/ToStore` con `Authorization: Bearer ${await readBearerToken(page)}` → filtrar `priceIncluded` → `freeIds`/`paidIds`/`allIds`.
  2. `GET /v1/stores/{storeId}` → leer `name`, `address` (van sin cambios en el PUT — `UpdateStoreCommand.cs:81-82` los sobreescribe sin condición).
  3. `PUT /v1/stores/{storeId}` con `{ id: storeId, name, address, description: null, approved: false, paymentStartDate: null, isActive: true, moduleIds: freeIds }`.
  4. **Re-`GET /v1/stores/{storeId}`** y tirar error ruidoso (nombrando el storeId y los ids esperados vs. observados) si el conjunto de ids devuelto no es exactamente `freeIds`, o si `paymentStartDate` volvió nulo. Precedente exacto del patrón "pinear la precondición": `roster-fixture.ts:298-326` (`plantRoster`).
  - `assertStoresFeature(page)` lee `JSON.parse(localStorage.currentUser).featureIds` y tira error ruidoso nombrando el módulo `Management`, la feature `Stores=73` y **H-7/H-8** si `73` no está — espejo exacto de la ruidosidad de `session.ts:164-171` (`createStoreUserViaUi`, guarda de redirect a `/login`).
- **Cabecera del fichero**: una frase que declare que es siembra de servidor, no flujo de usuario, y que es posible por **H-15** (ver WU-7).
- **Tests primero (TDD)**: mismo criterio que WU-1 — la prueba real de este contrato es WU-4 (el spec que lo invoca). El "red" es el `import` sin resolver hasta que este fichero exista; el "green" de esta unidad es `pnpm typecheck` limpio con los tres exports firmados arriba.
- **Gate**: `cd frontend-react && pnpm typecheck` — **yo**.
- **Rollback**: revertir solo este commit — fichero nuevo, cero consumidores hasta WU-4.
- **Commit**: `feat(e2e-support): add degradeStoreToFreePlan store-fixture for S2-01`

### WU-3 — `store-network-observer.ts`: cuarto observer ✅

- **Intención**: capturar el `PUT /v1/stores/{id}` (body + timestamp) y `GET /v1/auth/me` (timestamp) para las aserciones 4 y 5, y contar documentos para la aserción 5 (sin recarga).
- **Fichero**: `frontend-react/e2e/support/store-network-observer.ts` — NUEVO, no es fichero de test. Plantilla: `login-network-observer.ts` (patrón `page.on('request')`/`page.on('response')`, `createOutcomeQueue`, `resolveCapture`).
- **Contrato exacto** (`design.md` §4, D4):
  ```ts
  export interface StorePutCapture { status: number; url: string; moduleIds: number[]; rawBody: string }
  export interface StoreNetworkObserver {
    waitForPutRequest(): Promise<void>;
    waitForPutResponse(): Promise<StorePutCapture>;
    expectPutThenMe(): void;
    expectPutCount(expected: number): void;
    markDocumentBaseline(): void;
    expectNoDocumentSince(context?: string): void;
  }
  export function installStoreNetworkObserver(page: Page, storeId: string): StoreNetworkObserver;
  ```
  Detalles mecánicos fijados por el diseño (no re-decidir):
  - Sufijo parametrizado por `storeId` (`/v1/stores/${storeId}`), no un regex genérico — un PUT a otra tienda se detecta, no se cuenta junto (D4).
  - El body sale de `request.postData()` en el handler `page.on('request')`, sincrónico, junto con el timestamp — mismo criterio que `login-network-observer.ts:184-197`.
  - `/me` se duplica **solo como matcher de timestamps local** (4 líneas, NO se importa de `login-network-observer.ts` — ese fichero alimenta 5 specs vía `auto: true`, `test.ts:63,74`). El conteo de `/me` se cruza en el spec con `loginNetwork.expectMeRequestCount(1)`, que ya existe (`login-network-observer.ts:299-306`).
  - `markDocumentBaseline()`/`expectNoDocumentSince()`: cuenta `request.resourceType() === 'document'`. Técnica reusada de `login.spec.ts:539-555` (instrumentación del flake T8, `recordNavigations`), no reinventada.
  - **Se instala dentro del spec (WU-4), no en `test.ts`** — precedente exacto: `any-request-observer.ts`, instalado en cada test de `login-offline.spec.ts:14-19`, nunca como fixture `auto: true`.
- **Tests primero (TDD)**: igual criterio — la prueba real es WU-5 (la sección del spec que usa `waitForPutResponse`/`expectPutThenMe`/`expectNoDocumentSince`). "Green" de esta unidad = `pnpm typecheck` limpio con la interfaz de arriba implementada.
- **Gate**: `cd frontend-react && pnpm typecheck` — **yo**.
- **Rollback**: revertir solo este commit — fichero nuevo, cero consumidores hasta WU-5.
- **Commit**: `feat(e2e-support): add store-network-observer (PUT body + /me + document count)`

### WU-4 — Spec, parte 1: aserciones 1,2,3,8,9,10 (corregida) + guarda REQ-13 ✅

- **Intención**: primer bloque del `test()` #1 — desde `signedInPage` hasta las 6 aserciones DOM-dado-el-estado del plan gratuito, sin aún activar el plan pago.
- **Fichero**: `frontend-react/e2e/store-plan-activation.spec.ts` — **NUEVO**, SÍ es fichero de test (agregar tests nuevos está permitido; no es un test existente). Nombre fijado por `design.md` D8 — no `e2e/stores.spec.ts` (reservado a S2-03, `e2e/README.md:220`).
- **Cuerpo de esta unidad**:
  1. `import { test, expect } from './support/test'` (nunca `@playwright/test` directo — mismo patrón que los 5 specs existentes).
  2. `test.use({ persona: 'owner-admin' })` (persona default, cero coste extra — `test.ts:78`).
  3. `test('OwnerAdmin activa el plan pago una sola vez', async ({ signedInPage, loginNetwork }) => { ... })`:
     - `await assertStoresFeature(signedInPage.page)` — guarda REQ-13, antes de cualquier otra cosa (D9).
     - `const { freeIds, allIds } = await degradeStoreToFreePlan(signedInPage.page, signedInPage.storeId)`.
     - `await signedInPage.page.goto('/management/stores')`.
     - Aserción 1: `STORES.PLAN.ACTIVATE` visible en la pestaña no seleccionada (`plan-picker.tsx:97-106`).
     - Aserción 2: click en "Activar este plan" en la pestaña paga **sin guardar** → aparece `STORES.PLAN.WILL_ACTIVATE_ON_SAVE` (`:108-110`). *(Nota: este click dispara `choosePlan` y muta el `moduleIds` local del formulario — es voluntario para poder observar el aviso; no se guarda todavía, así que no interfiere con la aserción 3.)*
     - Aserción 3: `STORES.PLAN.ACTIVE_BADGE` sigue en la pestaña gratis (`:24-25,70,79`) — el estado *seleccionado* cambió, el *activo* no.
     - Aserción 8: `#store-payment-start` ausente del DOM (`store-form.tsx:217`, `isSuperAdmin && isEditMode` es falso).
     - Aserción 9: `#store-is-active` ausente del DOM (`:234`, `isSuperAdmin` es falso).
     - **Aserción 10, forma corregida por H-16**: `#store-owner` **ausente** del DOM (no "presente pero deshabilitado" — `isAdminUser = isSuperAdmin || isOwnerAdmin` es `false` para esta persona, `store-form.tsx:69,179`). Comentario en el spec citando H-16.
- **Tests primero (TDD)**: este ES el test. La forma "red→green" acá es literal una vez que el usuario tenga el backend arriba: antes de este commit, `store-plan-activation.spec.ts` no existe → cero cobertura (rojo por ausencia). El commit entrega el archivo con este primer tramo verificable — el gate real (Playwright contra backend) lo corre el usuario.
- **Gate**:
  - `pnpm typecheck` (yo, sin backend) — que compile y que los imports de WU-1/WU-2/WU-3 resuelvan.
  - `pnpm exec playwright test e2e/store-plan-activation.spec.ts` con backend arriba (`dotnet run --project backend/src/SMCA.WebApi --launch-profile http`, perfil `http`) — **usuario**.
- **Rollback**: revertir solo este commit — el `test()` que agrega no tiene aún el bloque de guardado, así que revertirlo no deja nada a medio construir para otro commit.
- **Commit**: `test(e2e): cover S2-01 free-plan DOM assertions (1,2,3,8,9,10) + featureIds guard`

### WU-5 — Spec, parte 2: aserciones 4 y 5 (round-trip de guardado) ✅

- **Intención**: extender el MISMO `test()` de WU-4 con el click en pago, el guardado, y las dos aserciones que exigen mirar la red.
- **Fichero**: `frontend-react/e2e/store-plan-activation.spec.ts` — **MODIFICADO** dentro de la misma rama, mismo fichero nuevo creado en WU-4 (no es un test *existente* al momento del `sdd-apply` — todo el cambio vive en una rama no mergeada; el fichero pasa a existir recién con WU-4). No requiere autorización.
- **Cuerpo agregado**:
  - `const storeObserver = installStoreNetworkObserver(signedInPage.page, signedInPage.storeId)` — instalado ANTES del submit, mismo patrón que `any-request-observer.ts` en `login-offline.spec.ts`.
  - `storeObserver.markDocumentBaseline()` justo antes del click en pago + guardar (D6).
  - Click en la pestaña paga → click "Activar este plan" → click "Guardar" (mismo flujo que la aserción 2, pero esta vez completando el submit).
  - `const putCapture = await storeObserver.waitForPutResponse()` → **Aserción 4**: `putCapture.moduleIds` es exactamente `allIds` (unión gratis+pagos), no solo los pagos — `getPlanModuleIds(modules, 'paid')` devuelve `modules.map(m => m.id)` sin filtrar (`plan-picker.tsx:26-27,49`).
  - `await loginNetwork.waitForMeRequest()` → `await signedInPage.page.waitForURL(/\/management\/stores$/)`.
  - **Aserción 5**: `storeObserver.expectPutThenMe()` (orden causal) + `storeObserver.expectNoDocumentSince('tras guardar el plan')` (cero documentos ⇒ sin `location.reload()`) + `loginNetwork.expectMeRequestCount(1)`.
- **Tests primero (TDD)**: mismo criterio que WU-4 — este commit extiende el rojo-por-ausencia anterior con el tramo que exige el observer de WU-3; el gate de backend (usuario) confirma verde.
- **Gate**:
  - `pnpm typecheck` — **yo**.
  - `pnpm exec playwright test e2e/store-plan-activation.spec.ts` con backend arriba — **usuario**.
- **Rollback**: revertir solo este commit vuelve el spec al estado de WU-4 (test funcional, sin el tramo de guardado) — estado coherente, no rompe nada.
- **Commit**: `test(e2e): cover S2-01 save round-trip assertions (PUT body + session refresh, no reload)`

### WU-6 — Spec, parte 3: aserciones 6, 7 (plan ya pago) + test nuevo para aserción 11 (fallo de carga) ✅

- **Intención**: cerrar el `test()` #1 con las dos aserciones de plan-ya-pago, y agregar el `test()` #2 independiente para la aserción 11.
- **Fichero**: `frontend-react/e2e/store-plan-activation.spec.ts` — MODIFICADO (mismo fichero nuevo de esta rama).
- **Cuerpo agregado al `test()` #1** (después de `waitForURL` de WU-5, la app ya está en `/management/stores` en plan pago):
  - `await signedInPage.page.reload()` (el flujo de la US pide explícitamente "recargar la pantalla", `S2-01.md:49` paso 4 — la propia US ejerce el reload que la aserción 5 demostró innecesario para el guardado; son dos pasos distintos, no una contradicción).
  - Aserción 6: `STORES.PLAN.ACTIVATE` **no existe en el DOM**, en ninguna pestaña (`plan-picker.tsx:100`).
  - Aserción 7: click en la pestaña gratis → `aria-selected` se mueve, panel cambia a módulos gratis, **no** aparece `SELECTED` ni `ACTIVATE` ni `WILL_ACTIVATE_ON_SAVE` en esa pestaña; la badge `ACTIVE_BADGE` sigue en la pestaña paga; click de vuelta a la pestaña paga → `SELECTED` reaparece ahí (D7 — el hecho observable que sustituye a `onChange`, que no tiene evento propio que escuchar).
- **`test()` #2, nuevo, mismo fichero**:
  ```ts
  test('fallo de carga muestra STORES.ERROR y no monta el formulario', async ({ signedInPage }) => {
    await signedInPage.page.route('**/v1/modules/ToStore', (route) => route.abort());
    await signedInPage.page.goto('/management/stores');
    await expect(signedInPage.page.getByRole('alert')).toHaveText(/* STORES.ERROR */);
    await expect(signedInPage.page.locator('#store-name')).toHaveCount(0);
  });
  ```
  - Intercepta `GET /v1/modules/ToStore` (el más angosto de los tres del `Promise.all`, `edit-store.tsx:49-53`) — precedente in-repo: `login.spec.ts:351`, `route.abort()` con el mismo razonamiento ("simulación honesta de que el servidor no está").
  - **Cubre**: la rama `.catch()` de `edit-store.tsx:80-82` → `setLoadError(...)` → `return` antes de montar `<StoreForm>` (`:158-164`).
  - **NO cubre — G1, brecha declarada, no disfrazada**: la rama `succeeded === false` con HTTP 200 (`edit-store.tsx:55-58`), que la aserción 11 de `S2-01.md:63` cita literalmente. Alcanzarla exigiría fabricar un cuerpo de respuesta (un mock real), rechazado por el diseño (D5). El comentario del test y `S2-01.md`/`README.md` deben decir esto explícitamente, no dejarlo implícito.
- **G2, brecha declarada, no asumida**: en ningún punto de este spec corre un `/me` entre la degradación (WU-2) y el guardado (WU-5) — si `Stores=73` no sobrevive a la degradación, no queda observado, ni roto ni confirmado. Anotar en el spec y en `S2-01.md`.
- **Tests primero (TDD)**: mismo criterio de las unidades anteriores.
- **Gate**:
  - `pnpm typecheck` — **yo**.
  - `pnpm exec playwright test e2e/store-plan-activation.spec.ts` con backend arriba — **usuario**.
- **Rollback**: revertir solo este commit deja el `test()` #1 en el estado de WU-5 (funcional, sin las aserciones de plan-pago) y sin `test()` #2 — estado coherente.
- **Commit**: `test(e2e): cover S2-01 paid-plan assertions (6,7) and load-failure assertion (11)`

### WU-7 — Documentación: `S2-01.md`, `README.md` ×2, H-15, H-16

- **Intención**: cerrar el catálogo de cobertura y registrar los dos hallazgos nuevos.
- **Ficheros** (ninguno es de test):
  - `docs/testing/e2e-stage-1/S2-01.md`:
    - `:10` — `E2E frontend (Playwright)`: `PENDIENTE` → `CUBIERTO`.
    - `:53-63` — marcar las 11 casillas `[ ]` → `[x]`.
    - `:62` — **reescribir la aserción 10**: de *"El selector de dueño está **deshabilitado** en modo edición (`store-form.tsx:188`)"* a algo del tipo *"El selector de dueño **no se renderiza** para un OwnerAdmin — `isAdminUser = isSuperAdmin || isOwnerAdmin` es falso, porque `hasOwnersAvailableFeature` exige la feature `Owners`, que ninguna tienda porta nunca (`edit-store.tsx:37`, `authorization-service.ts:44-46`, `ModuleEntityTypeConfiguration.cs:39`). Ver H-16."*
    - `:63` — anotar explícitamente G1 (rama `succeeded === false` no cubierta) al lado de la aserción 11, no solo en `README.md`.
    - `:84-85` — actualizar "Estado de cobertura" con la lista de tests nuevos y su fichero.
    - **Antes de escribir cualquier número**, re-verificar cada `archivo:línea` citado en el documento contra el código real (ya hecho en esta pasada para `edit-store.tsx`, `store-form.tsx`, `plan-picker.tsx` — confirmados exactos; `UpdateStoreCommand.cs`, `StoreRepository.cs` quedan como los re-verificó `design.md`, sin discrepancia encontrada por `sdd-tasks`).
  - `docs/testing/e2e-stage-1/README.md`:
    - `:39` — fila S2-01: `PENDIENTE` → `CUBIERTO`, con el nombre del spec.
    - `:68` — totales: mover S2-01 de PENDIENTE a CUBIERTO en el conteo (`2 CUBIERTO · 2 PARCIAL · 8 PENDIENTE` → `3 CUBIERTO · 2 PARCIAL · 7 PENDIENTE`).
    - `:88` — párrafo "Playwright hoy": agregar `store-plan-activation.spec.ts` a la lista de specs y **la aritmética** `42 + 2 = 44` (nunca "se observó 44" — el apply agent no corrió el backend).
    - Agregar **H-15** (después de H-14, `:288`): *"El backend no tiene candado de dirección única para el plan de una tienda"* — único guard de `UpdateStoreCommand.cs:69-106` es `IsSuperAdminOrOwnerAdmin` (`:71-72`); ninguna rama compara el conjunto de módulos entrante contra el actual ni consulta `PaymentStartDate` para rechazar una bajada. DG-7 es una garantía exclusivamente de UI (`plan-picker.tsx:9-15` documenta el `readOnly` en prosa). Con la ironía escrita explícitamente: la ausencia de este candado del lado servidor es lo que hace posible este test — si se arreglara, Approach A (este cambio) dejaría de tener precondición alcanzable. A diferencia de **H-10** (barrera de frontend *emergente*, un colapso de `??` que nadie diseñó), acá la barrera de frontend es **deliberada y documentada** — lo que falta no es intención, es la mitad de servidor de una intención que sí existe.
    - Agregar **H-16**: *"Dos nociones distintas de 'owner admin' en el mismo código"* — `edit-store.tsx:37` usa `isOwnerAdmin = isSuperAdmin || hasOwnersAvailableFeature(user)` (exige la feature `Owners`, que cuelga de `ModuleType.Administration`, sembrado `availableToStore: false`, `ModuleEntityTypeConfiguration.cs:39` → nunca la porta ninguna tienda), mientras que `adminLoader` (`loaders.ts:101`) mira el flag `user.isOwnerAdmin` (`GetMeQuery.cs:96`, `_httpContextService.IsOwnerAdmin`). Consecuencia: la aserción 10 de `S2-01.md` estaba mal escrita ("deshabilitado" en vez de "no renderizado"). **Segundo orden, digno de su propia nota**: dos defectos se cancelan — si `isOwnerAdmin` fuera `true` por la primera definición, `edit-store.tsx:52` llamaría `listOwners()`, `OwnersController.cs:18` (`[HasPermission(OwnersAdmin)]`) respondería 403, ese 403 caería en el `.catch()` de `:80-82`, y `loadError` mataría 10 de las 11 aserciones de esta misma US.
  - `frontend-react/e2e/README.md`:
    - Nueva sección **"## Suite de activación de plan (`store-plan-activation.spec.ts`)"**, después de "## Suite de login offline", con la misma estructura que esa sección: qué cubre (S2-01, `docs/testing/e2e-stage-1/S2-01.md`), capa de soporte (`store-fixture.ts`, `store-network-observer.ts`), costo (**0 logins extra** — reusa `owner-admin`; **2 `PUT`/`GET` de siembra reales**, sin rate limit, `PUT /v1/stores/{id}` no lleva `[EnableRateLimiting]` — verificado por `design.md` §6), y la advertencia de que **este spec SÍ necesita backend real levantado** (a diferencia de `login-offline.spec.ts`).
    - Nota explícita: la tienda de `owner-admin` termina el spec en **plan pago con `PaymentStartDate` no-nulo** — sin teardown alcanzable, mismo criterio ya documentado para las filas de `Owner`/`Store`/`User` (R3 de `design.md`, `e2e/README.md:107-112`).
- **Tests primero**: no aplica — unidad de documentación pura, sin código ejecutable.
- **Gate**: ninguno automatizado — revisión de lectura (yo, re-verificando cada cita antes de escribirla).
- **Rollback**: revertir solo este commit — no afecta código.
- **Commit**: `docs(testing): close S2-01 Playwright coverage and record H-15/H-16`

## 2. Checkpoint final — no es un commit

### Regresión de los 44 (antes 42)

- **Comando**: `cd frontend-react && pnpm test:e2e --force` con backend arriba.
- **Quién**: **usuario**. Esperar un minuto entre corridas completas — el margen sigue siendo de 1 login sobre 5/min (H-12, `e2e/README.md:167-171`); S2-01 agrega **cero** logins nuevos a ese presupuesto.
- **Qué confirma**: que ensanchar `ObserverSubject` (WU-1) no afectó a los 5 specs existentes que dependen de las fixtures `auto: true` de `test.ts:63,74` (R4 de `design.md`), y que las 2 aserciones nuevas de este cambio no rompieron nada preexistente.
- **No se planea ningún `dotnet test`** — la capa .NET de S2-01 ya está CUBIERTA (`S2-01.md:11,82`) y no hay trabajo de backend en este cambio.

### Verificación mecánica de REQ-15 (sin backend, la corre el apply agent)

- `git diff -- e2e/register.spec.ts e2e/register-rate-limit.spec.ts e2e/login.spec.ts e2e/login-rate-limit.spec.ts e2e/login-offline.spec.ts` debe ser vacío.
- `git diff -- e2e/support/test.ts e2e/support/session.ts` debe ser vacío.

## 3. Review Workload Forecast (informativo — entrega es commits-only, sin PR)

| Unidad | Líneas estimadas | Motivo de la estimación |
|---|---|---|
| WU-1 | +2 / ~+15 con comentarios | 1 línea de tipo, 1 función de 4 líneas + JSDoc |
| WU-2 | ~+90/+120 | 3 exports + interfaces + JSDoc con la cabecera de siembra-de-servidor |
| WU-3 | ~+140/+170 | Cuarto observer completo, plantilla de `login-network-observer.ts` (309 líneas) pero acotado a PUT+/me+documentos |
| WU-4 | ~+90 | Primer tramo del test: setup + 6 aserciones DOM |
| WU-5 | ~+60 | Click+submit + 2 aserciones de red |
| WU-6 | ~+90 | Reload + 2 aserciones + segundo `test()` completo |
| WU-7 | ~+90 (repartidas en 3 ficheros) | 11 casillas + corrección de aserción 10 + 2 hallazgos + fila/totales/párrafo + sección nueva de README |

**Total estimado**: ~560-635 líneas. Excede el presupuesto informal de 400 líneas de un PR único, pero **no aplica ningún guard de PR**: `delivery_strategy` de este cambio está fijado externamente como commits-only sobre la rama de feature, sin PR ni slicing. El forecast queda solo como referencia de tamaño para quien lea el `git log` de la rama.

## 4. Trazabilidad requisito → unidad

| Requisito (spec) | Unidad(es) |
|---|---|
| REQ-1, REQ-2, REQ-3, REQ-8, REQ-9 | WU-4 |
| REQ-10 (forma corregida, H-16) | WU-4 |
| REQ-4 | WU-5 |
| REQ-5 | WU-5 |
| REQ-6, REQ-7 | WU-6 |
| REQ-11 (con G1 declarada) | WU-6 |
| REQ-12 | WU-2 |
| REQ-13 (con G2 declarada) | WU-4, WU-2 (`assertStoresFeature`) |
| REQ-14 | Verificado por diseño — cero `login()` en todo el spec nuevo |
| REQ-15 | Checkpoint §2 |
| REQ-16 | WU-7 |
| `e2e-network-observer-core` REQ-7 | WU-1 |
