# Propuesta: cobertura Playwright para S2-01 (DG-7 — el OwnerAdmin activa el plan pago una sola vez)

> Fuente de la US: `docs/testing/e2e-stage-1/S2-01.md` (11 aserciones de UI declaradas). Exploración previa: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/explore.md`.
>
> Toda afirmación de este documento lleva `archivo:línea` verificado por lectura en esta pasada, o va marcada `⚠️ NO VERIFICADO`. Donde un documento de `docs/testing/` discrepa del código, gana el código y la discrepancia se reporta.

## 1. Por qué, y por qué ahora

S2-01 es la **primera US CRÍTICA del Bloque B** y hoy está en **PENDIENTE** en la capa Playwright, con la capa .NET ya en **CUBIERTO** (`docs/testing/e2e-stage-1/README.md:39`). La asimetría no es cosmética: el backend tiene 13 tests que fijan la *verdad del dato* del plan (`Billing/StoreActivationTests.cs:37,71,104` + `Stores/StoreUpdateTests.cs` + `Stores/StoreAuthorizationTests.cs:54`, catalogados en `S2-01.md:82`), pero DG-7 **no es una regla de datos: es una regla de UI**. El candado que impide que el dueño gaste dos veces su única activación no existe en el servidor — vive enteramente en que un botón no se renderice (`plan-picker.tsx:100`, verificado: `{selected === tab ? <p>SELECTED</p> : (!readOnly && <button>ACTIVATE</button>)}`, `plan-picker.tsx:97-106`). Ninguna cantidad de cobertura .NET puede aseverar la ausencia de un nodo del DOM.

Lo que hay hoy en su lugar es `vitest`: `store-form.test.tsx:408,426,446,464` y `plan-picker.test.tsx:141,156` (`S2-01.md:87`). Es `jsdom` con módulos inyectados a mano — exactamente la clase de cobertura que el `CLAUDE.md` de este repo desconfía por precedente propio, donde 303 tests de integración pesaron más que 315 unitarios porque los mocks reproducían un mundo que la base de datos nunca produjo. Playwright es la única capa que corre un navegador real contra la app y la API real (`README.md:24`).

Además, la infraestructura para hacerlo ya está pagada y no lo estaba cuando se escribió la etapa: `signedInPage` con 4 personas (`e2e/support/test.ts:95-98`, `session.ts`), un núcleo de observers extraído y estabilizado (`network-observer-core.ts`), y una corrida verde observada de 42 tests contra backend real el 2026-08-08 (`README.md:88`). El costo marginal de S2-01 es el más bajo que va a ser.

**Éxito se ve así**: las 11 casillas de `S2-01.md:53-63` marcadas, verificadas por una corrida verde contra backend real, sin agregar ni un login a los 4 que la suite ya gasta, y sin tocar ningún test existente.

## 2. La premisa de la US está contradicha por el código — y ese es el primer trabajo real

La User Story dice: *"Como OwnerAdmin **en plan gratuito**, quiero activar el plan pago…"* (`S2-01.md:15`). Ese estado inicial **no es alcanzable por el camino que produce OwnerAdmins en esta suite**.

`RegisterCommand.cs:73,81-83` le pasa a `CreateStoreAsync` **todos** los ids de `GetAvailableModulesToStore()`, y ese filtro no discrimina por `PriceIncluded` (`ModuleRepository.cs:17-24`: filtra `IsActive && AvailableToStore && Features.Any(...)`, nada de precio). Una tienda auto-registrada nace con módulos pagos activos. Como `isOnPaidPlan = modules.some((m) => !m.priceIncluded && m.selected)` (`store-form.tsx:83`, verificado literal), el candado **engancha desde el nacimiento**: `readOnly={!isSuperAdmin && isOnPaidPlan}` (`store-form.tsx:252`) es `true` para cualquier OwnerAdmin recién registrado.

No es inferencia: hay un test E2E existente que lo asevera contra base de datos real. `Billing/StoreCreationTrialTests.cs:359-361` afirma `PlanType == "Paid"` para una tienda auto-registrada, con el comentario textual *"Module 6 'Estadísticas' passes GetAvailableModulesToStore's filter, so a self-registered store always receives at least one paid module."* Está catalogado como **H-1** (`README.md:168-174`).

**Consecuencia para esta propuesta**: el primer trabajo real de este cambio no es escribir aserciones, es **fabricar una precondición que el producto no sabe alcanzar por sí mismo**. Las 4 personas de `session.ts` producen, todas, tiendas en plan pago. No existe hoy ningún camino —ni de UI, ni de fixture— hacia "OwnerAdmin en plan gratuito".

## 3. Enfoque elegido (Approach A) y su fundamento

Degradar una tienda real a plan gratuito con un **`PUT /v1/stores/{id}` real**, autenticado con el Bearer token de la misma sesión ya autenticada, emitido vía `page.request` de Playwright antes de navegar a la pantalla.

**Por qué el backend lo permite** (verificado leyendo el handler completo, `UpdateStoreCommand.cs:69-106`): el único guard de autorización es `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden)` (`:71-72`). **No hay ninguna rama que impida bajar de pago a gratis.** Y el resto del handler hace exactamente lo que la precondición necesita:

- Desactiva los módulos que no vienen en la lista: `item.IsActive = false` para cada `storeModulesToDelete` (`:113-122`), y arrastra sus `StoreRoleFeature` a `IsActive = false` (`:124-130`).
- **Deja `PaymentStartDate` intacto**: la única rama que lo escribe sin ser SuperAdmin es `if (store.PaymentStartDate is null && hasPaidModuleRequested)` (`:96-97`) — con la fecha ya no-nula y sin módulos pagos pedidos, ninguna de las dos mitades se cumple. La otra rama exige `IsSuperAdmin` (`:100-101`).
- El siguiente `GET /v1/stores/{id}` devuelve solo módulos activos, por include filtrado `.Include(s => s.StoreModules.Where(sm => sm.IsActive))` (`StoreRepository.cs:73`).

Resultado: `modules` llega al frontend con todos sus miembros `priceIncluded`, `isOnPaidPlan` computa `false`, `readOnly` es `false`, y el botón se renderiza. **Con `PaymentStartDate` todavía no-nulo** — que es la mitad valiosa: confirma por comportamiento, no por lectura de doc, que el candado depende solo de `modules` y nunca de la fecha (lo que `S2-01.md:19` y **H-5** afirman). Es también, textualmente, la precondición que S2-02 necesita.

**Por qué cuesta cero logins.** La persona `owner-admin` que ya existe (`test.ts:78` como default, `session.ts:197-227` `mintOwnerAdmin`) ya trae `featureIds` con `Stores = 73`. Cadena verificada: `GetMeQuery.cs:69-83` no filtra módulos salvo en estado `Vencido` (`StoreBillingUtils.cs:53-59`); `AllowedFeaturesService.cs:41-49` exige que los módulos de la tienda contengan el módulo de la feature; `Stores = 73` cuelga de `[HasModule(ModuleType.Management)]` (`StoreRoleFeatures.cs:192-195`); y `Management` es gratis (`priceIncluded: true`, `ModuleEntityTypeConfiguration.cs:97-105`) y siempre otorgado al registrarse (`RegisterCommand.cs:81-83`). Sobrevive a la degradación, porque la degradación conserva precisamente los `priceIncluded`. **El margen de exactamente 1 login contra el techo de 5/min (`RateLimitPolicies.cs:15-24`, documentado en `e2e/README.md:167-171`) queda intacto.**

**Y el `PUT` no tiene rate limit** — ver §6, ítem resuelto.

Rechazados y por qué (detalle completo en `explore.md:108-116`): `page.route()` pierde las aserciones 4 y 5 y cae en el precedente de mocks del `CLAUDE.md`; una persona SuperAdmin nueva agrega una quinta credencial que la cadena de `featureIds` demuestra innecesaria; sembrar `localStorage` es inviable porque `edit-store.tsx:47-101` carga todo por `Promise.all` de HTTP y nunca lee `localStorage` para esta pantalla.

## 4. Qué se entrega

### NUEVO

| Entregable | Qué hace |
|---|---|
| `frontend-react/e2e/support/store-fixture.ts` | `degradeStoreToFreePlan(page, storeId)`: lee el Bearer token, pide el catálogo real `GET /v1/modules/ToStore`, filtra por `priceIncluded`, y emite `PUT /v1/stores/{id}` con esos ids. **Nunca hardcodea los cuatro ids.** Diseñado para que S2-02 lo reuse tal cual. |
| `frontend-react/e2e/support/store-network-observer.ts` | Cuarto observer, sobre `network-observer-core.ts`: captura `PUT .../v1/stores/{id}` exponiendo el **body saliente** (aserción 4) y `GET .../v1/auth/me` (aserción 5). Plantilla directa: `login-network-observer.ts`. |
| `frontend-react/e2e/store-plan-activation.spec.ts` | El spec. Nombre distinto de `e2e/stores.spec.ts`, que `e2e/README.md:220` reserva para *"crear tienda en `/management/stores/create`"* — o sea S2-03, otra US. Nombre final a fijar en `sdd-design`. |

Un posible page-object del plan picker queda a decisión de `sdd-design`. Precedente mixto en el repo: `login-page.ts`/`register-page.ts` sí lo son, `store-seed.ts` navega directo. A favor de selectores directos: el picker ya expone `role="tablist"`/`role="tab"`/`role="tabpanel"` (`plan-picker.tsx:66,67,76,87`) y el form expone ids estables (`#store-owner`, `#store-payment-start`, `#store-is-active` — `store-form.tsx:185,223,238`).

### MODIFICADO — ninguno es un fichero de test

Se auditó cada uno leyendo sus call-sites. **Cero ficheros de test tocados**, así que no hay pedido de autorización pendiente por la regla innegociable del `CLAUDE.md`.

| Fichero | Naturaleza | Cambio | Consumidores existentes | Riesgo |
|---|---|---|---|---|
| `e2e/support/network-observer-core.ts:96` | módulo de soporte compartido | **Ensanchar** `export type ObserverSubject = 'registro' \| 'login'` para admitir el sujeto del nuevo observer | `network-observer.ts:130,138` (`'registro'`) y `login-network-observer.ts:231,284` (`'login'`) → y por la vía de las fixtures `auto: true` de `test.ts:58-74`, **los 5 specs existentes** | **Bajo, pero es un cambio a un export existente y va declarado.** Verificado por grep de `subject` en todo `e2e/support/`: el tipo se usa SOLO como tipo de parámetro y se interpola en un template string (`:118`). No hay ningún `switch` exhaustivo sobre él. Ambos consumidores son *productores* del valor, no consumidores del union, así que agregarle un miembro no rompe ni cambia su comportamiento. Alternativa que lo evita por completo: que el nuevo observer no use los helpers con `subject` (`wrongBackendMessage`, `resolveCapture`, `expectNoAttemptMessage`) y resuelva por su cuenta — a costa de perder el diagnóstico de backend equivocado. **Decide `sdd-design`.** |
| `e2e/support/auth-storage.ts` | módulo de soporte compartido | **Agregar** un `readBearerToken(page)` (hoy solo existe el mutador `mutateBearerToken`, `:97-102`) | `login.spec.ts:12`, `login-offline.spec.ts:6` — dos specs existentes | **Muy bajo**: puramente aditivo, ningún export existente cambia. El fichero ya tiene `TOKEN_KEY = 'token'` (`:23`) y ya documenta por qué es su propio fichero (`:12-16`). Alternativa: duplicar la constante en `store-fixture.ts`, con el mismo criterio de "regla de tres" que ese comentario invoca. **Decide `sdd-design`.** |
| `docs/testing/e2e-stage-1/S2-01.md:53-63` | documentación | Marcar las 11 casillas; actualizar `E2E frontend (Playwright)` de `PENDIENTE` a `CUBIERTO` (`:10,84-85`) | — | Nulo |
| `docs/testing/e2e-stage-1/README.md` | documentación | Fila de S2-01 (`:39`), totales (`:68`), párrafo "Playwright hoy" (`:88`), y el hallazgo nuevo de §5 | — | Nulo |
| `frontend-react/e2e/README.md` | documentación | Sección de la suite nueva + su costo (0 logins) | — | Nulo |

### NO MODIFICADO — y esto vale declararlo

**`e2e/support/test.ts` no se toca.** Es el fichero de más alto riesgo del directorio: lo importan los 5 specs existentes (`login.spec.ts:2`, `login-offline.spec.ts:1`, `register.spec.ts:1`, `register-rate-limit.spec.ts:1`, `login-rate-limit.spec.ts:1`) y sus fixtures `registerNetwork`/`loginNetwork` son `auto: true` (`test.ts:63,74`), o sea que cualquier error ahí cae sobre los 42 tests verdes de una sola vez.

No hace falta tocarlo porque **ya existe el precedente**: el tercer observer, `any-request-observer.ts`, **nunca se cableó como fixture**. Se instala dentro del propio spec, once per test — `login-offline.spec.ts:88,112,145,172,190,206,224,245,288,310,334`, con la razón escrita en `login-offline.spec.ts:14`. El cuarto observer sigue ese camino. Si `sdd-design` llegara a concluir que necesita ser fixture, eso convierte a `test.ts` en MODIFICADO compartido y **hay que declararlo explícitamente con su riesgo, no colarlo**.

## 5. Hallazgo a registrar: **H-15** — el backend no tiene candado de dirección única para el plan

El próximo número libre es **H-15** (`README.md` llega hasta H-14, `:288`, agregado el 2026-08-08).

**Hecho**: `UpdateStoreCommand.cs:69-106`, leído completo, tiene exactamente un guard de autorización — `IsSuperAdminOrOwnerAdmin` (`:71-72`) — y ninguna rama que compare el conjunto de módulos entrante contra el actual, ni que consulte `PaymentStartDate` para rechazar una bajada. Un OwnerAdmin puede degradar su propia tienda de plan pago a plan gratuito por API, cuantas veces quiera. Nada del `PUT` es idempotente-una-sola-vez.

**Consecuencia**: DG-7 es una garantía **exclusivamente de UI**. Su totalidad es que un `<button>` no se renderiza (`plan-picker.tsx:100`). Un `curl` con el token de un OwnerAdmin la esquiva por completo.

**Es la misma forma que H-10** (`README.md:240-252`, *"El backend permite que un OwnerAdmin cree tiendas; la única barrera es un accidente del frontend"*), con una diferencia que conviene no perder: en H-10 la barrera del frontend es **emergente** (un colapso de `??` que nadie diseñó); acá la barrera del frontend es **deliberada y documentada** (`plan-picker.tsx:9-15` explica el `readOnly` en prosa, `store-form.tsx:72-82` explica por qué el criterio se movió de `paymentStartDate` a `isOnPaidPlan`). Lo que falta no es intención: es la mitad de servidor de una intención que sí existe.

**La ironía que merece quedar escrita**: la ausencia de ese candado del lado servidor es *lo único que hace posible este test*. Si el backend implementara DG-7, Approach A dejaría de funcionar y S2-01 volvería a no tener precondición alcanzable — habría que crear una persona SuperAdmin (Approach C, hoy descartado). O sea que este cambio queda acoplado a un defecto. Eso va anotado en H-15, no escondido en un comentario del spec.

Este cambio **documenta** H-15; no propone arreglarlo. Cerrar el hueco de servidor es una decisión de producto con impacto en `UpdateStoreCommand`, no un item de cobertura de tests.

## 6. Los dos `⚠️ NO VERIFICADO` de la exploración: ambos RESUELTOS

**1) Nombre exacto de la clave del token en `localStorage` — RESUELTO.** `storage-keys.ts:4`: `TOKEN: 'token'`. Es la clave que `api-client.ts:37` lee para armar el header (`const token = StorageService.getTokenFromLocalStorage(); config.headers['Authorization'] = 'Bearer ' + token`, `:37-40`). La capa E2E ya la conocía: `auth-storage.ts:23` tiene `const TOKEN_KEY = 'token'`.

**Trampa a arrastrar**: `'token'` **no** es `AUTH_MODEL.authToken`. Son dos claves distintas y `AUTH_MODEL` tiene su clave prefijada por versión (`${GlobalConfig.APP_VERSION}-authf496fc5a9f17`, `storage-keys.ts:5`). El seeding necesita `'token'`, la plana, la única que el interceptor lee — está documentado en `auth-storage.ts:3-16` y `:90-96`.

**2) ¿`PUT /v1/stores/{id}` lleva `[EnableRateLimiting]`? — RESUELTO, negativo.** Leído `StoresController.cs` completo (183 líneas): **cero apariciones de `[EnableRateLimiting]` en todo el fichero**. La acción (`:93-103`) lleva solo los `[ProducesResponseType]` y hereda el `[HasPermission(SuperAdmin, StoresAdmin)]` de clase (`:27`). Tampoco lo aporta la base: `BaseApiController.cs:9-13` tiene `[ApiController]` y `[Route("api/v1/[controller]")]`, nada de rate limiting. Las dos únicas políticas definidas siguen siendo `LoginPolicy` y `RegisterPolicy` (`RateLimitPolicies.cs:15-35`), aplicadas solo en `AuthController.cs:27,102`.

Importa que sea del entorno correcto: bajo `Testing` el middleware ni se registra (**H-12**, `Program.cs:110,156`), pero Playwright corre contra `--launch-profile http` o sea Development, **donde el limitador sí está activo** — por eso el presupuesto de logins es real. La conclusión vale ahí: `PUT /v1/stores/{id}` no tiene cuota que agotar.

## 7. La columna vertebral del plan: el split 9/2

De las 11 aserciones de `S2-01.md:53-63`:

**9 son DOM-dado-el-estado.** Afirman qué renderiza la pantalla dado un `modules` determinado, y son insensibles a cómo se llegó a ese `modules`.

| # | Qué afirma | Ancla |
|---|---|---|
| 1 | Plan gratuito: el botón `STORES.PLAN.ACTIVATE` **se renderiza** — en la pestaña **no** seleccionada (`selected === tab` muestra `SELECTED`; el botón es la otra rama) | `plan-picker.tsx:97-106` |
| 2 | Elegir el pago sin guardar muestra `WILL_ACTIVATE_ON_SAVE` (`selected === tab && selected !== active`) | `plan-picker.tsx:108-110` |
| 3 | La badge `ACTIVE_BADGE` marca el plan **activo real** (`active`, derivado de módulos), no el seleccionado en curso | `plan-picker.tsx:24-25,70,79` |
| 6 | Ya en plan pago: el botón **no existe en el DOM** | `plan-picker.tsx:100` |
| 7 | Ya en plan pago: las tabs siguen clickeables y ningún click cambia la selección — `onChange` cuelga solo de `choosePlan` | `plan-picker.tsx:47-50,67,76,101` |
| 8 | `paymentStartDate` no se renderiza para OwnerAdmin (`isSuperAdmin && isEditMode`) | `store-form.tsx:217` |
| 9 | `isActive` no se renderiza para OwnerAdmin (`isSuperAdmin`) | `store-form.tsx:234` |
| 10 | El selector de dueño está deshabilitado en modo edición. **Verificado que SÍ se renderiza** para un OwnerAdmin: el bloque está gateado por `isAdminUser = isSuperAdmin \|\| isOwnerAdmin` | `store-form.tsx:69,179,188` |
| 11 | Fallo de carga → `STORES.ERROR` y el formulario **no se monta**: con `loadError` seteado hay `return` temprano antes de `<StoreForm>` | `edit-store.tsx:55-58,158-164` |

**2 exigen el round-trip real del guardado**, y no se pueden pinear sin perder justamente lo que afirman:

| # | Qué afirma | Ancla |
|---|---|---|
| 4 | Guardar emite `PUT /v1/stores/{id}` con `moduleIds` = **todos** (gratis + pagos) al elegir "pago". Es una aserción de **payload**: exige capturar el body saliente. `getPlanModuleIds(modules, 'paid')` devuelve `modules.map(m => m.id)` sin filtrar | `plan-picker.tsx:26-27,49`; `edit-store.tsx:122,129` |
| 5 | Tras guardar, la sesión se refresca vía `getUserByToken()` (dispara `GET /v1/auth/me` real) y se navega a `/management/stores` **sin recargar**: no hay `location.reload()` ni `window.location` en el camino | `edit-store.tsx:132-139` |

**Y esto es lo que el split NO significa.** Bajo Approach A, **las 11 se verifican contra estado real de servidor y base de datos** — el `modules` que las 9 observan es el que el servidor devolvió después de un `PUT` real, no un objeto que un test escribió a mano. El 9/2 describe **costo e instrumentación**, no rigor: las 9 solo necesitan la precondición sembrada más selectores; las 2 necesitan además el cuarto observer mirando la red. Ninguna de las 11 necesita un mock. Si en `sdd-design` alguien lee "9 son DOM-puro" como "9 se pueden hacer con `page.route()`", está leyendo mal el documento y pierde la propiedad que hace que este cambio valga: el `isOnPaidPlan` que el navegador computa sale de una fila que existe en PostgreSQL.

## 8. Alcance

### Dentro

| Ítem | Razón |
|---|---|
| Las 11 aserciones de UI de `S2-01.md:53-63` | Es el contrato de la US. Todas o ninguna: una US "PARCIAL" en Playwright ya existe dos veces (S1-01, S1-04) y cada una arrastra un item diferido |
| El helper de siembra `degradeStoreToFreePlan` | Sin él la US no tiene precondición alcanzable (§2). Se diseña reusable por S2-02 |
| El cuarto observer para `PUT /v1/stores/{id}` + `GET /v1/auth/me` | Es lo único que hace verificables las aserciones 4 y 5 |
| Aserción temprana y ruidosa de `user.featureIds ⊇ {73}` | Por H-8, el síntoma de una feature faltante es un `logout()` silencioso y un rebote a `/login` (`loaders.ts:16-19`), no un error legible. Se espeja la ruidosidad de `session.ts:164-171`, que ya hace exactamente esto para la feature hermana `Users = 72` |
| Documentar **H-15** y actualizar los estados de `docs/testing/e2e-stage-1/` | El hallazgo sale de este trabajo; el catálogo es donde vive |
| Leer los ids de módulos gratis del catálogo real (`GET /v1/modules/ToStore`, filtrado por `priceIncluded`) | Hardcodear los cuatro ids acopla la suite al seed. Si mañana cambia el catálogo, el test tiene que seguirlo, no contradecirlo |

### Fuera

| Ítem | Razón |
|---|---|
| **S2-02** (regresión DG-7 — el candado no puede volver a colgarse de `paymentStartDate`) | Misma precondición, US propia (`README.md:40`). El helper se diseña para que la reuse, pero su spec es otro cambio |
| Arreglar **H-15** (candado de servidor en `UpdateStoreCommand`) | Decisión de producto sobre código de producción, no cobertura de tests. Y §5: arreglarlo rompería este mismo test |
| Arreglar **H-1** (que el auto-registro otorgue módulos pagos) | Ídem: defecto de producto documentado, no de la suite. Se trabaja *alrededor*, con la vuelta declarada, no escondida |
| `plan-frontend.md` F-2..F-5 | Trabajo diferido con decisión propia pendiente (`README.md:11`) |
| Los 4 tests .NET de `S2-01-backend.md` (aserciones marcadas cubiertas sin test, `README.md:79`) | Capa distinta, plan propio |
| Modificar, borrar, renombrar o skipear cualquier test existente | Regla innegociable del `CLAUDE.md`. Auditado: nada lo requiere (§4) |
| Cablear el nuevo observer como fixture en `test.ts` | Innecesario por el precedente de `any-request-observer.ts` (§4). Si `sdd-design` lo revierte, se declara como shared MODIFICADO con su riesgo |
| Correr `dotnet` / la suite .NET | El backend lo corre el usuario; acá no hay uno disponible |
| PRs, push, slicing de entrega | Entrega es commits-only sobre `feat/e2e-playwright-store-plan-activation-s2-01`, un commit por unidad de trabajo |

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **La cadena de `featureIds` está trazada por lectura, no observada en vivo.** Ningún test (vitest, .NET, Playwright) asevera hoy que un OwnerAdmin auto-registrado tenga `73` en `featureIds`. Si falla, por H-8 el síntoma es un logout silencioso, no un error | Aserción explícita y temprana, con mensaje que nombre el módulo `Management`, la feature `Stores=73` y H-7/H-8 — como `session.ts:164-171`. Que la guarda hermana de `Users=72` nunca se haya disparado en las corridas verdes de S1-02/S1-04 es evidencia indirecta a favor, no una vista directa |
| R2 | **Acoplamiento a que `Management` (id 7) siga siendo `priceIncluded: true`** (`ModuleEntityTypeConfiguration.cs:97-105`). Si cambia, la degradación se lleva puesta la feature `Stores=73` y el test se desloguea a sí mismo | Misma aserción de R1: se dispara justo después de sembrar, antes de que el rebote a `/login` confunda el diagnóstico |
| R3 | **El seeding vía `PUT` directo puede leerse como "lo que haría un usuario"**, cuando es explícitamente un atajo de servidor | Comentario de cabecera en `store-fixture.ts` que lo diga en una frase, más H-15 como la razón por la que es posible. Precedente en el repo de sembrar fuera de la UI: `session.ts`, `roster-fixture.ts`, `store-seed.ts` |
| R4 | **Ensanchar `ObserverSubject`** toca un export de `network-observer-core.ts`, del que penden los 5 specs existentes | Verificado sin `switch` exhaustivo (grep de `subject` en `e2e/support/`), consumidores solo productores del valor. Declarado en §4 con su alternativa. `sdd-verify` debe re-correr los 42 |
| R5 | **La aserción 11 necesita un fallo de carga real** en alguno de los 3 del `Promise.all` (`edit-store.tsx:47-58`). Provocarlo sin mock es lo único de la US que no tiene camino obvio | A resolver en `sdd-design`. Es el único caso donde interceptar podría ser legítimo: la aserción es sobre el manejo de error del cliente, no sobre estado del servidor — y no depende del estado del plan |
| R6 | **Cuota de login si se corre dos veces en el mismo minuto**: 4 logins contra 5/min (`e2e/README.md:167-171`) | S2-01 agrega **cero** logins. El riesgo no crece, pero tampoco baja: el margen sigue siendo 1 |
| R7 | **Filas permanentes en la base `smca`** — la corrida ya deja 3 (`e2e/README.md:107-112`); acá se le muta el plan a una de ellas | Sin teardown alcanzable desde el navegador, igual que hoy. Documentar que la tienda de `owner-admin` termina en plan gratuito con `PaymentStartDate` no-nulo (estado *legacy*-like, y por eso útil) |
| R8 | Este cambio **depende de un defecto** (H-15). Si se arregla el backend, el spec deja de tener precondición | Escrito en H-15, no en un comentario del test. Approach C (persona SuperAdmin) queda documentado como la salida si eso pasa |

## 10. Postura de autorización

**No se pide ninguna.** Se auditaron los call-sites de todo lo que se propone tocar y **ningún fichero de test entra en el conjunto MODIFICADO** (§4). Los tres ficheros de soporte compartido en juego se resuelven así: `test.ts` no se toca (precedente de `any-request-observer.ts`); `auth-storage.ts` recibe solo un export nuevo; `network-observer-core.ts` recibe un miembro más en un union usado solo como tipo de parámetro, con la alternativa que lo evita del todo escrita al lado.

Si en `sdd-design` o `sdd-apply` aparece la necesidad de tocar un test existente —por cualquier razón, incluido "para que la suite quede verde"— la instrucción es **parar, nombrar el test, explicar por qué está en el camino, y preguntar**. Un E2E que falla es información, no un obstáculo.

## 11. Preguntas abiertas

Ninguna bloqueante. Tres decisiones quedan explícitamente delegadas a `sdd-design`, todas con sus alternativas y su evidencia ya en este documento:

1. **Aserción 11** (R5): cómo provocar el fallo de carga. Es el único punto de la US donde interceptar podría estar justificado, y por una razón distinta de la de las otras 10.
2. **`ObserverSubject`**: ensanchar el union (con el riesgo declarado en R4) o que el nuevo observer resuelva sin los helpers que llevan `subject`, resignando el diagnóstico de backend equivocado.
3. **Lectura del token**: agregar `readBearerToken` a `auth-storage.ts` o duplicar `TOKEN_KEY` en `store-fixture.ts` bajo la misma "regla de tres" que `auth-storage.ts:12-16` invoca.

Y una decisión menor de forma: el nombre del fichero de spec, que **no** debería ser `e2e/stores.spec.ts` porque `e2e/README.md:220` ya lo reserva para S2-03.
