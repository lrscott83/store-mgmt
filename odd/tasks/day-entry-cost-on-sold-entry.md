# Costo de entrada del día en entradas ya vendidas

## Objetivo

Permitir editar el costo —y la cantidad— de una entrada de **entradas del día** que ya tenga
unidades vendidas, siempre que la entrada **no** venga de almacén, y propagar el costo nuevo a
las ventas que usaron esa entrada.

## Problema

Hoy `InventoryOfflineService.update()` corre `isNotSoldEntry` y rechaza cualquier entrada
parcialmente vendida con *"Existe una venta que corresponde con esta entrada."*

La propagación **ya existe** pero es inalcanzable en ese caso:
- `OrderOfflineService.updateProductCostsByInventoryIds` (`order-offline-service.ts:635`) reescribe
  el `costPrice` de las líneas de venta de la entrada.
- `today-entries.tsx:170-177` ya la invoca, **pero** la ruta hace `return` en la línea 167 cuando
  `update()` falla, así que nunca se llega.

El guard no se puede simplemente relajar: `update()` hace hoy `available: quantity` (línea 685), y
una entrada `quantity 10 / available 8` editada volvería a `available = 10`, resucitando 2 unidades
fantasma al stock.

## Regla de negocio (definida por el owner)

```
vendidas          = entry.quantity - entry.available
nuevaAvailable    = nuevaQuantity - vendidas
válido si         nuevaQuantity >= vendidas
```

Si no se cumple → se rechaza con el error que ya existe
(`InventoryErrors.SaleExistsWithThisEntry`), y el modal lo muestra como hoy.

Cuando una venta se desactiva las unidades vuelven a `available`; por eso "vendida" se deriva de
`quantity - available` y no de un campo aparte.

## Alcance

Un solo cambio de comportamiento, en `InventoryOfflineService.update()`.

| | Antes | Después |
|---|---|---|
| Entrada vendida | se rechaza | se permite si `nuevaQuantity >= vendidas` |
| `available` | `= quantity` | `= nuevaQuantity - vendidas` |
| Entrada no vendida | `available = quantity` | igual (sin cambio) |

**Fuera de alcance — no se toca:**
- `deleteInventoryEntry()` — sigue bloqueado. El guard compartido `isNotSoldEntry` no se modifica.
- Entradas de almacén (`warehouseSaleOutMovementId`) — siguen selladas con `WarehouseEntryNotEditable`.
- Órdenes desactivadas — `updateProductCostsByInventoryIds` solo actualiza activas (decisión
  ratificada 2026-09-20 #2).
- El modal — sin validación nueva en cliente; sigue mostrando el error del servicio.
- `isNotSoldEntry()` — sin cambios; sus tests siguen vigentes.

## Verificación pendiente hecha

- `warehouseSaleOutMovementId` se asigna en un solo sitio: `markEntryWarehouseOrigin`, llamado
  únicamente por `WarehouseOfflineService.sale_out`.
- El import **no borra la marca**: `updateImportedEntries` fusiona con spread `...currentEntries[idx]`
  y el campo no está en la lista sobrescrita. `addImportedEntries` solo se usa para buckets nuevos,
  donde no hay entradas locales que perder.

## Tests a actualizar (autorizado por el owner)

- `frontend-react/e2e/entry-cost-propagation.spec.ts` — **E-CP-2** afirma hoy lo contrario
  (rechazo + costo sin cambio). Se reescribe a la nueva lógica. E-CP-1 no se toca.
- Tests unitarios que fijan el rechazo en `update()`: se actualizan al nuevo contrato.
- Los tests de `isNotSoldEntry` no cambian: el método no cambia.

## Tareas

- [x] T1 `update()`: allow sold non-warehouse entries, compute `available`
- [x] T2 Tests unitarios del servicio (el que fijaba el contrato viejo reescrito: 1 test -> 4)
- [x] T3 E2E E-CP-2 reescrito + E-CP-3 nuevo
- [x] T4 Verificacion completa

## Progreso — completado

### Cambio

`InventoryOfflineService.update()`:
1. Los dos checks de existencia quedan inline, identicos a los de `isNotSoldEntry`.
2. El check de almacen se evalua **antes** de la regla de cantidad, para que una entrada
   sellada siga sellada sea cual sea el numero que escriba el usuario.
3. `sold = quantity - available`; se rechaza si `quantity < sold`.
4. `available = quantity - sold` (derivado, nunca copiado).

Un solo test del servicio fallo al aplicar el cambio y era exactamente el que fijaba el
contrato viejo. El resto (delete, isNotSoldEntry, updateInventoryEntry) siguio verde, lo que
confirma que el cambio quedo contenido.

### Verificacion de que el test muerde

Revirtiendo solo `available: quantity - sold` -> `available: quantity`:
`expected 15 to be 9` y `expected 6 to be +0`. Es el bug de stock fantasma, capturado por test.

| Suite | Resultado |
|---|---|
| `app/inventory` | **540/540** (27 archivos) |
| `pnpm typecheck` / `pnpm lint` | limpios |
| Suite completa | 5014/5023 — ver abajo |

### Fallos preexistentes, NO de este cambio

`storage-keys.test.ts` y `store-data-reset.test.ts` fallan **en aislamiento** (2 tests).
Probado con `git stash`: con el arbol limpio en el commit de merge fallan igual. Son de la
rama, no de este trabajo, y probablemente los trajo el merge de `test`/`dev` de hoy
(`dev` toco `storage-keys.ts`).

Los otros 2 archivos que fallan en la corrida completa son los flakes conocidos de
auth/storage, que dan verdes aislados.

### Riesgo residual anotado

El export no se verifico: si un ZIP no serializa `warehouseSaleOutMovementId` y se importa en
otro equipo con el producto como bucket nuevo, esas entradas llegarian sin la marca de almacen.
No bloquea este cambio (en el camino normal de import la marca se conserva) y queda anotado
para revision aparte.