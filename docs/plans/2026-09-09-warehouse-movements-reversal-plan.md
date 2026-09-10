# Plan: Edición y eliminación de movimientos de almacén (reversa)

**Fecha**: 2026-09-09 (revisado mismo día: costo por lote FIFO exacto, D8-D12)
**Rama**: `qa`
**Alcance**: frontend (`frontend-react/`), feature completa y su suite de tests
**Estado**: PROPUESTA — requiere ratificación del usuario antes de implementar

## 1. Contexto — cómo funciona HOY (verificado en código)

Los movimientos de almacén son **100% frontend**: viven en localStorage cifrado
por tienda (`lizoft.store-warehouse-stock-movements-{storeId}`,
`entity-storage.ts` + `entity-crypto.ts`), sin tabla ni endpoint en el backend.
El backend solo conoce el módulo `Warehouses` (13) y sus features 36/37 como
catálogo de facturación — no hay API de movimientos.

**Invariante actual RATIFICADO**: *"Los movimientos no se editan ni se borran
(log de auditoría)"* — `packages/domain/src/models/warehouse.ts:13`,
`warehouse-offline-service.ts:67`, `docs/plans/2026-09-04-warehouses-plan.md:125`.
Este plan PROPONE revertirlo **con reversas**, no con mutación: la fila original
nunca se toca; se agrega un movimiento de reversa que la compensa.

**Estado materializado (no derivado)**: `WarehouseStockLevel.onHand` no es un
SUM sobre movimientos. `recordMovement` es la única puerta de mutación
(`warehouse-offline-service.ts:206-410`).

**Los 3 tipos del UI** (el modelo tiene 4; `transfer_in` solo nace por sync):

| Tipo | Label ES | Dirección | Efecto | Extra |
|---|---|---|---|---|
| `purchase_in` | Entrada (compra) | +1 `onHand`, promedio ponderado | agrega stock | `costPrice` requerido |
| `sale_out` | Salida a tienda | −1 `onHand` **+ crea `InventoryEntry`** de tienda al costo promedio del almacén | mueve almacén→tienda | — |
| `transfer_out` | Salida por transferencia | −1 origen **+1 destino** (una sola fila) | mueve entre almacenes | `toWarehouseId` |

**Consumidores del log** (todo lo que la reversa puede afectar):

| Consumidor | Archivo | Uso |
|---|---|---|
| Página Almacenes | `app/inventory/routes/warehouses.tsx` | paneles de stock, `recordMovement` |
| Historial de movimientos | `app/inventory/routes/warehouse-movements.tsx` | listado, acordeón por día |
| Guardia de desactivación | `warehouse-offline-service.ts:135-150` | bloquea si hay movimientos o stock |
| Export/Import sync | `data-serializer-service.ts` / `data-synchronizer-service.ts:779-815` | movimientos merge append-only por id; niveles last-writer-wins |
| Flujo de ventas (indirecto) | `order-offline-service.ts:440-525` | consume `InventoryEntry` FIFO → `OrderItem.productCosts` |
| Reporte de ganancias | `profit-calculator.ts` + `today-sales-profit.tsx` | ganancia = ingresos − Σ costos FIFO |
| Reportes del día | `today-quantities.tsx`, `today-report.tsx` | lecturas de InventoryOfflineService |

**Gap clave verificado**: la fila de movimiento NO guarda el costo de la
operación (un `purchase_in` no persiste su `costPrice` en la fila) ni el id de
la entrada de tienda que crea un `sale_out`, y el costo con que una Salida
llega a la tienda es el **promedio ponderado** del almacén — no el costo del
lote original. Este plan corrige las tres cosas (D8: costo exacto por lote;
D11: enlace 1:1) **y** agrega edición/eliminación vía reversa.

**Costo al llegar a la tienda — HOY vs PROPUESTA**: hoy `sale_out` crea UNA
entrada de tienda al promedio del almacén (`createInventoryEntry(productId,
quantity, level.costPrice)`, warehouse-offline-service.ts:293). Con D8, el
costo que llega es el **costo del lote consumido FIFO** — una salida que toca
dos lotes crea dos entradas (10@$5 y 5@$10), cada una con su costo exacto. Las
ventas de tienda ya consumen entradas multi-costo FIFO
(`getAvailableInventoryCosts`) — la tienda no cambia su mecanismo, solo recibe
costos exactos en lugar de promedios.

## 2. Decisiones de diseño ratificadas por el usuario (2026-09-09)

| # | Decisión | Elección |
|---|---|---|
| D1 | Semántica de edición/eliminación | **Movimiento de reversa** — la fila original nunca se muta; se agrega una fila compensatoria. El historial queda intacto como auditoría |
| D2 | Tipos cubiertos | **Los 3 del UI**: `purchase_in`, `sale_out`, `transfer_out` (`transfer_in` queda de solo lectura) |
| D3 | Salida ya consumida | **Bloquear** la reversa si la entrada de tienda ya fue consumida (parcial o total) por FIFO |
| D4 | Sync/import | **Dentro del alcance** — la reversa debe propagar entre dispositivos |
| D5 | Guardia desactivar almacén | **Se recalcula sola** — sin movimientos vivos y sin stock → desactivable |
| D6 | Permisos | **Solo OwnerAdmin** — StoreUser no ve acciones de reversa |
| D7a | Representación de la reversa | **Tipo `reversal` + enlace**: nuevo tipo único con `reversalOfMovementId`; la dirección se deduce del original |
| D8 | **Costo por lote FIFO** (ratificada 2026-09-09, supersede D7b) | **Cada movimiento lleva su costo exacto**: toda Entrada crea un lote con su `costPrice`; Salidas y Transferencias consumen lotes FIFO del más viejo al más nuevo y **se dividen en varias filas por lote** (15 sobre 10@$5 + 10@$10 = dos filas: 10@$5 y 5@$10). El costo que llega a la tienda es el costo del lote original — **nunca un promedio al llegar**. El costo visible en la página de Almacenes sigue siendo el **promedio ponderado de los lotes restantes** (mantiene los E2E existentes con los mismos números). Datos existentes: el stock actual de cada almacén se trata como **un lote sintético único** a su costo promedio actual (sin reconstrucción histórica — el log viejo no guardó costos). La reversa restaura el costo **exacto** del lote (la antigua D7b "mantener promedio" queda superseded por D8) |
| D9 | Reversa de compra con lote parcialmente consumido | **Revertir solo las restantes**: si del lote de 10 quedan 5 (5 salieron por Salida/Transferencia), la reversa devuelve solo las 5 restantes al lote exacto; si quedan 0 → `PurchaseLotConsumed` (bloqueo). Lo que ya salió no se puede "devolver" |
| D10 | Acción por fila, no agrupada | **Cada fila del historial es un movimiento/lote independiente**: Editar/Revertir la fila de 10@$5 toca solo ese lote. Nada de reagrupar filas del mismo producto — un flujo original multi-lote (p.ej. una transferencia de 15 que generó 2 filas) queda como 2 filas reversibles por separado |
| D11 | Enlace salida→entrada | **1:1 por fila**: cada fila de Salida guarda `inventoryEntryId` de la entrada de tienda que creó (una fila de salida = una entrada). Legacy sin enlace → huella (producto+cantidad+costo+día), bloqueo con 0 o >1 coincidencias |
| D12 | Conteo de la guardia de desactivación | **Contar solo no-revertidos**: un movimiento con reversa emparejada NO bloquea la desactivación del almacén (D5 se materializa así) |

## 3. Funcionalidades propuestas

### F1 — Movimiento con costo por lote + tipo `reversal` en el dominio

```ts
// packages/domain/src/models/warehouse.ts
export type WarehouseMovementType =
  | 'purchase_in' | 'sale_out' | 'transfer_in' | 'transfer_out'
  | 'reversal'; // NUEVO

export interface WarehouseStockMovement {
  // ... campos existentes ...
  /** Costo EXACTO del lote que esta fila movió (D8). NULO solo en filas legacy. */
  costPrice?: number;
  /** reversal → movimiento original que compensa. */
  reversalOfMovementId?: string;
  /** sale_out → entrada de tienda creada (D11, enlace 1:1 por fila). */
  inventoryEntryId?: string;
  /** reversal de sale_out → entrada de tienda restaurada/eliminada (D11). */
  reversalInventoryEntryId?: string;
}
```

**Regla de dirección**: la reversa aplica el delta INVERSO al original —
`reversal(purchase_in)` = −1 stock; `reversal(sale_out)` = +1 stock y restaura
la entrada; `reversal(transfer_out)` = +1 origen −1 destino.

**Regla de costo (D8 — exacto, no promedio)**: cada fila lleva el costo exacto
del lote que movió. Revertir una compra elimina las unidades restantes de ese
lote a ese costo; revertir una salida restaura la entrada de tienda al costo
exacto del lote; revertir una transferencia devuelve cada unidad al costo
exacto de su lote en el almacén de origen. **No hay distorsión de promedio** —
la antigua D7b queda superseded.

**Lotes FIFO por almacén-producto**: `recordMovement` cambia de "un nivel con
promedio" a **consumo FIFO de lotes** (el más viejo primero):

- `purchase_in qty @ cost` → crea UN lote (costo exacto) y UNA fila de movimiento.
- Salida/Transferencia de `qty` → consume lotes del más viejo al más nuevo; si
  cruza un borde de lote se generan **N filas de movimiento (una por lote
  tocado)**, cada una con su costo exacto (D8/D10). Ej.: stock 10@$5 + 10@$10,
  transferir 15 → dos filas: 10@$5 y 5@$10; el almacén origen queda con 5@$10.
- `sale_out` consume lotes igual y crea **una entrada de tienda POR LOTE
  tocado** (15 → entradas 10@$5 y 5@$10), cada fila de salida enlazada 1:1 a su
  entrada (`inventoryEntryId`, D11). El consumo FIFO de ventas ya soporta
  multi-entrada — la tienda no cambia.
- Transferencia: cada lote tocado se acredita en el destino **a su costo
  exacto** (el GAP-3 "mezcla ponderada" desaparece como mecanismo interno; el
  display ponderado de la página se mantiene, ver F1b).

**Lote sintético para datos existentes (D8)**: al primer arranque con el nuevo
modelo, el stock actual de cada (almacén, producto) se trata como **un único
lote sintético** a su costo promedio vigente — sin reconstrucción histórica
(imposible: el log viejo no guardó costos). Los movimientos legacy sin
`costPrice` muestran su costo como "—" (o el costo del nivel) y son reversibles
solo por huella (D11 legacy path).

**F1b — Display del costo en la página de Almacenes**: la celda
`warehouse-product-cost-{wid}-{pid}` sigue mostrando el **promedio ponderado de
los lotes restantes** (`Σ(qty×cost)/Σqty`, round2). Cálculo verificado contra
los 3 E2E existentes que pinean costos: compra única ($660 → $660), dos compras
($10+$30 → $20), GAP-3 (10@$6+5@$10 → $7.33) — **mismos números, mismos
tests**. El mecanismo interno cambia; lo visible, no.

### F2 — `reverseMovement(movementId)` en `WarehouseOfflineService`

Nueva puerta de mutación (hermana de `recordMovement`, misma escritura local):

```ts
reverseMovement(movementId: string, reason?: string): DataResult<WarehouseStockMovement>
```

Validaciones (en orden, la primera falla corta):

| # | Validación | Error nuevo (`WarehouseErrors`) |
|---|---|---|
| 0 | El movimiento existe | `MovementNotFound` |
| 1 | `type !== 'reversal'` (no reversa de reversa en v1) | `ReversalNotReversible` |
| 2 | No existe ya otra reversa con `reversalOfMovementId === movementId` | `ReversalAlreadyExists` |
| 3 | `type ∈ {purchase_in, sale_out, transfer_out}` (D2) | `TransferInNotReversible` |
| 4 | Stock suficiente: devolver unidades no deja `onHand < 0` en ningún almacén involucrado | `InsufficientStock` (existente) |
| 5 | D3/D11 — Salida consumida: entrada íntegra encontrada (`available === quantity`) | `SaleOutAlreadyConsumed` / `SaleOutEntryNotFound` / `SaleOutAmbiguousEntry` |
| 6 | Almacenes involucrados activos (origen y, en transfer, destino) | `WarehouseNotActive` (nuevo) |
| 7 | D9 — Compra con lote consumido: unidades restantes del lote (`onHand` de ese costo) ≥ unidades a revertir | `PurchaseLotConsumed` (nuevo) |
| 8 | `reason` opcional — texto libre (decisión #6 original) | — |

Localización de la entrada de tienda (validación 5, D11):

- Original **con** `inventoryEntryId` → entrada exacta (1:1 por fila).
- Original **legacy** sin enlace → huella: `productId + quantity + costPrice === entry.costPrice + mismo día local de createdDate`. 0 coincidencias → `SaleOutEntryNotFound`; >1 → `SaleOutAmbiguousEntry`; única pero `available < quantity` → `SaleOutAlreadyConsumed`.
- Entrada encontrada pero `isActive === false` → `SaleOutEntryNotFound`.

Efectos según el tipo (una sola escritura persistida) — **costo exacto del lote, no promedio (D8)**:

| Original | Efecto |
|---|---|
| `purchase_in` (D9) | Reduce el lote original: `onHand -= qty` **al costo exacto de la fila**. Si el lote fue parcialmente consumido, la reversa devuelve solo las unidades RESTANTES de ese lote (se ajusta `qty` de la reversa a las restantes); si restantes = 0 → `PurchaseLotConsumed`. El costo visible (promedio de lotes restantes) se recalcula naturalmente al desaparecer el lote |
| `sale_out` | `level.onHand += qty` **al costo exacto de la fila** (re-acredita el lote); la entrada de tienda enlazada se **elimina** (soft-delete `isActive=false`); la reversa guarda `reversalInventoryEntryId`; fila `reversal` |
| `transfer_out` | `origin.onHand += qty` y `target.onHand -= qty` **al costo exacto de la fila** (validación 4 en ambos); el destino pierde las unidades de ese lote; fila `reversal` |

**Detalle D9 — reversa de compra con lote parcial**: la reversa de una compra
de 10@$10 de la que salieron 5 (quedan 5) revierte solo las 5 restantes al
costo exacto $10. La fila `reversal` registra `quantity: 5` (las restantes), y
la fila original queda badge `Revertido` con la reversa parcial registrada.
Lo que ya salió no se puede "devolver" (para eso está revertir la salida/
transferencia que lo sacó).

**Compensación directa sobre lotes**: la reversa opera sobre los lotes
actuales del almacén (re-acredita o reduce el lote al costo de la fila
original). El display ponderado (F1b) se recalcula de los lotes restantes en
cada lectura — no se persisten promedios.

### F3 — Edición = reversa + recreación (composición, POR FILA — D10)

La "edición" NO muta la fila original y actúa sobre UNA fila/lote a la vez:

1. `reverseMovement(originalId, reason)` — compensa esa fila (al costo exacto de su lote).
2. `recordMovement(<valores corregidos>)` — crea el/los movimiento(s) nuevo(s).

Ambos pasos en el mismo handler de UI. Si el paso 2 falla (p.ej. stock
insuficiente para la nueva cantidad), el paso 1 YA está persistido: la UI
muestra el error y guía al usuario — **no hay rollback automático** en v1
(§7.2). Ventaja: cero superficie de validación nueva — la edición reutiliza
`recordMovement` intacto.

**Edición por tipo** (modal precargado):
- `purchase_in`: cantidad y costo (si el lote fue parcialmente consumido, el
  modal muestra las unidades restantes como tope editable — la reversa cubrirá
  solo las restantes, D9).
- `sale_out`: cantidad (bloqueada si su entrada está consumida — D3/D11).
- `transfer_out`: cantidad y destino (la nueva transferencia puede dividirse
  en varias filas por lote, D8).

**Sin agrupación (D10)**: un flujo original que generó N filas (p.ej. la
transferencia de 15 que dejó 10@$5 + 5@$10) se edita **fila por fila** — cada
edición toca un solo lote. El usuario edita la fila de 10, o la de 5, por
separado.

### F4 — UI: acciones en el historial (`warehouse-movements.tsx`)

Solo filas de los 3 tipos UI y **sin reversa emparejada** muestran el engranaje
(`Acciones de <movimiento>`, patrón `ActionMenu`) con:

- `Editar` → modal precargado (F3) → al guardar ejecuta reversa + recreación.
- `Revertir` → `confirmDialog()` (SweetAlert2 **Si/No**) con mensaje
  `WAREHOUSES.REVERSAL_CONFIRM_MESSAGE_A` + identificador del movimiento.

Filas `reversal` y `transfer_in`: **sin engranaje** (solo lectura).

Permisos: `isOwnerAdmin(user)` (patrón `entry-list`, `today-entries.tsx:28`;
D6). Testids nuevos (convención `mv-`):
`mv-actions-toggle-{id}`, `mv-edit-{id}`, `mv-revert-{id}`, `mv-edit-modal-{id}`,
`mv-edit-quantity-{id}`, `mv-edit-cost-{id}`, `mv-edit-target-{id}`,
`mv-reversal-badge-{originalId}`, `mv-reversal-icon-{id}`.

### F5 — Historial distingue reversas

- Fila `reversal`: icono violeta (`text-violet-600`) y label `WAREHOUSES.TYPE_REVERSAL`.
- Fila original revertida: badge `Revertido` (`mv-reversal-badge-{id}`) —
  derivado en runtime: existe reversa con `reversalOfMovementId === id` (sin
  migración; tras import en B el badge aparece solo).
- Acordeón por día intacto — la reversa cae en el día de su `createdDate`.

### F6 — Guardia de desactivación recuenta (D5/D12)

`deactivateWarehouse` pasa de `getMovements(id).length > 0` a:

```
movimientosVivos = getMovements(id).filter(m =>
  m.type !== 'reversal' && !isReversed(m.id))
```

Almacén desactivable ⇔ `movimientosVivos.length === 0 && Σ onHand === 0`.

### F7 — Sync/Import propaga reversas (D4)

1. **Movimientos** (merge append-only por id): sin cambio estructural — la
   reversa es una fila nueva y se propaga por id-presencia como cualquier
   movimiento.
2. **Niveles de stock**: el merge last-writer-wins por `(warehouseId, productId)`
   ya cubre la reversa (A revierte → nivel persistido → exporta → B lo adopta).
   Gap documentado (§7.4): si B registró otro movimiento entre la reversa de A
   y la importación, el nivel de B queda sobrescrito — consistencia eventual,
   igual que hoy.
3. **Reversa duplicada en B**: si B ya tiene reversa local del mismo original,
   la importación de la reversa de A debe **saltarse silenciosamente** (skip,
   mismo espíritu que el skip-por-id actual) — cambio requerido en
   `addImportedMovement` (hoy no valida esta condición).
4. **Tombstones**: no se introducen — no hay eliminación física; todo es append.

### F8 — i18n (`es.ts`)

Claves nuevas: `WAREHOUSES.TYPE_REVERSAL`,
`WAREHOUSES.REVERSAL_CONFIRM_MESSAGE_A`, `WAREHOUSES.REVERSAL_BADGE`,
`WAREHOUSES.REVERSAL_SUCCESS`, `WAREHOUSES.REVERSAL_BLOCKED_CONSUMED`,
`WAREHOUSES.REVERSAL_BLOCKED_STOCK`, `WAREHOUSES.REVERSAL_BLOCKED_TRANSFER_IN`,
`WAREHOUSES.REVERSAL_BLOCKED_DUPLICATE`, `WAREHOUSES.REVERSAL_BLOCKED_AMBIGUOUS`,
`WAREHOUSES.EDIT_TITLE`, `WAREHOUSES.MOVEMENT_NOT_FOUND`.

## 4. Matriz de tests objetivo

### 4.1 Unit — dominio y servicio (vitest, editables)

**Dominio** — `app/inventory/lib/__tests__/warehouse.test.ts` (extensión):

| ID | Test |
|---|---|
| U-D1 | `reversalDirection(originalType)` deduce el delta inverso por tipo |
| U-D2 | `applyReversal` calcula el delta por cada tipo original (compra→−, salida→+, transferencia→±) |
| U-D3 | Validator de reversa (cantidad > 0, round2, reason opcional) — paralelo al existente |
| U-D4 | `splitByFifoLots(stock, qty)` divide una cantidad sobre lotes ordenados del más viejo: 15 sobre 10@$5+10@$10 → [{10,$5},{5,$10}]; redondeo round2 en cada tramo |
| U-D5 | `displayCost(lots)` = promedio ponderado de los lotes restantes (10@$6+5@$10 → $7.33; lote único → su costo exacto) — el display F1b |
| U-D6 | Lote sintético legacy: nivel con promedio y sin lotes → se trata como un único lote a ese costo (D8 migración implícita) |
| U-D7 | `splitByFifoLots` con cantidad exacta al borde de lote → una sola porción (15 sobre 15@$5 → [{15,$5}]) |

**Servicio** — `app/inventory/lib/services/__tests__/warehouse-offline-service.test.ts` (extensión):

| ID | Test |
|---|---|
| U-S1 | Reversa de `purchase_in` reduce el lote al costo exacto de la fila; display ponderado recalcula (lote único: desaparece; multi-lote: queda el resto) |
| U-S1b | Reversa de `purchase_in` con lote parcialmente consumido (D9): devuelve SOLO las restantes (10@$10, salieron 5 → reversa de 5@$10) |
| U-S1c | Reversa de `purchase_in` con lote totalmente consumido (0 restantes) → `PurchaseLotConsumed` |
| U-S2 | Reversa de `purchase_in` cuando ya no queda stock del producto → `InsufficientStock` |
| U-S3 | Reversa de `sale_out` con enlace exacto (`inventoryEntryId`): entrada íntegra → se elimina (soft), `onHand` sube al costo exacto del lote |
| U-S4 | Reversa de `sale_out` legacy: huella única → ok; 0 coincidencias → `SaleOutEntryNotFound`; >1 → `SaleOutAmbiguousEntry` |
| U-S5 | Reversa de `sale_out` parcialmente consumida (`available < quantity`) → `SaleOutAlreadyConsumed` |
| U-S6 | Reversa de `sale_out` totalmente consumida (`available === 0`) → `SaleOutAlreadyConsumed` |
| U-S6b | Entrada encontrada pero `isActive === false` → `SaleOutEntryNotFound` |
| U-S7 | Reversa de `transfer_out`: origen +, destino −, ambos validados, cada uno al costo exacto de la fila |
| U-S8 | Reversa de `transfer_out` cuando el destino ya no tiene esas unidades → `InsufficientStock` |
| U-S9 | Segunda reversa del mismo original → `ReversalAlreadyExists` |
| U-S10 | Reversa de `transfer_in` → `TransferInNotReversible` |
| U-S11 | Reversa de una reversa → `ReversalNotReversible` |
| U-S12 | Movimiento inexistente → `MovementNotFound` |
| U-S12b | Almacén involucrado desactivado → `WarehouseNotActive` |
| U-S13 | `recordMovement('sale_out')` persiste `costPrice` y `inventoryEntryId` en CADA fila (D8/D11) |
| U-S13b | `recordMovement` de salida/transferencia multi-lote crea N filas (15 sobre 10@$5+10@$10 → 2 filas con su costo exacto y su enlace 1:1) |
| U-S13c | `recordMovement('purchase_in')` crea el lote con su costo exacto; NO recalcula promedios ajenos |
| U-S13d | Transferencia multi-lote acredita en el destino CADA lote a su costo exacto (10@$5 → destino lote $5; 5@$10 → lote $10) — sin mezcla ponderada |
| U-S14 | Persistencia: reversa + niveles/lotes re-persistidos, cifrado intacto |
| U-S15 | Helper `isReversed(id)` (badge F5 + guardia F6) |
| U-S16 | `deactivateWarehouse` con solo movimientos revertidos + stock 0 → desactiva (D5/D12) |
| U-S16b | `deactivateWarehouse` con stock > 0 aunque todo revertido → bloquea |
| U-S17 | `deactivateWarehouse` con movimiento vivo → bloquea (regresión del comportamiento actual) |
| U-S18 | Import: reversa duplicada (mismo `reversalOfMovementId` local) → skip silencioso (F7.3) |
| U-S19 | Aislamiento per-store: reversas de una tienda no aparecen en otra |
| U-S20 | Datos legacy: nivel con promedio y movimientos sin `costPrice` → lote sintético (U-D6) y reversas por huella funcionan |

### 4.2 Unit — UI (vitest)

**`app/inventory/routes/__tests__/warehouse-movements.test.tsx`** (extensión):

| ID | Test |
|---|---|
| U-M1 | OwnerAdmin: engranaje solo en filas UI sin reversa; NO en `reversal`/`transfer_in` |
| U-M2 | StoreUser: sin engranaje (D6) |
| U-M3 | `Editar` → modal precargado por tipo (cantidad/costo/destino) |
| U-M4 | `Revertir` → confirmDialog Si/No; No cancela; Si ejecuta y recarga |
| U-M5 | `reverseMovement` falla (p.ej. consumida) → Swal blocking error específico |
| U-M6 | Fila revertida con badge `Revertido`; fila `reversal` con icono/label propios |
| U-M7 | Editar `sale_out` a mayor cantidad con stock insuficiente → error del paso record, reversa ya persistida, mensaje guía (F3) |
| U-M7b | Editar `sale_out` íntegra a menor cantidad → ok: reversa + nueva salida |
| U-M8 | Acordeón por día intacto con reversas intercaladas (volumen) |
| U-M9 | `load()` refresca historial tras reversa/edición |

**`app/inventory/components/__tests__/warehouse-movement-modal.test.tsx`** (extensión, si el modal de edición reutiliza el existente):

| ID | Test |
|---|---|
| U-C1 | Modal de edición precarga valores del original por tipo |
| U-C2 | Validación por tipo reutiliza el validator existente |

### 4.3 Integration (vitest, flujos cruzados)

| ID | Test |
|---|---|
| I-1 | Venta tras `sale_out`+reversa: la entrada restaurada ya NO existe → `createOrder` no puede consumirla; la ganancia de la venta previa intacta (order.productCosts snapshot) |
| I-2 | FIFO tras reversa bloqueada (consumida parcial): la venta sigue consumiendo la entrada original normalmente |
| I-3 | **Costo exacto por lote (D8)**: compras 10@$5 + 10@$10 → sale_out 15 → la tienda recibe DOS entradas (10@$5 y 5@$10, en ese orden FIFO); ventas posteriores consumen primero la de $5 (getAvailableInventoryCosts multi-entrada) |
| I-3b | **Transferencia multi-lote (D8)**: compras 10@$5 + 10@$10 en A → transfer 15 A→B → dos filas de movimiento (10@$5, 5@$10); A queda con 5@$10; B acredita lotes 10@$5 y 5@$10 separados (sin mezcla ponderada); display de B = $6.67 ((10×5+5×10)/15) |
| I-3c | **FIFO de lotes en el origen**: compras 10@$5 + 10@$10 → transfer 12 → consume primero $5 (10@$5 + 2@$10, dos filas); quedan 8@$10 |
| I-3d | **Display ponderado de restantes (F1b)**: lotes 10@$6+5@$10 → display $7.33; lote único → costo exacto — replica los 3 números pineados por los E2E existentes (GAP-3 incluido) a nivel de servicio |
| I-3e | **Reversa de compra multi-lote (D9)**: compras 10@$5 + 10@$10, transfer 5 (consume del lote $5) → revertir la compra de 10@$5 → reversa devuelve solo las 5 restantes de ese lote (5@$5); el lote $10 no se toca; display recalcula |
| I-3f | **Ganancia multi-lote**: sale_out 15 (entradas 10@$5+5@$10) → venta de 12 → FIFO consume 10@$5 + 2@$10 → ganancia = Σ(venta − costo por tramo) — `productCosts` con DOS tramos |
| I-4 | Export→Import round-trip con reversa: B recibe la reversa por id-presencia + niveles por last-writer-wins |
| I-4b | B con reversa local del mismo original → import de la de A hace skip silencioso, sin error |
| I-4c | B registró un movimiento entre la reversa de A y la importación → nivel de B adopta el de A (consistencia eventual documentada) |
| I-4d | Import de backup legacy (sin campos nuevos, niveles con promedio) → lote sintético único, sin crash |
| I-4e | Import en tienda distinta → reversas no cruzan stores |
| I-5 | Reversa de `sale_out` cuya entrada fue editada por el CRUD (`updateInventoryEntry`) → la huella no matchea → `SaleOutEntryNotFound` |
| I-6 | `data-serializer` + `data-synchronizer` serializan `reversal`, `reversalOfMovementId`, `costPrice`, `inventoryEntryId`, `reversalInventoryEntryId` completos |

### 4.4 E2E (Playwright, spec NUEVA — las existentes son intocables)

**Nueva spec `e2e/movement-reversal.spec.ts`** (persona `owner-admin-with-products`,
serial, timeout 120s, backend real):

| ID | Escenario | Pin final |
|---|---|---|
| E-R1 | Reversa de Entrada desde el historial: crear almacén + purchase_in → engranaje → Revertir → Si | fila `reversal` visible + badge en original + stock −qty en el panel |
| E-R2 | Reversa de Movimiento (transfer_out): transfer A→B → Revertir → Si | stock A +qty, B −qty, fila + badge |
| E-R3 | Reversa de Salida íntegra: sale_out → Revertir → Si | stock alm. +qty; la entrada de tienda NO aparece en Entradas del día (soft-delete); fila + badge |
| E-R4 | Salida parcialmente consumida bloquea: sale_out → venta parcial → Revertir → Si → Swal error | mensaje de bloqueo + sin fila reversal |
| E-R5 | Edición de Entrada (F3): purchase_in 10 → editar a 15 | reversa + compra 15 en historial + stock neto correcto |
| E-R6 | Edición de Salida consumida bloquea: sale_out → vender 3 → editar a 8 | Swal error D3, sin cambios |
| E-R6b | Edición de Salida íntegra a menor cantidad: sale_out 10 íntegra → editar a 8 | stock neto 8; entrada nueva 8; original restaurado-eliminado |
| E-R7 | Transferencia editada a otro destino: transfer A→B 5 → editar a C | neto: A −5, B 0, C +5 (reversa devuelve a A y resta a B, nueva transfer A→C) |
| E-R7b | Transferencia editada cuando B ya no tiene stock (vendió/egresó) → reversa falla | Swal `InsufficientStock` (§7.6) |
| E-R8 | Guardia desactivar tras revertir todo | desactivación exitosa (D5/D12) |
| E-R9 | StoreUser con feature 37 → historial | sin engranajes (D6) |
| E-R10 | Historial muestra reversas con distinción visual | icono/label `reversal` + badge original |
| E-R11 | Sync round-trip con reversa: export → limpiar → import | reversa + stock presentes post-import |
| E-R12 | Confirmación cancelada: Revertir → No | sin cambios |
| E-R13 | Reversa duplicada por import: B ya revirtió el mismo original | skip silencioso, sin duplicado (F7.3) |
| E-R14 | Reversa de compra con lote parcial (D9): compra 10@$10 → transfer 5 → Revertir la compra | reversa de 5@$10 (solo restantes); lote $10 queda en 5; fila original con badge |
| E-R14b | Reversa de compra con lote totalmente consumido: compra 10@$5 → transfer 10 → Revertir la compra | Swal `PurchaseLotConsumed`, sin reversa |
| E-R15 | Reversa con almacén desactivado involucrado | Swal `WarehouseNotActive` |
| E-R16 | i18n completo: mensajes/badges/labels en español neutro | sin claves crudas en UI |
| E-R17 | **Salida multi-lote (D8)**: compras 10@$5 + 10@$10 → Salida 15 | historial: DOS filas de salida (10@$5 y 5@$10); Entradas del día: DOS entradas con sus costos exactos; almacén queda con 5@$10 |
| E-R17b | **Transferencia multi-lote (D8)**: compras 10@$5 + 10@$10 en A → Movimiento 15 a B | DOS filas de transferencia (10@$5, 5@$10); A queda con 5@$10; B display $6.67 |
| E-R17c | **Costo exacto a la tienda (D8)**: compra 10@$5 + 10@$10 → Salida 15 → vender 12 | ganancia usa FIFO multi-lote: 10@$5 + 2@$10 en productCosts (ganancia = Σ tramos); Entradas del día muestra las 2 entradas |
| E-R17d | **Reversa de una fila multi-lote (D10)**: Salida 15 (dos filas 10@$5+5@$10) → Revertir SOLO la fila de 10@$5 | solo esa entrada de tienda se elimina; la de 5@$10 queda; almacén re-acredita 10@$5 |
| E-R17e | **Edición de una fila multi-lote (D10)**: Salida 15 → editar la fila de 5@$10 a 3 | esa entrada pasa a 3@$10; la fila de 10@$5 intacta |

Un solo archivo serial (convención de las suites grandes: `warehouses.spec.ts`
702 líneas) — facilita el reuso de semillas append-only entre tests.

### 4.5 Backend E2E — NO APLICA

No hay endpoints de movimientos: el backend no conoce esta feature. Las suites
backend existentes (`WarehousesBillingTests` etc.) no se tocan. **Cero tests
backend nuevos.**

### 4.6 Reportes y FIFO — aclaración de impactos

- La reversa de una Salida **elimina** la entrada de tienda (soft-delete); NO
  vuelve al ciclo FIFO. Ventas futuras no pueden consumirla.
- La reversa no reordena el FIFO de las demás entradas.
- Los reportes históricos derivan de `order.productCosts` (snapshot en la
  venta) — la reversa NO reescribe historia de ganancias.
- "Disponible" filtra `isActive=false` → la entrada restaurada desaparece de
  los listados activos.
- Con lotes exactos (D8), una Salida multi-lote crea varias entradas — la venta
  consume esas entradas FIFO por costo exacto (I-3f/E-R17c), igual que hoy
  consume entradas manuales de distinto costo.

### 4.7 Matriz resumida

| Área | Unit | Integration | E2E |
|---|---|---|---|
| Dominio (reversal, splitByFifoLots, displayCost) | U-D1..U-D7 | — | — |
| Servicio (reverseMovement, lotes, guardias) | U-S1..U-S20 | I-1..I-6 | E-R1..E-R4, E-R7b, E-R8, E-R12, E-R15 |
| UI historial (engranaje, modal, badge) | U-M1..U-M9, U-C1..U-C2 | — | E-R1..E-R3, E-R9, E-R10, E-R16 |
| Edición (composición F3, por fila) | U-M7, U-M7b | I-3, I-3e | E-R5..E-R7, E-R14, E-R17e |
| Lotes FIFO exactos (D8) | U-D4..U-D7, U-S13b..S13d | I-3..I-3f | E-R17..E-R17e |
| Sync/Import | U-S18 | I-4..I-4e, I-6 | E-R11, E-R13 |
| Guardia desactivación | U-S16..U-S17 | — | E-R8 |
| Permisos | U-M2 | — | E-R9 |
| Reportes inmutables | — | I-1, I-2, I-3f | E-R3, E-R17c |
| Multi-store | U-S19 | I-4e | — |

## 5. Pasos de implementación (orden sugerido)

| Paso | Cambio | Tests | Verificación |
|---|---|---|---|
| 1 | Dominio: tipo `reversal` + campos nuevos (`costPrice`, `reversalOfMovementId`, `inventoryEntryId`, `reversalInventoryEntryId`) + `splitByFifoLots`/`displayCost` | U-D1..U-D7 | `cd apps/web-store-pos && pnpm vitest run app/inventory/lib/__tests__/warehouse.test.ts` |
| 2 | Servicio: `recordMovement` refactorizado a lotes FIFO exactos (divide filas por lote, enlaces 1:1, lote sintético legacy) | U-S13..U-S13d, U-S20 | `pnpm vitest run app/inventory/lib/services/__tests__/warehouse-offline-service.test.ts` |
| 3 | Servicio: errores nuevos + `reverseMovement` + `isReversed` (lotes exactos, D9) | U-S1..U-S12b | idem paso 2 |
| 4 | Guardia F6: `deactivateWarehouse` recuenta vivos | U-S16..U-S17 | idem paso 2 |
| 5 | Sync F7: serialización completa (incl. `costPrice`) + skip de reversa duplicada | U-S18, U-S19, I-4..I-4e, I-6 | `pnpm vitest run app/sync/lib/services/__tests__/data-synchronizer-warehouses.test.ts` |
| 6 | i18n F8: claves nuevas en `es.ts` | — | `pnpm lint && pnpm typecheck` |
| 7 | UI F4/F5: engranaje, modal edición, badge, Swals | U-M1..U-M9, U-C1..U-C2 | `pnpm vitest run app/inventory/routes/__tests__/warehouse-movements.test.tsx` |
| 8 | E2E: spec nueva `movement-reversal.spec.ts` | E-R1..E-R17e | `pnpm test:e2e movement-reversal.spec.ts` (desde `frontend-react/`) |
| 9 | Verificación final completa (§6) + regresión de suites existentes | — | §6 |

## 6. Verificación final

```bash
# Unit + integration (vitest, editables)
cd frontend-react/apps/web-store-pos
pnpm vitest run app/inventory/lib/__tests__/warehouse.test.ts
pnpm vitest run app/inventory/lib/services/__tests__/warehouse-offline-service.test.ts
pnpm vitest run app/inventory/lib/services/__tests__/inventory-offline-service.test.ts   # regresión
pnpm vitest run app/inventory/routes/__tests__/warehouse-movements.test.tsx
pnpm vitest run app/inventory/components/__tests__/warehouse-movement-modal.test.tsx
pnpm vitest run app/sync/lib/services/__tests__/data-synchronizer-warehouses.test.ts

# E2E (backend real; specs NUEVAS — las existentes NO se tocan)
cd frontend-react
pnpm test:e2e movement-reversal.spec.ts
pnpm test:e2e warehouses.spec.ts                       # regresión, intocable pero debe seguir verde
pnpm test:e2e warehouse-movements-extended.spec.ts     # regresión, idem

# Lint + typecheck
pnpm lint
pnpm typecheck
```

## 7. Riesgos y limitaciones documentadas

1. **Cambio de modelo interno de costos (D8)**: `recordMovement` pasa de
   promedio ponderado a lotes FIFO exactos. La página de Almacenes mantiene el
   display ponderado de lotes restantes (F1b) — verificado contra los 3 E2E
   existentes que pinean costos ($660, $20, $7.33: mismos números). Aun así,
   **es la parte más delicada del plan**: cualquier desvío rompe
   `warehouse-movements-extended.spec.ts` (intocable). Los pasos 1-2 de §5
   aislan el riesgo con la suite de servicio en verde antes de tocar UI.
2. **Datos legacy = lote sintético único (D8)**: el stock existente se trata
   como un lote al costo promedio vigente. Las próximas compras crean lotes
   exactos; los movimientos viejos sin `costPrice` son reversibles solo por
   huella (D11 legacy). No hay reconstrucción histórica (imposible — el log no
   guardó costos).
3. **Edición no-atómica (F3)**: si el paso record falla tras la reversa
   persistida, queda una reversa "huérfana" que el usuario compensa manualmente.
   Alternativa (rollback del paso 1) descartada por complejidad y riesgo de
   perder auditoría. La UI muestra error + guía.
4. **Huella legacy ambigua (D11)**: salidas antiguas sin enlace pueden volverse
   no-revertibles (0 o >1 coincidencias, o entrada editada/costo divergente).
   El bloqueo es el comportamiento seguro.
5. **Sync last-writer-wins**: dos dispositivos activos pueden perder la
   reversa/stock del otro tras importar — consistencia eventual, igual que hoy.
6. **Reversa de reversa y reversa de `transfer_in`**: fuera de alcance v1 —
   bloqueadas con error específico.
7. **Transferencia editada a otro destino**: exige stock en el destino original
   para devolver — si ya lo consumió, falla con `InsufficientStock` (E-R7b).
8. **Lote parcialmente consumido (D9)**: revertir una compra devuelve solo las
   restantes — la fila original queda "parcialmente revertida" (badge + reversa
   con cantidad menor). El usuario debe entender que lo que ya salió no vuelve
   por esa vía (mensaje claro en el Swal de confirmación).
9. **Regla E2E intocable**: `warehouses.spec.ts`, `warehouse-movements-extended.spec.ts`,
   `inventory-entry.spec.ts` y TODO `e2e/support/*` no se tocan; nueva cobertura
   en specs nuevas.
10. **Regla de producción**: este plan toca código de producción frontend
    (dominio, servicio, sync, UI). Según CLAUDE.md requiere notificación +
    aprobación explícita — este documento ES la notificación; implementar solo
    tras ratificar.
11. **PWA/offline**: las claves de movimientos están en `BUSINESS_ENTITY_NAMES`
    (wipes/migraciones las alcanzan) — la reversa no cambia ese contrato.
12. **Menú**: la feature no agrega ítems de menú (regla AGENTS.md: sin iconos).
13. **Concurrencia multi-ventana**: dos pestañas de la misma tienda escriben
    localStorage independiente — mismo riesgo que hoy con `recordMovement`; sin
    mitigación nueva en v1.

## 8. Próximos pasos

1. **Ratificar este plan** (usuario) — en particular F2 (validaciones/efectos),
   F3 (edición no-atómica), F6 (guardia) y F7 (sync).
2. Implementar pasos 1-8 de §5 (secuencial, cada paso con su suite en verde).
3. Verificación final §6 completa.
4. Commits por unidad de trabajo (skill `work-unit-commits`).
5. Push a `qa` cuando el usuario lo indique.

## 9. Reglas del repo vigentes (recordatorio)

- **E2E intocable**: nunca modificar/borrar/saltear/debilitar tests E2E
  existentes (frontend o backend) sin autorización explícita. Nueva cobertura va
  en specs nuevas.
- **Backend producción intocable**: este plan NO toca backend (no hay endpoints
  de movimientos).
- **AGENTS.md frontend**: sin iconos en menú, imports `~/`, interfaces sobre
  types, YAGNI, sin duplicación app/packages.
- **Convención de docs**: `docs/plans/YYYY-MM-DD-<nombre>-plan.md`, español,
  esta estructura.
