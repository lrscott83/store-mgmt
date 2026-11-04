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

## Fuera del alcance de este feature — mapa verificado 2026-11-04

El plan de auditoría define **33 endpoints** en 9 unidades; estos dos controladores quedan fuera de
esa cuenta. El mapa se levantó con `codegraph_explore` + lectura dirigida, no con la documentación.

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

### Descartado a propósito, con motivo

- **429 de telemetría**: `PublicCatalogPolicy` es un cubo de 120/min por IP **compartido por todo el
  suite** (`RateLimitPolicies.cs:88-97`); un test de 429 contamina el resto. El repo ya lo evita
  (`SiteTelemetryE2ETests.cs:22-24`).
- **`GET /catalog/products|categories` con `storeId` inexistente**: devuelven 200 con lista vacía
  (`GetCatalogProductsQuery.cs:40-44`). Es una asimetría frente al 404 de `status` que huele a
  defecto; fijarla en un test bloquearía el arreglo.

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

## Deuda abierta

**Sin deuda de revisión.** Los cuatro advisories que estuvieron anotados aquí se cerraron en
`47eba5f3` (quinto slice) y el guard de límites se movió a `Application.Tests` en el sexto.

Lo único pendiente son las dos superficies fuera del plan de 33 endpoints: **T8**
(`AdminCatalogController`) y **T9** (`PublicCatalogEventsController`), descritas arriba.
