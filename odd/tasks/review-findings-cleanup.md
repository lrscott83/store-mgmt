# Cierre de hallazgos de revisión (defectos + tests)

## Objetivo

Cerrar **todos** los hallazgos advisory acumulados de las revisiones nativas de esta tanda de
features (F1, F2, F3, F4, F8, catálogo público showcase y módulos). Incluye **defectos reales** y
**huecos de test**. Decisión del owner (2026-10-08): "absolutamente todo".

Los hallazgos están detallados en el doc ODD de cada feature (sección *Hallazgos de la revisión
nativa*). Este documento es el **seguimiento** y el mapa de cierre.

## Reglas

- Cada feature se cierra en **sus propios slices** (código + tests juntos), con commit y revisión nativa.
- Nada de valores a mano: migraciones EF generadas; scripts generados y patcheados.
- No se toca ningún E2E existente.

## Hallazgos por feature

### Módulos (`modulos-pedidos-whatsapp-gestion.md`)
- [x] **M-R3-001** (defecto) — La query de verificación #4 del **script 31** tiene `JOIN "Feature" ON TRUE` (cartesiano): no puede devolver el "3" que documenta. Corregir la query.
- [x] **M-R3-002** (test) — La topología (módulos 19/20, feature 124/123→20, `StorePlanModule` 3/4, backfill) no tiene test automatizado (solo SELECTs manuales). Añadir test contra `HasData`/modelo.
- [x] **M-R3-003** (defecto) — El `Down` borra **todas** las filas `StoreModule` de 19/20, no solo las creadas por la migración. Acotar el `Down`.
  - **Reclasificado como falso positivo.** El `DELETE` amplio lo exige la FK **Restrict**: el `Down` también borra
    `Module 19/20` y `Feature 124`, así que cualquier fila de `StoreModule`/`StoreRoleFeature` que sobreviviera
    haría fallar el rollback con violación de FK. Los módulos son nuevos, luego no hay filas preexistentes que
    preservar; acotar el `DELETE` rompería el rollback. Se documenta y se cubre con test de contrato
    (`Catalog.PedidosModulesBackfillTests.DownSql_RemovesTheRowsTheRestrictForeignKeysWouldOtherwiseBlock`).

### Showcase (`catalogo-publico-carrusel-dia.md`)
- [x] **SC-R1** (defecto) — Archivo huérfano si falla `SaveChanges` tras subir; borrado no idempotente (fila antes que archivo).
  - **Cerrado (2026-10-08).** Alta: `AddAsync`+`SaveChangesAsync` en `try/catch` → borra el archivo recién escrito y relanza. Baja: el `DeleteAsync` se traga el fallo con `LogWarning` (la fila ya está confirmada; el archivo es deuda de disco).
- [x] **SC-R2** (defecto) — La regla `Content NotNull` del validador es inalcanzable (el controller coacciona a `Stream.Null`).
  - **Cerrado (2026-10-08).** Sustituida por `RuleFor(x => x.Length).GreaterThan(0)`, que sí rechaza el multipart sin archivo.
- [x] **SC-R3** (defecto) — El config público no filtra por `IsActive`.
  - **Cerrado (2026-10-08).** `&& image.IsActive` en `Showcase(...)`. El repositorio ya filtraba: es endurecimiento explícito del contrato público, sin cambio de comportamiento.
- [x] **SC-R4** (test+defecto) — UI: el input file no se resetea (re-seleccionar el mismo archivo no dispara cambio); ramas de fallo parcial/red sin test; el test del halo comprueba clases CSS, no comportamiento.
  - **Cerrado (2026-10-08).** Reset del input de archivos, halo con la animación decidida en JS y test conductual, y cobertura de las ramas de fallo parcial y de red del upload.
- [x] **SC-R5** (test) — Carrusel: pausa por hover/focus y caso de **una sola imagen** sin cubrir.
  - **Cerrado (2026-10-08).** Tests de pausa por hover y por foco/teclado (con reanudación al salir) y de una sola imagen sin flechas, sin puntos y sin auto-avance.

### F8 marca (`pedidos-whatsapp-marca-catalogo.md`)
- [x] **F8-R1** (defecto) — Logo válido + banner inválido deja archivo huérfano.
  - **Cerrado (2026-10-08).** Validación up-front de los dos archivos en `Handle`: un banner inválido rechaza la petición antes de que el logo toque el disco. `EnsureValid` sale de `ResolveAsync`; el test pasa a exigir `SaveBrandingAsync` `Times.Never`, no solo el upsert.
- [x] **F8-R2** (defecto) — Se borra el archivo anterior antes de persistir; si `SaveChanges` falla, la BD apunta a un archivo borrado (404).
  - **Cerrado (2026-10-08).** Orden nuevo guardar → persistir → borrar. `ResolveAsync` solo encola `newKeys`/`obsoleteKeys` (y `DeleteIfReplacedAsync` desaparece); el borrado de los obsoletos va tras persistir y es best-effort con `LogWarning` (mismo patrón que `RemoveStoreCatalogImageCommandHandler`); si el guardado falla, se compensa borrando lo nuevo y lo anterior sobrevive. El handler suma `ILogger<T>`.
- [x] **F8-R3** (test) — El mapeo `CatalogBrandingUpdate → FormData` de `updateBranding` no se ejecuta en ningún test.
  - **Cerrado (2026-10-08).** `HTTP-12` fija el multipart completo (logo/banner como `File`, booleanos como `'true'`, header `multipart/form-data`, URL `/v1/catalog/branding`) y `HTTP-13` fija el PATCH: lo no mencionado no viaja al `FormData`.
- [x] **F8-R4** (test) — Falta el caso de archivo demasiado grande.
  - **Cerrado (2026-10-08).** Test de un PNG válido de 2 MB + 1 byte en `brand-logo-upload`: avisa, no retiene ni sube, botón deshabilitado.
- [x] **F8-R5** (defecto) — `MediaUrl` con slug null/blank.
  - **Cerrado (2026-10-08).** `MediaUrl` devuelve null si la clave **o** el slug están en blanco; antes construía `/api/v1/public/catalog//media/{key}`. El handler solo rechaza `CatalogSlug == null` con 404, así que el slug en blanco llegaba vivo hasta aquí: lo correcto es null y no pintar logo ni banner.
- [x] **F8-R6** (test) — Alt de imágenes solo por testid.
  - **Cerrado (2026-10-08).** El test de marca pública asserta el `alt` del logo y del banner (con el nombre de la tienda); los del carrusel y del bloque del día assertan que el `alt` usa el pie de foto o, sin él, el nombre de la tienda.

### F4 envío (`pedidos-whatsapp-envio.md`)
- [x] **F4-R1** (test) — El reset del aviso al reabrir el checkout no tiene test.
  - **Cerrado (2026-10-08).** `al reabrir el checkout el aviso del pedido anterior desaparece`: con un padre mínimo que replica el cierre real de `public-catalog.tsx`, primero afirma que el aviso sobrevive al cierre y luego que al reabrir desaparece.
- [x] **F4-R2** (defecto) — `buildWhatsAppOrderLink`/`window.open` dentro del `try/catch` del POST: si lanzan, el pedido ya guardado se reporta como fallo (reintento → duplicado).
  - **Cerrado (2026-10-08).** POST y aviso en `try/catch` separados; `onCreated` siempre tras un alta exitosa, también en `staffMode`. `window.open` lleva su propio guarda para no perder el `setWhatsapp` (el aviso es el respaldo del popup bloqueado). Dos tests: `window.open` lanzando y `buildWhatsAppOrderLink` lanzando; ninguno muestra `CHECKOUT.FAILED` y `onCreated` se cumple una sola vez.
- [x] **F4-R3** (defecto) — El resumen imprime el total del servidor junto a líneas/subtotal del cliente; si difieren, no cuadra.
  - **Cerrado (2026-10-08), por option B** (decisión del owner en `remove-delivery-fee-and-minimum.md`): el resumen se arma con `result.data.lines`/`subtotal`/`total`, el snapshot PERSISTIDO. Test con precios distintos entre servidor (90) y carrito (82.50).
- [x] **F4-R4** (test) — Test estructural por reflexión (`WhatsappNumber`).
  - **Cerrado (2026-10-08).** Sin reflexión: sobre las claves reales de los dos contratos (`Object.keys`), que es lo que decide la privacidad de T2 — el config público no lleva el número, la respuesta de creación sí.
- [x] **F4-R5** (test) — Test que no modela el cierre del checkout.
  - **Cerrado (2026-10-08).** `el padre cierra el checkout al recibir el pedido, una sola vez y sin perder el aviso`: padre mínimo con `useState` que cierra el checkout en `onCreated`, como `public-catalog.tsx`.
- [x] **F4-R6** (test) — Aserciones atadas al formato de `Intl`.
  - **Cerrado (2026-10-08).** Los importes esperados se derivan con `formatMoneyWithCurrency` (el formatter de la app) en lugar de escribirse a mano; caso añadido con millares (`12345`), cuyo separador es un NBSP.

### Revisión nativa — eliminación de envío/mínimo (2026-10-08)

Review `review-45af9674edf7bfe9` **APROBADA** (2 advisory, ninguno bloqueante; autoridad quemada):
- [x] **R3-1** (WARNING · frontend) — El paso de aviso traga cualquier error en un `catch` vacío: si `result.data.lines` no es un array (respuesta degradada) o `setWhatsapp` lanza, el cliente se queda sin handoff de WhatsApp y **sin error visible**, aunque el pedido esté guardado. No hay test del límite "lines vacío/ausente".
  - **Cerrado (2026-10-09).** Cambio de observabilidad, no de flujo: el pedido ya está guardado y el aviso se pinta IGUAL con el código y `link: null`, el estado BLOQUEADO que ya existía (el de "la tienda no tiene número"). Antes no se llamaba a `setWhatsapp` y el cliente se quedaba sin handoff ni error. `console.warn` con el error para que la respuesta degradada deje rastro. El `!staffMode` mantiene la regla D2 (en modo staff no hay aviso, ni al fallar). Dos tests: el fallo forzado de composición y el caso real —respuesta sin `lines`, que revienta en el `.map` antes de llegar al builder—; ambos fijan aviso con el código, estado bloqueado y `onCreated` una sola vez.
- [x] **R3-2** (SUGGESTION · frontend) — El guarda interno de `window.open` también traga todo, sin señal ni distinción de fallback: un popup que lanza es indistinguible de un open normal en cualquier punto de observabilidad.
  - **Cerrado (2026-10-09).** `console.warn` con el error en el `catch` de `window.open`. Sin cambio de flujo: el aviso sigue pintándose con su enlace manual, que es el respaldo del popup bloqueado. El test de F4-R2 (el de `window.open` lanzando) se amplía para exigir la señal **y** que el enlace manual siga ahí —las dos mitades, no una.

### F3 carrito (`pedidos-whatsapp-carrito-cliente.md`)
- [x] **F3-R1** (test · requiere E2E nuevo) — El bypass de filtro de tenant en `Order` solo con InMemory.
  - **Cerrado (2026-10-09)** con `Orders/PublicOrderingReadE2ETests.cs` (4 casos) + seed local
    `Orders/PublicOrderingSeed.cs`, contra `smca_test` por HTTP anónimo. El caso R1-2 es el que
    justifica el resto: prueba que el filtro global por tenant **sí** esconde la fila en PostgreSQL
    (filtrada = 0 filas, con `IgnoreQueryFilters` = 1, y un contexto sin tenant tampoco la ve), así
    que el 200 de R1-1 no puede explicarse por un filtro que no llega a SQL.
- [x] **F3-R2** (test) — La partición del rate limit desde `RouteValues` no se prueba end-to-end.
  - **Cerrado (2026-10-09)** con `Orders/PublicOrderingRateLimitE2ETests.cs` (3 casos). Los
    unitarios de la política pasan igual con el middleware antes del routing (inyectan `RouteValues`
    a mano); aquí la petición entra por HTTP, y R2-2 (agotar el slug A, el slug B responde 200 desde
    la misma IP) es exactamente la prueba que se colapsa a IP-only. R2-1 evita afirmar "la 21ª es
    429" porque la reposición es de 2/min y cruzaría una frontera de segmento; afirma los 20
    primeros en 200 y el cubo cerrado. R2-3 fija la normalización del slug.
- [x] **F3-R3** (defecto) — El estado muestra "no encontrado" para **cualquier** error (red/5xx), no solo 404.
  - **Cerrado (2026-10-09).** Solo el `404` se pinta como "no encontrado" (uniforme, no oráculo); el resto usa `ORDER.STATUS_FAILED`, hasta ahora sin usar. Detalle en `pedidos-whatsapp-carrito-cliente.md`.
- [x] **F3-R4** (defecto) — Vaciar el input de cantidad **borra la línea**.
  - **Cerrado (2026-10-09).** El input ignora lo vacío y lo no entero/positivo; el store (`updateQuantity(0) → remove`) intacto, porque lo usa el botón − y lo fija un test.
- [x] **F3-R5** (test) — Doble-submit del checkout sin test.
  - **Cerrado (2026-10-09)**, incluida una desviación: el test demostrado que el guarda por estado no cerraba la ventana (dos clics en el mismo tick → 2 pedidos); la guarda real es una `useRef` espejo del estado. Detalle en `pedidos-whatsapp-carrito-cliente.md`.
- [x] **F3-R6** (test) — Auto-dismiss del aviso "añadido" sin test.
  - **Cerrado (2026-10-09).** Test con temporizadores falsos: se va a los 2,5 s y el temporizador se reinicia al añadir otro producto. Sin cambio de producción.

### Revisión nativa — F3 frontend (2026-10-09)

Review `review-808d9dda34fad1da` **APROBADA** (3 advisory, ninguno bloqueante; autoridad quemada):
- [x] **R3-001** (WARNING · frontend) — La discriminación 404-vs-incidente clasifica como "no encontrado" solo si el rechazo trae `response.status === 404`; los tests nuevos solo cubren la rama de fallo con objetos fabricados, así que la rama del veredicto 404 (la que el fix protege) no está probada con la forma real del rechazo. Si esa forma no trae el status anidado, un 404 se muestra como "no se pudo consultar".
  - **Cerrado (2026-10-10) sin tocar producción: el helper YA reconocía la forma real, y ahora está probado con ella.** `catalogHttpService.getPublicOrderStatus` llama a `apiClient.get` y no envuelve nada, y el interceptor de `api-client.ts:109-155` rechaza **el mismo objeto** en todas las ramas HTTP — así que al `catch` del componente llega un `AxiosError` con `error.response.status`. Un `it.each` de tres filas (404/500/429) construye ese `AxiosError` real y afirma, por fila, su frase **y la contraria**, con lo único que cambia entre ellas siendo el status anidado. Ese par es el discriminado completo.
  - **Hallazgo colateral medido, que el aviso daba por hecho y no se cumple:** una sonda que cambiaba `isNotFound` a leer `error.status` (atajo de nivel superior) **dejó la suite en verde**. No es un canal roto —hay dos—: axios 1.16.1 puebla los dos en el constructor (`lib/core/AxiosError.js:122-125`, `this.response = response` **y** `this.status = response.status`). Se conserva `response.status` porque es el que funciona en toda la rango declarada: `package.json` pide `axios ^1.7.9` y el atajo `error.status` solo existe desde 1.8.0. Queda escrito en el helper del test para que una "simplificación" futura no rompa en 1.7.x.
- [x] **R3-002** (SUGGESTION · test) — Los tests del estado fabrican el rechazo como formas literales (`{isNetworkError:true}`, `{response:{status}}`) en vez del tipo de error real del servicio: fija la expectativa del componente, no el contrato.
  - **Cerrado (2026-10-10).** Los dobles literales desaparecieron (0 coincidencias de `{isNetworkError:true}` / `{response:{status}}` en el archivo). Dos helpers los sustituyen: `httpRejection(status)` construye el `AxiosError` real con su respuesta, y `networkRejection()` **pasa el error por el interceptor REAL de `api-client` y devuelve lo que él rechaza** — porque esa es la única forma que producción MUTA (`isNetworkError = true`, `api-client.ts:136-138`), y sellar ese `true` a mano habría reproducido exactamente el defecto que el aviso denunciaba. El test de red afirma además que la etiqueta viene puesta. El rechazo del checkout (429) usa el mismo helper.
- [x] **R3-003** (SUGGESTION · test) — `spyOnWarn` se restaura con `mockRestore()` manual al final de cada test; si una aserción falla antes, el espía se filtra a tests posteriores y silencia la señal.
  - **Cerrado (2026-10-10).** Los 10 `mockRestore()` manuales (7 `openSpy` + 3 `warnSpy`) se borraron y se puso `afterEach(() => vi.restoreAllMocks())`, que los retira haya pasado o no el test. Efecto lateral que hubo que absorber: tres espías de `window.open` solo se leían para restaurarlos, así que quedaron como `vi.spyOn(...)` sin capturar —siguen **instalados**, que es lo que evita que `window.open` reviente en jsdom— y con comentario que explica por qué no se capturan.

### F2 persistencia (`pedidos-whatsapp-persistencia.md`)
- [x] **F2-R1** (test) — Carreras del handler sin test: multi-moneda (`EnsureSingleCurrency`) y `DeliveryType` fuera del enum.
  - **Cerrado (2026-10-09).** 4 casos en `CreateOnlineOrderCommandHandlerTests`, cada uno con su status
    y su mensaje: carrito multi-moneda → 400 `OnlineOrderMixedCurrencies` sin llegar a escribir; su
    control positivo (dos productos de la MISMA moneda sí entran); y `[Theory]` -1/2/999 →
    400 `OnlineOrderDeliveryTypeInvalid` antes de leer el carrito (`GetPublishedByIdsAsync` `Never`).
- [x] **F2-R2** (test) — Persistencia nueva solo con Moq (integración real).
  - **Cerrado (2026-10-09)** con `Orders/OnlineOrderingPersistenceE2ETests.cs` (**archivo nuevo**,
    `WebAppFixture`, 7 casos contra `smca_test`): `UpsertAsync` INSERT **y** UPDATE con la sonda del
    `NoTracking` delante, `CodeExistsAsync` con la sonda de que el filtro global sí es SQL,
    `GetByCodeAsync` con sus líneas y su filtro por tenant, y las **cuatro** puertas de publicación de
    `GetPublishedByIdsAsync`. Detalle y evidencia en `pedidos-whatsapp-persistencia.md`.
- [x] **F2-R3** (test) — Grant de feature 123 por tienda sin test.
  - **Cerrado (2026-10-09)** en `StoreRoleFeatureGeneratorTests`: el test modela la media etapa que el
    generador no puede ver (módulo activo → featureIds, con el criterio de `AllowedFeaturesService`) y
    afirma 123 para OwnerAdmin + StoreUser; el caso contrario (módulo 18) fija que el grant **no** se
    arrastra. Nota: el hallazgo decía «módulo 18»; desde el 2026-10-08 (M3) la feature 123 está en el
    módulo 20.
- [x] **F2-R4** (test) — Tests estructurales por reflexión.
  - **Cerrado (2026-10-09), sin reflexión y más fuerte.** Los tests deserializan ahora **cuerpos JSON
    reales** con `code`/`total`/`price`/`currency` colados usando `JsonSerializerDefaults.Web` (las
    opciones del binding de ASP.NET Core) y exigen que el comando resultante sea idéntico al del cuerpo
    limpio. Tres de ellos eran por reflexión —los dos del hallazgo y un tercero (`WhatsappNumber`)
    cuyo comentario además decía «por comportamiento»—, y los tres solo miraban una lista de nombres:
    un `Importe` colado en el contrato pasaba el test.
- [x] **F2-R5** (defecto · migración) — Índice único `StoreCatalogSettings.StoreId` no parcial vs soft-delete.
  - **Reclasificado como falso positivo.** La premisa no se da: `StoreCatalogSettings` **no es
    soft-deletable**. Su único `HasQueryFilter` es por **tenant** (sin `x.IsActive`), no hay
    `IDeleteableEntity` ni borrado lógico, y el `AnyAsync` del upsert (con `IgnoreQueryFilters`)
    encuentra la fila dada de baja: el guardado va por la rama del UPDATE y el índice único nunca llega
    a evaluarse frente a un segundo INSERT. Sin migración. Fijado contra PostgreSQL con
    `R2_3_an_inactive_row_stays_visible_and_the_upsert_reactivates_it_in_place`.
- [x] **F2-R6** (defecto · migración) — `Down()` del backfill borra toda fila `FeatureId=123`.
  - **Reclasificado como falso positivo.** El borrado amplio es obligatorio: el `Down()` de
    `20261007021020_…` también ejecuta el `DeleteData` generado de la fila de catálogo 123 y
    `StoreRoleFeature.FeatureId` es **Restrict**, así que cualquier fila 123 que sobreviviera rompe el
    rollback con violación de FK; las migraciones posteriores (19/20) se revierten antes en la cadena y
    no tocan esas filas. Mismo razonamiento que M-R3-003. El comentario «ONLY» de
    `OnlineOrdersRoleFeatureBackfill.DownStoreRoleFeatureSql` se **corrigió** para declarar que el
    `Down` es dueño de TODAS las filas 123 (FK Restrict) — solo comentario, sin cambio de comportamiento.

### F1 config (`pedidos-whatsapp-config.md`)
- [x] **F1-R1** — E2E nuevo `SMCA.WebApi.E2ETests/Orders/OrderingSettingsRouteAuthE2ETests.cs`: 401 sin token
  (GET y PUT), 403 con Owner **sin** el módulo 18 en la tienda (con la fila sin tocar), 200 con módulo y fila
  real escrita, gating por tienda (el módulo en la A no abre la B del mismo Owner), público anónimo 200 y slug
  desconocido 404. Verificado 8/8.
- [x] **F1-R2** — **Reatribuido**: el fallback `DefaultPaletteId` no está en `GetStoreCatalogSettingsQuery`
  (su DTO ni siquiera expone `PaletteId`), sino en `GetPublicOrderingConfigQuery`. Cubierto en
  `GetStoreCatalogSettingsQueryHandlerTests` como test de caracterización (la marca no sale, la fila no se
  muta) + **hueco real anotado** en el propio archivo (ver nota de alcance abajo).
- [x] **F1-R3** — El validador mide el valor **recortado** (`FitsAfterTrim`), no el crudo. Tres casos que pasan
  con padding + tres que fallan por exceder el tope ya recortado + `null` que no lo activa.
- [x] **F1-R4** — Claim de tienda corrupto: 400 y **cero escrituras** (`UpsertAsync`/`SaveChanges` `Never`), en
  query y command. El de tenant se documenta aparte: la tienda del contexto manda.
- [x] **F1-R5** — **OBSOLETO**: `DeliveryFee`/`MinimumOrderAmount` se eliminaron del producto (backend + UI);
  no queda coerción monetaria que probar. `toForm`/`toPayload` no tienen campos de importe.
- [x] **F1-R6** — `staleWarning` aparte de `error`: guardado OK + recarga fallida avisa sin error fatal y
  conserva los valores. Tres tests (excepción, `succeeded: false`, aviso que se limpia al reintentar).
- [x] **F1-R7** — Rama de **excepción** en la carga inicial: error fatal, sin formulario, botón deshabilitado,
  sin aviso de recarga y sin `showBlockingError`.
- [x] **F1-R8** — `formatSyncedAt` exportada y con suite propia: UTC con `Z`, offset `+02:00`, sin zona,
  `z` minúscula e inválido.
- [x] **F1-R9** — Selectores migrados a rol/nombre accesible: los tres `Switch` por
  `getByRole('switch', { name })`, los campos por `getByLabelText`, el botón por su nombre y el aviso de
  recarga por `role="status"` **dentro de su región**. Documentado por qué el error fatal NO puede usar rol.

> **Alcance que queda fuera y por qué.** El caso "fila presente con `PaletteId` vacío/en blanco → paleta por
> defecto" de `GetPublicOrderingConfigQuery` sigue SIN cubrir: vive en `GetPublicOrderingConfigQueryHandlerTests.cs`,
> fuera de la superficie autorizada para este trabajo. El hueco queda escrito en el doc del test de
> caracterización de `GetStoreCatalogSettingsQueryHandlerTests` para que no se pierda.

## Progreso

- 2026-10-08 — Documento creado. Owner: "absolutamente todo". Sin cierre todavía.
- 2026-10-08 — **Slice "Módulos" cerrado (M-R3-001, M-R3-002, M-R3-003).** Query de verificación #4 del script 31
  reescrita con `UNION ALL` por fila (fin del producto cartesiano `JOIN "Feature" ON TRUE`); `StorePlanCatalogTests`
  actualizado con los módulos 19/20 en Superior y VIP (el seed ya los añadía y el test no los listaba: estaba rojo);
  nuevos tests de topología del seed contra `HasData` (`PedidosModulesSeedTests`) y de contrato del SQL compartido del
  backfill (`Catalog.PedidosModulesBackfillTests`). M-R3-003 reclasificado como falso positivo (FK Restrict).
  Commit (work-unit): `fix(modules): correct script 31 parity query and close module-slice review findings`. Verificación observada: `dotnet build src/SMCA.sln` → Build succeeded (0 errors);
  `Application.Tests --filter PedidosModulesBackfillTests` → 4/4; E2E `StorePlanCatalogTests|PedidosModulesSeedTests` → 4/4
  (re-ejecutado por el orquestador como spot-check: 4/4, 785 ms). RDD `assess` con base `817ec633`: risk=medium, 273 líneas,
  `review_due=false` (`under_budget`) → el slice queda en cola en la acumulación hasta el umbral; sin revisión nativa todavía.
- 2026-10-08 — **Bloque Showcase cerrado en su parte backend (SC-R1, SC-R2, SC-R3).** Compensación de archivo huérfano en el alta; borrado tolerante a fallo de disco con log; regla de archivo presente alcanzable (`Length > 0`); `IsActive` explícito en el config público. Verificación observada: build de la solución OK (0 errors, sin `error MSB`); `Showcase` 113/113; `GetPublicOrderingConfig` 43/43; sonda de mutación confirma que cada test cae al revertir su fix. SC-R4/SC-R5 (UI) siguen abiertos.
- 2026-10-08 — **Cerrados SC-R4 y SC-R5 (frontend del showcase).** Reset del `<input type="file">` tras leer los archivos, para que re-seleccionar el mismo archivo vuelva a disparar `change`; el halo del botón "Ver productos" decide la animación en JS a partir de `prefers-reduced-motion` (conservando `motion-reduce:animate-none` como red SSR) y su test comprueba el efecto en vez de las clases; tests nuevos de las ramas de fallo parcial y de red del upload (aviso, retención de lo que falló, sin toast de éxito) y del carrusel (pausa por hover y por foco/teclado con reanudación, y una sola imagen sin flechas, sin puntos y sin auto-avance). Verificación observada: `pnpm vitest run app/catalog/ app/sales/routes/__tests__/` → 28 archivos / 494 tests verdes; `pnpm exec eslint` sobre los 4 archivos tocados → limpio; `pnpm typecheck` → único error preexistente y ajeno (`storefront-checkout-staff.test.tsx(24,7)`, `PublicOrderingConfig` sin `carouselImages`/`dailyImages`). Sin commit (writer acotado).
- 2026-10-08 — **Slice F8 backend cerrado (F8-R1, F8-R2, F8-R5).** Validación up-front de logo+banner antes de
  escribir nada; borrado de archivos obsoletos diferido hasta después de persistir, best-effort con `LogWarning`,
  con compensación del archivo nuevo si el guardado falla (el anterior sobrevive); `MediaUrl` con guarda de slug
  además de la de clave. Tests: `Handle_WithAValidLogoAndAnInvalidBanner_ShouldNotSaveAnyFile` (renombrado y
  fortalecido con `SaveBrandingAsync` `Never`), `Handle_WhenThePersistenceFails_ShouldKeepThePreviousFileAndDeleteTheNewOne`,
  `Handle_WhenThePreviousFileCannotBeDeleted_ShouldStillSucceed` y `Handle_WhenTheStoreHasABlankCatalogSlug_ShouldPublishNoMediaUrls`.
  Verificación observada: `dotnet build src/SMCA.sln` → Build succeeded, 0 errors, sin `error MSB`;
  `--filter UpdateStoreCatalogBranding` → 46/46; `--filter GetPublicOrderingConfig` → 45/45;
  `Application.Tests` completo → **1163 passed, 0 failed**. Sondas de mutación: cada fix revertido rompe
  exactamente los tests que lo fijan (y solo uno, `...ShouldNotSaveAnyFile`, para F8-R1). Sin commit (writer acotado).
  F8-R3/R4/R6 (frontend) siguen abiertos.
- 2026-10-08 — **Slice F8 frontend cerrado (F8-R3, F8-R4, F8-R6).** Tests, sin cambio de producción:
  `HTTP-12` fija el mapeo multipart de `updateBranding` (logo/banner como `File`, booleanos `'true'`,
  header `multipart/form-data`) y `HTTP-13` el PATCH (lo no mencionado no viaja); caso de archivo
  demasiado grande (2 MB + 1 byte) en la marca; aserciones de `alt` en logo/banner (con nombre de tienda)
  y en las imágenes del carrusel y del bloque del día (pie de foto o nombre de la tienda).
  Verificación observada: `pnpm vitest run public-catalog + web-catalog + catalog-http-service` →
  3 archivos / **102 tests verdes**, 0 errores de tipo.
- 2026-10-08 — **Bloque F4 envío cerrado (F4-R1, F4-R2, F4-R3, F4-R4, F4-R5, F4-R6).** Frontend
  alineado con el contrato nuevo del backend (`remove-delivery-fee-and-minimum.md`): el resumen
  `wa.me` se arma con el snapshot del servidor (**option B**, cierra R3) y el aviso sale del
  `try/catch` del POST (R2). R1, R4, R5 y R6 son tests nuevos: reset al reabrir, claves de los dos
  contratos (el número no viaja en el config público), cierre del checkout modelado con el padre
  real, e importes esperados derivados de `formatMoneyWithCurrency`.
  Verificación observada: `pnpm vitest run app/catalog/ app/sales/` → 82 archivos / **1685 tests
  verdes**, `Type Errors: no errors`; `pnpm exec eslint` sobre los 11 archivos tocados → limpio;
  `pnpm typecheck` → **0 errores** (se resolvió de paso el preexistente de
  `storefront-checkout-staff.test.tsx`, `PublicOrderingConfig` sin `carouselImages`/`dailyImages`).
  Sondas de mutación: los tres fixes revertidos rompen exactamente sus tests. Sin commit (writer
  acotado). Pendiente de aviso por estar **fuera de la superficie autorizada**:
  `app/shared/lib/config/menu-config.ts:178`/`:191` (la ayuda del ítem "Pedidos WhatsApp" sigue
  ofreciendo configurar el costo de envío y el importe mínimo, que ya no existen) y
  `app/catalog/lib/storefront-cart-store.ts:49` (doc-comment con la misma idea obsoleta).
- 2026-10-09 — **Cerrados F3-R3, F3-R4, F3-R5 y F3-R6 (frontend del carrito/checkout) y R3-1/R3-2
  (aviso del checkout).** El estado del pedido separa el veredicto (404) del incidente (red caída,
  5xx, 429) con la clave `ORDER.STATUS_FAILED`, que existía sin usar; el input de cantidad ya no
  borra la línea al vaciarse (ni con `0`, `1.5` o negativos), y el `updateQuantity(<= 0) → remove`
  del store se deja como estaba porque lo usa el botón −; el doble envío se frena con un espejo del
  estado en una `useRef`; y el auto-dismiss del aviso "añadido" queda fijado con temporizadores falsos,
  incluido el reinicio del temporizador al añadir otro producto. R3-1 y R3-2 son de observabilidad:
  el aviso se pinta con el código y `link: null` (estado bloqueado) cuando el resumen no se puede
  componer, y tanto ese fallo como el de `window.open` dejan `console.warn`.
  Verificación observada: `pnpm vitest run app/catalog/ app/sales/` → 82 archivos / **1693 tests
  verdes**, `Type Errors: no errors`; `pnpm exec eslint` sobre los 6 archivos tocados → limpio;
  `pnpm typecheck` → **0 errores**. Sondas de mutación: cada uno de los 6 fixes revertidos rompe
  exactamente los tests que lo fijan. Sin commit (writer acotado). Sigue pendiente, por estar fuera de
  la superficie autorizada: `http-error.ts` no tiene helper de status y el 404 del estado del pedido se
  lee con un helper local al componente (si algún día se añade `isNotFound`, se sustituye aquí).
- 2026-10-09 — **Cerrados F3-R1 y F3-R2 (backend, E2E nuevo).** Los dos avisos pedían cobertura que
  ningún test tenía, y los dos tienen la misma forma: una garantía que solo se rompe si el PIPELINE
  real se comporta como el test supone.
  F3-R1: `Orders/PublicOrderingReadE2ETests.cs` lee el pedido por HTTP anónimo contra `smca_test`.
  El caso que hace que valga la pena es **R1-2**, no R1-1: con un tenant ajeno, la consulta filtrada
  de `Order` devuelve 0 filas y la de `IgnoreQueryFilters` devuelve 1, y un contexto sin tenant (el
  caso real del anónimo) tampoco ve la fila. Sin esa sonda, el 200 de R1-1 distinguiría "el bypass
  funciona" de "el filtro global no llega a traducirse a SQL en este Provider" — que es
  precisamente la duda que Ahumada dejó abierta al decir "solo con InMemory".
  F3-R2: `Orders/PublicOrderingRateLimitE2ETests.cs`. Los unitarios de la política pasan IGUAL con el
  middleware corrido antes del routing, porque inyectan `RouteValues` en un `DefaultHttpContext`: la
  premise está presupuesta en el test, no comprobada. Aquí entra por HTTP, y R2-2 es la prueba
  directa del hallazgo —agotado el slug A desde la misma IP, el slug B responde 200— que es
  justamente lo que se pierde si el slug llega vacío al limiter. Detalle no obvio: R2-1 **no** afirma
  "la petición 21 es 429", porque la reposición de `OnlineOrderPolicy` es de 2 por minuto y el bucle
  puede cruzar una frontera de segmento; afirma los 20 primeros en 200 y que el cubo **sigue**
  cerrado, que es lo que distingue un límite de un 429 puntual.
  Superficie: solo E2E nuevos (`Orders/PublicOrderingReadE2ETests.cs`,
  `Orders/PublicOrderingRateLimitE2ETests.cs`, `Orders/PublicOrderingSeed.cs`). Ni producción ni tests
  E2E existentes. El seed es local y no toca `WebCatalogSeed`/`AuthzSeed`: hace falta el
  `StoreCatalogSettings` con pedidos abiertos y un `Order` con líneas, y el `CatalogSlug` se fija en el
  alta del store porque `ApplicationDbContext` es NoTracking. El slug lleva GUID → un cubo de rate
  limit por prueba, así que el suite no se pisa a sí mismo.
  Verificación observada: `dotnet build src/SMCA.sln` → **Build succeeded**, 0 errors, sin `error MSB`;
  `--filter PublicOrderingReadE2ETests` → **4/4**; `--filter PublicOrderingRateLimitE2ETests` → **3/3**.
  Los nombres se confirmaron con `--list-tests` **sin** `--filter` antes de correr. Sin commit (writer
  acotado). Sin pendientes fuera de superficie en este slice.
- 2026-10-09 — **E2E de matriz de planes: regresión del cambio Módulos 19/20 encontrada y corregida
  (autorizada por el owner).** Al correr la suite E2E completa aparecieron 9 fallas, TODAS de la
  matriz de planes: `PlanChangeMatrixTests` ×8 (esperaba los feature sets sin 123/124 y sin los
  módulos 19/20 en Superior/VIP) y `StorePlanCatalogTests` ×1. El segundo reveló además que
  `smca_test` tenía la migración `20261008185523` **marcada aplicada pero SIN las filas
  `StorePlanModule` 19/20** (Superior = 16 en la DB); se reparó con el script idempotente 31 (su query
  #4 pasó a devolver 4). `PlanChangeMatrixTests` se actualizó: módulos 19/20 en Superior/VIP, feature
  123 → módulo 20 (sale del 18) y 124 → módulo 19. Verificación observada:
  `--filter PlanChangeMatrixTests|StorePlanCatalogTests` → **10/10**. El "4/4 verde" reportado en el
  slice de Módulos se sospecha **falso verde por binario stale** (AGENTS.md: mirar `error MSB`, no la
  duración). Nota: la suite E2E **completa** no terminó en la última corrida — el testhost crashea a
  mitad (0 fallas hasta el crash) —; los subconjuntos dirigidos pasan.
- 2026-10-09 — **Review `review-6049fd7fe3bc3f5e` APROBADA** (5 advisory, ninguno bloqueante; autoridad quemada):
  - [x] **R3-001** (WARNING · test) — `PublicOrderingReadE2ETests` R1-3 afirma que el 404 es uniforme entre código inexistente y teléfono incorrecto, pero `ReadAsync` deja el body en null ante cualquier status no-éxito: las aserciones son tautológicas y no prueban el anti-oráculo.
    - **Cerrado (2026-10-10).** Nuevo `GetStatusRawAsync`, que lee el cuerpo CRUDO (`ReadAsStringAsync`) sin pasar por `ReadFromJsonAsync`, y R1-3 compara **los dos cuerpos carácter a carácter** en vez de afirmar «ambos null». Se añadieron las tres piezas que faltaban para que la prueba sea real: control positivo (el par correcto responde 200 — sin él, «dos 404 iguales» también lo diría un endpoint que nunca devuelve nada), que el cuerpo no está vacío, y que **ninguno** de los dos cuerpos hace eco del código probado ni del teléfono. **Sonda de mutación**: con el valor esperado sustituido por una cadena inexistente, el test cae y muestra el cuerpo real — `{"data":null,"message":null,"actionCode":404,"succeeded":false,"errors":[{"code":"App.Unexpected","description":"No hay ningún pedido con ese código y ese teléfono"}]}`, 182 caracteres, idéntico en los dos casos y sin eco del código ni del teléfono. Se afirman las dos mitades: el status **y** el cuerpo.
  - [x] **R3-002** (SUGGESTION · test) — Los tests de rate limit no fijan el presupuesto exacto (20): cualquier límite entre 20 y 30 los deja verdes.
    - **Cerrado (2026-10-10), y cerrado de verdad, no documentado.** El techo se **deriva del reloj** en vez de aflojarse: la ventana deslizante es de segmentos discretos (10 segmentos de 1 min), así que mientras no se cierra un minuto entero no se repone ni un permiso y el techo real del cubo es `20 + 2 × minutos_completos_transcurridos`. `ExhaustAsync` mide con `Stopwatch` y `AssertBudgetHeld` afirma `Allowed ∈ [20, techo]`: en una corrida normal (medido: 0,4–1,1 s) el techo es **exactamente 20**, luego un límite de 25 o de 30 pone el archivo rojo. Si la máquina fuera tan lenta que el bucle pasara de un minuto, el techo se ensancha con la reposición REAL y el test sigue siendo cierto: no hay forma de que se vuelva flaky por reloj. La magnitud exacta sigue fijada además, y de forma determinista, en `Application.Tests/.../OnlineOrderRateLimitPolicyTests` (`PermitLimit = 20` + `AttemptAcquire(21)` → «permit limit of 20»). **Sonda de mutación**: `PermitLimit` a 25 → los 3 tests caen con «…luego el techo real era 25 … but found 20».
  - [x] **R3-003** (WARNING · test) — `PlanChangeMatrixTests` se editó en lockstep con una reparación manual de la DB: deja de ser corroboración independiente del wiring de producción.
    - **Resuelto por evidencia, sin código (2026-10-10).** Sigue siendo corroboración independiente: el test **lee la base viva** y afirma el universo NUEVO (módulos 19/20 en Superior y VIP, feature 123 → módulo 20, 124 → 19). Lo que se editó en lockstep fue la EXPECTATIVA, y la expectativa correcta la dicta `StorePlanModuleEntityTypeConfiguration.HasData` — el mismo modelo que genera la migración y su `INSERT` —, no la reparación. Si el wiring de producción estuviera mal, el universo en la base sería el viejo y el test caería; que la expectativa se escribiera mirando el modelo y no la base es justo lo que lo hace capaz de detectar una deriva. La reparación de `smca_test` fue legítima y de una causa DISTINTA y ya identificada (la migración `20261008185523` marcada aplicada sin sus filas, ver R3-005). Y los 700/700 de la suite completa (ver R3-004) demuestran que el arreglo de la base no dejó ningún otro test esperando el universo viejo.
  - [x] **R3-004** (WARNING) — La suite E2E completa no termina (crash del testhost) y hubo un falso verde sospechado por binario stale: la reproducibilidad full-suite de los E2E nuevos no está evidenciada.
    - **Ya NO aplica (cerrado 2026-10-10).** El crash es el del 2026-10-09, con causa raíz encontrada y arreglada: `PlanModuleConvergenceTests` re-ejecutaba `UpSql` contra `smca_test` y su `PlanCatalogCleanupSql` BORRA los pares plan↔módulo fuera de su `SpecCte` **histórico**, que no conoce 19/20. Con `ConvergenceSnapshot` capturando y restaurando también el catálogo, la suite E2E **completa** terminó **700/700, 0 fallos** (antes crasheaba a mitad). Lo que este slice evidenció por su cuenta: `PlanModuleConvergenceTests` **3/3** con la línea `[E2E Guard] … Database=smca_test`, reloj de pared 25–43 s frente a los `3 ms` que reporta VSTest (la trampa de `AGENTS.md`: la duración de VSTest no dice nada en esta suite) y auditoría de `smca_test` después → `StorePlanModule` 19/20 = **4**, 52 filas en total. El slice no toca estado global, así que no puede reintroducir el crash; y el grep de build mira `Build succeeded|Build FAILED` **y** `error MSB` (no solo `error CS`), que es lo que descarta el falso verde por binario stale.
  - [x] **R3-005** (WARNING) — La migración `20261008185523` marcada aplicada sin sus filas `StorePlanModule` 19/20 es un peligro en cualquier entorno donde corrió primero; los tests no cubren esa aplicación parcial.
    - **Ya cubierto por `StorePlanCatalogTests` (documentado 2026-10-10).** `StorePlanModule_seed_matches_documented_plan_matrix` lee la matriz `StorePlanModule` **de la base** y la compara módulo a módulo con la de `HasData`, **incluidos 19 y 20 en Superior y VIP** (`(int)ModuleType.PedidosWhatsApp`, `(int)ModuleType.GestionPedidos`). Con la migración marcada aplicada y las filas ausentes, ese test falla: es exactamente la aplicación parcial que el hallazgo describe. O sea, el peligro no es que los tests no lo cubran — es que lo cubren desde antes de que se manifestara, y el 2026-10-09 fue ese test (y `PlanChangeMatrixTests`) poniéndose rojos y delatando la base. Se deja constancia del riesgo residual real, que no es de test sino de proceso: un entorno donde la migración se marcó aplicada y nadie corre el E2E.
  
  
  
  
- 2026-10-09 — **Crash del testhost + corrupción del catálogo: CAUSA RAÍZ encontrada y arreglada
  (autorizada).** El crash de la suite E2E y la desaparición recurrente de los `StorePlanModule`
  19/20 tenían la MISMA causa: `PlanModuleConvergenceTests` re-ejecuta
  `PlanModuleConvergenceSql.UpSql` contra `smca_test`, y su `PlanCatalogCleanupSql` BORRA los pares
  plan↔módulo fuera de su `SpecCte` **histórico** (que no conoce 19/20); el `ConvergenceSnapshot`
  solo restauraba estado **por tienda**, no el catálogo. Arreglo: `ConvergenceSnapshot` ahora captura
  y restaura `StorePlanModule` en ambas direcciones. Además `MeAfterOwnerPlanChangeTests` (universo
  de Superior) se actualizó a los módulos 19/20. Verificación observada:
  `PlanModuleConvergenceTests` → **3/3** y `StorePlanModule` 19/20 siguen **4** tras la corrida;
  suite E2E **COMPLETA** → **700/700, 0 fallos** (antes crasheaba a mitad); catálogo intacto (4) al
  final. La causa histórica de la aplicación parcial (R3-005) queda como riesgo separado.
- 2026-10-09 — **Review 4R `review-eb5e26c51ba20365` APROBADA** (6 advisory, ninguno bloqueante;
  autoridad quemada). Lentes: risk (0 hallazgos), resilience, readability, reliability.
  - [x] **R4-001** (WARNING · resilience, el más accionable) — El restore del catálogo borra y reinserta en sentencias **no transaccionales**: una interrupción entre ambas deja el catálogo mutilado (justo el modo de crash que el fix neutraliza). **Cerrado (2026-10-09):** el borrado+reinserción del catálogo va ahora dentro de **una transacción** (`catalogTransaction`), así que es atómico. Verificado: `PlanModuleConvergenceTests` 3/3 y `StorePlanModule` 19/20 siguen 4 tras la corrida.
  - [x] **R3-CATALOG-SCOPE** (WARNING · reliability) — El restore borra **cualquier** par ausente del snapshot (global), no solo lo que movió `UpSql`; sensible al orden de tests.
    - **Verificado y documentado (2026-10-10), sin cambio de código.** El alcance global es CORRECTO y no un descuido: `PlanCatalogCleanupSql` recorre **todos** los planes de `StorePlan` (su CTE los cruza enteros, sin filtrar por plan) y todas las tiendas, así que un restore acotado a un subconjunto dejaría fuera justo los pares que la corrida tocó por fuera del recorte — sería una restauración **menos** fiel, no más. Y no hay escritor concurrente al quearle: la clase está en `[Collection("e2e")]`, que corre **serializada** sobre un único `WebAppFixture`. Los dos argumentos quedan escritos en el doc-comment de `ConvergenceSnapshot`.
  - [x] **R3-CATALOG-LOSSY** (WARNING · reliability) — El reinsert manda solo `PlanId`/`ModuleId`; si la tabla tuviera más estado persistido, el snapshot no sería fiel (hoy solo tiene esas 2 columnas → sin efecto).
    - **Verificado por construcción: NO-OP confirmado (2026-10-10).** `StorePlanModule : Entity` (no `AuditableEntity`), **sin `Id` propio** porque su PK ES `(PlanId, ModuleId)`, sin columnas de auditoría, y la migración `20260908194919_Add-StorePlanModules` no crea ninguna más. No hay estado adicional que capturar ni que restaurar: el snapshot del catálogo es completo por tener que serlo. Deuda que se saldó al llevar la reinserción por el `DbSet` mapeado: `UpdateAuditableEntitiesInterceptor` solo toca `AuditableEntity`, así que no puede reestampar nada, y `StorePlanModuleCreatedDomainEvent` **no tiene handler**, así que el `Add` no arrastra efectos secundarios.
  - [x] **R2-001/R2-002/R2-003** (readability) — Tres copias de la misma proyección EF; tipo anónimo/tuplas junto al `record`; SQL crudo con nombres de tabla/columna hardcodeados.
    - **Cerrado (2026-10-10), los tres en `PlanModuleConvergenceTests.cs`:**
      - **R2-001** → un único helper `ReadPlanModuleKeysAsync(db)` (devuelve `List<StorePlanModuleRow>`) para las TRES lecturas del bloque del catálogo: la captura, qué sobró tras la corrida y qué falta reponer. Capturar y restaurar leen ahora **exactamente la misma forma**; tres copias de una proyección son tres ocasiones de divergir, y la que divergiera mutilaría el catálogo en silencio — exactamente el 2026-10-09.
      - **R2-002** → `StorePlanModuleRow` sube a la región de `Records` de la clase (junto a `StoreModuleRow` y `StoreRoleFeatureRow`) y **todo** el bloque del catálogo lo usa, sin tipos anónimos ni tuplas de base de datos mezclados. Los `ToHashSet()` de `(PlanId, ModuleId)` siguen siendo tuplas, pero son un conjunto de búsqueda local, no una fila leída.
      - **R2-003** → el `INSERT` crudo (`INSERT INTO "StorePlanModule" ("PlanId","ModuleId") … ON CONFLICT …`) desaparece: ahora es `db.Set<StorePlanModule>().Add(StorePlanModule.Create(planId, moduleId))` más un único `SaveChangesAsync()` dentro de la transacción que ya existía. La misma fábrica y el mismo mapeo que usa `HasData`: un rename de tabla o de columna ya no puede dejar el restore escribiendo contra un esquema que no existe, y la segunda mitad del restore deja de ser un segundo lenguaje paralelo al modelo.
  
  
- 2026-10-09 — **Slice F2 persistencia cerrado (F2-R1..F2-R6).** R1, R3 y R4 son tests nuevos;
  R2 es un E2E **nuevo** (`Orders/OnlineOrderingPersistenceE2ETests.cs`, 7 casos contra `smca_test`)
  porque la persistencia de F2 —`UpsertAsync`, `CodeExistsAsync`/`GetByCodeAsync` y
  `GetPublishedByIdsAsync`— solo estaba probada con Moq; R5 y R6 quedan **documentados como falsos
  positivos** con evidencia, sin migración ni cambio de producción. R4 además se apoyó en una idea que
  salió de F4-R4: dejar de afirmar la FORMA del contrato y afirmar lo que hace el **binding** con el
  cuerpo real (`JsonSerializerDefaults.Web`), que es donde un cliente anónimo intentaría colar el
  precio o el código. El E2E reutiliza `PublicOrderingSeed` **sin tocarlo** y, por la lección del crash
  del 2026-10-09, no toca el catálogo: siembra y limpia en `finally`, con `IgnoreQueryFilters`, en orden
  de FK. Superficie: los tres archivos de test del backend y un E2E nuevo. Sin commit (writer acotado).
  Verificación observada: `dotnet build src/SMCA.sln` → **Build succeeded**, 0 errors, sin `error MSB`;
  `Domain.UnitTests --filter StoreRoleFeatureGeneratorTests` → **14/14** (suite completa **165/165**);
  `Application.Tests --filter OnlineOrdering` → **388/388** (suite completa **1166/1166**);
  `OnlineOrderingPersistenceE2ETests` → **7/7** con la línea `[E2E Guard] … Database=smca_test`, y
  `--filter E2ETests.Orders` (los 4 archivos de la carpeta) → **17/17**. Auditoría de `smca_test` tras
  la corrida: `StorePlanModule` 19/20 = **4**, `Feature 123` → `ModuleId` **20**, **0** filas E2E
  remanentes. Sonda de mutación dentro de la superficie: los mensajes esperados de los dos rechazos
  nuevos cambiados por una cadena inexistente → **4 fallos y solo esos 4**; revertido. Sin pendientes
  fuera de superficie: el comentario «ONLY» de `OnlineOrdersRoleFeatureBackfill` se corrigió (F2-R6).

- 2026-10-10 — **F1 (Pedidos WhatsApp config) cerrado en sus nueve hallazgos.** Retomado sobre un árbol con
  cambios sin commitear de un writer cancelado: primero se leyó cada `git diff` y se conservó lo que estaba bien
  (el fix del validador, los casos de claim corrupto, la reescritura de `loadData`, los tests F1-R6/R7/R8 y el
  E2E de ruta/permiso). **Reparado lo que quedó a medias**: (a) el writer dejó dos bloques `<summary>` seguidos
  en `UpsertStoreCatalogSettingsCommandValidatorTests` —el doc de `Validate_WithAnOverlongWhatsappNumber_ShouldFail`
  había quedado huérfano sobre el test nuevo y ahora está devuelto a su método—; (b) el validador de producción
  acabó **sin salto de línea final** (`\ No newline at end of file`), añadido; (c) `formatSyncedAt` arrastraba
  dos JSDoc apilados, fusionados en uno.
  **F1-R2 se reatribuyó** tras verificar el código: el fallback `DefaultPaletteId` está en
  `GetPublicOrderingConfigQuery`, no en la query de gestión cuyo DTO ni expone `PaletteId`; se dejó el test de
  caracterización y **el hueco real anotado** (cerrarlo tocaría `GetPublicOrderingConfigQueryHandlerTests.cs`,
  fuera de superficie). **F1-R5 se cerró como OBSOLETO**: `DeliveryFee`/`MinimumOrderAmount` ya no existen en
  `ordering-settings.tsx` (`toForm`/`toPayload` sin importes), luego no hay coerción monetaria que probar.
  **F1-R9** se ido más allá de "un selector": los tres `Switch` por `getByRole('switch', { name })`, los campos
  por `getByLabelText`, el botón por su nombre y el aviso de recarga por `role="status"` dentro de su región —
  con el motivo escrito de por qué el error fatal NO puede localizarse por rol (`Spinner` y `InfoBox` comparten
  `role="status"` sin nombre accesible que los distinga; el `findByRole` resolvía contra el Spinner).
  Verificación observada: `dotnet build src/SMCA.sln` → **Build succeeded**, 0 errors, sin `error MSB`;
  `Application.Tests --filter FullyQualifiedName~StoreCatalogSettings` → **75/75**;
  E2E `--filter OrderingSettingsRouteAuthE2ETests` → **8/8** con `[E2E Guard] ... Database=smca_test` y reloj de
  pared 59 s frente a los `8 ms` que reporta VSTest (la trampa documentada en `AGENTS.md`: la duración de VSTest no
  dice nada en esta suite); auditoría de `smca_test` tras la corrida → **0** `StoreCatalogSettings` huérfanas,
  **0** `StoreModule` de módulo 18, **0** tiendas `e2e-pedidos-%`, y el catálogo **intacto** (`Module` 18 con su
  `Feature`, 20 módulos, 52 `StorePlanModule`) — el E2E no toca tablas globales.
  `vitest run …/ordering-settings.test.tsx` → **24/24** sin avisos de `act`; `pnpm eslint` sobre los dos archivos
  tocados → limpio; `pnpm typecheck` → **2 errores preexistentes y ajenos** en
  `app/admin/modules/routes/__tests__/module-catalog.test.tsx` (`isActive` no existe en `ModuleCatalogPricingPayload`),
  archivo **no tocado por este trabajo** (`git diff --name-only HEAD` vacío para él) y con vitest en verde: se
  reporta, no se arregla. Sin commit (writer acotado).
- 2026-10-10 — **Review F1 `review-11b26b457f05e0c2` APROBADA** (2 advisory, ninguno bloqueante; autoridad quemada):
  - [x] **R3-001** (WARNING · test) — El test caracterizador `Handle_WithAPaletteStoredOrBlank_ShouldReturnOnlyTheOrderingColumns` solo afirmaba valores POR DEFECTO (Enabled=false, WhatsappNumber/SyncedAt null), así que no distinguía "se usó la fila" de "se devolvieron los defaults". **Cerrado (2026-10-10):** la fila se siembra con valores NO por defecto (Enabled=true, WhatsappNumber, SyncedAt) y se afirman; doc actualizado (el caso "paleta en blanco" vive en `GetPublicOrderingConfigQueryHandlerTests`).
  - [x] **R3-002** (SUGGESTION · backend) — `FitsAfterTrim` mide `(value ?? "").Trim()`, que podría divergir del `Trim` del handler; un valor con padding que el validador acepte pero el handler escriba más largo reintroduciría el 500 del INSERT. Sugiere un caso de borde a nivel columna/persistencia.
    - **Cerrado (2026-10-10) con la prueba al nivel de la COLUMNA que pedía el hallazgo — sin tocar el handler.** `OrderingSettingsRouteAuthE2ETests` gana dos casos: `R1_7_a_padded_value_that_fits_once_trimmed_is_persisted_trimmed` (PUT por HTTP con un número de 40 caracteres crudos que son 32 recortados, y `BusinessHours`/`DeliveryZones` con 518 crudos y 512 recortados → **200**, y la FILA leída de `smca_test` tiene exactamente los 32/512/512 recortados; si el handler no recortara, el INSERT no habría llegado; si el validador midiera el crudo, el 400 habría llegado antes) y `R1_8_a_padded_value_over_the_limit_once_trimmed_is_rejected_and_the_row_is_untouched` (un carácter por encima del tope ya recortado → **400** y la fila intacta, el control negativo que demuestra que R1-7 no pasó por gracia). **El `Trim` del validador y el del handler NO divergen**: los dos son `string.Trim()`, y lo que se persiste es siempre `value.Trim()`, exactamente lo que el validador midió.
    - Y la ÚNICA asimetría real entre las dos medidas quedó documentada y fijada en `UpsertStoreCatalogSettingsCommandValidatorTests.Validate_WithAWhitespaceOnlyNumberFarOverTheLimit_ShouldOnlyReachTheLengthRuleWithTheSwitchOff`: para un texto **solo-espacios** el validador mide `""` (longitud 0, PASE) y el handler persiste `null`. No hay riesgo —a `null` no lo revienta ninguna columna— y con el interruptor **encendido** la divergencia es además INALCANZABLE, porque `NotEmpty` (que FluentValidation también trata como vacío un texto de puros espacios) rechaza antes de que la regla de longitud mire nada. **Un hallazgo colateral, descubierto al escribir el caso**: el primer intento afirmaba que un número solo-espacios pasaba el validador con el interruptor encendido, y **cayó** — la regla de negocio lo rechaza. El caso se corrigió para afirmar lo que la base hace, que es más interesante que lo que se suponía.
- 2026-10-10 — **Advisories backend/E2E cerrados (writer acotado): review-6049fd7fe3bc3f5e R3-001..R3-005,
  review-eb5e26c51ba20365 R3-CATALOG-SCOPE / R3-CATALOG-LOSSY / R2-001..R2-003 y review-11b26b457f05e0c2
  R3-002.** Ocho advisories, cinco con código y tres resueltos/documentados con evidencia.
  **Convergencia (lectura):** las tres copias de la proyección de `StorePlanModule` —captura, borrado de
  sobrantes y reinserción de faltantes— pasan por un único `ReadPlanModuleKeysAsync`, y el
  `StorePlanModuleRow` sube a la región de `Records` de la clase para que todo el bloque del
  catálogo hable el mismo idioma. El `INSERT` crudo con `"StorePlanModule"`/`"PlanId"`/`"ModuleId"`
  escritos a mano se sustituye por `db.Set<StorePlanModule>().Add(StorePlanModule.Create(...))` +
  un `SaveChangesAsync` dentro de la transacción que ya existía: misma fábrica y mismo mapeo que
  `HasData`, sin tablas ni columnas repetidas en un segundo lenguaje. Verificado antes de nada que
  el cambio es **fiel**: `StorePlanModule : Entity` (no `AuditableEntity`), sin `Id` propio porque su
  PK ES `(PlanId, ModuleId)`, y `20260908194919_Add-StorePlanModules` no crea una tercera columna —
  luego el advisory LOSSY es un no-op confirmado, no un riesgo. SCOPE igual: documentado, sin
  código, porque `PlanCatalogCleanupSql` recorre TODOS los planes (acotarlo haría el restore MENOS
  fiel) y `[Collection("e2e")]` serializa sobre un único fixture (no hay escritor concurrente).
  **Anti-oráculo (R3-001):** R1-3 deja de afirmar «ambos body null» —tautológico, porque `ReadAsync`
  deja el body en null ante cualquier no-éxito— y pasa a comparar los **cuerpos crudos** de los dos
  404 carácter a carácter, con control positivo (el par correcto es 200), cuerpo no vacío, y sin eco
  del código ni del teléfono. **Presupuesto del rate limit (R3-002):** no aflojado, **derivado** —
  `ExhaustAsync` mide con `Stopwatch` y el techo es `20 + 2 × minutos_completos_transcurridos`,
  exacto porque la ventana es de segmentos discretos; en una corrida normal el techo es 20, luego un
  límite de 25 o 30 pone el archivo rojo. **Trim del validador vs el del handler:** no divergen
  (los dos son `string.Trim()`); el caso nuevo va a nivel de COLUMNA contra `smca_test`, que es lo
  que el hallazgo pedía, con su control negativo. Superficie: los cuatro archivos E2E autorizados +
  el de validador + este doc. **Ni una línea de producción tocada.**
  Verificación observada (con `Get-Process -Name "testhost*" | Stop-Process -Force` antes, y grepeando
  `Build succeeded|Build FAILED` **y** `error MSB`, no solo `error CS`): `dotnet build src/SMCA.sln`
  → **Build succeeded**, 0 errores, sin `error MSB` (los `warning CS` que salen son preexistentes y
  de archivos no tocados); E2E dirigido (`PlanModuleConvergenceTests|PublicOrderingReadE2ETests|
  PublicOrderingRateLimitE2ETests|OrderingSettingsRouteAuthE2ETests`) → **20/20** con `[E2E Guard]
  … Database=smca_test` y reloj de pared 43 s frente a los `11 ms` que reporta VSTest;
  `Application.Tests --filter UpsertStoreCatalogSettings` → **51/51**.
  **Sondas de mutación, las tres y revertidas:** (a) el cuerpo esperado de R1-3 cambiado por una
  cadena inexistente → cae y delata el cuerpo real de 182 caracteres; (b) `PermitLimit` a 25 → los
  3 tests de rate limit caen con «el techo real era 25 … but found 20», que es exactamente el hueco
  que el advisory denunciaba; (c) el valor persistido esperado en R1-7 cambiado por el string con
  padding → cae y muestra los 32 dígitos recortados. 5 fallos y solo esos 5.
  Auditoría de `smca_test` al terminar: `StorePlanModule` 19/20 = **4**, 52 filas en total, `Feature`
  123 → `ModuleId` **20**, `Module` 19/20 presentes, y **0** huérfanos en `Store` (e2e/pmc),
  `StoreModule`, `StoreRoleFeature`, `StoreCatalogSettings`, `Order`, `OrderItem`, `Product`,
  `ProductCategory`, `User` (`pmc-*`) y `Owner`. Sin commit (writer acotado).
  Sin pendientes fuera de superficie: el `Trim` del handler y el del validador NO difieren, así que no
  hubo que unificarlos ni tocar producción.
- 2026-10-10 — **Cerrados los 3 advisories frontend de F3 (`review-808d9dda34fad1da` R3-001/R3-002/
  R3-003), writer acotado, sin commit.** Superficie tocada: **solo el archivo de test**
  `storefront-flow.test.tsx` + este doc. `storefront-order-status.tsx` terminó **byte-idéntico a
  HEAD** (`git status` lo confirma) porque la hipótesis del R3-001 —«si la forma real no trae el
  status anidado, hay que arreglar el helper»— **no se cumplió al medirla**, y ya está escrito por
  qué en el advisory.
  **R3-001 (la rama del veredicto, que era el hueco real):** `getPublicOrderStatus` no envuelve nada
  y `api-client.ts:109-155` rechaza **el mismo objeto** en toda rama HTTP, así que al `catch` llega
  un `AxiosError` con `error.response.status`. La fila 404 pasó de un doble `{response:{status:404}}`
  a un `AxiosError` real, y las tres filas (404/500/429) afirman su frase **y la contraria** con la
  misma construcción: el único dato que cambia es el status anidado, luego es el discriminado entero.
  El 404 además afirma ahora lo que su nombre prometía desde antes —que no se adorna con el motivo
  (anti-oráculo F3-R3)— con un `not.toHaveTextContent(/no existe|no coincide|otra tienda/i)`.
  **Sondas de mutación, dos, y revertidas:** `isNotFound` a `return false` → cae **exactamente 1**
  test (la fila 404) y `return true` → caen **exactamente 3** (500, 429 y red). Ninguna más, que es
  lo que prueba que el test ata el comportamiento y no pasa por estar vacío.
  **Un hallazgo que la sonda no detectó, y que queda documentado igual:** cambiar `isNotFound`
  a leer `error.status` (atajo de nivel superior) **deja la suite VERDE**. No es un canal roto:axios
  1.16.1 puebla los dos canales en el constructor (`lib/core/AxiosError.js:122-125`). Se conserva
  `response.status` porque es el que vale en toda la rango declarada —`package.json` pide
  `axios ^1.7.9` y el atajo de nivel superior solo existe desde 1.8.0—, y queda escrito en el helper
  para que nadie lo "simplifique" y rompa en 1.7.x.
  **R3-002:** cero dobles literales (0 coincidencias de `{isNetworkError:true}` y de
  `{response:{status}}`). `httpRejection(status)` construye el `AxiosError` real;
  `networkRejection()` hace pasar el error **por el interceptor REAL de `api-client`** y devuelve lo
  que él rechaza —porque red es la única forma que producción MUTA (`isNetworkError = true`,
  `api-client.ts:136-138`), y sellar ese `true` a mano habría repetido el defecto—so, y el test
  afirma que la etiqueta viene puesta. El 429 del checkout usa el mismo helper.
  **R3-003:** los 10 `mockRestore()` manuales (7 `openSpy` + 3 `warnSpy`) fuera y
  `afterEach(() => vi.restoreAllMocks())`. Efecto lateral absorbido: tres espías de `window.open` solo
  se leían para restaurarlos, así que quedaron sin capturar —siguen instalados, que es lo que impide
  que `window.open` reviente en jsdom— con comentario explicando por qué.
  Verificación observada: `pnpm vitest run …storefront-flow.test.tsx` → **32/32** verde, `Type Errors:
  no errors`, y las seis pruebas de `estado del pedido` visibles por nombre en `--reporter=verbose`
  (las tres filas reales + la de red). `pnpm exec eslint` sobre los 2 archivos autorizados →
  **exit 0**. `pnpm typecheck` → 2 errores, **preexistentes y ajenos**, los dos en
  `app/admin/modules/routes/__tests__/module-catalog.test.tsx(663,664)`: reproducidos **con mi cambio
  en stash** y son idénticos, luego esta superficie **no añade ninguno**. Nada de `frontend/` (Angular)
  leído ni tocado, nada de `frontend-react/e2e/`.
