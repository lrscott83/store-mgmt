# Exploración: cobertura Playwright para S2-01 (DG-7 — OwnerAdmin activa el plan pago una sola vez)

> Fuente de la US: `docs/testing/e2e-stage-1/S2-01.md`. Toda cita lleva `archivo:línea`; donde no se pudo confirmar en código se marca `⚠️ NO VERIFICADO`.

## Estado actual

### El candado (DG-7)

```ts
const isOnPaidPlan = modules.some((m) => !m.priceIncluded && m.selected);  // store-form.tsx:83
<PlanPicker ... readOnly={!isSuperAdmin && isOnPaidPlan} />                // store-form.tsx:252
```

`readOnly` estructuralmente **no renderiza** el botón "Activar este plan" — `!readOnly && (<button onClick={() => choosePlan(tab)}>{t('STORES.PLAN.ACTIVATE')}</button>)` (`plan-picker.tsx:100-106`). `onChange` (que muta `moduleIds` en el padre) cuelga SOLO de ese botón (`plan-picker.tsx:47-50`); las pestañas (`role="tab"`, `plan-picker.tsx:67,76`) solo tocan `tab`/`setTab`, nunca `selected`/`onChange`. Verificado: no es "deshabilitado", es **ausente del DOM**.

### De dónde sale cada mitad de `isOnPaidPlan`

- `m.priceIncluded`: catálogo `GET /v1/modules/ToStore` → `GetAvailableModulesToStoreQuery` → `ModuleRepository.GetAvailableModulesToStore()` (`ModuleRepository.cs:17-24`, filtra `IsActive && AvailableToStore && Features.Any(IsActive && AvailableToStore)`). El merge del frontend (`edit-store.tsx:62-74`) solo pisa `currentPrice`/`price`/`discountText`, nunca `priceIncluded` — la suposición del merge se sostiene (ya cerrado como hueco #8 del catálogo).
- `m.selected`: pertenencia real de la tienda. `GET /v1/stores/{id}` incluye SOLO módulos activos: `.Include(s => s.StoreModules.Where(sm => sm.IsActive))` — confirmado por lectura directa, `StoreRepository.cs:73`.

### Guard de ruta

`edit-store.tsx:13`: `adminFeatureLoader([EFeatures.Stores])` → encadena `adminLoader()` (exige `isSuperAdmin || isOwnerAdmin`, `loaders.ts:96-105`) y LUEGO `featureGate([73])` (`loaders.ts:65-77,107-113`), que para un OwnerAdmin exige `user.featureIds.includes(73)` (`authorization-service.ts:31`). Sin esa feature, `denyAccess()` llama `logout()` y redirige a `/login` (`loaders.ts:16-19`) — no hay ruta `/unauthorized`. Coincide con H-7/H-8.

### Save path (aserción 5)

`edit-store.tsx:120-139`: `storeHttpService.updateStore(storeId, {...moduleIds: values.moduleIds...})` (PUT real) → `await getUserByToken()` (best-effort, catch silencioso) → `navigate('/management/stores')`, **sin** `location.reload()` ni `window.location`. `getUserByToken` dispara `GET /v1/auth/me` (`auth-store.ts:100-230`, mismo endpoint que el `ME_PATH_SUFFIX = '/v1/auth/me'` de `login-network-observer.ts`).

### Otros campos de la US, verificados

- `paymentStartDate` solo se renderiza con `isSuperAdmin && isEditMode` (`store-form.tsx:217`).
- `isActive` solo se renderiza con `isSuperAdmin` (`store-form.tsx:234`).
- Selector de dueño: `disabled={isLoading || isEditMode}` (`store-form.tsx:188`).
- Error de carga: `edit-store.tsx:158-164` — si `loadError` está seteado, renderiza `<p role="alert">{loadError}</p>` y hace `return` ANTES de montar `<StoreForm>` (las líneas 175-196 nunca se alcanzan). `loadError` se setea cuando falla `storeRes`/`modulesRes`/`ownersRes` (`edit-store.tsx:55-58`).

## Problema 1 — cómo obtener una tienda en plan gratuito (VEREDICTO)

**El auto-registro no sirve** (premisa contradicha, ya documentado como H-1): `RegisterCommand.cs:73,81-83` pasa TODOS los módulos disponibles (pagos incluidos) a `CreateStoreAsync`, así que `isOnPaidPlan` es `true` desde el nacimiento. Confirmado contra base real por `Billing/StoreCreationTrialTests.cs:359-361`.

**localStorage NO sirve**: `edit-store.tsx:47-101` carga `store`/`modules`/`owners` exclusivamente vía `Promise.all([storeHttpService.getStore(storeId), storeHttpService.getModulesToStore(), ...])` — cero lectura de `localStorage`. A diferencia de S1-03 (roster offline), esta pantalla es HTTP puro. Confirmado por lectura completa del `useEffect`.

**`page.route()` interceptando `GET /v1/stores/{id}` y `GET /v1/modules/ToStore`**: viable técnicamente, pero cae exactamente en el precedente que `CLAUDE.md` documenta ("mocks reproducían un mundo que la base de datos nunca produjo" — bug de `BillingService`/`FindAsync`). Para las aserciones que son puramente reacción del DOM a `modules` es aceptable como fallback de última instancia, pero NO para la aserción del payload del `PUT` ni la del refresco de sesión — esas necesitan que el store real detrás cambie.

**Degradar una tienda real vía `PUT /v1/stores/{id}` directo (RECOMENDADO)**: `UpdateStoreCommand.cs:71-72` solo exige `IsSuperAdminOrOwnerAdmin` — el backend **no tiene ningún guard de "una vez pago, no se puede volver"**; ese candado es puramente de UI (confirmado por lectura completa del handler, `UpdateStoreCommand.cs:69-106`). Un OwnerAdmin puede hacer `PUT` con `moduleIds` = solo los `priceIncluded` (catálogo real: `Sales=2`, `Inventory=3`, `Synchronization=4`, `Management=7` — `ModuleEntityTypeConfiguration.cs:42-105`, verificado uno por uno) y el handler:

- Desactiva (`IsActive=false`) los módulos pagos que ya no vienen en la lista (`UpdateStoreCommand.cs:108-131`, `storeModulesToDelete`).
- Deja `PaymentStartDate` **intacto** — no hay ninguna rama que lo anule; `UpdateStoreCommand.cs:96` solo lo *setea* si estaba `null` y viene un módulo pago, lo cual no aplica acá.
- El siguiente `GET /v1/stores/{id}` devuelve solo esos 4 módulos activos (todos `priceIncluded`) → `isOnPaidPlan` computa `false` en el frontend, **aunque `PaymentStartDate` siga no-nulo**. Esto CONFIRMA por lectura, no por herencia del doc, la afirmación de `S2-01.md:19` y H-5: el candado del frontend depende solo de `modules`, nunca de la fecha. Es también exactamente el escenario que S2-02 necesita.

Es un round-trip real contra el servidor real (no un mock), hecho con el token de la MISMA sesión ya autenticada (cero login extra) — responde las dos objeciones: evidencia real de servidor Y cero costo de cuota.

**Mecánica concreta para el `PUT`**: la app adjunta el Bearer token leyendo `StorageService.getTokenFromLocalStorage()` (`storage-service.ts:9-11`, clave `StorageKeys.TOKEN` — nombre exacto de la clave ⚠️ NO VERIFICADO en este barrido, resolver en `sdd-apply` leyendo `storage-keys.ts`) en un interceptor de request de axios (`api-client.ts:32-42`). Un test puede leer ese token con `page.evaluate()` y emitir el `PUT` con `page.request.put(...)` (`APIRequestContext` de Playwright, que comparte el proceso de red pero no pasa por `apiClient`) con ese header — sigue siendo HTTP real contra `E2E_API_URL`, no un mock de página.

**No hay persona SuperAdmin en `session.ts` hoy** — y no es necesaria bajo el approach recomendado: el propio OwnerAdmin puede degradar su tienda vía API directa, aunque la UI se lo impida vía `isOnPaidPlan`.

## Problema 2 — presupuesto de login (VEREDICTO)

**Hallazgo central: NO hace falta ninguna persona nueva ni login extra.** Rastreada la cadena completa de `user.featureIds`:

1. `GetMeQuery.cs:69-83`: `storeModuleIds = StoreBillingUtils.FilterForBilling(storeModules, billing)` — para status `NoAplica` (sin plan) o cualquier estado activo, devuelve TODOS los módulos activos de la tienda sin filtrar (`StoreBillingUtils.cs:53-59`); solo filtra a solo-`PriceIncluded` cuando está `Vencido`. En cualquier caso, el módulo `Management` (id 7, `priceIncluded: true`) sobrevive.
2. `AllowedFeaturesService.GetAllowedFeatureIdsByRoleAsync` (`AllowedFeaturesService.cs:41-49`) exige que `storeModuleIds` contenga `(int)roleFeature.GetModuleType()` para cada feature. La feature `Stores` (73) está anotada `[HasFeature(FeatureType.Stores)] [HasModule(ModuleType.Management)]` (`StoreRoleFeatures.cs:192-195`) — depende del módulo `Management`, que es GRATIS (`priceIncluded: true`, `ModuleEntityTypeConfiguration.cs:97-105`) y `AvailableToStore: true`.
3. `RegisterCommand.cs:81-83` le pasa a `CreateStoreAsync` TODOS los módulos disponibles — Management incluido — así que cualquier tienda auto-registrada (paga, o degradada a gratis después) tiene el módulo Management activo, y por lo tanto la feature `Stores=73` en `user.featureIds`.

**Conclusión**: la persona `owner-admin` que YA existe en `session.ts` (`createPersonaCache` → `mintOwnerAdmin`, `session.ts:197-227`) ya trae `featureIds` con `Stores=73` de fábrica, sin ningún paso extra. El presupuesto de **4 logins por corrida contra el techo de 5/min** queda intacto: S2-01 consume **CERO logins reales adicionales**, restaurando el snapshot `owner-admin` ya minteado (o minteándolo si es el primer test que lo toca en ese worker) y agregando solo un `PUT` sin rate limit (⚠️ NO VERIFICADO por lectura línea a línea de `StoresController.cs`; `RateLimitPolicies.cs:15-35` solo define `LoginPolicy`/`RegisterPolicy`).

⚠️ **Matiz de honestidad**: esta cadena está verificada por lectura completa, archivo por archivo, pero **ningún test existente (vitest, unitario de backend, o E2E) afirma explícitamente "un OwnerAdmin recién auto-registrado tiene `featureIds` conteniendo 73"** — es una inferencia de código, no una observación en vivo. El propio `session.ts:150-159` trata como riesgo real que un OwnerAdmin auto-registrado carezca de la feature hermana `Users=72` (mismo módulo `Management`, misma cadena de derivación) y falla ruidosamente si eso pasa (`createStoreUserViaUi`, `session.ts:161-183`). Que esa guardia nunca se haya disparado en las corridas verdes de S1-02/S1-04 —que sí usan `createStoreUserViaUi` vía la persona `store-user`— es evidencia indirecta a favor, pero no una vista directa de `featureIds=73` en particular.

**Recomendación para `sdd-apply`**: el primer test de S2-01 debería afirmar `user.featureIds` ANTES de asumir el resto, y si falla, el mensaje debe ser tan explícito como el de `session.ts:164-171`. Sin eso, por H-8, el síntoma sería un logout silencioso en vez de un mensaje claro.

## Split de las 11 aserciones — DOM-puro vs round-trip real

**DOM-dado-el-estado** (baratas, insensibles a CÓMO se obtuvo el estado):

1. Plan gratuito: botón `STORES.PLAN.ACTIVATE` se renderiza en la tab no seleccionada (`plan-picker.tsx:97-106`, `readOnly` falso).
2. Aviso `STORES.PLAN.WILL_ACTIVATE_ON_SAVE` al elegir plan pago sin guardar (`plan-picker.tsx:108-110`).
3. Badge `STORES.PLAN.ACTIVE_BADGE` en la pestaña activa real, no en la seleccionada (`plan-picker.tsx:24-25,70,79`).
6. Ya en plan pago: botón ausente del DOM (`plan-picker.tsx:100`).
7. Ya en plan pago: tabs clickeables pero `onChange` nunca dispara (`plan-picker.tsx:47-50,101`).
8. `paymentStartDate` no se renderiza para OwnerAdmin (`store-form.tsx:217`).
9. `isActive` no se renderiza para OwnerAdmin (`store-form.tsx:234`).
10. Selector de dueño deshabilitado en modo edición (`store-form.tsx:188`).
11. Error de carga → `STORES.ERROR`, formulario no se monta (`edit-store.tsx:55-58,158-164`) — esta SÍ necesita un round-trip fallido real (o interceptado) contra alguno de los 3 del `Promise.all`, pero no depende del estado de plan.

**Requieren round-trip real al servidor** (no se pueden pinear con `page.route()` sin perder la garantía que afirman):

4. Guardar emite `PUT /v1/stores/{id}` con `moduleIds` = TODOS (gratis+pagos) al elegir "pago" (`plan-picker.tsx:26-27,49` vía `getPlanModuleIds`). Es la aserción de PAYLOAD — exige capturar el body real del `PUT` saliente.
5. Tras guardar, refresco de sesión vía `getUserByToken()` (dispara `GET /v1/auth/me` real) y navegación a `/management/stores` sin reload (`edit-store.tsx:132-139`).

Total: **9 de 11 son DOM-dado-el-estado**, **2 de 11 exigen los dos round-trips reales del flujo de guardado**. Usando el `PUT` real recomendado para sembrar la precondición, las 11 se verifican contra servidor real — no hace falta ningún mock para ninguna.

## Qué ya existe vs qué es nuevo

**Reusable sin cambios**:

- `signedInPage` / persona `owner-admin` (`e2e/support/session.ts`, `e2e/support/test.ts`) — cubre autenticación, cero logins extra.
- `network-observer-core.ts` (`createOutcomeQueue`, `matchesPathSuffix`, `resolveCapture`, `wrongBackendMessage`, `backendUnreachableMessage`, `apiBaseMissingMessage`) — núcleo genérico ya extraído, listo para un cuarto observer.
- El patrón de `login-network-observer.ts` como plantilla directa para un `store-network-observer.ts` nuevo (captura `PUT .../v1/stores/{id}` + `GET .../v1/auth/me`, con un `waitFor...Response()` que exponga el body para afirmar `moduleIds`).

**Nuevo, a construir**:

- Un helper de siembra `degradeStoreToFreePlan(page, storeId)` que: lea el token de `localStorage`, llame `GET /v1/modules/ToStore` para obtener los ids `priceIncluded` reales (**nunca hardcodear los 4 ids** — mismo criterio que el resto de la suite de no escribir a mano lo que la app ya calcula), y haga `PUT /v1/stores/{id}` con esos ids. Candidato natural: `e2e/support/store-fixture.ts`.
- `store-network-observer.ts` (cuarto observer, sobre `network-observer-core.ts`) para las aserciones 4 y 5.
- El fichero de test en sí; no existe hoy. `frontend-react/e2e/README.md:220` sugiere `e2e/stores.spec.ts` como nombre para features de gestión de tiendas.
- Posible page-object del plan picker, o selectores directos (`role="tab"`, `role="tabpanel"`, texto de botón). Precedente mixto: `login-page.ts`/`register-page.ts` sí son page objects; `store-seed.ts` navega directo sin uno. A decidir en diseño.

**Relacionado, NO en este alcance**: S2-02 necesita exactamente la misma precondición (tienda con `PaymentStartDate != null` y módulos todos `priceIncluded`) para probar el caso de regresión. El helper `degradeStoreToFreePlan` debería diseñarse pensando en que S2-02 lo va a reusar.

## Approaches comparados

| Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|
| **A — `PUT /v1/stores/{id}` real para degradar, reusando `owner-admin`** (RECOMENDADO) | Cero login extra; servidor y base reales de punta a punta; cubre las 11 aserciones incluidas las 2 de round-trip; reusable por S2-02 | Requiere leer el token de `localStorage` y emitir el `PUT` fuera del flujo normal de UI: es seeding, no "lo que haría un usuario"; depende de que `Management` (id 7) siga siendo gratis | Medio |
| **B — `page.route()` interceptando los dos GET** | Cero dependencia de estado real de servidor; rápido de escribir | Cae en el precedente de `CLAUDE.md` (mocks que reproducen un mundo que la base nunca produjo); NO sirve para las aserciones 4 y 5; dos fuentes de verdad a mantener sincronizadas | Bajo, con cobertura incompleta |
| **C — Persona SuperAdmin nueva** | Estructuralmente limpio: usa el bypass explícito `readOnly={!isSuperAdmin && ...}` | No existe hoy ningún camino de login SuperAdmin en la suite; agrega una quinta credencial que, según el Problema 2, no hace falta | Alto e innecesario |
| **D — Seeding a `localStorage` estilo S1-03** | Cero red | Descartado por lectura: `edit-store.tsx` no lee `localStorage` para esta pantalla | Inviable |

## Recomendación

Enfoque **A**: reusar la persona `owner-admin` existente, degradar su tienda a plan gratuito con un `PUT /v1/stores/{id}` real (token de la propia sesión, `moduleIds` = catálogo real filtrado por `priceIncluded`) como paso de precondición antes de navegar a `/management/stores`, y construir `store-network-observer.ts` sobre `network-observer-core.ts` para capturar el `PUT` de guardado y el `GET /v1/auth/me` posterior. Las 9 aserciones DOM-dado-el-estado se verifican directamente sobre el resultado de ese seeding, sin instrumentación adicional.

## Riesgos

- El seeding vía `PUT` directo (fuera de la UI) es una decisión de diseño que un lector futuro podría confundir con "lo que el usuario haría" — hay que documentar explícitamente que es un paso de precondición, no una aserción de negocio.
- Acoplamiento a que el módulo `Management` (id 7) siga siendo `priceIncluded: true` en el seed. Si cambia, la feature `Stores=73` deja de estar garantizada y el propio guard de ruta (H-7/H-8) **desloguea el test en vez de fallar con un mensaje claro**. Mitigar con una aserción temprana y explícita de `featureIds`, igual que `createStoreUserViaUi` ya hace para `Users=72`.
- Ningún test hoy afirma en vivo que el `featureIds` de un OwnerAdmin recién registrado contiene `73` — es inferencia de código, aunque trazada completa.
- `PUT /v1/stores/{id}` no tiene rate limit conocido, pero eso ⚠️ NO se verificó leyendo `StoresController.cs` línea a línea.
- Tocar un test EXISTENTE nunca está en alcance sin autorización explícita. Esta exploración no propone tocar ninguno; todo lo descrito es aditivo.

## Preguntas abiertas

1. **¿El seeding vía `PUT` directo con el token de la sesión (salteando la UI) es aceptable como precondición de test?** Es la única vía viable para llegar a "plan gratuito" desde una tienda auto-registrada sin login extra ni mocks — pero es explícitamente un atajo de servidor, no un flujo de usuario. **RESUELTA por el orquestador: sí.** Es un round-trip real contra servidor y base reales, cuesta cero logins, cubre las 11 aserciones, y el repo ya tiene precedente de sembrar fuera de la UI (`session.ts`, `store-seed.ts`). Las alternativas pierden cobertura (B) o agregan una credencial innecesaria (C).
2. Ninguna de las 11 aserciones de S2-01 requiere tocar un test existente — no hay pregunta de autorización pendiente para esta US.
3. ¿Se verifica en vivo la cadena de `featureIds` como parte de S2-01, o se acepta la inferencia de código? **RESUELTA por el orquestador: se verifica en vivo**, con una aserción temprana y un mensaje de fallo explícito. Una inferencia de código que ningún test observa es exactamente lo que el `CLAUDE.md` de este repo desconfía.

## Hallazgo candidato para el catálogo

El backend **no tiene ningún candado de dirección única** para el plan: `UpdateStoreCommand.cs:69-106` solo exige `IsSuperAdminOrOwnerAdmin`, así que un OwnerAdmin puede degradar su tienda de pago a gratis por API, aunque la UI se lo impida estructuralmente (`plan-picker.tsx:100`). DG-7 es, en el servidor, una garantía inexistente. Es la misma forma que H-10 (el backend permite lo que la UI bloquea) y merece su propia entrada en `docs/testing/e2e-stage-1/README.md`.
