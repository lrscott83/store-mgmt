# Diseño: cobertura Playwright para S2-01 (DG-7)

> Insumos: `proposal.md`, `explore.md`, `docs/testing/e2e-stage-1/S2-01.md`. Toda cita fue **re-verificada línea a línea en esta pasada**; donde el número de la propuesta se corrió, se corrige acá. Lo no verificado va marcado `⚠️ NO VERIFICADO`.

## 0. Hallazgo de diseño que cambia una aserción de la US: **H-16**

La propuesta (§7, fila 10) afirma que el selector de dueño **sí se renderiza** para un OwnerAdmin. **Es falso, y la cadena está verificada completa:**

| Paso | Evidencia |
|---|---|
| `edit-store.tsx:37` | `isOwnerAdmin = isSuperAdmin \|\| hasOwnersAvailableFeature(user)` — **no** usa el flag `user.isOwnerAdmin` |
| `authorization-service.ts:44-46` | `hasOwnersAvailableFeature = isUserAuthorized(user, [EFeatures.Owners], undefined)`; `Owners = 11` (`packages/domain/src/enums/index.ts:10`) |
| `authorization-service.ts:31` | rama OwnerAdmin: exige `user.featureIds.includes(11)` |
| `StoreRoleFeatures.cs:12-14` | `OwnersAdmin` es `[HasRoles(SuperAdmin, ReSeller)]` y **no** lleva `[HasModule]` |
| `AllowedFeaturesService.cs:41-47` | filtra por `GetRoles().Any(r => r == OwnerAdmin)` **y** `GetModuleType().HasValue` → `Owners` cae por las dos |
| `authorization-service.ts:35-38` (fall-through) | `user.roles[].featureIds` viene de `GetMeQuery.cs:73-81` → `StoreRoleFeatureRepository.cs:46` exige `storeModuleIds.Contains(srf.Feature.Module.Id)`; la feature `Owners` cuelga de `ModuleType.Administration` (`FeatureEntityTypeConfiguration.cs:57-60`), y `Administration` es `availableToStore: false` (`ModuleEntityTypeConfiguration.cs:34-41`), así que `StoreModuleRepository.cs:22` la excluye siempre |

⇒ Para la persona `owner-admin`, **`isOwnerAdmin === false`** y por lo tanto `isAdminUser === false` (`store-form.tsx:69`). Consecuencias:

1. **Aserción 10 es incorrecta como está escrita** (`S2-01.md:62`): el bloque de dueño está gateado por `isAdminUser` (`store-form.tsx:179`), así que **no se renderiza** — no es "deshabilitado". Gana el código. Se cubre en su forma verdadera (ausencia) y se corrige `S2-01.md:62`. La cobertura vitest de esa línea (`store-form.test.tsx:224-254`) pasa `isOwnerAdmin={true}` a mano: un mundo que la app no produce para esta persona — el patrón exacto que el `CLAUDE.md` desconfía.
2. **Dos defectos se cancelan, y eso salva el cambio**: `OwnersController.cs:18` es `[HasPermission(OwnersAdmin)]`, o sea 403 para un OwnerAdmin. Si `isOwnerAdmin` fuera `true`, `edit-store.tsx:52` llamaría `listOwners()`, axios rechazaría el 403 (`api-client.ts:98`), `Promise.all` caería en el `.catch()` de `:80-82` y `loadError` mataría 10 de las 11 aserciones. Es `false`, así que el tercer miembro es `Promise.resolve(success([]))` y **en modo edición solo salen 2 GET reales**.
3. `adminLoader` **sí** pasa: mira el flag `user.isOwnerAdmin` (`loaders.ts:101`), que viene de `_httpContextService.IsOwnerAdmin` (`GetMeQuery.cs:96`). Dos nociones distintas de "owner admin" en el mismo código — eso es H-16.

## 1. Decisiones (ADR)

### D1 — `degradeStoreToFreePlan`: 4 pasos, y el 4º es pinear la precondición

Elección: `e2e/support/store-fixture.ts` con `page.request` (`APIRequestContext`), token propio de la sesión.

1. `GET /v1/modules/ToStore` → `freeIds = catálogo.filter(priceIncluded).map(id)`, `paidIds`, `allIds`. **Nunca hardcodear los cuatro ids.**
2. `GET /v1/stores/{id}` → leer `name` (y `address`). **Obligatorio**: `UpdateStoreCommand.cs:81-82` sobreescribe Name/Address sin condición y `:78-79` rechaza nombre duplicado; el validador exige `Name` no vacío y `ModuleIds` no vacío (`UpdateStoreCommandValidator.cs:26-33`).
3. `PUT /v1/stores/{id}` con `{ id, name, address, description: null, approved: false, paymentStartDate: null, isActive: true, moduleIds: freeIds }`. Los cuatro campos de SuperAdmin se ignoran para un OwnerAdmin (`UpdateStoreCommand.cs:84-89`, `:100-101`) y `PaymentStartDate` queda intacto porque ninguna mitad de `:96` se cumple.
4. **Re-leer `GET /v1/stores/{id}` y tirar error ruidoso si el estado no es el que se acaba de escribir** — precedente `roster-fixture.ts:298-326`. Se verifica: (a) el conjunto de ids devuelto es **exactamente** `freeIds`; (b) `paymentStartDate` volvió **no-nulo** (lo que S2-02 necesita). **Trampa**: la verificación compara **ids contra el catálogo**, nunca el `priceIncluded` del DTO de la tienda — ese campo mapea el snapshot `ModulePriceIncluded` (`ModuleProfile.cs:25`), no el catálogo, que es lo que el frontend realmente usa (`edit-store.tsx:62-74` + `store-form.tsx:83`).

Devuelve `{ storeId, freeIds, paidIds, allIds, paymentStartDate }` — `allIds` es lo que la aserción 4 compara, derivado del catálogo. Reusable tal cual por S2-02.

### D2 — Lectura del token: `readBearerToken(page)` en `auth-storage.ts`

`StorageKeys.TOKEN = 'token'` (`storage-keys.ts:4`), la única clave que `api-client.ts:37` lee. `auth-storage.ts:23` ya tiene `TOKEN_KEY = 'token'` y el fichero existe precisamente para alojarla (`:12-16`). Agregar el getter es **puramente aditivo** (hoy solo hay el mutador `:97-102`). Rechazado: duplicar la constante en `store-fixture.ts` — sería la tercera copia de una clave cuyo fichero propio ya existe.

### D3 — `ObserverSubject`: se ensancha. Veredicto re-verificado

`grep subject` en todo `e2e/`: el tipo aparece solo como tipo de parámetro/campo (`network-observer-core.ts:116,161,190`) y se interpola en `:118`. Los dos consumidores (`network-observer.ts:130,138`, `login-network-observer.ts:231,284`) **solo producen** el literal. **Cero `switch`, cero `Record<ObserverSubject, …>`, cero mapeo exhaustivo.** Agregar `'tienda'` es aditivo y no puede cambiar el comportamiento de los 5 specs existentes. Se conserva el diagnóstico de backend equivocado.

### D4 — `store-network-observer.ts`: PUT (body) + `/me` + documentos

Sobre `network-observer-core.ts`, plantilla `login-network-observer.ts`.

- Suffix **parametrizado con el storeId** (`/v1/stores/${storeId}`) en vez de un regex: el spec ya conoce `signedInPage.selectedStoreId`, y así un PUT a otra tienda se detecta en vez de contarse.
- **El body se lee en el handler `page.on('request')` con `request.postData()`**, sincrónico, junto con el timestamp — mismo criterio que `login-network-observer.ts:184-197`: guardar la captura, nunca el trabajo de lectura, para después de la navegación.
- `/me` se duplica solo como **matcher de timestamps** para poder afirmar el orden causal `expectPutThenMe()`, espejo de `expectLoginThenMe()` (`login-network-observer.ts:242-274`). Rechazado: exponer timestamps desde `login-network-observer.ts` — es un fichero de soporte del que penden 5 specs vía fixture `auto: true` (`test.ts:63,74`); 4 líneas de matcher local cuestan menos riesgo. El **conteo** de `/me` se cruza con `loginNetwork.expectMeRequestCount(1)`, que ya existe (`:299-306`).
- **`markDocumentBaseline()` / `expectNoDocumentSince()`**: cuenta `request.resourceType() === 'document'`. Idea reusada de `login.spec.ts:539-555` (la instrumentación del flake T8). Hace falta la marca porque el observer se instala al principio del test y el `goto` inicial ya es un `document`.

Se instala **dentro del spec**, no en `test.ts` — precedente `any-request-observer.ts`, razón escrita en `login-offline.spec.ts:14-19`.

### D5 — Aserción 11: `route.abort()` sobre `GET /v1/modules/ToStore`

**Posición**: interceptar acá es legítimo y **no** es un mock. Un `abort()` **no fabrica ningún payload**: reproduce un mundo que la red produce todos los días. El precedente in-repo es explícito: `login.spec.ts:351` hace `page.route('**/v1/auth/me', route => route.abort())` con el comentario `:347-350` — *"la simulación honesta de 'el servidor no está' es cortar la petición en el origen"*.

Por qué **ese** endpoint: es el más angosto de los tres del `Promise.all` (`edit-store.tsx:49-53`), no toca el dato de la tienda, y su URL es inequívoca (aborta `**/v1/stores/*` y te llevás el PUT y el GET juntos). Por qué **abort** y no `fulfill(500)`: un 500 abre un Swal bloqueante (`api-client.ts:88-95`) que se interpondría; un abort cae en `!error.response` → `isNetworkError` → rechaza sin diálogo (`:79-82`).

**Qué prueba**: que un fallo de carga renderiza `STORES.ERROR` con `role="alert"` y **retorna antes** de montar `<StoreForm>` (`edit-store.tsx:158-164`) — vía el `.catch()` de `:80-82`.
**Qué NO prueba**: la rama `succeeded === false` con HTTP 200 (`:55-58`), que la aserción de la US cita. Alcanzarla exigiría fabricar un cuerpo de respuesta, o sea un mock de verdad. **Queda declarada como brecha**, no disfrazada.

### D6 — Aserción 5: la ausencia de recarga se mide, no se asume

`markDocumentBaseline()` antes del submit → submit → `waitForPutResponse()` → `waitForMeRequest()` → `page.waitForURL(/\/management\/stores$/)` → `expectNoDocumentSince()` (0 documentos) + `expectPutThenMe()` + `loginNetwork.expectMeRequestCount(1)`. Rechazado: afirmar sobre `location.reload()` por lectura de fuente — la app es la caja negra.

### D7 — Aserción 7: el negativo se prueba volviendo a la pestaña

`onChange` cuelga solo del botón ausente (`plan-picker.tsx:97-106`), así que no hay evento que observar. Los hechos observables, en orden:

1. Click en la pestaña gratis → `aria-selected="true"` se mueve a ella (`plan-picker.tsx:67`) y el panel cambia a la lista de módulos gratis (`:45,87-95`) ⇒ **la pestaña sí es clickeable**.
2. En ese panel **no** aparece `STORES.PLAN.SELECTED` ni el botón `ACTIVATE` (`:97-106`, `readOnly` true) y **no** aparece `WILL_ACTIVATE_ON_SAVE` (`:108-110`).
3. La badge `ACTIVE_BADGE` sigue en la pestaña paga (`:79-83`, `active` derivado de módulos).
4. **Se vuelve a la pestaña paga y `SELECTED` reaparece** ⇒ `selected` nunca se movió. Ése es el hecho observable que sustituye al `onChange`.

Rechazado: guardar y afirmar que el `moduleIds` del PUT no cambió — probaría lo mismo pero gasta un PUT extra y muta estado en medio del spec.

### D8 — Sin page object; nombre del spec

Selectores directos: el picker ya expone `role="tablist"/"tab"/"tabpanel"` (`plan-picker.tsx:66,67,76,87`) y el form ids estables (`#store-name`, `#store-owner`, `#store-payment-start`, `#store-is-active`). Precedente de navegar directo: `store-seed.ts`. Fichero: **`e2e/store-plan-activation.spec.ts`** — `e2e/stores.spec.ts` está reservado para S2-03 (`e2e/README.md:220`).

### D9 — Guarda temprana de `featureIds`

Se lee `JSON.parse(localStorage.currentUser).featureIds` (mismo objeto `UserModel` que `authorization-service.ts:31` evalúa, escrito por la app en `auth-store.ts:170,198`) **antes de navegar**, y se tira error nombrando `Management`, `Stores=73`, H-7/H-8 — ruidosidad espejo de `session.ts:164-171`. Ése es exactamente el valor que `featureGate` va a evaluar (`loaders.ts:65-77`), no un proxy.

**R2 baja de severidad**: entre la degradación y el guardado **ningún `/me` corre**, así que el guard nunca ve un `featureIds` recalculado sobre la tienda gratis. Que `Stores=73` sobreviva a la degradación queda **sin observar** — brecha declarada, no asumida.

## 2. Flujo

```
restore(owner-admin)  ──► currentUser.featureIds ⊇ {73}?  ── no ──► ERROR RUIDOSO (D9)
        │ sí
        ▼
degradeStoreToFreePlan(page, storeId)          [store-fixture.ts]
  GET /v1/modules/ToStore ─► free/paid/all ids
  GET /v1/stores/{id}     ─► name, address
  PUT /v1/stores/{id}     ─► moduleIds = freeIds        (servidor + PostgreSQL reales)
  GET /v1/stores/{id}     ─► ids === freeIds && paymentStartDate != null  ── no ──► ERROR
        ▼
goto /management/stores ─► 2 GET ─► merge ─► isOnPaidPlan=false ─► readOnly=false
        ▼
aserciones 1,2,3,8,9,10*   ──►  click ACTIVATE(paid) ──► submit
        ▼
PUT (body: moduleIds === allIds)  ─►  GET /v1/auth/me  ─►  /management/stores
        ▲                                                        │
   aserción 4                                    aserción 5: documents === 0
        ▼
recarga ─► ahora en plan pago ─► aserciones 6, 7
```

`*` aserción 10 en su forma corregida (ausencia), ver §0.

## 3. Ficheros

| Fichero | Acción | Qué |
|---|---|---|
| `frontend-react/e2e/support/store-fixture.ts` | Crear | `degradeStoreToFreePlan`, `readModuleCatalog`, `assertStoresFeature`. Cabecera que diga en una frase que es siembra de servidor, no flujo de usuario, y que es posible por H-15 |
| `frontend-react/e2e/support/store-network-observer.ts` | Crear | PUT (body + timestamps), `/me` (timestamps), contador de documentos |
| `frontend-react/e2e/store-plan-activation.spec.ts` | Crear | El spec, 11 aserciones |
| `frontend-react/e2e/support/auth-storage.ts` | Modificar (aditivo) | `readBearerToken(page)` |
| `frontend-react/e2e/support/network-observer-core.ts:96` | Modificar (aditivo) | `ObserverSubject` += `'tienda'` |
| `docs/testing/e2e-stage-1/S2-01.md` | Modificar | 11 casillas; `PENDIENTE`→`CUBIERTO` (`:10,84-85`); **corregir la aserción 10** (`:62`) |
| `docs/testing/e2e-stage-1/README.md` | Modificar | fila S2-01 (`:39`), totales (`:68`), "Playwright hoy" (`:88`), **H-15 y H-16** (último ocupado: H-14, `:288`) |
| `frontend-react/e2e/README.md` | Modificar | sección de la suite nueva + costo (0 logins) |
| `e2e/support/test.ts` | **NO se toca** | 5 specs lo importan, fixtures `auto: true` (`:63,74`) |

## 4. Contratos

```ts
// store-fixture.ts
export interface ModuleCatalog { freeIds: number[]; paidIds: number[]; allIds: number[] }
export interface FreePlanPrecondition extends ModuleCatalog {
  storeId: string;
  /** No-nulo por contrato — pineado en el paso 4. Es lo que S2-02 necesita. */
  paymentStartDate: string;
}
export function readModuleCatalog(page: Page): Promise<ModuleCatalog>;
export function degradeStoreToFreePlan(page: Page, storeId: string): Promise<FreePlanPrecondition>;
export function assertStoresFeature(page: Page): Promise<void>;

// store-network-observer.ts
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

// auth-storage.ts (aditivo)
export function readBearerToken(page: Page): Promise<string | null>;
```

## 5. Unidades de trabajo y gates

Un commit por unidad. **Casi todos los gates son del usuario**: a diferencia de S1-03, este spec **exige backend real** para 10 de las 11 aserciones (solo la 11 corre sin backend, y aun así necesita la sesión, que sí lo exige). Ninguna corrida de Playwright se ejecuta en esta sesión.

| # | Unidad | Gate | Quién |
|---|---|---|---|
| 1 | `ObserverSubject` += `'tienda'` + `readBearerToken` | `pnpm typecheck && pnpm lint` (desde `frontend-react/`) | yo |
| 2 | `store-fixture.ts` | `pnpm typecheck` | yo |
| 3 | `store-network-observer.ts` | `pnpm typecheck` | yo |
| 4 | Spec: aserciones 1,2,3,8,9,10 + guarda D9 | `pnpm exec playwright test e2e/store-plan-activation.spec.ts` con backend arriba | **usuario** |
| 5 | Spec: aserciones 4,5 | ídem | **usuario** |
| 6 | Spec: aserciones 6,7,11 | ídem | **usuario** |
| 7 | Docs (S2-01, README ×2, H-15, H-16) | — | — |
| 8 | No-regresión de los 42 | `pnpm test:e2e --force` con backend arriba | **usuario** |

Backend que el usuario levanta: `dotnet run --project backend/src/SMCA.WebApi --launch-profile http` (mensaje ya cableado en `network-observer-core.ts:133-137`). **Esperar un minuto entre dos corridas**: el margen sigue siendo de 1 login sobre 5/min (`e2e/README.md:167-171`); S2-01 agrega **cero** logins.

## 6. Alternativas rechazadas

| Alternativa | Por qué no |
|---|---|
| `page.route()` para sembrar el plan gratis | Precedente de mocks del `CLAUDE.md`; pierde las aserciones 4 y 5 (`explore.md:113`) |
| Persona SuperAdmin | Quinta credencial; la cadena de `featureIds` demuestra que no hace falta (`explore.md:114`) |
| Siembra a `localStorage` | `edit-store.tsx:49-53` es HTTP puro, no lee `localStorage` |
| Cablear el 4º observer en `test.ts` | 5 specs, fixtures `auto: true` (`test.ts:63,74`); precedente contrario en `login-offline.spec.ts:14-19` |
| Hardcodear los 4 ids gratis | Acopla al seed; el catálogo es la fuente |
| Timestamps de `/me` exportados desde `login-network-observer.ts` | Fichero compartido por 5 specs; 4 líneas locales cuestan menos |
| `fulfill(500)` para la aserción 11 | Swal bloqueante (`api-client.ts:88-95`) se interpone |
| Page object del plan picker | Roles ARIA + ids estables ya alcanzan; precedente `store-seed.ts` |

## 7. Riesgos y brechas declaradas

| # | Riesgo / brecha | Estado |
|---|---|---|
| G1 | La rama `succeeded === false` de `edit-store.tsx:55-58` **no** queda cubierta (D5) | Declarada |
| G2 | Que `Stores=73` **sobreviva** a la degradación no se observa: ningún `/me` corre en esa ventana (D9) | Declarada |
| R1 | **H-16 corrige una aserción de la US.** Si el usuario prefiere cubrir la forma "deshabilitado", eso exige la persona SuperAdmin (Approach C) | Reportado, no resuelto por mi cuenta |
| R2 | Ensanchar `ObserverSubject` toca un export compartido | Re-verificado seguro (D3); `sdd-verify` debe re-correr los 42 |
| R3 | La tienda de `owner-admin` queda con `PaymentStartDate` no-nulo y módulos pagos re-activos tras el spec; sin teardown alcanzable (`e2e/README.md:107-112`) | Documentar |
| R4 | El cambio **depende de H-15** (el backend no tiene candado de dirección única). Si se arregla, la precondición desaparece | Escrito en H-15 |
| ⚠️ | El `PUT` de siembra emitido por `page.request` comparte cookies/proxy del contexto pero **no** pasa por `apiClient`: el header `Authorization` se arma a mano. No verificado en vivo que el backend lo acepte por esa vía (es HTTP plano con Bearer, no hay razón para que no) | `⚠️ NO VERIFICADO` — se resuelve en el gate 4 |

## 8. Preguntas abiertas

Ninguna bloqueante. Nada exige tocar un test existente ni `test.ts`, así que **no se pide autorización**. Si en `sdd-apply` aparece la necesidad: parar, nombrar el test, explicar, preguntar.
