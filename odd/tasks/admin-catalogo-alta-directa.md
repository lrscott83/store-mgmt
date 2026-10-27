# admin-catalogo-alta-directa

Permitir que el SuperAdmin **cree** categorías y productos desde la vista store-scoped del catálogo
web (`/admin/stores/:storeId/web-catalog`), sobre las MISMAS tablas que ya usa el catálogo
(`ProductCategory`, `Product`). Sin tablas nuevas, sin copia del catálogo, sin snapshot del
dispositivo. Alta y edición con descripción e imagen principal.

- Rama: `feat/admin-catalogo-alta-directa` (desde la rama actual).
- Entrega: `ask-on-risk` (default). Push/PR = decisión del owner.
- Runner: backend `dotnet test`; frontend `pnpm vitest run` + `pnpm typecheck` + `pnpm lint`.

## Specs

S1. El SuperAdmin crea una **categoría** desde la vista del catálogo de la tienda; se guarda en
`ProductCategory` con `StoreId` de la tienda de la ruta, slug único por tienda y orden al final.

S2. El SuperAdmin crea un **producto** desde esa vista con: categoría, nombre, precio, moneda,
descripción e imagen principal. Se guarda en `Product`; sin imagen queda sin imagen principal.

S3. Las vistas mantienen **los mismos paneles por categoría**. Una categoría recién creada aparece
como panel aunque todavía no tenga productos (solo en la vista admin; la vista del dueño no cambia).

S4. Al **editar** un producto se sigue pudiendo cambiar descripción e imagen principal (comportamiento
existente, se conserva).

S5. Todo es **online**: crear no depende de sincronizar ni de un snapshot del POS. El botón
"Sincronizar Catálogo" no es requisito para crear.

S6. Los productos creados son productos reales de la tienda (visibles en POS/inventario), igual que
los del import CSV. El catálogo público los muestra (slug de categoría).

S7. No se modifican E2E existentes ni sus support files. Se añaden tests nuevos. La vista y los
endpoints del dueño conservan su comportamiento.

## Contrato (fijado por el orquestador)

- `GET  /api/v1/stores/{storeId}/catalog/categories` → lista `{ id, name, order }` ordenada por `order`.
- `POST /api/v1/stores/{storeId}/catalog/categories` body `{ name, order? }` → `{ id, name, order }`.
- `POST /api/v1/stores/{storeId}/catalog/products` body
  `{ categoryId, name, price, currency?, description?, order? }` → `{ id }`.
- Imagen principal: reutilizar `POST /api/v1/stores/{storeId}/catalog/products/{productId}/images`
  (multipart `file`) después del alta; el primer imagen asignada fija `Product.Image`.
- `currency` en request es numérico (`int?`, enum), igual que `UpdateProductCatalogFieldsCommand`.

## Tareas

- [x] **T1** Backend: `GET/POST .../catalog/categories` + `POST .../catalog/products` (comandos nuevos
      store-scoped, sin tocar los del dueño).
- [x] **T2** Backend: E2E nuevo `AdminCatalogCreateTests` (alta, panel vacío, imagen, aislamiento, 403).
- [x] **T3** Frontend: métodos `getCategories` / `createCategory` / `createProduct` en el cliente.
- [x] **T4** Frontend: botón + modal "Nueva categoría" y "Nuevo producto" (descripción, moneda, imagen)
      en los paneles existentes.
- [x] **T5** Frontend: i18n + tests nuevos.
- [x] **T6** Verificación (build, E2E nuevos, typecheck, lint, vitest) y commits por unidad.

## Log

L1 (2026-10-26, verbatim):
> "compadre donde mismo se guardan las categorias y los productos del catalogo, no inventes mas cosas que no estan en este scope papo. Entendiste? que no entiendes?"

L2 (2026-10-26, verbatim):
> "las vistas si que sean con los mismos paneles por categorias y cuando se adicione y se edite un prodycto ya se pueda poner la imagen y la descripcion. Esto es todo online."

L3 (2026-10-26, implementación, evidencia):
- Backend: `CreateCatalogCategoryCommand` (nombre único por tienda, slug único, orden al final),
  `CreateCatalogProductCommand` (categoría de la tienda o 404, `AvailableToSale`, `Description`,
  `Currency`, orden al final, slug de tienda si falta, regeneración de página estática best-effort) y
  `GetCatalogCategoriesQuery`. Tres acciones nuevas en `AdminCatalogController`; dueño intacto.
- Frontend: `getCategories`/`createCategory`/`createProduct` en el cliente; modales admin de alta;
  los paneles admin se construyen desde las categorías (una categoría vacía se ve); el dueño sigue
  agrupando solo por productos.
- Hueco corregido antes de verificar: `CurrencySelect` no se pinta si la sesión no tiene MultiMonedas,
  así que el alta del SuperAdmin siempre habría guardado CUP. El modal admin usa un selector propio
  con todas las monedas; el test corre sin el módulo 15 para pinzarlo.
- Verificación observada: `dotnet build src/SMCA.sln` Build succeeded; `AdminCatalogCreate` 7/7;
  regresión `AdminWebCatalog|AdminCatalogImport` 22/22; Vitest 66/66 (nuevos + vista existente);
  `pnpm typecheck` 5/5; `pnpm lint` 4/4. E2E existentes sin tocar.

L4 (2026-10-26, instrucción del owner, verbatim):
> "elimina ese test, solamente esto es para la vista del SuperAdmin, en la vista del owner no tienes que hacer ningun cambio. Entendido?????????????"

- La vista del SuperAdmin oculta el bloque de sincronización (botón "Sincronizar Catálogo" y
  "Última sincronización"); el dueño conserva ambos sin cambios. El aviso de "sin publicar" usa un
  texto propio del admin que ya no menciona sincronizar.
- Se eliminó el test **SCOPE-2** de `web-catalog.test.tsx` (afirmaba el botón en modo admin),
  autorizado explícitamente por el owner. El test del dueño sobre el botón sigue intacto.
- Verificación: Vitest 60/60 en los dos archivos tocados; `typecheck` 5/5; `lint` 4/4.
