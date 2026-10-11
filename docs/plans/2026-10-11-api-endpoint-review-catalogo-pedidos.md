# API endpoint review — Catálogo Web / Pedidos WhatsApp / Gestión de Pedidos

**Fecha:** 2026-10-11
**App:** `SMCA.WebApi` (backend)
**Skill:** `api-endpoint-review` (8 dimensiones: seguridad, rendimiento, clean code, patrones,
errores, anti-patrones, memoria, diseño REST)
**Alcance:** los 34 endpoints de los módulos **18 Catálogo Web**, **19 Pedidos WhatsApp** y
**20 Gestión de pedidos**, revisados en **9 unidades** (8 controladores completos + las 2 acciones
`catalog-template` de `StoresController`).
**Estado:** revisión hecha (solo lectura). **Nada implementado.** Cada fix toca **código de
producción backend** (y en un caso un E2E existente) → requiere aprobación explícita por punto.

## Cómo usar este plan

- Cada hallazgo es una casilla. Se marca `[x]` cuando está **implementado y verificado**, no cuando
  se decide.
- Convención de severidad de la skill: `HIGH` = bug de producción o vulnerabilidad · `MEDIUM` =
  rendimiento/mantenibilidad/contrato · `LOW` = estilo/mejora menor.
- Al cerrar un punto, anotar commit + evidencia observada (comando + resultado).
- Los fixes de backend **no** se aplican sin aprobación del owner (regla AGENTS.md).

## Aclaraciones del owner (decisiones)

**A1 — El Owner gestiona VARIAS tiendas.** Un Owner es dueño de varias tiendas y puede gestionar
todo de todas ellas. Por tanto, "tocar otra tienda del mismo dueño" **no es** por sí mismo una
brecha de autorización. Lo que hay que garantizar es **el aislamiento por tienda de la operación**:
si estoy operando la tienda seleccionada, la petición no debe mutar datos de **otra** tienda
(aunque sea del mismo dueño). El filtro EF por **tenant** ya impide tocar otra cuenta; falta la
verificación por **store** en el recurso concreto. → Reclasifica varios hallazgos de "IDOR/cross-store
(seguridad)" a "**scope por tienda (corrección)**", salvo que un tenant pueda alojar tiendas de
owners distintos (pendiente de confirmar; si aplica, recupera la severidad de seguridad).

## Resumen por unidad

| # | Unidad | Score |
| --- | --- | --- |
| 1 | `CatalogController` (catálogo admin) | 6.5 |
| 2 | `CatalogBrandingController` | 7.0 |
| 3 | `CatalogShowcaseController` | 6.5 |
| 4 | `PublicCatalogController` (público) | 5.5 |
| 5 | `OnlineOrderingController` (config) | 6.5 |
| 6 | `OnlineOrdersController` (gestión) | 7.0 |
| 7 | `DeliveryDriversController` | 6.5 |
| 8 | `PublicOrderingController` (público) | 7.0 |
| 9 | `StoresController` — `catalog-template` | 7.5 |

## Temas transversales (una casilla por tema, aplica a varias unidades)

- [ ] **X1 — Límite multipart global sin tope real.** `Program.cs:126-131` pone
      `MultipartBodyLengthLimit` y `MemoryBufferThreshold` en `int.MaxValue` → el cuerpo entero se
      bufferea en RAM **antes** de que corra la regla de 2 MB. Afecta a las subidas de catálogo/marca/
      showcase. Fix: `RequestSizeLimit`/`RequestFormLimits` por acción y volver al spill a disco
      (64 KB). (Unidades 1, 2, 3.)
- [ ] **X2 — `EntityState.Modified` sobre `NoTracking` = full-row overwrite.** `GenericRepository.cs:29-33`
      marca TODA la fila como modificada; en escrituras parciales revierte cambios concurrentes de
      columnas que el handler no tocó. (Unidades 5, 6, 7.)
- [ ] **X3 — `UpsertAsync` check-then-act → 500.** `StoreCatalogSettingsRepository.cs:59-74` hace
      `AnyAsync`+`Add`; dos peticiones concurrentes chocan en el índice único `StoreId` → 500.
      Fix: `ON CONFLICT` o mapear `23505` a **409**. (Unidades 2, 5, 9.)
- [ ] **X4 — OpenAPI declara solo el 200.** Casi todas las acciones no declaran 400/401/403/404/409
      que sí devuelven. (Todas.)
- [ ] **X5 — `200 { succeeded:true, data:false }` como éxito.** Escrituras que afectan 0 filas
      devuelven éxito. (Unidades 1, 3, 6, 7.)
- [ ] **X6 — Errores de cliente contestan 500.** `DbUpdateException`/desbordes `int` → 500 en vez de
      409/400. (Unidades 4, 5, 6, 8, 9.)
- [ ] **X7 — `CancellationToken` aceptado y descartado** antes de la BD. (Unidades 4, 6, 7.)
- [ ] **X8 — Cobertura E2E ausente** en la mayoría de estos recursos (solo unit tests con repos
      mockeados; el repo ya se comió un bug así). (Unidades 3, 6, 7, 9.)
- [ ] **X9 — `ToDto`/proyecciones duplicadas** (GET y PUT con copias que pueden divergir).
      (Unidades 5, 7.)

---

## Unidad 1 — `CatalogController` (7 endpoints)

`POST /catalog/sync` · `GET /catalog/status` · `GET /catalog/products` ·
`PUT /catalog/products/{id}` · `POST|DELETE /catalog/products/{id}/images` ·
`PUT /catalog/products/{id}/images/order`

### HIGH
- [x] **1.1 — Falta scope por tienda en los endpoints de imagen (reclassificado por A1).** — **HECHO
      2026-10-11** (`36e7f30b`): guard compartido `ProductStoreAccess` (404 uniforme) aplicado a
      add/remove/reorder, y `UpdateProductCatalogFieldsCommand` reusa el mismo. Test del caso
      cross-store añadido.
      `AddProductImageCommand.cs:51`, `RemoveProductImageCommand.cs:41`,
      `ReorderProductImagesCommand.cs:38`: cargaban el producto por el `productId` de la ruta sin
      comprobar que fuera de la **tienda del contexto**.
- [x] **1.2 — `CatalogMirrorWriter.CategoryResult` es estado estático mutable.** — **HECHO 2026-10-11**
      (`548eb20f`): `MirrorCatalogAsync` devuelve `CatalogMirrorResult` (counts + categorías); la
      propiedad `static` eliminada; `SyncCatalogCommand` usa el retorno.
- [x] **1.3 — `ReorderProductImagesCommand` acepta rutas duplicadas.** — **HECHO 2026-10-11** (`36e7f30b`):
      el guard exige ahora biyección (diccionario por path + set distinct), y se eliminó el scan O(n²).
- [x] **1.4 — El límite de subida de 2 MB se evalúa tras bufferear en RAM (ver X1).** — **HECHO
      2026-10-11** (`8449cc2b`): `MemoryBufferThreshold` a 64 KB (vuelca a disco), cuerpo global a
      8 MB, y `[RequestSizeLimit]` por acción (2 MB en 1 archivo; 4 MB en marca). El "2 MB es por
      ARCHIVO" (decidido con el owner: 1 archivo por request, producto/showcase; 2 en marca).
      `Program.cs:129-130`.

### MEDIUM
- [x] **1.5 — `Product.Image` se escribe desde un string del cliente sin verificar pertenencia.** —
      **HECHO 2026-10-11** (`9bcc1e7a`): valida con `ICatalogImageStorage.BelongsToStore` (400 si la
      clave no es de la tienda) + test negativo.
- [x] **1.6 — `GET /catalog/status` materializa todo el grafo de productos para contar 3 enteros.** —
      **HECHO 2026-10-11** (`09a4356e`): `CountForCatalogStatusAsync` / `CountByStoreIdAsync` (COUNT
      en SQL, sin materializar).
- [x] **1.7 — `SyncCatalogCommand` arma la URL a mano.** — **HECHO 2026-10-11** (`e3c0c020`): usa
      `CatalogPublicUrls.Catalog(storeSlug)`, el mismo builder que la vista de estado.
- [x] **1.8 — DECISIÓN (2026-10-11): no se hace ahora.** Refactor cosmético de `SyncCatalogCommand`
      (extraer helpers) sin cambio de comportamiento; el riesgo no compensa por ahora.
- [x] **1.9 — DECISIÓN (2026-10-11): se deja como está.** `Success(SaveChanges()>0)` → 200 con
      `data:false` es el patrón **vigente en todo el proyecto**; no se cambia aquí. (No se toca.)
- [x] **1.10 — `MirrorGalleriesAsync` rompe el invariante de imagen principal.** — **HECHO 2026-10-11**
      (`0d28fa97`): limpia `Product.Image` cuando el sync borra su fila de galería.
- [x] **1.11 — R5–R7 sin `AbstractValidator`.** — **HECHO 2026-10-11** (`f649a6f8`): validadores
      declarativos de forma (ProductId, Path(s) presentes + longitud, lista de reordenado no vacía y
      dentro del tope). El formato/tamaño del archivo y la biyección siguen en el handler.

### LOW (diferidos 2026-10-11 — no críticos)
- [ ] **1.12 — DTO `ReorderProductImagesRequest` vive en WebApi** (`CatalogController.cs:98-101`).
- [ ] **1.13 — `UpdateProductCatalogFieldsCommand` es la única clase mutable** (por `request.Id =`).
- [ ] **1.14 — `[ProducesResponseType]` incompletos** (solo 200). Ver X4.
- [ ] **1.15 — `DELETE` devuelve 200+bool** en vez de 204. `[FromQuery] path` sin validar longitud.

---

## Unidad 2 — `CatalogBrandingController` (2 endpoints)

`GET|PUT /catalog/branding`

### HIGH
- [ ] **2.1 — Tercera ventana de compensación F8-R1/R2.** El `try` abre en
      `UpdateStoreCatalogBrandingCommand.cs:134`, pero los `ResolveAsync` están en `:122-125` (fuera).
      Un fallo de E/S al escribir el **banner** deja el **logo** recién subido huérfano. Fix: mover
      los dos `ResolveAsync` dentro del `try` (las listas `newKeys`/`obsoleteKeys` ya cubren).
- [ ] **2.2 — La compensación usa el `CancellationToken` de la petición** (`:154`,`:177`) → en una
      cancelación (causa típica del fallo parcial) el `DeleteAsync` lanza al instante y la limpieza
      **nunca ocurre**. Fix: `CancellationToken.None` en los borrados de limpieza.

### MEDIUM
- [ ] **2.3 — Límite multipart (ver X1).**
- [ ] **2.4 — Validación de archivo por extensión O content-type, ambos del cliente; sin magic bytes.**
      `CatalogImageUploadRules.cs:19-26`. Fix: verificar firma (12 bytes) + `X-Content-Type-Options: nosniff`
      en el endpoint público de media.
- [ ] **2.5 — Sin concurrencia optimista** (`last-write-wins` + huérfanos garantizados). Fix: rowversion.
- [ ] **2.6 — `PUT` con semántica de merge (no es idempotente).** Fix: `PATCH`, o `PUT`+`If-Match`.
- [ ] **2.7 — `Handle` de 115 líneas / 6 responsabilidades**; extraer `ApplyAsync`.
- [ ] **2.8 — Regla de fallback de `PaletteId` triplicada** (`:193-195`, `GetStoreCatalogBrandingQuery.cs:63-68,77-79`).
- [ ] **2.9 — TOCTOU en `UpsertAsync` → 500 (ver X3).** `StoreCatalogSettingsRepository.cs:61-68`.

### LOW
- [ ] **2.10 — `[Authorize]` ausente** (el filtro es la única barrera) + skip total para SuperAdmin.
- [ ] **2.11 — `ResolveAsync` con 8 parámetros** (agrupar contexto).
- [ ] **2.12 — `[ProducesResponseType]` incompletos** / `[FromForm]` explícito.

---

## Unidad 3 — `CatalogShowcaseController` (4 endpoints)

`GET|POST /catalog/showcase` · `DELETE /catalog/showcase/{id}` · `PUT /catalog/showcase/order`

### HIGH
- [ ] **3.1 — Límite multipart sin tope real (ver X1).**
- [ ] **3.2 — `TenantId` sin guard en el alta.**
      `AddStoreCatalogImageCommand.cs:73`: token sin claim de tenant escribe `TenantId = Guid.Empty`
      → fila invisible para siempre (el filtro resuelve tenant a NULL) + archivo huérfano. Fix: mismo
      guard que `StoreId` (400).

### MEDIUM
- [ ] **3.3 — Contenido de archivo no validado (ver 2.4).**
- [ ] **3.4 — `DELETE` carga TODO el set de imágenes para borrar una.**
      `RemoveStoreCatalogImageCommand.cs:69-70`. Fix: `WHERE StoreId AND Id` indexado.
- [ ] **3.5 — `Reorder` marca toda la fila `Modified`** → revierte `Caption`/`IsActive` concurrentes
      + hasta 10 UPDATEs. Fix: marcar solo `OrderIndex` (`UpdatePropertiesAsync`).
- [ ] **3.6 — TOCTOU en el tope de 10 imágenes** → 11 imágenes / orden empatado.
- [ ] **3.7 — Compensación puede enmascarar el error original.** `AddStoreCatalogImageCommand.cs:112-126`:
      el `DeleteAsync` de limpieza puede lanzar y reemplazar la excepción real. Fix: envolverlo en
      try/catch + `LogWarning` y relanzar el original.
- [ ] **3.8 — Ventana de crash en DELETE** deja archivo huérfano sin reconciliación.
- [ ] **3.9 — Dos formas de 400**: `ValidationProblemDetails` (binding) vs `ResponseResult`
      (FluentValidation). Fix: `InvalidModelStateResponseFactory` unificado.

### LOW
- [ ] **3.10 — Folder name en dos ensamblados** (`ShowcaseImageKinds.Folder` muerto vs `CatalogImageStorage.cs:28`).
- [ ] **3.11 — `IsActive` en el DTO es constante `true`** (siempre filtrado).
- [ ] **3.12 — `POST` 200 en vez de 201**; `DELETE` 200 en vez de 204; `[ProducesResponseType]` incompletos.
- [ ] **3.13 — Sin E2E de showcase (ver X8).**

---

## Unidad 4 — `PublicCatalogController` (4 endpoints, anónimos)

`GET /public/catalog/{slug}` · `.../products` · `.../products/{id}` · `.../media/{**key}`

### HIGH
- [ ] **4.1 — `BelongsToStore` valida la clave CRUDA pero se lee la NORMALIZADA.**
      `CatalogImageStorage.cs:188-195` vs `:197-212`: un `..` pasa la pertenencia
      (`{tenantA}/{storeA}/../{tenantB}/{storeB}/x`) y `Path.GetFullPath` lo resuelve leyendo **otra
      tienda** dentro de la raíz. Fix: comparar segmento a segmento + rechazar `.`/`..`.
- [ ] **4.2 — Guard de traversal sin separador final.** `CatalogImageStorage.cs:208`:
      `fullPath.StartsWith(fullRoot)` deja escapar a una carpeta hermana
      (`.../catalog-backup/...`). Fix: terminar el prefijo en `Path.DirectorySeparatorChar`.
- [ ] **4.3 — `page` desborda int → `Skip(-120)` → 500 anónimo.** `GetPublicCatalogProductsQuery.cs:75,81`
      (`?page=2147483647`). Fix: acotar el offset en `long` + tope de página.
- [ ] **4.4 — La paginación es un no-op: materializa TODO el catálogo por request.**
      `GetPublicCatalogProductsQuery.cs:56-84` filtra/pagina en memoria (el repo ya filtra en SQL,
      pero se llama con `null,null`). Fix: filtro + `Skip/Take` en SQL; quitar el `Include(Images)`.

### MEDIUM
- [ ] **4.5 — Lecturas anónimas sin rate limit.** Fix: política `PublicCatalogPolicy` (patrón ya
      existente para pedidos).
- [ ] **4.6 — Sin `X-Content-Type-Options: nosniff`** al servir media inline.
- [ ] **4.7 — `GET` de cabecera hace O(categorías × productos)** para contar. Fix: `GROUP BY` en SQL.
- [ ] **4.8 — `CancellationToken` descartado (ver X7).**
- [ ] **4.9 — Inconsistencia de error de media**: clave fuera de raíz → `InvalidOperationException` →
      500, rompiendo el "404 uniforme". Fix: 404.
- [ ] **4.10 — Feature envy**: el handler reimplementa filtros que el repo ya tiene.

### LOW
- [ ] **4.11 — Slug resuelto 4×** (extraer resolver); `store.CatalogSlug == null` inalcanzable;
      `24` mágico; `ContentDisposition` no-op; ids internos en el DTO público.
- [ ] **4.12 — OpenAPI dice JSON para el endpoint de media** (`[Produces]` heredado). Fix: override.
- [ ] **4.13 — Sin tests de handler** (solo mapper). `[ProducesResponseType]` incompletos.

---

## Unidad 5 — `OnlineOrderingController` (2 endpoints)

`GET|PUT /online-ordering/settings` (gate actual `WebCatalogAdmin` / módulo 18)

### HIGH
- [ ] **5.1 — El gate apunta al módulo 18 pero la config es del 19.**
      `OnlineOrderingController.cs:26` → `WebCatalogAdmin` (feature 122 / módulo 18), cuando la
      feature que **gatea la CONFIGURACIÓN de pedidos** es `PedidosWhatsAppAdmin` (124 / 19). Rompe
      2 casos: falso 403 (tienda con 19 sin 18 no puede apagar su propio pedido) y falso 200 (config
      que el storefront nunca leerá). Fix: `[HasPermission(StoreRolesFeatures.PedidosWhatsAppAdmin)]`
      — **nota**: el E2E existente fija módulo 18; cambiarlo requiere autorización (añadir test
      nuevo, no tocar el existente).
- [ ] **5.2 — `TenantId` sale del claim del llamador, no de la tienda.** `:98`:
      `StoreCatalogSettings.Create(storeId, _httpContextService.TenantId.ToGuid())`. Un SuperAdmin
      escribiendo una tienda de otro tenant crea una fila que el owner no ve y **no puede actualizar
      nunca** (500 por índice único en cada PUT). Fix: resolver el tenant desde la fila `Store`
      (`store.TenantId`). Mismo defecto en `UpdateStoreCatalogBrandingCommand.cs:96`.

### MEDIUM
- [ ] **5.3 — Pérdida de columnas de marca (ver X2).** `EntityState.Modified` reescribe la fila
      entera → guardar settings pisa `LogoKey`/`BannerKey` (el logo "desaparece"). Fix: update por
      columnas (`ExecuteUpdateAsync`).
- [ ] **5.4 — `UpsertAsync` re-deriva existencia con `AnyAsync`** (round-trip de más) + TOCTOU (ver X3).
- [ ] **5.5 — Tres copias de la proyección `StoreCatalogSettingsDto`** (ver X9).
- [ ] **5.6 — Límites de columna declarados en 2 sitios** (command const vs EF config).

### LOW
- [ ] **5.7 — `DbUpdateException` → 500 opaco** (ver X6); `[ProducesResponseType]` solo 200;
      `PUT` sin token de concurrencia; create devuelve 200.

---

## Unidad 6 — `OnlineOrdersController` (6 endpoints)

`GET /online-orders` · `/{id}` · `/stats` · `PATCH /{id}/status|payment|driver`

### HIGH
- [ ] **6.1 — Lost update en los 3 PATCH (ver X2).** `EntityState.Modified` + NoTracking reescribe
      TODA la fila → si A marca pago mientras B marcó aceptado, **el estado de B se revierte** sin
      error (data loss en el flujo multiusuario normal). Fix: marca por columna + token de concurrencia.

### MEDIUM
- [ ] **6.2 — `page` sin tope → `Skip(-40)` → 500** (`?page=2147483647`) + `OFFSET` no acotado.
- [ ] **6.3 — `search` es `LIKE '%…%'` sin índice ni longitud** (seq scan por tecla). Fix: validador +
      índice trigram.
- [ ] **6.4 — `PATCH /{id}/driver` con `{}` desasigna al repartidor en silencio** (200 OK). Fix:
      distinguir "campo ausente" de `null` explícito + validator.
- [ ] **6.5 — `AssignDriver` materializa toda la plantilla de repartidores** para un sí/no.
- [ ] **6.6 — Sin feature-level authz** (solo el filtro custom). Fix: `[Authorize]` + `FallbackPolicy`.
- [ ] **6.7 — PII en el listado** (nombre+teléfono ×100/página, sin máscara ni auditoría).
- [ ] **6.8 — `200 data:false` (ver X5)**; store-guard+404 copiado 4×; sin `CancellationToken` (X7).

### LOW
- [ ] **6.9 — Los 3 PATCH cargan 2 `Include` que no usan**; sort sin índice; mensajes sin localizar;
      `[ProducesResponseType]` solo 200; `bool` como tipo de retorno débil.
- [ ] **6.10 — Sin E2E (ver X8).**

---

## Unidad 7 — `DeliveryDriversController` (3 endpoints)

`GET|POST /delivery-drivers` · `PATCH /delivery-drivers/{id}`

### HIGH
- [ ] **7.1 — `PATCH` no es parcial: cuerpo sin `isActive` DESACTIVA al repartidor.** `:52,:93`:
      `IsActive` es `bool` no-nullable y se escribe siempre; el body canónico de PATCH
      (`{"name","phone"}`) lo da de baja en silencio con 200. Hoy solo lo tapa el tipo TS del cliente.
      Fix: `bool?` + escribir solo si `HasValue`.

### MEDIUM
- [ ] **7.2 — `TenantId`/columnas base escritas por `EntityState.Modified`** (ver X2); sin token.
- [ ] **7.3 — Sin E2E del recurso (ver X8)** (el guard IDOR solo con mock).
- [ ] **7.4 — Name/Phone aceptan contenido arbitrario** (solo `NotEmpty`+`MaximumLength`).
- [ ] **7.5 — Validación mide el valor crudo, persistencia el trim** (rechaza un nombre de 200 + espacio).
- [ ] **7.6 — `ToDto` copiado 3× (ver X9)**; límites de columna en 3 sitios.
- [ ] **7.7 — Store-guard copiado 3×.**

### LOW
- [ ] **7.8 — Sin `DELETE` (correcto, soft delete)**; sin `GET /{id}`; `{id}` sin `:guid`;
      evento de dominio sin handlers; `POST` 200 en vez de 201; `[ProducesResponseType]` incompletos.

---

## Unidad 8 — `PublicOrderingController` (3 endpoints, anónimos)

`GET /public/ordering/{slug}/config` · `POST .../orders` · `GET .../orders/{code}?phone=`

### HIGH
- [ ] **8.1 — `Quantity` sin tope desborda `Order.ItemsCount` (checked) → 500 anónimo.**
      `CreateOnlineOrderCommand.cs:74,217` + `Order.cs:120`; el validator solo exige `>0`. Fix:
      tope de cantidad por línea y de líneas por carrito (validator + guard en el handler).
- [ ] **8.2 — El rate-limit cuenta requests, no filas.** 1 POST permitido puede insertar cientos de
      miles de `OrderItem` → cierra el hueco que el límite dice cerrar. Fix: tope de líneas (arriba).

### MEDIUM
- [ ] **8.3 — Teléfono del cliente en query string y logueado en cada request** (Serilog+Elasticsearch):
      PII en el índice, sobre el valor que es segundo factor del lookup. Fix: body (POST) o header.
- [ ] **8.4 — Código de pedido con `Random.Shared` (no criptográfico).** Fix:
      `RandomNumberGenerator.GetString`.
- [ ] **8.5 — Contrato del config documenta "mínimo" que ya no existe** (`MinimumOrderAmount` columna
      muerta). Fix: corregir el doc (o implementar la regla, decisión de producto).
- [ ] **8.6 — `POST` devuelve 200, creó un recurso** (fix: 201; **breaking** para el storefront).
- [ ] **8.7 — Sin rate-limit en el lookup por código** (el único read público con secreto).
- [ ] **8.8 — Teléfono primitivo sin formato** → el lookup por teléfono puede fallar por formato.

### LOW
- [ ] **8.9 — `DeliveryType` int + revalidación**; `storeSlug` reasignable en el DTO; `{code}` sin
      constraint de longitud; `[ProducesResponseType]` incompletos.

---

## Unidad 9 — `StoresController` — `catalog-template` (2 endpoints, SuperAdmin)

`GET|PUT /stores/{storeId}/catalog-template`

### MEDIUM
- [ ] **9.1 — `BaseApiController` sin `[Authorize]` + el filtro compara VALORES, no instancia.**
      `HasPermissionAttribute.cs:67-70`: una acción cuyo `[HasPermission]` iguala el de la clase
      queda **sin** autorización. (Project-level.) Fix: `[Authorize]` + `ReferenceEquals`.
- [ ] **9.2 — `UpsertAsync` check-then-act → 500 (ver X3).**
- [ ] **9.3 — El `templateId` no se valida contra los ids conocidos.** Un typo (`boutiqe`) persiste,
      200, y el storefront pinta `default` para siempre, sin error. Fix: allowlist server-owned.
- [ ] **9.4 — `.Trim()` inalcanzable por HTTP** (el validator corre antes sobre el valor sin trim) +
      un test unitario prueba una ruta que ningún cliente puede ejercer.
- [ ] **9.5 — Carga un join de 4 tablas (`GetStoreByIdIncludingModules`) para leer 1 escalar** (y un
      store sin owner se reporta como "not found"). Fix: leer solo el tenant.
- [ ] **9.6 — `{storeId}` inexistente devuelve 400 en vez de 404** (convención del proyecto; cambio
      de contrato).

### LOW
- [ ] **9.7 — `[ProducesResponseType]` incompletos/contradictorios**; el `storeId` viaja también en
      el body (se descarta); sin token de concurrencia; evento de dominio sin handler.
- [ ] **9.8 — Sin E2E (ver X8).**

---

## Progreso

- 2026-10-11 — Plan creado a partir de la revisión `api-endpoint-review` (9 unidades / 34 endpoints).
  Sin implementación. Pendiente: acordar punto por punto.
- 2026-10-11 — **Controller 1: HIGH 1.1–1.4 HECHOS** (`36e7f30b` scope por tienda + biyección ·
  `548eb20f` mirror por retorno · `8449cc2b` topes de subida). `dotnet build` 0 errores;
  `Application.Tests` **1241 verde**. Decisión A1 aplicada. Pendientes del Controller 1: MEDIUM
  1.5–1.9 (1.9 se deja como está), 1.10, 1.11 y LOW 1.12–1.15.
- 2026-10-11 — **Controller 1: MEDIUM 1.5, 1.6, 1.7, 1.10 HECHOS** (`9bcc1e7a` validar imagen
  principal · `09a4356e` contar en SQL · `e3c0c020` URL por helper · `0d28fa97` sync limpia imagen
  principal). `Application.Tests` **1242 verde**. Pendientes: 1.8 (extraer helpers de `Handle`),
  1.11 (validadores R5–R7) y LOW 1.12–1.15.
- 2026-10-11 — **Controller 1 CERRADO** salvo LOWs. 1.11 hecho (`f649a6f8`); 1.8 = decisión de NO
  hacerlo ahora (refactor cosmético); LOW 1.12–1.15 **diferidos** (no críticos). `dotnet build` 0
  errores; `Application.Tests` **1242 verde** en cada paso. Siguiente: Controller 2.
