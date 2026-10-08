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
- [ ] **M-R3-001** (defecto) — La query de verificación #4 del **script 31** tiene `JOIN "Feature" ON TRUE` (cartesiano): no puede devolver el "3" que documenta. Corregir la query.
- [ ] **M-R3-002** (test) — La topología (módulos 19/20, feature 124/123→20, `StorePlanModule` 3/4, backfill) no tiene test automatizado (solo SELECTs manuales). Añadir test contra `HasData`/modelo.
- [ ] **M-R3-003** (defecto) — El `Down` borra **todas** las filas `StoreModule` de 19/20, no solo las creadas por la migración. Acotar el `Down`.

### Showcase (`catalogo-publico-carrusel-dia.md`)
- [ ] **SC-R1** (defecto) — Archivo huérfano si falla `SaveChanges` tras subir; borrado no idempotente (fila antes que archivo).
- [ ] **SC-R2** (defecto) — La regla `Content NotNull` del validador es inalcanzable (el controller coacciona a `Stream.Null`).
- [ ] **SC-R3** (defecto) — El config público no filtra por `IsActive`.
- [ ] **SC-R4** (test+defecto) — UI: el input file no se resetea (re-seleccionar el mismo archivo no dispara cambio); ramas de fallo parcial/red sin test; el test del halo comprueba clases CSS, no comportamiento.
- [ ] **SC-R5** (test) — Carrusel: pausa por hover/focus y caso de **una sola imagen** sin cubrir.

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
