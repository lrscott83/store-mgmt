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
- [ ] **R3-001** (WARNING · frontend) — La discriminación 404-vs-incidente clasifica como "no encontrado" solo si el rechazo trae `response.status === 404`; los tests nuevos solo cubren la rama de fallo con objetos fabricados, así que la rama del veredicto 404 (la que el fix protege) no está probada con la forma real del rechazo. Si esa forma no trae el status anidado, un 404 se muestra como "no se pudo consultar".
- [ ] **R3-002** (SUGGESTION · test) — Los tests del estado fabrican el rechazo como formas literales (`{isNetworkError:true}`, `{response:{status}}`) en vez del tipo de error real del servicio: fija la expectativa del componente, no el contrato.
- [ ] **R3-003** (SUGGESTION · test) — `spyOnWarn` se restaura con `mockRestore()` manual al final de cada test; si una aserción falla antes, el espía se filtra a tests posteriores y silencia la señal.

### F2 persistencia (`pedidos-whatsapp-persistencia.md`)
- [ ] **F2-R1** (test) — Carreras del handler sin test: multi-moneda (`EnsureSingleCurrency`) y `DeliveryType` fuera del enum.
- [ ] **F2-R2** (test) — Persistencia nueva solo con Moq (integración real).
- [ ] **F2-R3** (test) — Grant de feature 123 por tienda sin test.
- [ ] **F2-R4** (test) — Tests estructurales por reflexión.
- [ ] **F2-R5** (defecto · migración) — Índice único `StoreCatalogSettings.StoreId` no parcial vs soft-delete.
- [ ] **F2-R6** (defecto · migración) — `Down()` del backfill borra toda fila `FeatureId=123`.

### F1 config (`pedidos-whatsapp-config.md`)
- [ ] **F1-R1..R9** (mix) — Ruta/permiso sin test; `PaletteId` vacío; `MaximumLength` vs `Trim`; `StoreId` no-Guid; coerción monetaria; reload tras guardar; error de carga inicial; `formatSyncedAt`; selectores por testid vs role/label.

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
