# E2E coverage — catálogo web y pedidos (backend)

**Objetivo:** suite E2E completa de los 33 endpoints de los módulos 18 (Catálogo Web),
19 (Pedidos WhatsApp) y 20 (Gestión de pedidos), añadiendo SOLO tests nuevos.
**Rama:** trabajo local sobre la rama actual.
**Runner:** `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
(PostgreSQL real en `localhost:5432`, base `smca_test`).

## Specs

- **S1** — Cubrir con tests E2E de backend *"todo lo de los catálogos web y los pedidos"*:
  los 33 endpoints del plan `docs/plans/2026-10-11-api-endpoint-review-catalogo-pedidos.md`
  (9 unidades: `CatalogController`, `CatalogBrandingController`, `CatalogShowcaseController`,
  `PublicCatalogController`, `OnlineOrderingController`, `OnlineOrdersController`,
  `DeliveryDriversController`, `PublicOrderingController`, y las 2 acciones `catalog-template`
  de `StoresController`).
- **S2** — *"que no esten ya implementados"*: nada que ya esté cubierto por un E2E existente se
  duplica. La matriz de cobertura de abajo es la fuente de verdad y cita el archivo que cubre.
- **S3** — *"cubrir todos esos endpoints al 100%"*: se considera cubierto un endpoint cuando
  existe al menos un E2E que (a) ejerce su camino feliz contra PostgreSQL real y (b) afirma su
  guarda principal (authz, aislamiento por tienda o validación de entrada). Un endpoint con solo
  un `ProducesResponseType` o un unit test con mocks NO cuenta.
- **S4** — *"Revisa bien en el codigo fuente"*: cada caso se deriva del handler/controlador leído,
  no de la descripción del plan de auditoría. Donde el plan y el código discrepan, manda el código.
- **S5** — Regla del repo (`AGENTS.md`): solo se **añaden** E2E; no se modifica ningún test ni
  support file existente, ni código de producción backend.
- **S6** — `api-endpoint-tests` declara en su contrato que NO sirve para E2E de app completa; se
  reutilizan de ella la estructura de 4 categorías (Happy / Edge / Error / Integración), el naming
  `{Action}_{Scenario}_{Expected}` y la regla "leer la implementación antes de escribir el test".
  El harness (xUnit + `WebAppFixture` + PostgreSQL real + FluentAssertions) es el del repo.

## Matriz de cobertura (verificada contra el código, 2026-11-03)

| # | Endpoint | Estado | Evidencia |
| --- | --- | --- | --- |
| 1.1 | `POST /catalog/sync` | cubierto | `Catalog/WebCatalogSyncTests.cs` |
| 1.2 | `GET /catalog/status` | cubierto | `Catalog/WebCatalogSyncTests.cs`, `WebCatalogModuleGatingTests.cs` |
| 1.3 | `GET /catalog/products` | cubierto | `Catalog/WebCatalogProductFieldsTests.cs` |
| 1.4 | `PUT /catalog/products/{id}` | cubierto | `Catalog/WebCatalogProductFieldsTests.cs` |
| 1.5 | `POST /catalog/products/{id}/images` | cubierto | `Catalog/WebCatalogImagesTests.cs` |
| 1.6 | `DELETE /catalog/products/{id}/images` | cubierto | `Catalog/WebCatalogImagesTests.cs` |
| 1.7 | `PUT /catalog/products/{id}/images/order` | cubierto | `Catalog/WebCatalogImagesTests.cs` |
| 2.1 | `GET /catalog/branding` | cubierto | `Catalog/WebCatalogBrandingTests.cs` |
| 2.2 | `PUT /catalog/branding` | cubierto | `Catalog/WebCatalogBrandingTests.cs` |
| 3.1 | `GET /catalog/showcase` | cubierto (nuevo) | `Catalog/ShowcaseEndpointsE2ETests.cs`. Ojo: las rutas de SuperAdmin (`/stores/{id}/catalog/showcase`) y el repositorio ya tenían E2E; la ruta de SESIÓN no. |
| 3.2 | `POST /catalog/showcase` | cubierto (nuevo) | `Catalog/ShowcaseEndpointsE2ETests.cs` (binding multipart por la ruta de sesión) |
| 3.3 | `DELETE /catalog/showcase/{id}` | cubierto (nuevo) | `Catalog/ShowcaseEndpointsE2ETests.cs` |
| 3.4 | `PUT /catalog/showcase/order` | cubierto (nuevo) | `Catalog/ShowcaseEndpointsE2ETests.cs` |
| 4.1 | `GET /public/catalog/{slug}` | cubierto | `Catalog/WebCatalogPublicApiTests.cs` |
| 4.2 | `GET /public/catalog/{slug}/products` | cubierto | `Catalog/WebCatalogPublicApiTests.cs` |
| 4.3 | `GET /public/catalog/{slug}/products/{id}` | cubierto | `Catalog/WebCatalogPublicApiTests.cs` |
| 4.4 | `GET /public/catalog/{slug}/media/{**key}` | cubierto | `Catalog/WebCatalogImagesTests.cs` |
| 5.1 | `GET /online-ordering/settings` | cubierto (nuevo) | `Orders/OnlineOrderingSettingsE2ETests.cs`; el gating de ruta sigue en `OrderingSettingsRouteAuthE2ETests.cs` |
| 5.2 | `PUT /online-ordering/settings` | cubierto (nuevo) | `Orders/OnlineOrderingSettingsE2ETests.cs` |
| 6.1 | `GET /online-orders` | cubierto (nuevo) | `Orders/OnlineOrdersManagementE2ETests.cs` |
| 6.2 | `GET /online-orders/{id}` | cubierto (nuevo) | `Orders/OnlineOrdersManagementE2ETests.cs` |
| 6.3 | `GET /online-orders/stats` | cubierto (nuevo) | `Orders/OnlineOrdersManagementE2ETests.cs` |
| 6.4 | `PATCH /online-orders/{id}/status` | cubierto (nuevo) | `Orders/OnlineOrdersManagementE2ETests.cs` |
| 6.5 | `PATCH /online-orders/{id}/payment` | cubierto (nuevo) | `Orders/OnlineOrdersManagementE2ETests.cs`; `OrderPaidAtE2ETests.cs` sigue fijando `PaidAt` |
| 6.6 | `PATCH /online-orders/{id}/driver` | cubierto (nuevo) | `Orders/OnlineOrdersManagementE2ETests.cs` |
| 7.1 | `GET /delivery-drivers` | cubierto | `Orders/DeliveryDriverPartialUpdateE2ETests.cs` (ambos `activeOnly`) |
| 7.2 | `POST /delivery-drivers` | cubierto (nuevo) | `Orders/DeliveryDriverCreateE2ETests.cs` |
| 7.3 | `PATCH /delivery-drivers/{id}` | cubierto | `Orders/DeliveryDriverPartialUpdateE2ETests.cs` |
| 8.1 | `GET /public/ordering/{slug}/config` | cubierto (nuevo) | `Orders/PublicOrderingConfigE2ETests.cs` |
| 8.2 | `POST /public/ordering/{slug}/orders` | cubierto (nuevo) | `Orders/PublicOrderingCreateE2ETests.cs`; el 429 sigue en `PublicOrderingRateLimitE2ETests.cs` |
| 8.3 | `GET /public/ordering/{slug}/orders/{code}` | cubierto | `Orders/PublicOrderingReadE2ETests.cs` |
| 9.1 | `GET /stores/{storeId}/catalog-template` | cubierto (nuevo) | `Stores/CatalogTemplateE2ETests.cs` |
| 9.2 | `PUT /stores/{storeId}/catalog-template` | cubierto (nuevo) | `Stores/CatalogTemplateE2ETests.cs` |

## Tasks

- **T1** — HECHO `9197827c` · Unidad 9 — `GET`/`PUT catalog-template`: default sin fila, escritura
  parcial (no toca pedidos/marca), contrato kebab-case, SuperAdmin-only. → `Stores/CatalogTemplateE2ETests.cs`
- **T2** — HECHO `9197827c` · Unidad 8 — `GET config`: flags de pedidos, flags de módulo 19/20,
  WhatsApp, defaults de plantilla/paleta/columnas, 404 uniforme de slug, slug case-insensitive,
  tienda con pedidos cerrados devuelve 200/`Enabled=false`. → `Orders/PublicOrderingConfigE2ETests.cs`
- **T3** — HECHO `9197827c` · Unidad 8 — `POST orders`: alta feliz con precio del catálogo (no del
  cliente), el `storeSlug` del cuerpo no redirige, producto inexistente / carrito vacío / cantidad
  0 → 400 y sin filas. → `Orders/PublicOrderingCreateE2ETests.cs`
- **T4** — HECHO `9197827c` · Unidad 7 — `POST delivery-drivers`: alta activa, trim, validaciones,
  `storeId` del cuerpo ignorado, anónimo 401. → `Orders/DeliveryDriverCreateE2ETests.cs`
- **T5** — HECHO `9197827c` · Unidad 6 — listado (paginación/filtros), detalle (404 cross-store),
  stats, `PATCH status`, `PATCH payment` (incluida la invariante entregado⇒pagado), `PATCH driver`
  (asignar/rechazar ajeno), anónimo 401. → `Orders/OnlineOrdersManagementE2ETests.cs`
- **T6** — HECHO `9197827c` · Unidad 5 — `GET`/`PUT online-ordering/settings`: defaults sin fila,
  alta con trim y null de texto en blanco, rechazo sin WhatsApp y sin modalidad. →
  `Orders/OnlineOrderingSettingsE2ETests.cs`
- **T7** — HECHO `9197827c` · Auditoría de unidades 1-4: el resto ya estaba cubierto por suites
  preexistentes; el único hueco demostrado fue la ruta de sesión del showcase, cerrado con
  `Catalog/ShowcaseEndpointsE2ETests.cs`.
- **T10** — HECHO · Superficie de catálogo web (fuera del recuento de 33, dentro del alcance pedido)
  — `AdminCatalogBrandingController` (2 endpoints):
  401 anónimo, nada-que-actualizar, `mobileColumns` fuera de rango **y dentro de rango**, archivo+`remove*`, tipo,
  2 MB exactos aceptados y >2 MB rechazado, tienda inexistente, y borrado parcial que conserva el
  otro lado. → `Catalog/AdminBrandingEndpointRulesE2ETests.cs` (9 métodos, 11 casos)
- **T11** — HECHO · Superficie de catálogo web (fuera del recuento de 33, dentro del alcance pedido)
  — `AdminCatalogShowcaseController` (4 endpoints):
  401 anónimo en los 4, tope de 10 por conjunto, `kind` inválido, sin archivo, `caption` de 200
  aceptado y >200 rechazado, tipo
  no permitido, lectura cross-store vacía, borrado de un id real de otra tienda, y la teoría de
  reordenado (vacío/subconjunto/duplicado/inventado/otro conjunto/otra tienda) con el orden
  persistido intacto. → `Catalog/AdminShowcaseEndpointRulesE2ETests.cs` (8 métodos + teoría de 7
  casos = 15 casos)

## Superficies adicionales de catálogo web — mapa verificado 2026-11-04

Cuatro controladores quedan fuera del recuento de 33 endpoints del plan, pero **son superficie de
catálogo web igual** y entran en el alcance de este feature (corrección del Owner, L11).

El plan de auditoría define **33 endpoints** en 9 unidades; estos **cuatro** controladores quedan
fuera de esa cuenta. El mapa se levantó con `codegraph_explore` + lectura dirigida, no con la
documentación.

**`AdminCatalogController`** — 11 acciones, `[HasPermission(SuperAdmin)]` + `[AdminStoreScope]`
(`AdminCatalogController.cs:34-36`). Cobertura existente: **11/11 con camino feliz y guarda 403**
(`AdminCatalogCreateTests`, `AdminCatalogImportTests`, `AdminWebCatalogTests`,
`AdminWebCatalogCrudTests`, `AdminWebCatalogScopeProbes`).

**`PublicCatalogEventsController`** — 1 acción anónima, `PublicCatalogPolicy` + 16 KB
(`PublicCatalogEventsController.cs:18-26`). Camino feliz en `CatalogTelemetryE2ETests.cs:35-73`.

### Gaps cerrados (2026-11-04)

- **T8 — HECHO** · `Catalog/AdminCatalogImageRulesE2ETests.cs` (6 tests): 7º archivo → 400 con la
  galería en 6; archivo >2 MB → 400 sin fila; tipo no permitido → 400 sin fila; reordenado con
  subconjunto y con path duplicado → 400 **y** orden persistido intacto; `DELETE` de un path que no
  está en la galería → 404 conservando la fila. Hallazgo al leer el handler: el tope de 6 se evalúa
  **antes** de validar el archivo (`AddProductImageCommand.cs:68-71`), así que el 7º upload reporta
  el límite aunque el archivo también fuera inválido — el test usa un JPEG válido por eso.
- **T9 — HECHO** · `Catalog/CatalogTelemetryRulesE2ETests.cs` (6 tests): slug inexistente y UA de
  bot → 204 sin escribir (con control positivo en el mismo slug); `name` fuera de la allowlist
  ignorado; `productId` de otra tienda guardado **sin** atribución (y control de que ese GUID sí
  publica en su tienda); lote de 12 → solo cuentan 10; cuerpo que no liga → **400** (el único
  camino distinto de 204, lo produce el binding antes del handler). Cada caso lleva control
  positivo para no pasar por vacío.
  Hallazgos: `PageViews` cuenta solo `PageView`, mientras `Visits`/`Visitors` cuentan hashes
  distintos de cualquier evento; el `Take(10)` se aplica **antes** del filtro de nulos.

### T10 — Superficie admin de branding y showcase (6 endpoints, 2026-11-04)

Los dos controladores SuperAdmin de marca y escaparate quedaron sin matriz endpoint por endpoint.
`AdminWebCatalogCrudTests` los ejercita con camino feliz suelto (branding `:141-174`, showcase
`:177-222`) y `AdminWebCatalogScopeProbes` cubre el 403 de los 13 endpoints y la escritura de marca
cruzada. Eso NO es la matriz: era superficie de catálogo web igual, solo que en otro controlador.

**Guardas comunes** (`AdminCatalogBrandingController.cs:20-22`, `AdminCatalogShowcaseController.cs:21-23`):
`[HasPermission(StoreRoleFeatures.SuperAdmin)]` + `[AdminStoreScope]`. Anónimo → **401**
(`HasPermissionAttribute.cs:80-81`), no-SuperAdmin → **403** (`AdminStoreScopeAttribute.cs:45-49`).
`AdminStoreScopeFilter` **valida el GUID pero no la existencia de la tienda**: solo publica el id
(`AdminStoreScopeAttribute.cs:54-58`); el 404 de tienda inexistente lo produce únicamente
`PUT branding` (`UpdateStoreCatalogBrandingCommand.cs:102-104`).

| # | Endpoint | Camino feliz | 401 anónimo | 403 no-SA | Aislamiento cross-store | Reglas / bordes |
| --- | --- | --- | --- | --- | --- | --- |
| 10.1 | `GET .../catalog/branding` | ✅ CRUD `:141` | ✅ T10 | ✅ Probes `:44` | ✅ Probes `:92` | defaults sin fila ✅; normalización de paleta vacía y `MobileColumns` fuera de rango **no fijadas** (ver Descartado) |
| 10.2 | `PUT .../catalog/branding` | ✅ CRUD `:141` | ✅ T10 | ✅ Probes `:44` | ✅ Probes `:92` | ✅ T10: nada-que-actualizar, `mobileColumns` fuera de rango, archivo+`remove*`, tipo no permitido, >2 MB (con control positivo), tienda inexistente 404, y borrado parcial que conserva el banner |
| 10.3 | `GET .../catalog/showcase` | ✅ CRUD `:177` | ✅ T11 | ✅ Probes `:44` | ✅ T11 | nunca 404: las dos listas siempre presentes ✅ |
| 10.4 | `POST .../catalog/showcase` | ✅ CRUD `:177` | ✅ T11 | ✅ Probes `:44` | ✅ (la tienda sale de la ruta; el filtro es el único alcance) | ✅ T11: tope **10 por (tienda, conjunto)** con el otro conjunto aceptando, `kind` inválido, sin archivo, `caption` >200, tipo no permitido |
| 10.5 | `DELETE .../catalog/showcase/{id}` | ✅ CRUD `:177` | ✅ T11 | ✅ Probes `:44` | ✅ T11 (id real de otra tienda) | ✅ T11: 404 conservando la fila ajena |
| 10.6 | `PUT .../catalog/showcase/order` | ✅ CRUD `:177` | ✅ T11 | ✅ Probes `:44` | ✅ T11 | ✅ T11: vacío, subconjunto, duplicado, inventado, otro conjunto, otra tienda y `kind` inválido → 400 con el orden persistido intacto |

Reglas verificadas en el código, no en el plan:

- **Tope de showcase**: `StoreCatalogImage.MaxImagesPerKind = 10` (`StoreCatalogImage.cs:36`), **por
  conjunto**, no global. Se evalúa dos veces en `POST`: rechazo temprano
  (`AddStoreCatalogImageCommand.cs:100-107`) y comprobación autoritativa dentro de la transacción
  con `AcquireSetLockAsync` (`:129-139`). Es **400**, nunca 429.
- **Reordenado**: `sameSet` = mismo conteo **y** sin duplicados **y** todo id vigente presente
  (`ReorderStoreCatalogImagesCommand.cs:81-83`) — una sola comprobación cubre lista incompleta,
  duplicados, ids inventados, ids del otro conjunto y ids de otra tienda. **No escribe nada antes**
  de pasar la comprobación (`:91-101`).
- **Borrado cross-store**: decidido en el repositorio por `(id, storeId)` →
  **404** `ShowcaseImageNotFound` (`RemoveStoreCatalogImageCommand.cs:69-72`), nunca 403 ni 200.
- **Marca**: sin fila → **200 con defaults**, nunca 404 (`GetStoreCatalogBrandingQuery.cs:63-69`);
  `mobileColumns ∉ {1,2}` → **400** al escribir (`UpdateStoreCatalogBrandingCommandValidator.cs:42-46`)
  pero se **normaliza a 2 en silencio al leer** (`GetStoreCatalogBrandingQuery.cs:91-92`);
  `removeX=true` + archivo del mismo lado → **400** (`:51-59`).
- **Límites de archivo**: jpg/jpeg/png/webp e imagen/jpeg|png|webp, máx. 2 MB, mismas reglas que
  las imágenes de producto (`CatalogImageUploadRules.cs:23-36`). El `RequestSizeLimit` de los
  controladores está por encima (2×2 MB+128 KB en marca, 2 MB+64 KB en showcase), así que el
  archivo sobredimensionado llega al validador y responde **400**, no 413.

### Descartado a propósito, con motivo

- **429 de telemetría**: `PublicCatalogPolicy` es un cubo de 120/min por IP **compartido por todo el
  suite** (`RateLimitPolicies.cs:88-97`); un test de 429 contamina el resto. El repo ya lo evita
  (`SiteTelemetryE2ETests.cs:22-24`).
- **`GET /catalog/products|categories` con `storeId` inexistente**: devuelven 200 con lista vacía
  (`GetCatalogProductsQuery.cs:40-44`). Es una asimetría frente al 404 de `status` que huele a
  defecto; fijarla en un test bloquearía el arreglo.
- **409 `ShowcaseSetBusy` de `POST showcase`** (`AddStoreCatalogImageCommand.cs:158-165`): exige dos
  subidas concurrentes al mismo (tienda, conjunto) agotando el `AcquireSetLockAsync`. Es una prueba
  de concurrencia real, no determinista en este harness; se deja como deuda explícita.
- **`GET branding|showcase` con un `storeId` inexistente devuelve 200**: `AdminStoreScopeFilter` no
  valida la existencia de la tienda, así que la lectura responde defaults/listas vacías mientras
  `PUT branding` sí da 404. Asimetría que huele a defecto: **no se fija en un test** para no bloquear
  el arreglo; queda anotada aquí.
- **Asimetría de tenant en `POST showcase`** (hallazgo del explorer, no fijado): el showcase toma
  `TenantId` del **claim** del llamador (`AddStoreCatalogImageCommand.cs:82`) mientras la marca lo
  toma de la **fila de la tienda** (`UpdateStoreCatalogBrandingCommand.cs:102-106`). Un SuperAdmin
  cuyo claim de tenant difiera del de la tienda de la ruta escribiría la clave bajo el prefijo
  equivocado. Es código de producción: fuera del alcance permitido (solo tests nuevos), anotado para
  el Owner.
- **`CatalogImageUploadRules` acepta un archivo si CUALQUIERA de las dos señales está permitida**
  (hallazgo de T11, no fijado): `if (!extensionAllowed && !contentTypeAllowed)`
  (`CatalogImageUploadRules.cs:23`). La conjunción `&&` deja pasar `nota.txt` con `image/jpeg` y
  `logo.jpg` con `text/plain`, es decir, la lista de content types no se aplica cuando el nombre
  tiene extensión válida (y viceversa). Es una **posible erosión de la allowlist** en código de
  producción compartido por marca, showcase e imágenes de producto: se reporta, no se parchea ni se
  fija en un test. Pinchar cualquiera de los dos comportamientos bloquearía el arreglo.

## Log

- **L1 (2026-11-03, verbatim)** — *"lo que quiero es hacer una suite completa de tests e2e en el
  backend de catalgo web y pedidos que no esten ya implementados para cubrir todos esos endpoints
  al 100%. Dale con un ODD para todo eso. Revisa bien en el codigo fuente y usa el skill requerido
  para eso para que no asumas nada de nada"*
- **L2 (2026-11-03)** — Reconocimiento hecho: inventario de 33 endpoints desde los atributos de
  ruta + inventario de 190 archivos E2E con conteo de `[Fact]/[Theory]`. Huecos demostrados en
  unidades 5, 6, 7 (`POST`), 8 (`config` y alta feliz) y 9. Descartado duplicar unidades 1-4.
- **L2b (2026-11-03)** — La auditoría de las unidades 1-4 encontró un hueco más, no previsto en
  L2: la ruta de SESIÓN del showcase (`/api/v1/catalog/showcase` GET/POST/DELETE/order) no tenía
  ningún E2E; lo que existía cubría las rutas de SuperAdmin y el repositorio. Corregido en T7.
- **L3 (2026-11-03)** — **T1–T7 HECHOS** en `9197827c` (8 archivos, 1811 líneas según el
  manifiesto del commit): 7 suites nuevas, **46 tests**. Evidencia: `dotnet test` con filtro
  `Catalog|Orders` → **175/175 verde**. Ningún E2E existente tocado; ningún archivo de producción
  modificado.
  Assess sobre el commit (`--base-ref 2eedabe4 --committed-only`): `risk: medium`
  (`executable_change`), `review_due: false`, `review_due_reason: under_budget`. **Sin receipt**:
  el candidato quedaba pendiente en el slice.
- **L3b (2026-11-03)** — El usuario pidió abrir el ciclo igualmente. `review start` (lineage
  `review-a6aaa86f9943fb57`, lentes readability+reliability) → **APROBADO**, 0 bloqueantes,
  10 advisories informacionales; `acknowledge-approved` quemó la autoridad
  (`consumed_revision` `sha256:9b95c457…`). Entrega (push/PR/merge) sigue sin autorizar.
- **L4 (2026-11-03)** — Correcciones del commit de docs, derivadas de la RDD anterior: la matriz ya
  no marca como GAP endpoints que este feature cerró, y las filas del showcase distinguen la ruta de
  sesión (nueva) de las rutas de SuperAdmin y el repositorio (preexistentes). L3 dice T1–T7 y 1811
  líneas para dejar de contradecir Tasks y el manifiesto.
- **L5 (2026-11-03)** — Los 8 advisories de test de esa RDD, cerrados:
  R2-003 `SetOrdersEnabledAsync` → `CloseOrdersAsync`, que escribe SOLO `Enabled`, y la aserción
  ahora prueba que las modalidades no se tocan; R2-004 lecturas duplicadas → `Infrastructure/OrderingQueries.cs`
  (settings, conteo de settings, pedido, conteo de pedidos); R2-005 nota de por qué el `TinyJpeg`
  basta; R3-BOUNDARY-NAME casos ACEPTADOS en el límite de nombre y teléfono (+ teléfono 33 → 400);
  R3-REJECTED-WRITE-STATE carrito vacío y cantidad inválida ya comprueban que no persiste pedido;
  R3-REORDER-GUARD teoría con subconjunto, duplicado e id inventado; R3-SETTINGS-UNIQUENESS conteo
  de filas = 1.
  R3-COVERAGE-LEVEL **no requería código nuevo**: la revisión no tenía a la vista
  `Application.Tests/Features/OnlineOrdering/DeliveryDriverCommandValidatorTests.cs` (incluye el
  caso ACEPTADO en el límite) ni `Features/StoreManagement/Stores/StoreCatalogTemplateTests.cs`
  (los 4 casos del validador de plantilla). Se intentaron crear dos archivos y se borraron al
  comprobar que **duplicaban** cobertura existente; ninguna prueba previa se modificó.
  Evidencia: E2E de las 7 suites **50/50**.
- **L6 (2026-11-03)** — Tercer slice, con los 5 advisories de la RDD de L5: el `switch` de la
  teoría de reordenado ya nombra el caso `foreign` y su brazo por defecto **lanza** (un `InlineData`
  mal escrito falla en vez de degradar al caso ajeno); `OrderingQueries` mueve el prólogo
  scope+contexto a un `QueryAsync<T>` privado; se añade el caso separado que apaga SOLO la recogida
  y afirma `PickupEnabled=false` con el resto encendido; el log queda en orden cronológico.
  Evidencia: E2E de las 7 suites **51/51**.
- **L6b (2026-11-03)** — RDD del tercer slice: lineage `review-2eceb3484f9493d3`, lentes
  readability+reliability → **APROBADO**, 0 bloqueantes, 3 advisories informacionales
  (`R2-DUP-WRITE-PREAMBLE`, `R3-REORDER-STATE`, `R3-NAME-BOUNDARY`); `acknowledge-approved` quemó
  la autoridad (`consumed_revision` `sha256:655f1259…`). Nota: el candidato se calculó desde
  `0efcbc88`, así que el motor revisó también el contenido del slice anterior.
- **L7 (2026-11-03)** — Cuarto slice, con los 3 advisories de L6b:
  `R2-DUP-WRITE-PREAMBLE` → un único `SetFlagAsync(storeId, SettingsFlag, value)` escribe la
  columna pedida y concentra el prólogo scope+contexto; las dos llamadas anteriores se sustituyen
  sin cambiar qué columna toca cada caso. `R3-REORDER-STATE` → el caso de rechazo compara el orden
  del carrusel ANTES y DESPUÉS del 400, así que un handler que reordenara y luego fallara se ve.
  `R3-NAME-BOUNDARY` → **no se reproduce**: `Post_with_a_name_longer_than_the_column_is_rejected_with_a_400`
  (`DeliveryDriverCreateE2ETests.cs:179`) ya envía `NameMaxLength + 1` y espera 400 sin fila; la
  lente no tenía ese tramo a la vista. No se añadió código por ese punto.
  Evidencia: E2E de `PublicOrderingConfigE2ETests` + `ShowcaseEndpointsE2ETests` **14/14**.
- **L7b (2026-11-03)** — RDD del cuarto slice: lineage `review-38611e7edcb977cf`, lentes
  readability+reliability → **APROBADO**, 0 bloqueantes, 4 advisories informacionales
  (`R2-OPAQUE-DECISION-REF`, `R2-FLAG-ENUM-NAME`, `R3-LIMIT-CONSTANT-COUPLING`,
  `R3-REORDER-EMPTY-LIST`); `acknowledge-approved` quemó la autoridad
  (`consumed_revision` `sha256:790ff25a…`). Los cuatro son de estilo o de un borde barato: la
  revisión converge.

- **L8 (2026-11-04)** — Sexto slice. `R2-1` y `R3-e2e-metadata-guard` cerrados juntos: la guarda
  de límites sale del suite E2E y pasa a
  `Application.Tests/Features/OnlineOrdering/DeliveryDriverColumnLimitsTests.cs`, sin fixtura, sin
  base de datos y sin `async` de relleno; el E2E conserva la prueba observable (alta con el valor
  exacto → 200 y fila persistida). `R3-empty-ordering-scenario` **no requiere cambio**: la teoría
  de rechazo afirma 400 **y** que el orden del carrusel no cambió, así que un conjunto vaciado
  fallaría la igualdad. Evidencia: unit **1/1**; E2E `DeliveryDriverCreateE2ETests` **7/7**.

- **L9 (2026-11-04)** — T8 y T9 HECHOS con dos workers en secuencia (build compartido, no en
  paralelo): `Catalog/AdminCatalogImageRulesE2ETests.cs` y `Catalog/CatalogTelemetryRulesE2ETests.cs`,
  **12 tests**. Evidencia: `dotnet test` con ambos filtros → **12/12**. Ningún test ni support file
  existente tocado; ningún archivo de producción modificado. RDD pendiente al cierre de este log.

- **L10 (2026-11-04)** — Los dos advisories con peso real, cerrados:
  `R2-hidden-seed-side-effect` / `R3-3` → `CatalogTelemetryRulesE2ETests` implementa
  `IAsyncLifetime`, memoiza el **Task** del cliente (`??=`, asignado antes del primer `await`) para
  sembrar UN SuperAdmin por test y lo borra en `DisposeAsync`; las llamadas existentes no cambian.
  `R3-1` → el test de >2 MB sube primero el JPEG pequeño con **el mismo nombre y content type**
  (control positivo, 200) y después el buffer sobredimensionado (400), afirmando **una** fila: la
  única diferencia entre las dos peticiones es el tamaño. El método se renombró a
  `..._is_rejected_while_the_small_one_is_accepted` porque el nombre viejo decía "no row".
  Evidencia: ambas suites **12/12**.

- **L11 (2026-11-04, verbatim)** — *"AdminCatalogBrandingController 2 (GET/PUT .../catalog/branding)
  sin matriz / AdminCatalogShowcaseController 4 (...) sin matriz / Los dos que faltan no están a
  cero: AdminWebCatalogCrudTests los ejercita ... Pero eso es camino feliz suelto, no la matriz
  endpoint por endpoint ... Mi error fue tratar 'branding y showcase viven en otros controladores'
  como si eso los sacara de la cuenta. No la saca: son superficie de catálogo web igual. Haz la
  matriz de esos dos y cierro los huecos que aparezcan, con el mismo flujo (explorer con codegraph,
  subagentes, worker, RDD)."*
- **L11b (2026-11-04)** — Matriz levantada con `codegraph_explore` + lectura dirigida de los
  handlers, la validación, las reglas de imagen y las dos suites existentes. Los 6 endpoints tienen
  camino feliz y 403; lo que falta es el **401 anónimo en los 6**, el aislamiento cross-store de
  GET/POST/order, y **todas** las reglas de borde de la tabla T10 salvo los defaults de marca.
  Asimetrías y bordes no fijables quedaron anotados en "Descartado a propósito". Las filas 10.x de
  la matriz son el contrato de T10 y T11.
- **L12 (2026-11-04)** — **T10 y T11 HECHOS**, en dos workers **secuenciales** (build compartido, no
  en paralelo, mismo criterio que L9): `Catalog/AdminBrandingEndpointRulesE2ETests.cs` (8 métodos,
  9 casos) y `Catalog/AdminShowcaseEndpointRulesE2ETests.cs` (7 métodos + teoría de 7 casos = 14).
  **23 casos nuevos**, los 6 endpoints con la matriz completa salvo lo declarado en Descartado.
  Evidencia: spot check del padre tras los renombrados →
  `dotnet test --filter "FullyQualifiedName~AdminBrandingEndpointRulesE2ETests|FullyQualifiedName~AdminShowcaseEndpointRulesE2ETests"`
  = **23/23 verde**. `AdminWebCatalogCrudTests` corrió **4/4** como smoke en ambos workers: ningún
  E2E existente tocado, ningún support file tocado, ningún archivo de producción modificado.
  Dos hallazgos de la matriz, reportados y **no** parcheados: la conjunción `&&` de
  `CatalogImageUploadRules.cs:23` (allowlist erosionable) y la asimetría del origen del `TenantId`
  entre showcase y marca.
  Nota de harness: el TestServer avisa "A request body size limit could not be applied", así que el
  `RequestSizeLimit` de los controladores no actúa en el E2E — el 400 del validador es lo único
  observable aquí, y así quedó comentado en la prueba de >2 MB.
- **L13 (2026-11-04)** — RDD del slice `39b9c09d`: lineage `review-28614dc28ac92ae7`, lentes
  readability+reliability → **APROBADO**, 0 bloqueantes, 11 advisories; `acknowledge-approved` quemó
  la autoridad (`consumed_revision` `sha256:67eea228…`). Cerrados los cinco con peso real en el
  slice siguiente: `R3-size-boundary` → 2 MB **exactos** aceptados antes del 2 MB+1 rechazado;
  `R3-caption-boundary` → `caption` de 200 aceptado y releído sin truncar;
  `R3-mobile-columns-range` → teoría del lado aceptado (1 y 2 persisten y se releen);
  `R2-doc-debt-contradiction` → la sección "Deuda abierta" ya no dice "sin deuda" y enumera tres
  hallazgos de producción; `R2-doc-scope-label` → T10/T11 se rotulan como superficie de catálogo web
  dentro del alcance, y el encabezado de las superficies adicionales deja de decir "fuera del
  alcance".
  **Cerrados** (5):
  - `R3-size-boundary` → 2 MB **exactos** aceptados (con relectura de la clave) antes del 2 MB+1
    rechazado.
  - `R3-caption-boundary` → `caption` de 200 aceptado y releído sin truncar.
  - `R3-mobile-columns-range` → teoría del lado aceptado (1 y 2 persisten y se releen).
  - `R2-doc-debt-contradiction` → la sección "Deuda abierta" ya no dice "sin deuda" y enumera tres
    hallazgos de producción.
  - `R2-doc-scope-label` → T10/T11 se rotulan como superficie de catálogo web dentro del alcance, y
    el encabezado de las superficies adicionales deja de decir "fuera del alcance".

  **Declinados a propósito** (6), con su motivo:
  - `R2-dup-cleanup`, `R2-dup-tinyjpeg`, `R2-dup-seed-idiom` — extraer un helper compartido exige
    **modificar** `WebCatalogSeed.cs`, un support file E2E, y eso necesita autorización del Owner;
    además es el idioma ya establecido de `AdminWebCatalogCrudTests`.
  - `R2-field-name-abbrev`, `R2-hardcoded-limits` — nombrar los límites con las constantes de
    producción haría que la prueba no pudiera detectar un cambio en la regla; es el mismo motivo por
    el que L7b marcó el acoplamiento a constantes como advisory a evitar.
  - `R3-seed-leak` — idioma preexistente de todo el suite (la siembra va antes del `try`);
    corregirlo solo en los dos archivos nuevos sería inconsistente con las 190 suites restantes.
  Evidencia: E2E de las dos suites nuevas + `AdminWebCatalogCrudTests` → **30/30 verde**.
- **L14 (2026-11-04)** — RDD del slice `5ff21e37`: lineage `review-8d81e4ffd48a6740`, mismas dos
  lentes → **APROBADO**, 0 bloqueantes, 9 advisories; `acknowledge-approved` quemó la autoridad
  (`consumed_revision` `sha256:1602cd9c…`). Cerrados los tres con defecto demostrable:
  `R2-doc-scope-count` y `R2-doc-coverage-count` (la sección decía "cuatro controladores" y "estos
  dos", y "seis superficies" para cuatro — cifras falsas), `R2-doc-open-findings-referent`
  ("en ninguno" sin referente), `R2-doc-bare-file-refs` (citas con nombre suelto, ahora
  repo-relative), `R2-doc-declined-buried` (los declinados pasan a lista propia) y
  `R3-size-limit-acceptance-not-persisted` (el caso de 2 MB exactos ahora **relee** la marca y exige
  que la clave haya cambiado, no solo un 200).
  Declinados con motivo: `R2-test-seed-duplication` (mismo trade-off ya documentado) y
  `R3-inclusive-boundary-only-at-e2e` (el caso E2E prueba la **persistencia** del valor aceptado, que
  un test del validador no puede probar; el predicado puro ya vive en `Application.Tests`).
  **Este slice final NO se re-revisa**: el contrato nativo prohíbe loop-until-clean y los advisories
  son posteriores, no bloqueantes. Evidencia: ambas suites + `AdminWebCatalogCrudTests` → **30/30**.

## Deuda abierta

**Sin deuda de revisión de tests.** Los advisories que estuvieron anotados aquí se cerraron en
`47eba5f3` (quinto slice) y el guard de límites se movió a `Application.Tests` en el sexto. El
quinto ciclo (`review-28614dc28ac92ae7`, T10+T11) cerró sin bloqueantes y sus advisories de borde se
cerraron en el slice siguiente.

**Cobertura:** T1–T11 cerradas. Las **cuatro** superficies de catálogo web que no entran en el
recuento de 33 endpoints del plan —`AdminCatalogController` (T8), `PublicCatalogEventsController`
(T9), `AdminCatalogBrandingController` (T10) y `AdminCatalogShowcaseController` (T11)— tienen matriz
propia y sus huecos cerrados.

**Abierto de verdad — código de producción, requiere autorización del Owner.** No son deuda de
tests, y por eso ninguno de los tres se fijó en un test: hacerlo bloquearía el arreglo.

1. `backend/src/Application/Features/WebCatalog/Images/CatalogImageUploadRules.cs:23` usa `&&` en
   vez de `||`: un archivo con la extensión permitida y el content type prohibido (o al revés) pasa
   la allowlist.
2. `backend/src/Application/Features/WebCatalog/Showcase/Commands/AddStoreCatalogImage/AddStoreCatalogImageCommand.cs:82`
   toma el `TenantId` del claim del llamador, mientras
   `backend/src/Application/Features/WebCatalog/Branding/Commands/UpdateStoreCatalogBranding/UpdateStoreCatalogBrandingCommand.cs:102-106`
   lo toma de la fila de la tienda — un SuperAdmin con otro tenant escribe la clave bajo el prefijo
   equivocado.
3. `backend/src/SMCA.WebApi/Filters/AdminStoreScopeAttribute.cs:54-58`: `GET branding|showcase` con
   un `storeId` inexistente responde 200 con defaults/listas vacías (el filtro valida el GUID, no la
   existencia), mientras `PUT branding` responde 404.
