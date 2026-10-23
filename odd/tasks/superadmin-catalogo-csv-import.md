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
`nombre`/`name`, `precio`/`price`, `moneda`/`currency` o `precio_moneda`/`price_currency`. Se
reutiliza `parseCsvProducts` (quote-aware, RFC4180). Sin moneda o con moneda desconocida = `CUP`.

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

L5 (2026-10-22, evidencia):
- `dotnet build src/SMCA.sln`: Build succeeded.
- E2E nuevos `Catalog/AdminCatalogImportTests.cs`: 4/4 verdes (crea categorías/productos y los
  publica, reimport actualiza precio y moneda sin duplicar, fila inválida rechaza todo, OwnerAdmin 403).
- Frontend: `typecheck` y `lint` sin errores. Vitest de los archivos tocados: 134/134
  (`web-catalog` 56, `catalog-http-service` 15, `store-scope` 6, `csv-product-parser` 54,
  `catalog-csv-import-card` 3).
