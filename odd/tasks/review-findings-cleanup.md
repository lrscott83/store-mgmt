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
- [ ] **F8-R1** (defecto) — Logo válido + banner inválido deja archivo huérfano.
- [ ] **F8-R2** (defecto) — Se borra el archivo anterior antes de persistir; si `SaveChanges` falla, la BD apunta a un archivo borrado (404).
- [ ] **F8-R3** (test) — El mapeo `CatalogBrandingUpdate → FormData` de `updateBranding` no se ejecuta en ningún test.
- [ ] **F8-R4** (test) — Falta el caso de archivo demasiado grande.
- [ ] **F8-R5** (defecto) — `MediaUrl` con slug null/blank.
- [ ] **F8-R6** (test) — Alt de imágenes solo por testid.

### F4 envío (`pedidos-whatsapp-envio.md`)
- [ ] **F4-R1** (test) — El reset del aviso al reabrir el checkout no tiene test.
- [ ] **F4-R2** (defecto) — `buildWhatsAppOrderLink`/`window.open` dentro del `try/catch` del POST: si lanzan, el pedido ya guardado se reporta como fallo (reintento → duplicado).
- [ ] **F4-R3** (defecto) — El resumen imprime el total del servidor junto a líneas/subtotal del cliente; si difieren, no cuadra.
- [ ] **F4-R4** (test) — Test estructural por reflexión (`WhatsappNumber`).
- [ ] **F4-R5** (test) — Test que no modela el cierre del checkout.
- [ ] **F4-R6** (test) — Aserciones atadas al formato de `Intl`.

### F3 carrito (`pedidos-whatsapp-carrito-cliente.md`)
- [ ] **F3-R1** (test · requiere E2E nuevo) — El bypass de filtro de tenant en `Order` solo con InMemory.
- [ ] **F3-R2** (test) — La partición del rate limit desde `RouteValues` no se prueba end-to-end.
- [ ] **F3-R3** (defecto) — El estado muestra "no encontrado" para **cualquier** error (red/5xx), no solo 404.
- [ ] **F3-R4** (defecto) — Vaciar el input de cantidad **borra la línea**.
- [ ] **F3-R5** (test) — Doble-submit del checkout sin test.
- [ ] **F3-R6** (test) — Auto-dismiss del aviso "añadido" sin test.

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
