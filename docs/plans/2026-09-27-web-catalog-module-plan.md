# Plan — Módulo WebCatalog (18): catálogo web público + sincronización desde Productos

**Fecha:** 2026-09-27 · **Rama:** test · **Estado:** ✅ COMPLETADO (F1–F5 en código y verificado) — **REVISIÓN 2026-09-28: publicación DIRECTA sobre las tablas normales (decisión del Owner); las tablas `Catalog*` se ELIMINARON** (ver §11). E2E backend **620/620**, vitest **328 archivos / 4790 tests**, `pnpm typecheck` + `pnpm lint` OK.

## 1. Resumen y decisiones cerradas

Nuevo módulo **WebCatalog (18)** incluido en el plan **Superior** (precio **5**), que habilita:

1. Una vista **"Catálogo Web"** en la sección **VENTA** del menú (debajo de *Catálogo Productos*), **solo para el Owner** y **solo con el módulo activo**, donde se completan los campos extra de cada producto (descripción HTML, % descuento, precio rebajado, nuevo, imagen(es)) y se pulsa **"Sincronizar Catálogo"**.
2. Un **catálogo web público** por tienda, servido por la propia app en **`/catalog/<nombre_tienda>`** (slug normalizado: minúsculas, sin tildes, único).

La sincronización es **backend contra backend**: la vista llama a un endpoint nuestro que crea/actualiza la copia publicada (categorías y productos). Si no existe, se crea; si existe (relación 1:1 por id origen), se actualizan sus valores.

**Decisiones cerradas con el Owner (2026-09-27):**

| # | Decisión | Elección |
|---|---|---|
| D1 | Dónde vive el catálogo | **Todo en nuestro sistema.** Replicamos modelo + vistas públicas en SMCA; el repo `public-clothes-store-demo` es **solo referencia de diseño/UX** |
| D2 | Repo del catálogo (externo) | **No se modifica** (fuera de alcance) |
| D3 | Imágenes | **Subida en nuestro backend** (multipart) + almacenamiento en disco del VPS |
| D4 | Colisión de slug de tienda | **Sufijo automático** (`-2`, `-3`, …) generado en el backend |
| D5 | Plan VIP | Incluye WebCatalog *(enmendada 2026-09-28: planes autocontenidos; originalmente solo Superior)* |
| D6 | Producto/categoría que ya no está en venta | La copia se **desactiva** (`IsActive = false`), nunca se borra |
| D7 | `% descuento` y `precio rebajado` a la vez | **Se combinan**: primero el %, luego se resta el monto |
| D8 | Dónde se editan los campos nuevos | **Solo en la vista Catálogo Web** (el formulario de producto actual no cambia) |
| D9 | `description` | **Texto plano, sin HTML** (nada de editor HTML ni sanitizador). Límite de longitud + `textarea` en la vista |
| D10 | Imágenes | **≤ 2 MB**, **máx. 6 por producto**, formatos **jpg/png/webp** (validado en backend) |
| D11 | Origen de los datos del catálogo | **El POS sube su catálogo local**: "Sincronizar Catálogo" envía un *snapshot* (categorías + productos del dispositivo, con los ids Guid que el POS ya generó) y el backend lo espeja antes de publicar. El catálogo no depende de que el servidor tenga productos propios |
| D12 | Guardas invertidas en 4 handlers | ✅ **Hecho** (`!string.IsNullOrEmpty(StoreId)` → `string.IsNullOrEmpty(StoreId)`) en `CreateProductCategoryCommand`, `ImportCsvProductsCommand`, `GetToEntryProductsQuery` y `HasAnyAvailableToSaleProductQuery`, con cobertura E2E y los archivos reportados en §10.3 |

**Análisis del template (para copiar lo que sirve):** el catálogo de referencia es multi-tenant por subdominio con schema por empresa; su modelo de producto es `{name, description, sku, barcode, price+currency, percentDiscountPrice, discountPrice, cost+currency, categoryId, image (UNA), isNew, order, active}` y su categoría `{name, slug único, image, icon, order, active}`. Sus vistas públicas ya muestran descripción y una imagen, y tienen componentes de badge (Nuevo/Descuento) y tarjeta de producto que replicamos conceptualmente. **No** trae galería de imágenes ni id de origen — de ahí las tablas nuevas de §2.2.

**Fuera de alcance:** carrito/checkout en el catálogo público (solo exhibición), pedidos desde el catálogo, multi-idioma del catálogo, y cualquier cambio en el repo del template.

## 2. Modelo de datos (backend)

### 2.1 Origen — nuestras tablas (datos que el Owner edita)

| Tabla | Campo | Tipo | Notas |
|---|---|---|---|
| `Product` | `Description` | `string` | **Texto plano** (D9), máx. 4000. Default `""` |
| `Product` | `PercentDiscountPrice` | `int` | **PERCENT_SCALE = 2** (`PERCENT_SCALE = 100`): `1250` = `12.50 %`. Default `0` |
| `Product` | `DiscountPrice` | `int` | **DISCOUNT_PRICE_SCALE = 2** (`DISCOUNT_PRICE_SCALE = 100`): `500` = `5.00`. Default `0` |
| `Product` | `IsNew` | `bool` | Default `false` |
| `Product` | `Image` | `string?` | Path de la imagen principal |
| `ProductImage` (nueva) | `ProductId`, `Path`, `Order` | — | Ordena/almacena `images: string[]`; cascade al borrar el producto |
| `ProductCategory` | `Slug` | `string?` | Único **por tienda** (índice parcial `WHERE "Slug" IS NOT NULL`); derivado del nombre (normalizado) + sufijo ante colisión. **Sin backfill SQL**: lo genera el sync con `SlugNormalizer` (una sola implementación de la normalización) |
| `Store` | `CatalogSlug` | `string?` | Único **global** (índice parcial); se genera la primera vez que se abre/usa el catálogo |
| `Store` | `CatalogSyncedAt` | `DateTime?` | Solo diagnóstico (última sincronización) |

*Convenciones:* `PERCENT_SCALE` y `DISCOUNT_PRICE_SCALE` viven como constantes en `Domain/Common` (backend) y en `packages/domain` (frontend) con helpers `toDecimal/fromDecimal` — el contrato HTTP y el modelo hablan en **enteros escalados**, como pidió el Owner; `Price` sigue siendo `decimal` (no se toca).

*Slug de tienda (D4):* `normalize(name)` = minúsculas, sin tildes/diacríticos, `ñ→n`, espacios y símbolos → `-`, colapsar guiones, recortar a 63 chars (`^[a-z0-9][a-z0-9-]*$`, mismo alfabeto que el template). Ante colisión se añade `-2`, `-3`, …; índice único global.

### 2.2 Catálogo publicado (decisión del Owner, 2026-09-28: SIN tablas de copia)

No existen tablas de catálogo publicado. La publicación es **directa**: la sincronización escribe
`Product` / `ProductCategory` / `ProductImage` y la API pública lee esas mismas tablas. Las tablas
`CatalogCategory` / `CatalogProduct` / `CatalogProductImage` del diseño original
(migración `20260927193020_Catalog-Published-Tables`) quedaron huérfanas y se **eliminaron** de
código y de las BD (locales y VPS).

## 3. Módulo WebCatalog y plan Superior

Siguiendo el patrón exacto de Elaboración (17) / MultiPayments (16):

| Pieza | Cambio |
|---|---|
| `Domain/Common/Enums/ModuleType.cs` | `WebCatalog = 18` (`[Description("Catálogo web")]`) |
| `Domain/Common/Enums/FeatureType.cs` | `WebCatalog = 122` (rango 12x libre; el 121 es Elaborations) |
| `ModuleEntityTypeConfiguration.cs` | Seed `Module.Create(18, "Catálogo web", order 140, priceIncluded: false, price: 5, discountPrice: 0, percentDiscountPrice: 100, availableToStore: true, isActive: true)` |
| `FeatureEntityTypeConfiguration.cs` | Seed feature 122 → módulo 18, `availableToStore: true` |
| `StorePlanModuleEntityTypeConfiguration.cs` | `(Superior, 18)` |
| **Migración EF** | `Add-WebCatalog-Module` + `WebCatalogModuleBackfill.cs` (tiendas `StorePlanId = 3` → `StoreModule(18)` + `StoreRoleFeature(122)` para OwnerAdmin/StoreUser, `ON CONFLICT DO NOTHING`) |
| **Script VPS** | `backend/scripts/24-20260927-Add-WebCatalog-Module.sql` (mismo contenido + registro en `__EFMigrationsHistory`) + entrada en `backend/scripts/README.md` |
| `RegisterCommand` / `StoreRoleFeatureGenerator` / `ChangeStorePlan` | **Cero cambios** (iteran el catálogo) |

> **Cerrado (D5):** el módulo 18 entra **solo en Superior**. VIP (4) no lo incluye; si algún día se quiere, es una línea más en el seed del plan.

## 4. Backend — API

### 4.1 Productos y categorías (campos nuevos)

- `CreateProductCommand` / `UpdateProductCommand` (+ validators + DTOs, `GetProductById`/listados): aceptan `description`, `percentDiscountPrice`, `discountPrice`, `isNew`, `image`, `images[]`.
- **`description` = texto plano (D9)**: sin HTML, sin sanitizador. Solo `HasMaxLength(4000)` + normalización de saltos de línea. Los campos nuevos son **opcionales** (null = no tocar) para que el formulario actual de Productos siga funcionando sin enviarlos.
- Validación de descuentos: `0 ≤ percentDiscountPrice ≤ 10000` (0–100 %) y `discountPrice ≥ 0`.
- **Precio final (D7 — se combinan):** `final = max(0, round(price × (10000 − percentDiscountPrice) / 10000, 2) − discountPrice)`. Ejemplo: `price 100` + `percentDiscountPrice 1250` (12.50 %) + `discountPrice 500` (5.00) → `100 − 12.50 = 87.50` → `87.50 − 5.00 = 82.50`. El cálculo vive en **un helper único del Domain** que consumen la API pública y el catálogo (no se persiste un precio final duplicado).

### 4.2 Imágenes (D3)

> **Implementado** bajo `/api/v1/catalog/*` (controlador `CatalogController` con `[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]`), para que todo el módulo viva en una sola ruta gateada por el módulo 18 en lugar de repartirlo en `ProductsController` (que exige `ProductsAdmin`).

| Endpoint | Descripción |
|---|---|
| `POST /api/v1/catalog/products/{id}/images` | Multipart (campo `file`); jpg/png/webp; ≤ 2 MB; máx. 6 por producto. Devuelve la clave guardada |
| `DELETE /api/v1/catalog/products/{id}/images?path={clave}` | Borra la fila y el archivo |
| `PUT /api/v1/catalog/products/{id}/images/order` | Reordena: body `{ paths: [...] }` con el orden final completo |
| `GET /api/v1/public/catalog/{storeSlug}/media/{**key}` | **Público**, sirve el archivo con `Cache-Control: immutable` (no se exponen rutas del filesystem y la clave debe pertenecer a la tienda del slug) |

> La galería **no** se acepta en `UpdateProductCommand`: la gestionan solo los endpoints de imágenes (una única dueña del dato). `image` (principal) sí viaja en el update, con `removeImage` para limpiarla.

### 4.2.1 Campos editables de la vista (D8)

| Endpoint | Descripción |
|---|---|
| `PUT /api/v1/catalog/products/{id}` | Guarda SOLO los campos del catálogo: `description`, `percentDiscountPrice`, `discountPrice`, `isNew`, `image`, `removeImage`. Body opcional (null = no tocar). Valida que el producto pertenezca a la **tienda seleccionada** (404 uniforme si no) |

> **Por qué un endpoint propio y no `PUT /v1/products/{id}`**: el endpoint de Productos recibe el producto COMPLETO, así que la vista del catálogo tendría que reenviar nombre, precio, orden y **código de barras** (que no edita) y los sobrescribiría con lo último que leyó; además exige `ProductsAdmin` (módulo Ventas). Con el endpoint dedicado, la vista del catálogo solo necesita el módulo 18 (frontera real, decisión D8).

- Almacenamiento: raíz configurable `Storage:CatalogImageRoot` (volumen del VPS), estructura `{tenantId}/{storeId}/{productId}/{guid}.{ext}`.
- Al reemplazar `image` principal, el archivo anterior se conserva hasta que el Owner lo borre explícitamente (evita roturas de catálogos publicados).

### 4.3 Sincronización (el botón "Sincronizar Catálogo")

| Endpoint | Descripción |
|---|---|
| `POST /api/v1/catalog/sync` | Auth + módulo **18** activo en la tienda + **Owner**. Body opcional `{snapshot: {categories, products}}` con el **catálogo local del POS** (D11): con snapshot, el backend lo espeja a las tablas normales (categorías/productos del dispositivo + desactivar lo que ya no existe). Sin body solo asegura el slug y la fecha. La publicación es DIRECTA (§11): lo que hay en `Product`/`ProductCategory` ES el catálogo. Responde `{storeSlug, catalogUrl, syncedAt, categoriesCreated, categoriesUpdated, productsCreated, productsUpdated, productsDeactivated}` |
| `PUT /api/v1/catalog/products/{id}` | Auth + módulo **18** + **Owner**. Guarda SOLO los campos del catálogo (descripción, % descuento, precio rebajado, "Nuevo", imagen principal). Acepta también los hechos del producto para crear el espejo si aún no existe (el POS es su dueño). `null` = no tocar; 404 uniforme para productos de otra tienda |
| `GET /api/v1/catalog/status` | Slug público, `CatalogSyncedAt` y contadores del origen (categorías, productos, publicados y sin imagen) para pintar la vista |
| `GET /api/v1/catalog/preview` | (Opcional) resumen de lo que cambiaría, sin escribir — **descartado** (O3: sin dry-run en fase 1) |

Reglas: se crean las faltantes (por `SourceId`), se **actualizan valores** de las existentes; categorías antes que productos; un producto cuya categoría no existía genera su categoría. Producto no `AvailableToSale` en origen (o categoría inactiva) → su copia se marca `IsActive = false`, nunca se borra (**D6**).

### 4.4 API pública del catálogo (anónima)

| Endpoint | Descripción |
|---|---|
| `GET /api/v1/public/catalog/{storeSlug}` | Tienda (nombre, slug) + categorías activas con su conteo de productos |
| `GET /api/v1/public/catalog/{storeSlug}/products?categorySlug=&search=&page=&pageSize=` | Listado paginado de publicados activos (pageSize máx. 60; `sort` implícito: categoría → orden → nombre) |
| `GET /api/v1/public/catalog/{storeSlug}/products/{productId}` | Detalle (descripción + galería). El `productId` ES el **id del producto** (publicación directa, §11) |

Sin auth; `404` uniforme para slug inexistente o sin catálogo publicado (no distingue el motivo); política de rate-limit propia; respuesta con ETag/caché corta.

## 5. Frontend

### 5.1 Enums y menú

- `packages/domain/src/enums`: `EModules.WebCatalog = 18`, `EFeatures.WebCatalog = 122` (+ tests de enums como los de Elaboration/MultiPayments).
- `menu-config.ts`, sección `MENU.SALES`, **inmediatamente después** de `MENU.PRODUCTS`:
  - `label: 'MENU.WEB_CATALOG'`, `path: '/sales/web-catalog'`, `featureIds: [EFeatures.WebCatalog]`, `moduleId: EModules.WebCatalog`, `rolesOnly: (user) => user.isOwnerAdmin` (el módulo ya lo gatea `moduleId`; el Owner-only lo pina `rolesOnly`).

### 5.2 Vista "Catálogo Web" (`/sales/web-catalog`)

- Cabecera: **URL pública** (`/catalog/<slug>` con botón copiar), estado de última sincronización y botón **"Sincronizar Catálogo"** (deshabilitado mientras corre; toast con el resumen).
- Lista por categoría con edición de los campos extra por producto: descripción (**`textarea` de texto plano**, D9), `% descuento`, `precio rebajado`, `Nuevo` (toggle), imagen principal y **galería** (subir, ordenar, borrar, previsualizar, ≤ 2 MB y 6 por producto).
- Vista previa del catálogo público (botón "Ver catálogo") abriendo `/catalog/<slug>`.
- Guard de ruta: módulo 18 + Owner (loader que desloguea/deniega como el resto de vistas gateadas).

### 5.3 Catálogo público (`/catalog/:storeSlug`)

- Ruta **pública** en `app/routes.ts`, fuera del layout autenticado (junto a `login`/`register`): header de tienda, buscador, filtro por categoría, grid con badges (Nuevo / % descuento / precio rebajado).
- Detalle: al **tap** se abre el producto con la **descripción HTML sanitizada** y la **galería** de imágenes (principal + `images[]`), con ampliación.
- Descuentos (**D7**): con `%` y `precio rebajado` a la vez, la tarjeta y el detalle muestran el **precio final combinado** (helper compartido), el `%` y el precio original tachado.
- Se replica el look/UX del template (tarjeta, badges, detalle) con nuestros componentes.
- **Nota SEO (O4):** la app es `ssr: false`; el catálogo público será cliente (sin meta tags por producto). Fase 1 lo acepta; si se quiere SEO, se evalúa prerender del shell o SSR de esa ruta.

### 5.4 i18n

- Keys nuevas en `app/shared/lib/i18n/es.ts` (`MENU.WEB_CATALOG`, `WEB_CATALOG.*`, `CATALOG_PUBLIC.*`).
- **Sin editor HTML (D9)**: la descripción se edita en un `textarea` con contador de caracteres; el catálogo público la renderiza como texto (saltos de línea preservados), nunca con `dangerouslySetInnerHTML`.

## 6. Tests

### 6.1 Backend — unitarios nuevos

- `Domain.UnitTests`: escalas (`toDecimal/fromDecimal`), invariantes de descuentos, `normalizeSlug` (tildes, ñ, colisiones → `-2`, recorte 63), entidades del catálogo.
- `Application.Tests`: `Catalog.WebCatalogCatalogTests.cs` (catálogo: 18 en Superior, **no** en Gratis/Pago/VIP), validators de producto con campos nuevos (rangos de descuento, longitud de descripción), **fórmula combinada del precio final (D7: %, luego monto, con piso en 0)**, `CatalogSyncService` (crear / actualizar / idempotencia / categoría faltante / producto inactivo), generación de slug único (sufijo ante colisión).

### 6.2 Backend — E2E nuevos (cubren el módulo al 100 %)

| Archivo (nuevo) | Qué cubre |
|---|---|
| *(sin archivo propio)* | Módulo 18 en el catálogo de planes: **no** hizo falta una suite nueva — se cubre ampliando los tests de planes que ya existían (`Plans/StorePlanCatalogTests.cs`, `Plans/PlanChangeMatrixTests.cs`, `Auth/MeAfterOwnerPlanChangeTests.cs`, ver §6.3); el gating de módulo/rol está en `Catalog/WebCatalogModuleGatingTests.cs` y el backfill de tiendas existentes se verifica en `Application.Tests/Catalog.WebCatalogCatalogTests.cs` (junto a la migración `WebCatalogModuleBackfill.cs`) |
| `Catalog/WebCatalogSyncTests.cs` ✅ (6) | Sync servidor-a-servidor crea todo; segundo sync solo actualiza (conteos + valores); gating sin módulo (403/404); solo Owner; resumen correcto; producto/categoría origen borrado → desactivado |
| `Catalog/WebCatalogSnapshotTests.cs` ✅ (7) | El botón "Sincronizar Catálogo" con snapshot (D11): espejo del catálogo local (categorías/productos nuevos y actualizados, ids del POS respetados), despublicar lo que ya no está en el dispositivo (nunca borrar), `images: null` no toca la galería y lista vacía la limpia, topes del snapshot (501/5001 → 400 sin escribir), coherencia producto↔categoría (categoría colgante → 400), colisión de id con otra tienda → 400 |
| `Catalog/WebCatalogProductFieldsTests.cs` ✅ (9) | Editar los campos por el endpoint dedicado: valores guardados y visibles en la lista, `null` = no tocar y el resto del producto intacto, `removeImage` limpia solo la principal, rangos inválidos → 400 sin tocar el producto, producto de otra tienda → 404 (id inventado y id de otra tienda responden igual), sin módulo → 403, el sync publica exactamente lo guardado (texto plano con saltos + precio final combinado), quitar de la galería la imagen principal no deja punteros rotos, y un producto que **solo existe en el dispositivo** se crea desde los hechos de la vista |
| `Catalog/WebCatalogImagesTests.cs` ✅ (7) | Subida válida / tipo inválido / tamaño excedido / límite 6; borrado; servido público; 404 de media inexistente |
| `Catalog/WebCatalogPublicApiTests.cs` ✅ (7) | Endpoints anónimos del catálogo público: slug con sufijo ante colisión, 404 uniforme, no expone inactivos, paginación/búsqueda/filtro |
| `Catalog/WebCatalogModuleGatingTests.cs` ✅ (3) | Gating del módulo 18 y del rol: sin módulo → 403, StoreUser → 403, Owner → 200; y la vuelta de las guardas invertidas (D12) en categorías/productos |
| `Catalog/WebCatalogSeed.cs` ✅ | Utilidad compartida de siembra de las suites del catálogo |

`dotnet test --filter "FullyQualifiedName~Catalog"` → **60/60 passed**.

### 6.3 Tests EXISTENTES tocados — **reporte 1 a 1**

Al correr la suite completa rompieron **menos** de los previstos: las entradas B2, B3, B4, B6, B7 y B8 del borrador no se tocaron (afirman "no contiene" o no fijan conteos exactos). Esto es todo lo que se modificó, con permiso explícito y el reporte en simple:

| # | Test | Qué prueba | Problema en simple | Cambio |
|---|---|---|---|---|
| 1 | `Plans/StorePlanCatalogTests.cs:76` | El catálogo de planes es exacto para Superior y VIP | Superior gana el módulo 18, así que la lista esperada quedaba corta | Añadido `ModuleType.WebCatalog` a la lista de Superior (VIP **sin** cambios) |
| 2 | `Plans/PlanChangeMatrixTests.cs:83,124` | Universo de módulos por plan y mapa módulo→features | Faltaban el módulo 18 y su feature 122 | Añadido 18 a Superior y `18 => [122]` al mapa |
| 3 | `Auth/MeAfterOwnerPlanChangeTests.cs:81` | `/me` tras cambiar de plan expone los módulos del plan | Faltaba 18 en la lista esperada | Añadido `ModuleType.WebCatalog` |
| 4 | `Catalog/WebCatalogProductFieldsTests.cs` | (archivo **nuevo** del módulo) | — | **Solo se AÑADIÓ un `[Fact]`** (producto que solo existe en el dispositivo se crea desde los hechos que manda la vista). No se cambió ninguna aserción existente |
| 5 | `frontend-react/e2e/support/global-teardown.ts` | (no es aserción: barrido de datos `e2e-*`) | Con D11 las tiendas e2e **sí** dejan filas de producto en el servidor, así que `DELETE FROM "Store"` chocaba con `FK_ProductCategory_Store_StoreId` y el teardown fallaba | 3 `DELETE` nuevos, hijos primero: `ProductImage`, `Product`, `ProductCategory` |

> Ningún test se tocó sin permiso explícito, y ningún cambio alteró lo que el test verifica: solo se ampliaron listas de expectativa (módulo/feature que el plan gana) y, en el archivo nuevo, se añadió un caso más.

### 6.4 Frontend ✅

- **Vitest** (todos verdes; suite completa **328 archivos / 4790 tests**): `web-catalog-format.test.ts` (escalas, precio final D7 y límites D10), `catalog-http-service.test.ts` (endpoints, incluidos los 3 públicos, el multipart y el body `{snapshot}`), `catalog-snapshot.test.ts` (SNAP-1..6: la foto del catálogo local sale de los repositorios locales, nunca manda galería), `web-catalog.test.tsx` (vista + gate del loader: Owner con módulo entra, sin módulo y StoreUser se desloguean; guardas, validaciones, subida, "la primera imagen queda como principal" y "sin tienda seleccionada no sincroniza"), `public-catalog.test.tsx` (grid, badges, filtro, búsqueda, paginación, detalle en texto plano, 404 y sin conexión) y `media-url.test.ts`.
- **Playwright** (nuevo spec, no toca los existentes): `web-catalog.spec.ts` + `support/web-catalog-fixture.ts` — owner privado en Superior (módulo 18 por `change-plan` con SuperAdmin), **categoría y producto creados por la UI real del POS** (D11: `support/web-catalog-fixture.ts` ya no siembra nada por API), la vista Catálogo Web vacía, `Sincronizar Catálogo` con su resumen (`1 categorías nuevas, … 1 productos nuevos`), edición de los campos + 2 imágenes, segundo `Sincronizar Catálogo` (`0 nuevas, 1 actualizada, 0 nuevos`) y la URL pública abierta en un **contexto anónimo** mostrando tarjeta (`$82.50` sobre `$100`), badges `Nuevo`/`-12.5%`, detalle en texto plano y galería servida por la API pública. El fixture usa un dueño privado (nunca una persona compartida) para no gastar el presupuesto de logins ni tocar el plan de las personas existentes.

## 7. Operación (VPS)

1. Scripts `24` y `25` (módulo + feature + plan Superior + campos), luego el **26 combinado** `26-20260928-Currency-SalePaymentMethod-And-WebCatalog-Vip.sql` — cierra los huecos del 16/09 (Currency) y 17/09 (método de pago) y añade el módulo 18 al plan VIP con backfill de tiendas VIP activas.
2. Volumen persistente para las imágenes del catálogo (`Storage:CatalogImageRoot`) + inclusión en el backup.
3. nginx/loadbalancer: sin cambios de rutas (todo cae bajo `/api` y el SPA ya sirve deep links); **subir `client_max_body_size`** a ~5 MB para las subidas.
4. Verificación post-deploy: `GET /api/v1/catalog/status` con una tienda Superior y `GET /api/v1/public/catalog/<slug>` anónimo.

## 8. Decisiones abiertas (defaults propuestos — objeta cualquiera y se ajusta el plan)

**Cerradas con el Owner (2026-09-27):** D5 VIP = solo Superior *(enmendada 2026-09-28: también VIP)* · D6 desactivar la copia · D7 descuentos se combinan · D8 edición solo en la vista Catálogo Web.

- **O1** — SEO del catálogo público: fase 1 sin SSR (la app es `ssr: false`), sin meta tags por producto. *Default: aceptado.*
- **O2 — CERRADA (D9)**: descripción en **texto plano**; sin editor HTML y sin sanitizador (no se añade ninguna dependencia).
- **O3** — Vista previa del sync (dry-run): *default: no en fase 1.*

## 9. Fases y verificación (comandos del README)

| Fase | Contenido | Verificación |
|---|---|---|
| F1 ✅ | Enums 18/122, seeds, `StorePlanModule`, migración + backfill, script VPS | `dotnet build` OK · Domain 76/76 · Application 532/532 · **E2E backend 576/576** |
| F2 ✅ | Campos nuevos en `Product`/`ProductCategory`/`Store` (+ `ProductImage`), validators de rangos, subida/servido de imágenes (`ICatalogImageStorage`), migración `Catalog-Product-Fields-And-Images` + script 25 | Domain 76/76 (nuevos: escalas, precio final, slug) · Application 532/532 (14 nuevos de validadores + handler) |
| F3 ✅ | Tablas publicadas (CatalogCategory/CatalogProduct/CatalogProductImage) + `SyncCatalogCommand`, `/catalog/sync`, `/catalog/status` y API pública `/public/catalog/*`, migración `Catalog-Published-Tables` — *(sustituido por la publicación directa de §11 el 2026-09-28; las tablas se eliminaron de código y BD)* | **E2E del módulo al 100 %** (`--filter "FullyQualifiedName~Catalog"` → 60/60) + suite E2E backend completa |
| F4 ✅ | Frontend: enums, menú (`moduleIds` + `rolesOnly`), vista Catálogo Web (`app/sales/routes/web-catalog.tsx`), editor por producto, servicio HTTP, i18n, tests | `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (web-store-pos **328 archivos / 4790 tests**) |
| F5 ✅ | Catálogo público `/catalog/:storeSlug` (`app/catalog/routes/public-catalog.tsx`, ruta pública fuera del layout autenticado) + i18n `CATALOG_PUBLIC.*` + spec Playwright nuevo + D11 (snapshot del catálogo local) de punta a punta | Vitest de la vista pública ✅ · **Playwright `pnpm test:e2e --workers=4` → 338 passed / 2 flaky (ajenos) / 0 failed** |

Cada fase cierra con los checks del README antes de pasar a la siguiente; la suite E2E backend completa se corre al final de F3 y la de frontend en F5.

**Verificación final (2026-09-28) — plan cerrado, sin pendientes:**

| Suite | Comando | Resultado |
|---|---|---|
| E2E backend (completa) | `cd backend && dotnet test src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` | **617 passed / 0 failed** (3 m 16 s) |
| E2E backend (solo catálogo) | `dotnet test … --filter "FullyQualifiedName~Catalog"` | **60 passed / 0 failed** |
| E2E frontend | `cd frontend-react && pnpm test:e2e --workers=4` | **338 passed / 2 flaky / 0 failed** (5.7 m) · teardown 2686 filas |
| Vitest | `pnpm test` (turbo) | **328 archivos / 4790 tests** · `Type Errors: no errors` |
| Estáticos | `pnpm typecheck` · `pnpm lint` | ✅ (5/4 tasks successful) |

Los 2 flaky de Playwright son ajenos al módulo (`e2e/create-store-user.spec.ts:28`, `e2e/credits-history.spec.ts:89`).

## 10. Notas de operación y hallazgos al implementar

### 10.1 El catálogo se publica desde el catálogo LOCAL del POS (D11, decidido)

Hallazgo que motivó D11: el POS es **offline-first** (`GlobalConfig.USE_ONLINE_SERVICE:false`, igual que en Angular), así que los productos viven en el dispositivo y el servidor nunca los conoce por su cuenta — los servicios "online" de productos son código muerto y el "enviar datos" del sync es un ZIP dispositivo-a-dispositivo (blob), no una subida al servidor. Publicar la tabla `Product` del servidor daba un catálogo **vacío** para cualquier tienda real.

Por eso "Sincronizar Catálogo" envía un **snapshot** del catálogo local (`CatalogSnapshotDto`: categorías + productos con sus hechos y los ids Guid del POS) y el backend lo **espeja** (`CatalogMirrorWriter`) antes de publicar:

- El espejo respeta el id del dispositivo, para que la copia publicada siga siendo 1:1 con el origen y re-sincronizar sea idempotente.
- Solo viajan **hechos** (nombre, precio, categoría, orden, disponibilidad, moneda, código de negocio); la descripción, los descuentos, "Nuevo" y la imagen principal **no** van en el snapshot, así que el espejo nunca pisa lo que se editó en la vista Catálogo Web (D8). La galería tampoco viaja (`images: null` = no tocar): las fotos se suben desde la vista y viven en el servidor.
- Lo que ya no está en el dispositivo se marca inactivo (D6: despublicar, nunca borrar). El backend valida topes (500 categorías / 5000 productos), coherencia producto↔categoría y colisión de id con otra tienda.

Flujo real de la tienda, tal como queda: **(1) crear los productos en Catálogo Productos → (2) en Catálogo Web, pulsar Sincronizar Catálogo (sube y publica) → (3) completar descripción, descuentos e imágenes → (4) Sincronizar Catálogo otra vez para publicar esos campos**. El paso 4 existe porque editar un producto no republica por sí solo: el sync es el único acto de publicación. El vacío de la lista explica el paso 2 (`WEB_CATALOG.NO_PRODUCTS`).

### 10.2 Las imágenes del backend se resuelven contra el origen de la API

El backend devuelve rutas raíz-relativas (`/api/v1/public/catalog/<slug>/media/<clave>`). En producción el SPA y la API comparten origen (nginx proxyfica `/api`), pero en desarrollo y en la suite E2E `API_URL` es **absoluta** (`http://localhost:5019/api`) y un `<img src="/api/...">` pegaría al dev server (:3333), que no proxyfica `/api`: la imagen salía rota. Se añadió `shared/lib/http/media-url.ts` (`apiFileUrl`), que resuelve la ruta contra el mismo `API_URL` que usa `api-client.ts`, y lo consumen el editor del catálogo y la página pública.

### 10.3 Verificación completa ✅ y los 5 bugs que destapó

El spec `e2e/web-catalog.spec.ts` se ejecutó con el entorno E2E limpio: (1) parar el dev server manual de :3333, (2) levantar el backend con `dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e` (:5019, health `/health`), (3) borrar `apps/web-store-pos/node_modules/.vite` (el paquete `@store-mgmt/domain` se reconstruyó con los enums 18/122) y (4) `pnpm test:e2e --workers=4` desde `frontend-react/`. Resultado: **338 passed / 2 flaky ajenos / 0 failed**. Correr la suite de verdad encontró **cinco bugs reales**, todos con cobertura ya añadida:

1. **Cuatro guardas invertidas (D12)** — `CreateProductCategoryCommand.cs:43`, `ImportCsvProductsCommand.cs:56`, `GetToEntryProductsQuery.cs:44`, `HasAnyAvailableToSaleProductQuery.cs:38` usaban `!string.IsNullOrEmpty(StoreId)`, así que devolvían **400 "Tienda no encontrada" justo cuando SÍ había tienda**. Fix: `string.IsNullOrEmpty(StoreId)` en los cuatro.
2. **NRE en `SyncCatalogCommandValidator.cs:45`** — la regla `.Must(images => images.Count <= 6)` reventaba con `NullReferenceException` (500) porque el POS manda `images: null` (la galería no viaja en el snapshot). Fix: `images is null || images.Count <= ProductEntityLimits.MaxImagesPerProduct`.
3. **Tracking del contexto (`QueryTrackingBehavior.NoTracking` global)** — las categorías creadas por el espejo quedaban *tracked*, y al releerlas para resolver el slug el contexto lanzaba *"The instance of entity type 'ProductCategory' cannot be tracked because another instance with the same key value for {'Id'} is already being tracked"*. Fix: `CatalogMirrorWriter.MirrorCatalogAsync` ahora **devuelve `IList<ProductCategory>`** (existentes + creadas, ordenadas) y `SyncCatalogCommand` usa ese resultado en vez de releer `GetByStoreIdAsync`.
4. **`PUT /v1/catalog/products/{id}` daba 400 en vez de 404** cuando el producto no existe y no vienen hechos. Fix: 404 uniforme (un id inventado y uno de otra tienda responden igual), devuelto por `CreateMirrorAsync`.
5. **`415 Unsupported Media Type` al subir una imagen** — `api-client.ts` fija `Content-Type: application/json` global y **axios 1.16.1 convierte el `FormData` a JSON** al ver ese tipo. Fix en `uploadImage`: `{ headers: { 'Content-Type': 'multipart/form-data' } }` (axios borra la cabecera en el adaptador XHR y el navegador pone el boundary).

También por D11: como las tiendas e2e ahora dejan filas de producto en el servidor, el barrido `e2e-*` de `global-teardown.ts` fallaba con `FK_ProductCategory_Store_StoreId`; se añadieron los 6 `DELETE` de §6.3 (hijos primero). En corridas intermedias aparecieron flaky ya conocidos y ajenos al módulo (`StoreDeactivationSessionTests`, `OwnerStoreSwitcherFlowTests` en .NET; `create-store-user.spec.ts:28`, `credits-history.spec.ts:89` en Playwright); la corrida final .NET salió limpia (617/617).

## 11. Revisión 2026-09-28 — publicación DIRECTA sobre las tablas normales (decisión del Owner)

**El Owner revirtió la arquitectura de "copia publicada"**: no se aprobó nunca una capa de tablas
`Catalog*` espejo. La regla es la que se pidió desde el principio: **la sincronización escribe
sobre las tablas que ya había** (`Product`, `ProductCategory`, `ProductImage`, con los campos del
script 25) y el catálogo público **lee directamente de ellas** (lectura pura y anónima; el CRUD
sigue con sus permisos).

### Qué cambió

| Antes (copia publicada) | Ahora (publicación directa) |
|---|---|
| El sync espejaba el snapshot y LUEGO publicaba a `Catalog*` | El sync escribe el snapshot en las tablas normales y ya está: eso ES el catálogo |
| El público leía `CatalogProduct` (id de copia) | El público lee `Product` — el **id público es el id del producto** |
| Editar un campo exigía re-sincronizar para verse público | **Publicación al instante**: guardar en la vista basta (no hay segundo paso) |
| "Fuera de venta" se despublicaba en la copia | Fuera de venta / inactivo => no aparece en el público (mismo filtro: activo + en venta + categoría activa con slug) |
| Slugs de categoría generados al publicar la copia | Slugs generados una sola vez y guardados en `ProductCategory.Slug` (URLs estables) |

**Hallazgo técnico:** las consultas públicas (anónimas, sin tenant en el contexto) NO pueden leer
`ProductCategory` con el filtro global por tenant — responde vacío. Por eso la cabecera y el filtro
de categoría del listado se construyen **desde los productos publicados** (cada producto trae su
categoría), todas las lecturas públicas con `IgnoreQueryFilters`. Mismo motivo por el que el
rellenado de slugs vive dentro del espejo (una sola lectura; releer categorías chocha con las
instancias tracked del contexto NoTracking).

### Tablas `Catalog*`: eliminadas (2026-09-28)

`CatalogCategory` / `CatalogProduct` / `CatalogProductImage` (migración
`20260927193020_Catalog-Published-Tables`) **se eliminaron** por decisión del Owner: la publicación
directa las dejó sin uso. Se quitó la migración EF, entidades/repositorios/configuraciones, los
DbSets y sus bloques del snapshot. Las BD locales (`smca`, `smca_test`) están limpias, y el VPS
debe limpiarse con el ROLLBACK del script 26 original (las tablas allí se crearon con la corrida
del 27-09): `DROP TABLE IF EXISTS "CatalogProductImage", "CatalogProduct", "CatalogCategory"` +
borrar la fila de `__EFMigrationsHistory`. No hay script de drop numerado: los scripts numerados
son solo para crear/transformar, nunca para destruir (decisión del Owner).

### WebCatalog también en VIP (2026-09-28)

Los planes son **autocontenidos** (decisión del Owner): todo lo que aparece en Superior aparece en
VIP. Migración EF `20260928191227_Add-WebCatalog-Module-Vip` (fila `(4, 18)` en `StorePlanModule`),
backfill compartido `WebCatalogModuleBackfill` ahora con `StorePlanId IN (3, 4)`, y script 26
combinado para el VPS (`26-20260928-Currency-SalePaymentMethod-And-WebCatalog-Vip.sql`) que además
cierra los huecos del 16/09 (Currency) y 17/09 (precios por método de pago). Seed, backfill, tests
de planes y gating ya alineados.

### Verificación tras la revisión

| Suite | Resultado |
|---|---|
| E2E backend `--filter "FullyQualifiedName~Catalog"` | **63/63 passed** |
| E2E backend completa | **620/620 passed** (5 m 52 s) |
| Application.Tests catálogo | 45/45 passed |
| Vitest (frontend) | 328 archivos / 4790 tests, typecheck y lint OK |

El contrato HTTP del frontend no cambió (mismos endpoints, mismos DTOs) — no hizo falta tocar código
de frontend.

### Hueco pendiente en los scripts del VPS (aparcado por el Owner)

Las migraciones `20260916213905_AddCurrencyToStoreEntities` y `20260917194809_Add-SalePaymentMethod-Pricing`
**nunca tuvieron script SQL** → en el VPS y en la BD local `smca` faltan las columnas `Currency`
(Product/Order/OrderItem/InventoryEntry/InventoryEntryCost) y `Order.Percent/Tax/SalePaymentMethod`;
el error `column p.Currency does not exist` al abrir Catálogo Web es exactamente eso. Verificado:
`smca_test` las tiene; `smca` (local) y el VPS no. Generar scripts 27/28 quedó **aparcado** por el
Owner — sin ellos el catálogo no arrancará en esas bases.
