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
- [x] **2.1 — Tercera ventana de compensación F8-R1/R2.** — **HECHO 2026-10-11** (`de48a72c`): los
      dos `ResolveAsync` ahora van DENTRO del `try`, así la compensación cubre el fallo de E/S al
      escribir el 2º archivo.
- [x] **2.2 — La compensación usa el `CancellationToken` de la petición.** — **HECHO 2026-10-11**
      (`de48a72c`): los borrados de limpieza usan `CancellationToken.None`.

### MEDIUM
- [x] **2.3 — Límite multipart.** — **HECHO** vía 1.4 (`8449cc2b`): `[RequestSizeLimit]` en
      `UpdateBrandingAsync` + spill global a disco.
- [x] **2.4 — Validación de archivo.** — **PARCIAL 2026-10-11** (`cd53081e`): `X-Content-Type-Options:
      nosniff` en el endpoint público de media. La verificación por **magic bytes** queda DIFERIDA
      (cambia la firma de `CatalogImageUploadRules` para recibir el contenido).
- [ ] **2.5 — Sin concurrencia optimista** → **DIFERIDO**: añadir `rowversion` implica columna + migración.
- [ ] **2.6 — `PUT` con semántica de merge** → **DIFERIDO**: cambiar el verbo a `PATCH` rompe al cliente.
- [ ] **2.7 — `Handle` de 115 líneas** → **DIFERIDO** (refactor cosmético).
- [ ] **2.8 — fallback de `PaletteId` triplicado** → **DIFERIDO** (refactor).
- [ ] **2.9 — TOCTOU en `UpsertAsync`** → **DIFERIDO**: es el transversal **X3** (unidades 2/5/9);
      requiere decidir entre mapear Postgres `23505`→409 o `ON CONFLICT` (decisión de diseño).

### LOW (diferidos 2026-10-11 — no críticos)
- [ ] **2.10–2.12** — diferidos (`[Authorize]` global, `ResolveAsync` con 8 params, `[ProducesResponseType]`).

---

## Unidad 3 — `CatalogShowcaseController` (4 endpoints)

`GET|POST /catalog/showcase` · `DELETE /catalog/showcase/{id}` · `PUT /catalog/showcase/order`

### HIGH
- [x] **3.1 — Límite multipart sin tope real (ver X1).** — **HECHO vía 1.4** (`8449cc2b`): el `POST`
      ya lleva `[RequestSizeLimit]`, el buffer global vuelca a disco (64 KB) y el cuerpo está acotado a
      8 MB. Cerrado por cobertura, sin cambio propio.
- [x] **3.2 — `TenantId` sin guard en el alta.** — **HECHO 2026-10-12** (`d2d6c195`): el handler exige
      tenant no vacío (400 con mensaje nuevo `ShowcaseStoreTenantNotResolved`) antes de subir el
      archivo; test del caso añadido.

### MEDIUM
- [x] **3.3 — Contenido de archivo no validado (ver 2.4).** — *cubierto por 2.4*: queda la
      verificación por magic bytes **DIFERIDA** junto a 2.4 (misma decisión).
- [x] **3.4 — `DELETE` carga TODO el set para borrar una.** — **HECHO 2026-10-12** (`d2d6c195`):
      nuevo `IStoreCatalogImageRepository.GetByIdAndStoreIdAsync(id, storeId, ct)`; el handler borra
      por id acotado a la tienda.
- [x] **3.5 — `Reorder` marca toda la fila `Modified`.** — **HECHO 2026-10-12** (`d2d6c195`):
      nuevo `SetOrderIndexAsync` que marca SOLO `OrderIndex`; ya no revierte `Caption`/`IsActive`
      concurrentes ni reescribe la fila entera.
- [x] **3.6 — TOCTOU en el tope de 10 imágenes.** — **HECHO 2026-10-12** (`d2d6c195`): decisión del
      owner = **check transaccional sin tocar el esquema**. `BeginTransactionAsync` en el UoW +
      `AcquireSetLockAsync` (lock de transacción `pg_advisory_xact_lock` por (tienda, conjunto)); el
      handler re-cuenta y calcula el `OrderIndex` dentro del lock. Serializa altas al mismo conjunto,
      no bloquea tiendas/conjuntos distintos.
- [x] **3.7 — La compensación puede enmascarar el error original.** — **HECHO 2026-10-12** (`d2d6c195`):
      la limpieza va en `TryDeleteFileQuietlyAsync` (try/catch + `LogWarning`, `CancellationToken.None`)
      y el error original se relanza; test del caso añadido.
- [ ] **3.8 — Ventana de crash en DELETE** deja archivo huérfano sin reconciliación. — **DIFERIDO**:
      hoy se registra como deuda de disco; la reconciliación es una tarea aparte.
- [x] **3.9 — Dos formas de 400** (`ValidationProblemDetails` vs `ResponseResult`). — **HECHO
      2026-10-12** (`d2d6c195`): `InvalidModelStateResponseFactory` unificado
      (`AddUnifiedValidationResponseExtension`) proyecta el binding al mismo sobre de la API.

### LOW (diferidos 2026-10-12 — no críticos)
- [ ] **3.10–3.13** — diferidos (`ShowcaseImageKinds.Folder` muerto, `IsActive` constante en el DTO,
      `POST` 200 / `DELETE` 200, `[ProducesResponseType]` incompletos, sin E2E de showcase).

---

## Unidad 4 — `PublicCatalogController` (4 endpoints, anónimos)

`GET /public/catalog/{slug}` · `.../products` · `.../products/{id}` · `.../media/{**key}`

### HIGH
- [x] **4.1 — `BelongsToStore` valida la clave CRUDA pero se lee la NORMALIZADA.** — **HECHO 2026-10-12**
      (`255ade42`): se rechazan los segmentos `.`/`..` antes de comparar, así la pertenencia se decide
      sobre la misma forma que se resuelve al leer.
- [x] **4.2 — Guard de traversal sin separador final.** — **HECHO 2026-10-12** (`255ade42`): el prefijo
      de la raíz termina en `Path.DirectorySeparatorChar`.
- [x] **4.3 — `page` desborda int → `Skip(-120)` → 500 anónimo.** — **HECHO 2026-10-12** (`255ade42`):
      offset en `long` + `Skip` acotado al total; una página enorme devuelve lista vacía.
- [x] **4.4 — La paginación es un no-op.** — **HECHO 2026-10-12** (`255ade42`): filtro + `Skip/Take` en
      SQL (métodos nuevos `GetPublishedPageAsync`/`CountPublishedAsync`) y sin `Include(Images)` en el
      listado.

### MEDIUM
- [x] **4.5 — Lecturas anónimas sin rate limit.** — **HECHO 2026-10-12** (`255ade42`):
      `PublicCatalogPolicy` (120/min por IP) en cabecera/listado/detalle; **media excluida** (una página
      pide ~24 imágenes cacheadas).
- [x] **4.6 — Sin `X-Content-Type-Options: nosniff`.** — **YA ESTABA** (`cd53081e`, `PublicCatalogController.cs:61`).
- [x] **4.7 — Cabecera O(categorías × productos).** — **HECHO 2026-10-12** (`255ade42`):
      `GetPublishedCategoryCountsAsync` con `GROUP BY` en SQL.
- [x] **4.8 — `CancellationToken` descartado.** — **HECHO 2026-10-12** (`255ade42`): se propaga a los
      métodos del repositorio.
- [x] **4.9 — Inconsistencia de error de media.** — **HECHO 2026-10-12** (`255ade42`): con 4.1/4.2, una
      clave con `.`/`..` o fuera de la tienda cae en el **404** uniforme (ya no llega al 500).
- [x] **4.10 — Feature envy.** — **HECHO 2026-10-12** (`255ade42`): el filtro/paginación viven en el
      repositorio.

### LOW
- [ ] **4.11 — Slug resuelto 4×**; `CatalogSlug == null` inalcanzable; `24` mágico; `ContentDisposition`
      no-op; ids internos en el DTO público. — **DIFERIDO** (cosmético).
- [x] **4.12 — OpenAPI dice JSON para el endpoint de media.** — **HECHO 2026-10-12** (`255ade42`):
      `[Produces(...)]` con los tipos reales.
- [x] **4.13 — Sin tests de handler/servicio.** — **HECHO 2026-10-12** (`255ade42`): tests de los 3
      handlers + `BelongsToStore` (traversal). `Application.Tests` **1269 verde**.

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
- [x] **5.1 — Gate en el módulo 18 en vez del 19.** — **HECHO 2026-10-12** (`22c46714`): el controlador
      exige `PedidosWhatsAppAdmin` (feature 124, módulo 19). **Nota de test:** el plan **Superior/VIP ya
      incluye el módulo 19** (`PedidosModulesBackfill` → `StorePlanModule` 19→planes 3 y 4), así que el
      E2E del fixture (Superior) no puede representar "sin el módulo": los casos negativos usan una
      tienda en **plan Gratis** (sin el 19) y el caso que distingue los dos módulos contrata el 18 en
      esa tienda y espera 403. **E2E `Orders` 30/30.**
- [x] **5.2 — `TenantId` sale del claim del llamador.** — **HECHO 2026-10-12** (`00acfe44`): el handler
      de settings resuelve el tenant desde `Store.TenantId` al crear; el de marca lo resuelve SIEMPRE
      (es también el prefijo de la clave del archivo). Default de `UpsertAsync` conserva la firma
      histórica para el E2E.
- [x] **5.3 — Pérdida de columnas por UPDATE de fila completa (X2).** — **HECHO 2026-10-12**
      (`00acfe44`): `UpsertAsync` marca SOLO las columnas que la operación tocó (`modifiedProperties`);
      cada vista pasa las suyas. Probado contra Postgres (E2E nuevo: un cambio de marca concurrente
      sobrevive a un guardado de pedidos).
- [x] **5.4 — `AnyAsync` redundante + TOCTOU (X3).** — **PARCIAL 2026-10-12** (`00acfe44`): los
      handlers pasan la existencia conocida y se evita el round-trip. El mapeo `23505 → 409` para
      altas concurrentes queda **DIFERIDO** (decisión de diseño de X3, compartida con 2.9).
- [x] **5.5 — Proyección `StoreCatalogSettingsDto` duplicada (X9).** — **HECHO 2026-10-12**
      (`00acfe44`): `StoreCatalogSettingsDtoMapper` único para el GET y el upsert.
- [x] **5.6 — Límites de columna en 2 sitios.** — **HECHO 2026-10-12** (`00acfe44`): consts en la
      entidad; EF y el comando los referencian.

### LOW
- [ ] **5.7 — `DbUpdateException` → 500 opaco** (ver X6); `[ProducesResponseType]` solo 200;
      `PUT` sin token de concurrencia; create devuelve 200. — **DIFERIDO**.

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

## Problemas de errores en los tests E2E (registro, detectados 2026-10-12)

Al correr el E2E del namespace `Catalog` para verificar los cambios globales (sobre 400 unificado)
aparecieron fallos **PRE-EXISTENTES** (también presentes en el baseline `d9e7c35f`: **6 fallos/48**;
con los fixes y los 4 tests nuevos: **3 fallos/52**). Son de **Controller 1**, y el E2E nunca se había
corrido tras ese trabajo (solo `Application.Tests`, con repos mockeados — el mismo blind spot que ya
documenta `AGENTS.md`).

- [x] **C1-E2E-1 — `CatalogImagePathTooLong` con 1 argumento.** La clave está **duplicada** en
      `I18n.resx`/`I18n.en.resx` (una con 2 placeholders) y `ReorderProductImagesCommandValidator` +
      `RemoveProductImageCommandValidator` (Controller 1, `f649a6f8`) la llamaban con **1** →
      `FormatException` del localizador → **500** en reorder/delete de imagen de producto.
      **ARREGLADO 2026-10-12 (`f551b031`)**: los 2 validadores pasan 2 args (como los otros 4) y se
      elimina la entrada duplicada del `.resx`.
- [ ] **C1-E2E-2 — `Product cannot be tracked because another instance with the same key is already
      being tracked`** en el sync/snapshot de galerías → **500** (`WebCatalogSnapshotTests.Null_gallery…`,
      `WebCatalogSyncTests.Null_gallery…`). Trampa NoTracking/attach en el espejo de galerías. PRE-EXISTENTE.
- [ ] **C1-E2E-3 — `WebCatalogProductFieldsTests.Saving_the_fields_exposes_them_in_the_catalog_view`**
      → **400** donde espera 200 (alguna regla de validación rechaza un payload válido). PRE-EXISTENTE.

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
- 2026-10-11 — **Controller 2 (`CatalogBrandingController`)**: HIGH 2.1/2.2 (`de48a72c`) + 2.3 (vía
  1.4) + 2.4 parcial (`cd53081e`, `nosniff`) HECHOS. **Diferidos con motivo**: 2.5 (rowversion+migración),
  2.6 (rompe cliente), 2.7/2.8 (refactor), 2.9 (= **X3** transversal 2/5/9) y LOW 2.10–2.12.
  `Application.Tests` 1242 verde.
- 2026-10-12 — **Controller 3 (`CatalogShowcaseController`) HECHO** (`d2d6c195`): 3.2 (guard de tenant)
  + 3.4 (borrado por id acotado a la tienda) + 3.5 (solo `OrderIndex`) + 3.6 (check transaccional con
  lock por (tienda, conjunto) — decisión del owner: **sin tocar el esquema**) + 3.7 (compensación que
  no enmascara) + 3.9 (un solo sobre de 400). 3.1 cerrado por cobertura (1.4). **Diferidos con motivo**:
  3.3 (junto a 2.4, magic bytes), 3.8 (deuda de disco/reconciliación) y LOW 3.10–3.13.
  `dotnet build` 0 errores; `Application.Tests` **1244 verde** (2 tests nuevos). Siguiente: Controller 4.
- 2026-10-12 — **Controller 3: RDD aprobada** (lineage `review-ef89c1e88fb53bb2`, 3 lentes
  risk/resilience/reliability, refuter incluido; autoridad quemada). **Advisories no bloqueantes**
  (trabajo posterior, no reabren este candidato): (a) el lock y la transacción NO tienen test que
  pruebe la serialización (solo mocks; falta E2E/Postgres de showcase); (b) los 3 métodos nuevos del
  repositorio no tienen test; (c) el mock de `GetByIdAndStoreIdAsync` ignora el `storeId`; (d) el lock
  bloqueante no tiene timeout/`try-lock`; (e) ventana *pre-existente* commit-con-resultado-desconocido →
  borra el archivo. Un hallazgo CRITICAL (`R3-Unified400Untested`) fue **refutado** por el refuter.
- 2026-10-12 — **Controller 3 advisories CERRADOS** (`9b5e4c18`): T1 (doble respeta storeId) · T2
  (tests de repositorio + UPDATE parcial probado en Postgres) · T3 (lock transaccional probado con
  Postgres real) · T4 (sobre 400 unificado cubierto por E2E) · T5 (`lock_timeout` acotado → 409) ·
  T6 (archivo conservado si el commit es desconocido). Unit **1250 verde**; E2E nuevos **4/4**.
  Además `f551b031` arregla el bug E2E pre-existente **C1-E2E-1** (ver sección de hallazgos). Siguiente:
  RDD de los advisories + el fix, y decidir los hallazgos C1-E2E-2/3.
- 2026-10-12 — **Advisories Controller 3 + fix del path: RDD APROBADA** (lineage
  `review-fb2e7c3a53c0b162`, 3 lentes, sin refuter; autoridad quemada). **Advisories no bloqueantes**:
  (a) el mapeo `55P03 → ShowcaseSetBusyException` no tiene test que provoque un timeout real (el unit
  lo stubea); (b) `SET LOCAL lock_timeout` aplica a TODA la transacción, no solo al lock (un lock
  posterior abortaría a 5 s como 500 sin traducir); (c) el 409 no registra log/métrica; (d) los
  archivos retenidos por commit desconocido acumulan deuda de disco sin reconciliación/métrica. La lente
  de riesgo no encontró hallazgos.
- 2026-10-12 — **Controller 4 (`PublicCatalogController`) HECHO** (`255ade42`): 4.1/4.2 (traversal
  rechazado por segmento + prefijo con separador) · 4.3 (offset `long`) · 4.4/4.10 (filtro + paginación
  en SQL, sin `Include(Images)`) · 4.5 (`PublicCatalogPolicy`) · 4.7 (`GROUP BY` en SQL) · 4.8
  (`CancellationToken`) · 4.12 (`[Produces]`) · 4.13 (tests). 4.6 ya estaba. **Diferido**: 4.11
  (cosmético). `dotnet build` 0 errores; `Application.Tests` **1269 verde**; E2E `Catalog` **49/52**
  (los 3 fallos son los pre-existentes C1-E2E-2/3, sin fallos nuevos). Siguiente: RDD del Controller 4.
- 2026-10-12 — **Controller 4: RDD APROBADA** (lineage `review-7fbc1c5ccba9e5c0`, 3 lentes, autoridad
  quemada). **Advisories no bloqueantes**: (a) **R1** el guard de segmentos solo rechaza `.`/`..`
  exactos; en Windows un segmento `.. ` (con espacio) se recorta al resolver → traversal residual
  (PRE-EXISTENTE, el baseline no tenía guard alguno); (b) **R3-1** los 3 métodos SQL nuevos no tienen
  test de repositorio contra Postgres (solo mocks; el E2E público SÍ los ejerce y pasa); (c) R3-2 el
  guard de separador de `ResolveFullPath` sin test; (d) R3-3 la normalización del filtro no se prueba;
  (e) **R4-1** el rate limit por IP colapsa todo un NAT/egress en un cubo → lecturas válidas podrían
  rechazarse; (f) R4-2 (pre-existente) el endpoint de media sigue sin límite.
- 2026-10-12 — **Traversal residual endurecido** (`65efee36`): `IsTraversalSegment` rechaza todo
  segmento que al recortar espacios/puntos finales quede vacío (cubre `.`/`..`/`.. `/`...`), aplicado
  en `BelongsToStore` y en `ResolveFullPath`. **RDD APROBADA** (lineage `review-d708f28e5ae16c24`,
  lentes risk+reliability, autoridad quemada); la lente de riesgo no encontró hallazgos.
  Advisories no bloqueantes: (a) sobre-rechazo conservador de segmentos solo-espacios (en Linux serían
  nombres válidos; ninguna clave del backend se ve afectada); (b) el test de `OpenAsync` no dispone un
  stream si alguna vez devolviera uno. `Application.Tests` **1274 verde**; E2E `Catalog` 49/52 (los 3
  pre-existentes). Push `1c3e5cdb..`.
- 2026-10-12 — **Controller 5 (`OnlineOrderingController`)**: **5.2–5.6 HECHOS** (`00acfe44`): tenant
  desde la tienda (fila y clave del archivo) · upsert PARCIAL por columnas (probado en Postgres: un
  cambio de marca concurrente sobrevive) · existencia conocida (sin `AnyAsync`) · mapper DTO único ·
  límites de columna en la entidad. Unit **1276 verde**; E2E `Orders` **28/28**. **5.1 BLOQUEADO** y
  **revertido** (el plan Superior/VIP ya incluye el módulo 19 → el fixture no puede probar el caso
  negativo; rompía 8 asserts). **Diferidos**: 5.4b (`23505→409`, X3) y 5.7 (LOW). Pendiente de decisión:
  cómo testear 5.1 (seed en plan inferior) antes de RDD.
- 2026-10-12 — **Controller 5 COMPLETO**: **5.1 HECHO** (`22c46714`) — gate en el módulo 19
  (`PedidosWhatsAppAdmin`); el E2E usa una tienda en plan **Gratis** para el caso negativo (el plan
  Superior ya incluye el 19) y contrata el 18 en esa tienda para demostrar que NO abre la config.
  `dotnet build` 0 errores; `Application.Tests` **1276 verde**; E2E `Orders` **30/30**. Siguiente: RDD
  del Controller 5.
- 2026-10-12 — **Controller 5: RDD APROBADA** (lineage `review-ba673ce3b616716d`, 3 lentes, autoridad
  quemada); la lente de riesgo no encontró hallazgos. **Advisories no bloqueantes**: (a) la rama de
  upsert PARCIAL no sella `UpdatedDate` (la de fila completa sí lo hacía) — revisar si el interceptor
  de auditoría lo cubre; (b) la marca resuelve el tenant desde la tienda pero **no hay test** que
  distinga tenant-de-tienda de tenant-del-claim; (c) el upsert de plantilla no asserta su lista de
  columnas; (d) alta concurrente → `23505` → 500 (= **5.4b**, diferido).
- 2026-10-12 — **Advisories del Controller 4 CERRADOS (solo tests; sin tocar producción)**:
  - **R3-1 + R3-3** — nuevo `Catalog/PublicCatalogRepositoryPersistenceTests.cs`: **10 casos contra
    PostgreSQL real** para los 3 métodos SQL (`GetPublishedPageAsync`, `CountPublishedAsync`,
    `GetPublishedCategoryCountsAsync`): paginación en SQL y orden (categoría, producto), filtro por slug
    y por búsqueda insensible a mayúsculas/espacios (`Trim().ToLowerInvariant()` + `ToLower()` del SQL),
    conteo alineado con la página, `GROUP BY` con conteos, y exclusión de inactivos/fuera de venta/
    categoría inactiva. Dejan de estar cubiertos solo con mocks.
  - **R3-2** — test del guard de SEPARADOR de `ResolveFullPath` con una clave ABSOLUTA que apunta a una
    carpeta hermana que comparte el prefijo textual (`.../catalog-backup`). **Mutación verificada**: sin
    el separador, el test cae (la lectura escaparía de la raíz). Es alcanzable porque `Path.Combine` con
    una ruta absoluta descarta la raíz — no era redundante.
  - **R4-1** (el rate limit por IP colapsa un NAT/egress en un cubo) y **R4-2** (el endpoint de media sin
    límite, pre-existente): **DIFERIDOS** — son decisión de diseño/alcance, no huecos de test.
  - Evidencia: `Application.Tests` **1283 verde**; nuevo E2E de repositorio **10/10**.
