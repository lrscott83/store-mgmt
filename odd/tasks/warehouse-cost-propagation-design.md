# Mini-diseño: propagación del costo al editar una compra

**Feature**: warehouse-movements-fases-3-5 — tarea **F3.1** (plan §2.3 + §3 Fase 3).
**Plan fuente**: `docs/plans/2026-09-16-warehouse-movements-plan.md`.
**Alcance**: frontend (`frontend-react/apps/web-store-pos`). Backend `backend/**` intocable.
**Estado**: **IMPLEMENTADO** (F3.1 diseño + F3.2 propagación + F3.3 pruebas). Las 4 decisiones
de producto pendientes quedaron ratificadas por el usuario el **2026-09-20** (ver §6).

Idioma: prosa en español; identificadores, campos y comentarios en inglés (regla §0.5).

---

## 0. Resumen ejecutivo

Al editar el costo de una **compra** (`purchase_in`) ya usada, hay que propagar el costo nuevo a
(a) las ventas ya hechas que consumieron esas unidades y (b) el stock que sigue en tienda proveniente
de esa compra.

Hallazgo central: **hoy el vínculo `compra → salida a tienda` NO está persistido.** Solo se guarda
el `costPrice` de la fila `sale_out`; el campo `lotOriginMovementId` que sí se escribe en los lotes
del almacén (A4) **se pierde al cruzar la frontera almacén→tienda** (no se propaga a la fila de salida
ni a la `InventoryEntry` espejo). En cambio, sí existen enlaces exactos `venta ↔ entrada de tienda` y
`entrada de tienda ↔ salida`, lo que permite todo el recorrido salvo el primer tramo.

Consecuencia de diseño: la Fase 3 debe **añadir un campo opcional** que preserve la referencia de
origen en la salida (frontend-only, aditivo, compatible con datos viejos) y usar un **fallback por
costo** solo para datos históricos, que debe **bloquear ante ambigüedad** en vez de adivinar.

---

## 1. Modelo del vínculo (con evidencia file:line)

### 1.1 Cadena completa

```
purchase_in (P)
   └─ lote del almacén { costPrice, quantity, lotOriginMovementId: P.id }
        │
        │  (sale_out consume FIFO; splitByFifoLots copia lotOriginMovementId a cada slice)
        ▼
   fila sale_out (M)   costPrice = costPrice del slice; inventoryEntryId = entryId
        │                                  ▲
        │                                  └── M ← entry.warehouseSaleOutMovementId   (5)
        ▼
   InventoryEntry espejo (E)  { quantity, available, costPrice, warehouseSaleOutMovementId: M.id }
        │
        │  (venta: getAvailableInventoryCosts consume E y snapshotea su costo)
        ▼
   Order.orderItems[i].productCosts[k] = { inventoryId: E.id, quantity, costPrice }   (3)(4)
        │
        ▼
   calculateOrderProfit(item) → ganancia = precio·qty − Σ(productCost.costPrice·quantity)   (6)
```

### 1.2 Evidencia concreta por salto

**(0) La compra crea un lote referenciado a su propio movimiento.**
`warehouse-offline-service.ts:280-309` — en `purchase_in` se genera `purchaseMovementId` (`:286`),
se hace `push` del lote con `lotOriginMovementId: purchaseMovementId` (`:287-292`) y se persiste la
fila de movimiento con `id: purchaseMovementId` (`:297-305`). Modelo del lote:
`packages/domain/src/models/warehouse.ts:35-46` (`lotOriginMovementId?`, `:45`).

**(1) La salida divide por lote FIFO y copia la referencia al *slice*.**
`sale_out` → `splitByFifoLots` (`warehouse-offline-service.ts:320`); el helper copia
`lotOriginMovementId` a cada tramo: `inventory/lib/warehouse.ts:86-98` (especialmente `:93-95`).

**(2) La salida crea una entrada espejo por tramo y la sella.**
`warehouse-offline-service.ts:333-365`: por cada slice llama
`inventoryService.createInventoryEntry(productId, slice.quantity, slice.costPrice)` (`:334-338`) y
luego `markEntryWarehouseOrigin(productId, entry.id, movementId)` (`:343-347`). El sello:
`inventory-offline-service.ts:860-875` (`warehouseSaleOutMovementId = movementId`, `:870`);
modelo `inventory.ts:23-28` (`warehouseSaleOutMovementId?`, `:28`).

**(3) La fila de salida enlaza 1:1 su entrada.**
`warehouse-offline-service.ts:371-383` persiste una fila por slice con `costPrice: slice.costPrice` e
`inventoryEntryId: entryId` (`:379-380`). Modelo: `warehouse.ts:107-111`. Test que lo pinea:
`warehouse-offline-service.test.ts:642-668` (U-S13) y `:670-713` (U-S13b, multi-lote con costo exacto
y enlace 1:1 por fila). Ver también `warehouse-offline-service-fase1.test.ts:352-392`.

**(4) La venta snapshotea el costo por entrada consumida.**
`order-offline-service.ts:470-505`: `productCosts = inventoryService.getAvailableInventoryCosts(...)`
(`:481`) cuando `product.discountFromInvantory && hasInventoryModule` (`:480`). El consumo FIFO y el
snapshot ocurren en `inventory-offline-service.ts:406-450`, que emite
`{ inventoryId: entry.id, costPrice: entry.costPrice, quantity: taken }` (`:437-443`). Modelos:
`order.ts:6-20` (`productCosts`, `:16`) e `inventory.ts:4-10` (`InventoryEntryCost.inventoryId`).

**(5) La ganancia se deriva del snapshot.**
`inventory/lib/profit-calculator.ts:19-27` (`calculateOrderProfit`: `cost = Σ(costPrice·quantity)`).
Consumo en reportes: `order-offline-service.ts:180-188` (`getActiveOrdersProfitBetweenDates`) y
`:264-281` (`getTopProductsInLastMonth`). **Actualizar `productCosts` basta: reportes y "Cuadre" se
recalculan solos, sin cambios.**

**(6) Unidades aún en almacén (incluidas transferencias).**
El lote sigue con `lotOriginMovementId`; la reversa lo localiza con
`remainingPurchaseUnits` (`warehouse.ts:139-154`) y `removeLotUnitsByOrigin`
(`warehouse-offline-service.ts:1029-1050`). Las transferencias **sí** conservan la referencia en el
destino al hacer spread del slice (`warehouse-offline-service.ts:402-403` y `:435-436`), así que
almacén→almacén no rompe el vínculo.

### 1.3 El eslabón que FALTA (crítico)

Las filas `sale_out` **no** reciben `lotOriginMovementId`. La construcción de la fila
(`warehouse-offline-service.ts:371-383`) solo pasa `costPrice` e `inventoryEntryId` a
`appendMovement`; el parámetro `appendMovement` (`:1052-1094`) no tiene campo de origen, y el modelo
`WarehouseStockMovement` tampoco (`warehouse.ts:76-114`). Verificado con búsqueda global:
`lotOriginMovementId` aparece **únicamente** en `WarehouseStockLot` y en los lotes del almacén
(`warehouse.ts:45`, `warehouse-offline-service.ts:291,654,1038`, `warehouse.ts:93-95`); **nunca** en
filas de salida ni en `InventoryEntry`.

Por tanto, con los datos actuales, `compra P → fila sale_out M` es reconstruible **solo por igualdad
de costo** (`round2(M.costPrice) === round2(P.costPrice)`), que es justo la fragilidad que A4 quiso
eliminar para los lotes del almacén.

---

## 2. Qué es identificable y qué NO

### 2.1 Identificable de forma determinista

| Objeto | Clave de enlace | Evidencia |
|---|---|---|
| Unidades de P aún en **almacén** (origen o destino de transferencia) | `lot.lotOriginMovementId === P.id` | `warehouse.ts:45,139-154` |
| **Entrada de tienda E** creada por una salida | `E.warehouseSaleOutMovementId` ↔ `M.id` | `warehouse-offline-service.ts:343-347`; `inventory-offline-service.ts:860-875` |
| Fila **sale_out M** ↔ su **entrada E** | `M.inventoryEntryId` | `warehouse-offline-service.ts:371-383`; `warehouse.ts:111` |
| **Venta** ↔ entradas consumidas | `orderItem.productCosts[k].inventoryId` | `inventory-offline-service.ts:437-443`; `order.ts:16` |
| Reversa de una salida ↔ entrada restaurada | `reversalInventoryEntryId` | `warehouse-offline-service.ts:775`; `warehouse.ts:113` |

### 2.2 NO identificable (hoy)

1. **`compra → fila sale_out`** cuando hay más de una compra del mismo producto con el **mismo costo**
   (o datos sin `lotOriginMovementId`): solo queda el `costPrice`. Es la ambigüedad central.
2. **Entradas de tienda nacidas por CRUD manual** (sin `warehouseSaleOutMovementId`): no pertenecen a
   ninguna compra. La reversa las maneja con "huella legacy" (producto + cantidad + costo + mismo día)
   y bloquea si hay 0 o >1 candidatas: `warehouse-offline-service.ts:693-731`.
3. **Lotes legacy sin `lotOriginMovementId`** (datos previos a Fase 1): fallback por costo
   (`warehouse.ts:147-152`).
4. **Entradas espejo editadas antes de A8**: `update()` hoy las bloquea (`inventory-offline-service.ts:632-638`,
   `:805-810`), pero datos históricos editados quedan inconsistentes (cantidad/costo ya no coinciden).
5. **Ventas sin `productCosts`**: si el producto no descuenta de inventario o el módulo está apagado,
   `productCosts` queda `[]` (`order-offline-service.ts:480-485`). Esas ventas **no** consumieron
   entradas de tienda y no hay nada que propagar.
6. **Unidades de P consumidas por `consumption_out` (elaboración)**: no generan entrada de tienda
   (`warehouse-offline-service.ts:465-492`), por lo que no hay venta enlazada. Fuera de alcance (§2.2
   del plan ya excluye devoluciones/elaboración de ventas).

---

## 3. Algoritmo de propagación

### 3.0 Campo nuevo recomendado (Fase 3, aditivo)

Añadir **`lotOriginMovementId?: string`** a `WarehouseStockMovement` (opcional, retrocompatible) y
propagarlo en `sale_out` desde `slice.lotOriginMovementId` en `appendMovement`
(`warehouse-offline-service.ts:371-383` y `:1052-1094`). Así `compra → sale_out` queda determinista,
igual que ya lo es para los lotes.

- Alternativa (no excluyente): sellar también `InventoryEntry` con el id de la compra al crearla, para
  un join O(1) `compra → entrada`. **Recomendación**: empezar por la fila de movimiento (mínimo cambio
  y simétrico con A4); el campo de la entrada se evalúa solo si se necesita rendimiento.
- Datos viejos: sin el campo → fallback por costo (3.2).

### 3.1 Paso 0 — Resolver el conjunto afectado (lectura, sin mutar)

Dada la compra `P` (producto, almacén, `costPrice = C_old`) y el costo nuevo `C_new`:

1. **A = filas `sale_out` vivas atribuibles a P**
   - Determinista: `m.type === 'sale_out' && m.lotOriginMovementId === P.id`.
   - Fallback legacy (sin campo): `m.type === 'sale_out' && round2(m.costPrice) === round2(C_old)`.
     Si en el mismo producto existe **más de una compra viva** con `C_old` y ninguna referencia de
     origen → **ambigüedad** (ver §4.1).
2. **B = entradas espejo**: para cada `m ∈ A`, `E = inventoryEntryId`; si falta, huella legacy idéntica
   a `reverseSaleOut` (`warehouse-offline-service.ts:693-731`).
3. **C = ventas afectadas**: recorrer órdenes (`getStorageOrders`), y para cada `orderItem` cada
   `productCosts[k]` con `inventoryId ∈ B`, registrar `(orderId, itemIndex, costIndex, quantity)`.

### 3.2 Paso 1 — Validación (antes de toda mutación; la primera falla corta)

- Compra no revertida (`isReversed`, `warehouse-offline-service.ts:538-542`) y almacén activo.
- Cada `E ∈ B`: existe, `isActive`, e íntegra (misma `quantity` que la fila de salida). Reutilizar los
  guards de `reverseSaleOut` (`:734-752`): `SaleOutEntryNotFound` / `SaleOutEntryModified`.
- Atribución determinista o no ambigua. Si no → §4.1.
- Consistencia de moneda (`C_old`/lotes/entradas con la misma `currency`).
- Si `A = B = C = ∅` → **no hay nada que propagar**: se mantiene el flujo de edición actual sin
  confirmación (clave para no romper los E2E existentes, §5).

### 3.3 Paso 2 — Aviso/confirmación con detalle (solo si hay afectados)

Nuevo servicio de lectura `getPurchasePropagationPreview(P.id, C_new)` que devuelve los conteos:
`{ sales: nº de ventas distintas, soldUnits, storeUnits, from, to }`.

UI: diálogo de confirmación (patrón `confirmDialog` con `Si`/`No`, como la reversa) con detalle, p. ej.:
> "Esta compra tiene N unidades fuera del almacén: X en tienda sin vender y Y ya vendidas en K ventas.
> Se actualizará su costo de $C_old a $C_new. ¿Continuar?"

**Solo aparece cuando `A/B/C` no está vacío.** Cuando la compra no salió del almacén, la edición sigue
guardando directo (preserva E-UI-3 y E-R5, §5).

### 3.4 Paso 3 — Aplicación atómica ("todo o nada", espíritu A2)

Snapshot **en memoria** de: niveles de almacén involucrados, el mapa completo de `inventory-entries`
de los productos afectados, y el arreglo de `orders`. Luego:

- **(a) Ventas pasadas**: por cada `productCosts[k]` en C, fijar `costPrice = C_new` (nuevo seam
  `OrderOfflineService.updateProductCostsByInventoryIds(...)`). No tocar `quantity` ni líneas ajenas.
- **(b) Stock en tienda**: por cada `E ∈ B`, fijar `costPrice = C_new` (nuevo seam
  `InventoryOfflineService.updateWarehouseOriginEntryCost(...)` que **omite a propósito** el bloqueo
  A8 para correcciones dirigidas desde el almacén; el `update()` del CRUD sigue bloqueando).
- **(c) Almacén**: mantener la edición existente = `reverseMovement(P)` + `recordMovement(purchase_in,
  remainingQty, C_new)`. El remanente del almacén queda valorado a `C_new`; las unidades ya fuera se
  corrigen por (a)/(b).
- Persistir cada store **una sola vez** al final; si un paso devuelve fallo o lanza, **restaurar los
  snapshots y no persistir nada** (devolver `DataResult` con error). Los pasos de escritura no mutan
  estado global hasta el flush final.

**Refactor recomendado**: sacar la orquestación del route a un método
`WarehouseOfflineService.applyPurchaseCostEdit(purchaseId, quantity, newCost)` (o un coordinador
pequeño) que posea snapshot/rollback y colabore con los tres servicios. Hoy el route hace reversa +
recreación **no atómico** (`warehouse-movements.tsx:239-278`); Fase 3 debe unificar todo bajo una sola
operación atómica.

### 3.5 Nota de alcance del "todo o nada"

El snapshot/rollback es en memoria (mismo enfoque que A2, `warehouse-offline-service.ts:797-841`). Un
fallo de `localStorage.setItem` a mitad del flush final (p. ej. cuota) es el único punto no reversible
del todo; el diseño mitiga calculando **todo** antes de escribir y documentando ese riesgo residual.

---

## 4. Casos borde y bloqueos

### 4.1 Bloquear en vez de adivinar

| # | Situación | Resultado |
|---|---|---|
| B1 | >1 compra viva del mismo producto con `C_old` y sin `lotOriginMovementId` | **Bloquear** con error nuevo `Warehouse.PurchasePropagationAmbiguous` (no hay forma de saber qué salidas son de P). |
| B2 | Fila `sale_out` atribuible a P sin entrada espejo localizable | **Bloquear**: `SaleOutEntryNotFound` (`warehouse-errors.ts:67-70`). |
| B3 | Entrada espejo editada (legacy) → cantidad no coincide con la fila | **Bloquear**: `SaleOutEntryModified` (`warehouse-errors.ts:81-85`). |
| B4 | Entrada de tienda ya revertida (soft-deleted) con `reversalInventoryEntryId` | Excluir del conjunto vivo (ya reconciliada). Si aparece en A viva → **bloquear** (estado inconsistente). |
| B5 | Moneda de `C_old`/lote/entrada distinta de `C_new` | **Bloquear** (evitar corromper la valoración). |
| B6 | Compra sin remanente en almacén (`remainingPurchaseUnits === 0`) | Hoy `reversePurchase` ya bloquea con `PurchaseLotConsumed` (`warehouse-offline-service.ts:656-660`). **Decisión abierta** §6.1. |
| B7 | Orden con `isActive === false` | Los `productCosts` ya se restauraron en `deactivateOrder` (`order-offline-service.ts:626-635`). **Decisión abierta** §6.2 (recomendado: excluir + avisar en el detalle). |
| B8 | Sync entre dispositivos | `updateImportedOrder` mergea **solo** `date/isActive/updatedDate/updatedByName` (`order-offline-service.ts:656-666`) y `updateImportedEntries` **solo** `available/isActive/updatedDate/updatedByName` (`inventory-offline-service.ts:914-934`): la corrección de costo **NO viaja** por sync/import. **Decisión abierta** §6.3. |

### 4.2 Casos que se resuelven solos

- Producto sin `productCosts` (módulo apagado / no descuenta): no consumió entradas → no afectado
  (`order-offline-service.ts:480-485`).
- Transferencias intermedias: conservan `lotOriginMovementId` en el destino
  (`warehouse-offline-service.ts:402-403`, `:435-436`).
- Varias líneas `productCosts` de la misma entrada repartidas en varias ventas: se actualizan **todas**
  las que referencien el `inventoryId`.
- Decimales: costo por unidad, sin prorrateo; `round2` en las comparaciones.

---

## 5. Plan de pruebas

**Regla dura**: no tocar E2E existentes (`frontend-react/e2e/**`) ni sus support files; solo agregar.

### 5.1 Unitarias nuevas (service/domain)

- **Atribución** (`getPurchasePropagationPreview` / helper puro):
  - ruta determinista por `lotOriginMovementId` en la fila de salida;
  - fallback por costo en datos viejos;
  - **ambigüedad** (dos compras al mismo costo) → error `PurchasePropagationAmbiguous`;
  - fila sin entrada → `SaleOutEntryNotFound`; entrada editada → `SaleOutEntryModified`;
  - salida revertida excluida.
- **Aplicación atómica** (`applyPurchaseCostEdit`):
  - éxito: almacén (reversa + recreación), entradas de tienda y `productCosts` quedan en `C_new`;
  - ruta de fallo (siguiendo el estilo de `warehouse-offline-service-fase1.test.ts:59` A2): no persiste
    ni deja estado intermedio;
  - multi-lote / dos compras: editar una sola actualiza solo sus líneas.
- **Seams nuevos**:
  - `InventoryOfflineService.updateWarehouseOriginEntryCost` actualiza el costo **y** `update()` sigue
    bloqueando (regresión pineada en `warehouse-offline-service-fase1.test.ts:352-392`);
  - `OrderOfflineService.updateProductCostsByInventoryIds` toca solo las líneas coincidentes;
  - `calculateOrderProfit` refleja el costo nuevo tras propagar (`profit-calculator.test.ts`).
- **Profit multi-tramo**: I-3f (ya listada en §3 Fase 4) — venta de 12 sobre 10@$5 + 5@$10 → dos
  tramos en `productCosts`; editar la compra del tramo afectado corrige solo ese tramo.

### 5.2 Un E2E NUEVO (requisito del plan §3 Fase 3)

Archivo nuevo `frontend-react/e2e/warehouse-cost-propagation.spec.ts` (no modifica ningún spec
existente). Flujo completo:

1. `enableWarehouseFeatures` → crear almacén → `purchaseIn` 10 @ $50.
2. `saleOut` 6 a tienda (crea entrada espejo a $50).
3. `createSaleOfFirstProduct` (consume ≥1 de la entrada; `productCosts` a $50).
4. Editar la compra a costo $70 → aparece el diálogo de propagación → confirmar.
5. Verificar: (a) la venta muestra costo/ganancia con $70; (b) el stock en tienda muestra costo $70.
6. Caso negativo: editar una compra 100% en almacén (sin salidas) **no** muestra diálogo (protege
   E-UI-3 / E-R5).

Reutilizar helpers de `e2e/support/*` (`enableWarehouseFeatures`, `purchaseIn`, `saleOut`,
`createSaleOfFirstProduct`, `latestMovementId`, `onHandOf`). Añadir support **nuevo** solo si hace
falta; no alterar el comportamiento de los existentes.

### 5.3 E2E existentes que NO deben romperse

- `warehouse-movement-edit-cap.spec.ts:293-321` (E-UI-3) y `movement-reversal.spec.ts:472-498` (E-R5)
  editan una compra **sin unidades fuera** y esperan guardar directo. El diálogo de propagación **no**
  debe aparecer en esos casos.
- `movement-reversal.spec.ts:500-527` (E-R6): editar una salida consumida sigue bloqueando.

---

## 6. Decisiones ratificadas (usuario, 2026-09-20)

Estas cuatro decisiones reemplazan las preguntas abiertas originales del diseño y están
implementadas en Fase 3:

1. **Compra totalmente consumida**: **se permite** editar el costo aunque no quede remanente en el
   almacén. Es una **corrección de SOLO costo**: no se crea fila de reversa ni compra nueva; solo se
   corrigen las entradas de tienda y las ventas. Implementado en
   `WarehouseOfflineService.applyPurchaseCostEdit` (`costOnly = remainingPurchaseUnits <= 0`) y en el
   modo `costOnly` del modal (campo de cantidad oculto). El error `PurchaseLotConsumed` ya NO bloquea
   este caso.
2. **Órdenes desactivadas**: **solo las ACTIVAS** reciben el costo nuevo. Las desactivadas se cuentan
   y el diálogo de confirmación lo indica (`WAREHOUSES.PROPAGATION_LEFT_OUT`). Implementado en
   `OrderOfflineService.updateProductCostsByInventoryIds`.
3. **Local-only**: la corrección **NO** viaja por import/export. No se extendió el merge estrecho de
   órdenes ni de entradas; queda documentado aquí y en el comentario del seam.
4. **Enlace determinista**: se añadió `lotOriginMovementId` a **`WarehouseStockMovement`** y se
   propaga en `sale_out` desde el slice consumido, con **fallback por costo** para datos viejos
   (bloqueando ante ambigüedad con `PurchasePropagationAmbiguous`).

---

## 7. Archivos implementados (Fase 3)

- `packages/domain/src/models/warehouse.ts` — `lotOriginMovementId?` en `WarehouseStockMovement`.
- `packages/domain/src/errors/warehouse-errors.ts` — `PurchasePropagationAmbiguous`,
  `PurchasePropagationNoOutflow`.
- `app/inventory/lib/warehouse.ts` — helpers puros `attributePurchaseOutflow` y
  `summarizeOrderImpact` (sin I/O).
- `app/inventory/lib/services/warehouse-offline-service.ts` — `lotOriginMovementId` en `sale_out`;
  `getPurchasePropagationPreview`; `applyPurchaseCostEdit` atómico ("todo o nada"); puerto opcional
  `PurchaseCostOrderPort`.
- `app/inventory/lib/services/inventory-offline-service.ts` — `updateWarehouseOriginEntryCost`
  (bypass deliberado de A8; `update()` del CRUD sigue bloqueando).
- `app/sales/lib/services/order-offline-service.ts` — `updateProductCostsByInventoryIds` (solo activas)
  y `restoreOrdersSnapshot` (rollback).
- `app/inventory/routes/warehouse-movements.tsx` — diálogo de confirmación con detalle y llamada atómica.
- `app/inventory/components/warehouse-movement-modal.tsx` — modo `costOnly`.
- `app/shared/lib/i18n/es.ts` — claves `WAREHOUSES.PROPAGATION_*`.
- Tests: `app/inventory/lib/__tests__/warehouse.test.ts`,
  `app/inventory/lib/services/__tests__/warehouse-offline-service-fase3.test.ts`,
  `app/sales/lib/services/__tests__/order-offline-service.test.ts`,
  `app/inventory/routes/__tests__/warehouse-movements.test.tsx`.
- E2E NUEVO: `frontend-react/e2e/warehouse-cost-propagation.spec.ts` (ningún spec existente se tocó).
