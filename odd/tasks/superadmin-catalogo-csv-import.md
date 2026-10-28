# superadmin-catalogo-csv-import

## Objetivo

El **SuperAdmin** puede importar productos al catálogo web de UNA tienda desde un CSV con
**categoría, producto, precio de venta y moneda de venta**, dentro de la misma vista store-scoped
del catálogo (`/admin/stores/:storeId/web-catalog`).

El import es **upsert** por (categoría + producto): crea lo que falta y actualiza **precio y
moneda** de lo existente. Los productos importados son productos REALES de la tienda (el catálogo
publica directamente `Product`/`ProductCategory`), así que también aparecen en el POS/inventario.

- Rama: `feat/superadmin-catalogo-csv-import` (stacked sobre `feat/superadmin-web-catalog`).
- Entrega: `ask-on-risk` (default). Push/PR = decisión del owner.
- Runner: backend `dotnet test`; frontend `pnpm vitest run` + `pnpm typecheck` + `pnpm lint`.

## Specs

S1. En la vista store-scoped del catálogo, el SuperAdmin selecciona un `.csv` y lo importa. La
tarjeta de importación **solo** aparece en modo admin (con `storeId`); el dueño conserva su
importación de `/sales/products`.

S2. Columnas aceptadas (encabezados, sin distinguir mayúsculas): `categoria`/`category`,
`nombre`/`name`/`producto`/`product`, `precio`/`price`/`precio_venta`/`sale_price`,
`moneda`/`currency`/`moneda_venta`/`sale_currency` (o `precio_moneda`/`price_currency`). Se
reutiliza `parseCsvProducts` (quote-aware, RFC4180) **con `allowCurrencyNames: true`**, que es lo
único que habilita la moneda por código (`USD`) en la columna `moneda`; el import del POS del dueño
conserva el modo estricto (solo el número del enum, no numérico → `undefined` → CUP). Sin moneda o
con moneda desconocida = `CUP`.

S2b. El import es por lotes con tope de filas y deduplicado por (categoría + producto): si el
archivo repite un par, se procesa UNA vez y gana la última aparición; `rowsProcessed` cuenta filas
efectivas.

S3. Upsert por (categoría + producto), comparando nombres **sin distinguir mayúsculas**. Crea
categorías y productos faltantes; en los existentes actualiza **solo** `Price` y `Currency`.

S4. Los productos nuevos nacen `IsActive = true` y `AvailableToSale = true` (sin ellos el catálogo
público no los publica). `DiscountFromInventory = true`, `BusinessId = ""` (mismo criterio que el
import legacy). Orden: al final de su categoría; categoría nueva al final de la tienda.

S5. El import genera el slug público de la tienda y de las categorías sin slug, con el MISMO
`SlugNormalizer` y unicidad que la sincronización (`SyncCatalogCommand`), para que el catálogo
público muestre lo importado.

S6. Endpoint `POST /api/v1/stores/{storeId:guid}/catalog/import`, `[HasPermission(SuperAdmin)]` +
`[AdminStoreScope]`. Devuelve `{ categoriesCreated, productsCreated, productsUpdated,
rowsProcessed }`.

S7. Validación todo-o-nada: lista vacía, categoría/nombre vacíos, precio negativo o moneda fuera
del enum → 400 y NO se escribe nada.

S8. Tras guardar se regenera la página estática del catálogo (best-effort, igual que la sync).

S9. No se toca el import legacy (`ImportCsvProductsCommand`) ni su endpoint del dueño, ni E2E
existentes. Se añaden tests nuevos.

## Decisiones

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| D1 | Comando | `ImportCatalogCsvCommand` nuevo | El legacy no maneja moneda y tiene bugs (diccionario por nombre de producto, `Max` sobre listas vacías, `ForEach` async). No se arriesga el camino del dueño. |
| D2 | Parseo | En el navegador con `parseCsvProducts`; el backend recibe filas normalizadas y revalida | Reutiliza el parser probado y mantiene el endpoint simple (JSON). |
| D3 | Duplicados | Upsert de precio + moneda | Decisión del owner (L2). |
| D4 | Productos reales | Aviso explícito en la UI | El catálogo publica `Product`/`ProductCategory`; no hay copia aparte. |
| D5 | Slugs | Se generan en el import si faltan | Sin slug la categoría no se publica (filtro del catálogo público). |
| D6 | Entrega | Rama stacked sobre la del catálogo admin | La vista y los endpoints dependen de esa rama aún sin fusionar. |
| D7 | Moneda por código | Opt-in (`allowCurrencyNames`) en el parser compartido | El import del POS del dueño es un contrato existente: aceptar códigos en `moneda` cambiaría la moneda de un CSV suyo sin pedirlo. |

## Tareas

- [x] **T1** — Backend: DTOs (`CatalogCsvRowDto`, `CatalogCsvImportSummaryDto`).
- [x] **T2** — Backend: `ImportCatalogCsvCommand` + handler (upsert, slugs, regeneración) + validación en el handler (todo o nada con número de fila).
- [x] **T3** — Backend: acción `POST .../catalog/import` en `AdminCatalogController`.
- [x] **T4** — Backend: tests E2E nuevos (import + publicación, reimport con precio nuevo, 403, 400).
- [x] **T5** — Frontend: `importCatalogCsv` en el servicio + tipos.
- [x] **T6** — Frontend: `CatalogCsvImportCard` (FileInput + parseo + resumen + errores) en la vista.
- [x] **T7** — Frontend: i18n y tests (servicio, tarjeta solo en admin, parser con alias).
- [x] **T8** — Verificación (build, E2E nuevos, `typecheck`, `lint`, `vitest`).

## Criterios de aceptación

1. El SuperAdmin importa un CSV de 2 filas y el catálogo de esa tienda queda con 2 productos (S1-S6).
2. Reimportar con precios nuevos actualiza precio y moneda sin duplicar (S3).
3. Los productos importados se publican en el catálogo público (slug de tienda y categorías) (S5).
4. Una fila inválida rechaza todo el import con 400 (S7).
5. El dueño no ve la tarjeta y su importación actual sigue intacta (S1, S9).

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AdminCatalogImport"

cd frontend-react
pnpm typecheck
pnpm lint
pnpm --filter @store-mgmt/web-store-pos test -- --run app/sales/routes/__tests__/web-catalog.test.tsx app/sales/lib/services/__tests__/catalog-http-service.store-scope.test.ts
```

## Log

L1 (2026-10-22, verbatim):
> "Que el SuperAdmin pueda importar productos para el catalogo web usando un csv con categoria, producto, precio de venta y moneda de venta"

L2 (2026-10-22, decisión del owner, verbatim):
> "Actualizar precio y moneda"

L3 (2026-10-22, evidencia previa):
- Parser React reutilizable: `sales/lib/csv-product-parser.ts` ya acepta `categoria/category`,
  `nombre/name`, `precio/price`, `moneda/currency` y `precio_moneda/price_currency`.
- Backend legacy: `ImportCsvProductsCommand` sin moneda y con bugs; no se toca (D1).
- Publicación directa: el catálogo lee `Product`/`ProductCategory`; los slugs de categoría se
  generan en la sync (`SyncCatalogCommand.cs:123-173`) y el público filtra categorías con slug.

L4 (2026-10-22, hallazgos de implementación):
- El parser del POS solo aceptaba `nombre`/`precio` y la columna `moneda` solo como NÚMERO. Para
  que el CSV natural del owner (`categoria,producto,precio_venta,moneda_venta`, moneda `USD`) funcione
  se añadieron alias ADITIVOS (`producto`, `precio_venta`, `moneda_venta`, `sale_*`) y la moneda por
  nombre en la columna `moneda`. Los CSV existentes siguen resolviendo igual.
- Trampa atrapada por los tests: `parseCurrencyByName` mira `Currency[raw]` y en un enum numérico
  TypeScript eso devuelve el NOMBRE por el mapeo inverso (`Currency['1'] === 'USD'`). El número se
  resuelve primero con `parseOptionalCurrency`.
- La API serializa los enums como CADENA (`"USD"`), no como número; el E2E lo fija.

L6 (2026-10-23, RDD — receipt-driven development):
- RDD está ON (global). Assess inicial del slice completo (`HEAD~2..HEAD`, 5109 líneas): medium,
  `under_budget`. Con escalado del item 2 → high / `review_due`.
- El START del slice completo falló con `lens_context_budget_exceeded` (3 lentes); no se creó
  autoridad. Se redujo el alcance al commit del import CSV (`HEAD~1..HEAD`, 16 archivos, 1020
  líneas), 3 lentes (risk, readability, reliability), con consentimiento del owner.
- Resultado: **approved** (lineage `review-7e17eac5e49b17e2`, target `sha256:65dd27c1…`),
  acknowledgement ejecutado (`gentle-ai.review-acknowledged/v1`), autoridad quemada.
- Hallazgos: 16, todos **informational/no bloqueantes**. Reales y a corregir como trabajo
  posterior: (1) la columna `moneda` compartida ahora acepta códigos y eso cambia el import del
  POS del dueño (contradice lo que decía S2 de este doc); (2) filas duplicadas en un mismo CSV
  actualizan una entidad recién añadida y descuadran el resumen; (3) `await onImported()` dentro
  del try hace que un fallo de recarga se reporte como fallo de importación; (4) `rows: null`
  produce 500 en vez de 400; (5) la doc del DTO dice "moneda desconocida = CUP" pero el handler
  devuelve 400; (6) falta cobertura de lista vacía, moneda fuera del enum y backfill de slug en
  categoría existente.
- Falso positivo comprobado: R3-3 (la regeneración no es best-effort) — `CatalogStaticPageRegenerator`
  captura toda excepción y nunca lanza (`CatalogStaticPageRegenerator.cs:43-59`).
- Pendiente: el commit de la vista store-scoped (`697dd1d6`, item 2 seguridad) sigue sin RDD.

L8 (2026-10-23, rebase y cobertura de integración):
- La rama se re-apoyó sobre el tip real de `feat/superadmin-web-catalog` tras partir aquel commit
  (`git rebase --onto e751555e 697dd1d6`), sin conflictos y con el árbol del CSV intacto
  (verificado: `git diff 9a5dc8f4 HEAD` solo muestra lo que llegó de la base nueva).
- Test de integración nuevo: importar un CSV, editar el producto importado con el CRUD admin
  (`PUT .../catalog/products/{id}`) y comprobar que el catálogo público sirve la descripción,
  precio y moneda editados. `AdminCatalogImportTests` queda 9/9.
- RDD por commit (assess con `gentle-ai review assess`): `81fa1698` import → medium/under_budget;
  `df7940e6` correcciones → medium/under_budget; `d2c83bd8` dedupe → medium/under_budget;
  `0eb29e9b` docs → passive; `8870e218` test integración → medium/under_budget. Los dos primeros
  conservan además los receipts nativos previos al rebase (mismo contenido, lineage
  `review-7e17eac5e49b17e2` y `review-4618d98356b313ed`, ambos con acknowledgement).

L7 (2026-10-23, correcciones tras la revisión RDD):
- R1/R3-5: la moneda por código del parser quedó **opt-in** (`allowCurrencyNames`); el import del
  POS del dueño vuelve a resolver un valor no numérico a `undefined` (CUP). Tests del parser
  cubren ambos modos y la suite del POS sigue verde.
- R3-2: filas duplicadas en un mismo archivo se deduplican por (categoría + producto) antes de
  escribir; gana la última y el resumen cuenta filas efectivas.
- R3-1: `rows: null`/vacío se rechaza con 400 y mensaje propio (`CatalogCsvEmpty`), sin 500 ni
  "fila 0".
- R3-4: la recarga posterior al import ya no está en el `try`: un fallo de recarga no reporta el
  import como fallido.
- R2-7: la tarjeta muestra el `description` del backend (la fila rechazada) en vez de un texto fijo.
- R3-7 + bug real atrapado por el test nuevo: una categoría existente SIN productos no estaba en
  el diccionario agrupado y el handler lanzaba `KeyNotFoundException`; ahora se crea la lista.
- R2-1: la doc del DTO y `ResolveCurrency` ya no prometen un fallback a CUP que el handler rechaza.
- Tests nuevos: E2E de lista vacía, moneda fuera del enum, filas duplicadas y backfill de slug en
  categoría existente (8/8 verdes); Vitest de los archivos tocados 122/122.

L5 (2026-10-22, evidencia):
- `dotnet build src/SMCA.sln`: Build succeeded.
- E2E nuevos `Catalog/AdminCatalogImportTests.cs`: 4/4 verdes (crea categorías/productos y los
  publica, reimport actualiza precio y moneda sin duplicar, fila inválida rechaza todo, OwnerAdmin 403).
- Frontend: `typecheck` y `lint` sin errores. Vitest de los archivos tocados: 134/134
  (`web-catalog` 56, `catalog-http-service` 15, `store-scope` 6, `csv-product-parser` 54,
  `catalog-csv-import-card` 3).
