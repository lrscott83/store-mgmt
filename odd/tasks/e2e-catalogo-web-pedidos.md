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
| 3.1 | `GET /catalog/showcase` | cubierto | `Catalog/ShowcaseValidationEnvelopeTests.cs` |
| 3.2 | `POST /catalog/showcase` | cubierto | `Catalog/ShowcaseValidationEnvelopeTests.cs` |
| 3.3 | `DELETE /catalog/showcase/{id}` | cubierto | `Catalog/ShowcaseRepositoryPersistenceTests.cs` |
| 3.4 | `PUT /catalog/showcase/order` | cubierto | `Catalog/ShowcaseRepositoryPersistenceTests.cs` |
| 4.1 | `GET /public/catalog/{slug}` | cubierto | `Catalog/WebCatalogPublicApiTests.cs` |
| 4.2 | `GET /public/catalog/{slug}/products` | cubierto | `Catalog/WebCatalogPublicApiTests.cs` |
| 4.3 | `GET /public/catalog/{slug}/products/{id}` | cubierto | `Catalog/WebCatalogPublicApiTests.cs` |
| 4.4 | `GET /public/catalog/{slug}/media/{**key}` | cubierto | `Catalog/WebCatalogImagesTests.cs` |
| 5.1 | `GET /online-ordering/settings` | **GAP** | solo `OrderingSettingsRouteAuthE2ETests` (auth de ruta) |
| 5.2 | `PUT /online-ordering/settings` | **GAP** | ídem |
| 6.1 | `GET /online-orders` | **GAP** | sin E2E |
| 6.2 | `GET /online-orders/{id}` | **GAP** | sin E2E |
| 6.3 | `GET /online-orders/stats` | **GAP** | sin E2E |
| 6.4 | `PATCH /online-orders/{id}/status` | **GAP** | sin E2E |
| 6.5 | `PATCH /online-orders/{id}/payment` | parcial | `Orders/OrderPaidAtE2ETests.cs` fija `PaidAt`, no el contrato del PATCH |
| 6.6 | `PATCH /online-orders/{id}/driver` | parcial | `Orders/DeliveryDriverPartialUpdateE2ETests.cs` lo usa como efecto lateral |
| 7.1 | `GET /delivery-drivers` | cubierto | `Orders/DeliveryDriverPartialUpdateE2ETests.cs` (ambos `activeOnly`) |
| 7.2 | `POST /delivery-drivers` | **GAP** | sin E2E |
| 7.3 | `PATCH /delivery-drivers/{id}` | cubierto | `Orders/DeliveryDriverPartialUpdateE2ETests.cs` |
| 8.1 | `GET /public/ordering/{slug}/config` | **GAP** | sin E2E de comportamiento |
| 8.2 | `POST /public/ordering/{slug}/orders` | parcial | `PublicOrderingRateLimitE2ETests` solo ejercita el 429 |
| 8.3 | `GET /public/ordering/{slug}/orders/{code}` | cubierto | `Orders/PublicOrderingReadE2ETests.cs` |
| 9.1 | `GET /stores/{storeId}/catalog-template` | **GAP** | sin E2E |
| 9.2 | `PUT /stores/{storeId}/catalog-template` | **GAP** | sin E2E |

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
- **L3 (2026-11-03)** — **T1–T4 y T7 HECHOS** en `9197827c` (8 archivos, 1796 líneas): 7 suites
  nuevas, **46 tests**. Evidencia: `dotnet test` con filtro `Catalog|Orders` → **175/175 verde**.
  Ningún E2E existente tocado; ningún archivo de producción modificado.
  RDD sobre el commit (`--base-ref 2eedabe4 --committed-only`): `risk: medium`
  (`executable_change`), `review_due: false`, `review_due_reason: under_budget`. **Sin receipt**:
  el candidato queda pendiente en el slice, no aprobado.
- **L4 (2026-11-03)** — Pendiente: T5/T6 quedaron cerrados dentro de L3 (el listado/detalle/stats/
  PATCH y la configuración de pedidos entraron en las 7 suites). Lo que sigue abierto es la
  cobertura de unidades 1-4 más allá del showcase: su matriz está en la tabla de arriba y se apoya
  en suites preexistentes; no se añadieron archivos nuevos ahí.
