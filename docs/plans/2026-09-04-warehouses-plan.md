# Plan: Almacenes + Movimientos → Entradas de la tienda

Fecha: 2026-09-04 · Rama: `main` · Estado: **diseño (sin código)**

## Objetivo

Adicionar la gestión de **almacenes** a la app (patrón tomado de
`ECommerce/public-clothes-store-demo/templates` → `api-salesops/src/warehouse` +
`stock`), con:

1. CRUD de almacenes (maestro plano: nombre + activo).
2. **Stock por producto × almacén** (`onHand`) con costo unitario.
3. **Movimientos de almacén**: entrada por compra (`purchase_in`), transferencias
   entre almacenes (`transfer_out` / `transfer_in`), y salida del almacén hacia la
   tienda (`sale_out`) que **genera una `InventoryEntry` (entrada de la tienda)**.
4. Todo offline-first (localStorage por tienda + export/import), igual que el resto
   de la data de negocio.

**Fuera de alcance (decisión del usuario):** rol `warehouse_operator`, entregas,
reservas (`reserved`), ajustes de inventario (`adjustment_in/out`) en v1.

---

## Modelo de referencia (ECommerce templates)

Fuente: `packages/domain/src/inventory/*` + `packages/infra-db/prisma/tenant/schema.prisma`
+ `apps/api-salesops/src/{warehouse,stock}/*`.

- **`Warehouse`** — `{ id, name, active, createdAt, updatedAt }`. Maestro plano, sin
  dirección/geografía. `createWarehouse` valida nombre no vacío (lanza
  `InvalidWarehouseError`). Soft-delete (`active=false`), nunca hard DELETE.
- **`StockLevel`** — `{ productId, warehouseId, onHand, reserved }`, único por
  `(productId, warehouseId)`. `available = onHand - reserved` **derivado** en
  lectura, nunca almacenado. `onHand` **solo muta vía un `StockMovement`**, dentro
  de una transacción — no hay "set onHand" directo.
- **`StockMovement`** — log append-only: `{ productId, warehouseId, type, quantity,
  reason, createdBy, createdAt }`. `quantity` siempre **magnitud positiva**; la
  dirección sale del `type` (`movementDirection`: `_in` = +1, `_out` = -1).
  `createStockMovement` valida entero > 0. Nunca se borra ni edita.
- **Tipos (6 en referencia)** — `purchase_in | sale_out | transfer_in |
  transfer_out | adjustment_in | adjustment_out`.
- **Lógica pura** — `applyMovement(level, type, quantity)` calcula el siguiente
  `onHand` y lanza `NegativeStockError` si quedaría negativo; la DB tiene CHECK
  constraint como backstop.

---

## Decisiones fijadas (preguntas respondidas)

1. **Costo**: el `StockLevel` del almacén guarda `costPrice` por unidad
   (promedio ponderado, recalculado al registrar entradas de compra). La salida
   almacén → tienda usa ese costo para crear la `InventoryEntry`.
2. **Tipos de movimiento en v1**: `purchase_in`, `transfer_in`, `transfer_out`,
   `sale_out`. **Sin** `adjustment_*` en v1.
3. **Menú/guard**: ítem en el **módulo Inventario** (`EModules.Inventory`), con un
   **nuevo feature `EFeatures.Warehouses`** (crear/seeder en el backend, mismo
   patrón que `Egress`).

---

## Modelo de datos (offline-first, localStorage)

3 entidades nuevas (patrón del modelo de referencia, adaptado a la persistencia
local de la app):

### `warehouses` (maestro)

```ts
interface Warehouse {
  id: string;          // UUID local (crypto.randomUUID)
  name: string;
  isActive: boolean;   // soft-delete
  createdDate: Date;
  createdByName: string;
  updatedDate?: Date;
  updatedByName?: string;
}
```

- Validación: nombre no vacío / no solo espacios (`InvalidWarehouseError` portado
  como `WarehouseErrors.InvalidName`).
- Soft-delete con guard: un almacén con stock (`onHand > 0`) o movimientos
  registrados **no se puede desactivar** (botón bloqueado con aviso) — decisión #5.

### `warehouse-stock-levels` (StockLevel)

```ts
interface WarehouseStockLevel {
  id: string;
  warehouseId: string;
  productId: string;
  onHand: number;       // solo muta vía movimiento
  costPrice: number;    // promedio ponderado por unidad (decisión #1)
  createdDate: Date;
  updatedDate?: Date;
}
```

- Único por `(warehouseId, productId)` (clave compuesta = `warehouseId:productId`).
- `onHand` **nunca se escribe directo**: solo vía `recordMovement` (mismo
  invariante del modelo de referencia).
- `costPrice` se recalcula como promedio ponderado al aplicar `purchase_in`:
  `nuevo = (onHand_previo * costo_previo + cantidad * costo_entrada) / onHand_nuevo`.

### `warehouse-stock-movements` (StockMovement — append-only)

```ts
type WarehouseMovementType = 'purchase_in' | 'sale_out' | 'transfer_in' | 'transfer_out';

interface WarehouseStockMovement {
  id: string;
  warehouseId: string;      // almacén origen (sale_out/transfer_out) o destino (purchase_in/transfer_in)
  productId: string;
  type: WarehouseMovementType;
  quantity: number;         // magnitud positiva, round2 (acepta decimales — decisión #7)
  reason: string | null;    // texto libre OPCIONAL en todos los tipos (decisión #6)
  createdDate: Date;
  createdByName: string;
  // Transferencias:
  toWarehouseId?: string;   // transfer_out → destino
  fromWarehouseId?: string; // transfer_in → origen
}
```

- Append-only: no se edita ni borra (igual que `ExchangeRate` / `StockMovement`).

---

## Flujo: salida de almacén → entrada de la tienda

Es la integración clave. Al registrar un `sale_out`:

1. **Validación** (función pura `recordWarehouseMovement`):
   - almacén existe y está activo; producto existe y está activo.
   - `quantity` > 0, redondeada a 2 decimales (decisión #7).
   - `onHand` del `(warehouse, product)` ≥ quantity → si no,
     `WarehouseErrors.InsufficientStock` (portado de `NegativeStockError`).
2. **Débito del almacén** (atómico): `onHand -= quantity` (FIFO no aplica aquí, el
   almacén es un agregado; el costo unitario es el promedio ponderado actual).
   Se persiste `WarehouseStockMovement` tipo `sale_out` + el `StockLevel` nuevo.
3. **Creación de la `InventoryEntry` en la tienda**: llamar al servicio existente
   `InventoryOfflineService.createInventoryEntry(productId, quantity, costPrice)`,
   con `costPrice = stockLevel.costPrice` (costo promedio del almacén). Así la
   venta posterior descuenta por FIFO con el costo correcto y los reportes de
   ganancia/inventario de la tienda siguen funcionando sin cambios.
4. **Rastro**: el movimiento queda como audit log; la entrada de la tienda queda
   en `inventory-entries` como cualquier otra (visible en Entradas del día).

> Nota de diseño: la `InventoryEntry` creada por `sale_out` no difiere en nada de
> una entrada manual — la tienda "no sabe" que vino de un almacén. La trazabilidad
> completa (qué almacén/quién/cuándo) vive en `warehouse-stock-movements`.

### Transferencia entre almacenes (`transfer_out` + `transfer_in`)

- `transfer_out` en el almacén origen: valida stock, decrementa `onHand`, registra
  movimiento con `toWarehouseId`.
- `transfer_in` en el destino: incrementa `onHand` (crea `StockLevel` si no
  existe), registra movimiento con `fromWarehouseId`. El **costo se propaga tal
  cual** (no se recalcula el promedio en el destino — decisión #4).
- UI: una sola pantalla "Transferir" que pide origen, destino, producto, cantidad
  (origina ambos movimientos) — o dos pasos manuales. Se propone la pantalla única.

---

## Backend (cambios)

- **Nuevo feature `Warehouses`** en el seeder de features (mismo patrón que
  `Egress`): el item del menú queda gateado por `EFeatures.Warehouses` y el guard
  `featureLoader` lo valida contra los features del plan de la tienda.
- **Cero cambios** en la API de negocio: almacenes/movimientos son 100%
  offline-first (como órdenes, gastos, inventario, exchange-rates). No hay
  endpoints nuevos de almacenes.
- El `InventoryOfflineService` actual no se toca (la integración es un llamado a
  `createInventoryEntry`, no una modificación de su lógica).

---

## Frontend (cambios)

### Nuevo módulo de dominio (`packages/domain`)

- `models/warehouse.ts`: `Warehouse`, `WarehouseStockLevel`,
  `WarehouseStockMovement`, `WarehouseMovementType`.
- `errors/warehouse-errors.ts`: portados de la referencia — `InvalidWarehouseError`
  (nombre vacío), `NegativeStockError` → `InsufficientStock`, más
  `WarehouseNotActive`, `ProductNotActive`, `MovementQuantityInvalid` (si aplica).
- `enums/index.ts`: agregar `EFeatures.Warehouses` (nuevo id).

### Servicio offline (`app/inventory/lib/services/warehouse-offline-service.ts`)

- CRUD almacenes (create/update/soft-delete/list).
- `getStockLevel(warehouseId, productId)` y `getAvailableQuantity(...)`.
- `recordMovement(...)` — la única puerta de mutación de `onHand`:
  - `purchase_in`: `onHand += q`, recalcula `costPrice` promedio ponderado.
  - `sale_out`: valida stock → `onHand -= q` → **crea `InventoryEntry`** en la
    tienda (inyecta `InventoryOfflineService`).
  - `transfer_out` / `transfer_in`: mueve stock entre almacenes (propaga costo).
- Funciones puras (testeables): `movementDirection`, `applyMovement`,
  `computeWeightedCost`, validaciones.

### Persistencia / sync (7º y 8º/9º archivo del backup)

- `storage-keys.ts`: agregar `'warehouses'`, `'warehouse-stock-levels'`,
  `'warehouse-stock-movements'` a `BUSINESS_ENTITY_NAMES` (mismo patrón que
  `exchangeRates`).
- `data-serializer-service.ts` / `data-synchronizer-service.ts`: export/import +
  merge de las 3 entidades (upsert por id; movimientos append-only → los nuevos
  del backup se agregan, no se reemplazan).
- **Compatibilidad**: backups viejos sin estas entradas importan como `[]`; la
  entrada `sale_out` creada por backup se restaura como `InventoryEntry` normal
  (ya viaja en `inventory-entries`).

### UI

- Ruta `/inventory/warehouses` + ítem de menú en `EModules.Inventory`
  (`MENU.WAREHOUSES`, ícono 🏬) con guard `EFeatures.Warehouses` y su help text.
- **Pantalla Almacenes**: lista + crear/editar/desactivar almacén.
- **Pantalla Stock por almacén**: tabla producto × almacén con `onHand`, costo
  promedio, y acciones por producto: "Entrada (compra)", "Salida a tienda",
  "Transferir".
- **Pantalla Movimientos**: histórico append-only por almacén/producto/rango de
  fechas, con filtro por tipo.
- i18n en `es.ts` (nuevos `MENU.WAREHOUSES`, `WAREHOUSES.*`).

---

## Impacto (resumido)

| Área | Cambio |
|---|---|
| Domain | 3 modelos nuevos + errores + `EFeatures.Warehouses` — aditivo, no rompe nada |
| Backend | Solo el feature `Warehouses` en el seeder (guard del menú). Cero endpoints |
| Storage | 3 entidades nuevas en `BUSINESS_ENTITY_NAMES` + serializer/synchronizer + rutas export/import |
| Inventario tienda | Sin cambios: `sale_out` llama a `createInventoryEntry` existente |
| Ventas/Órdenes/Dashboard | **Cero** — la tienda sigue vendiendo de su inventario local |
| UI | 3 pantallas nuevas + menú + i18n |
| Tests | Ver sección siguiente |

---

## Tests (cobertura completa: unit + integración + e2e)

Estrategia TDD: primero tests que fallen (unit → integración), luego implementar,
correr hasta verde, y al final la suite e2e. Patrones existentes del repo:
**unit** = vitest puro (funciones puras y servicios con deps mockeadas),
**integración** = vitest con piezas reales cableadas (localStorage de verdad +
servicios reales + sync, sin backend/red), **e2e** = Playwright contra backend
`http-e2e`/`smca_test` + backend E2E xUnit (`SMCA.WebApi.E2ETests`).

### 1. Unit (vitest — primero rojos, luego verdes)

- **Dominio** (`packages/domain`): `createWarehouse` valida nombre vacío/solo
  espacios; errores portados (`WarehouseErrors.*`); `movementDirection`,
  `applyMovement` (negativo → `InsufficientStock`), `computeWeightedCost`
  (promedio ponderado, casos: primera entrada, costos distintos, round2).
- **`warehouse-offline-service`** (deps mockeadas):
  - `purchase_in` suma `onHand` y recalcula `costPrice` (decisión #1).
  - `sale_out` con stock suficiente debita el almacén y llama a
    `InventoryOfflineService.createInventoryEntry` con `costPrice` correcto
    (mock del service).
  - `sale_out` con stock insuficiente → `InsufficientStock`, sin cambios ni
    llamadas al inventario.
  - `sale_out` con almacén/producto inactivo → error, sin cambios.
  - `sale_out` con cantidad decimal (round2) — aceptado (decisión #7).
  - `transfer_out`/`transfer_in`: mueven stock, **propagan costo tal cual**
    (decisión #4); destino sin fila previa crea `StockLevel`.
  - Desactivación bloqueada con stock/movimientos (decisión #5); `reason`
    opcional en todos los tipos (decisión #6); movimientos append-only (la API
    no expone editar/borrar).
- **UI**: sección de formularios (crear/editar almacén, modal de movimiento),
  validaciones de cantidad/costo en pantalla, ítem de menú + guard.

### 2. Integración (vitest — piezas reales, sin backend/red)

- **Servicios reales + localStorage real** (jsdom): `WarehouseOfflineService` +
  `InventoryOfflineService` + `ProductRepository` reales; un `sale_out` de verdad
  deja el stock del almacén debitado Y una `InventoryEntry` persistida en
  `inventory-entries` con `quantity`/`costPrice` correctos.
- **Storage roundtrip**: las 3 entidades con cifrado at-rest (`encryptEntity`/
  `decryptEntity`) y revival de fechas; `BUSINESS_ENTITY_NAMES` actualizado
  (tests existentes de la lista de entidades, wipe/reset y migración de cifrado
  cubren las 3 nuevas automáticamente).
- **Sync roundtrip completo**: export (serializer) → JSON → import (synchronizer)
  con las 3 entidades + `inventory-entries`; backups legacy sin ellas importan
  como `[]`; merge de movimientos no duplica (append-only); idempotencia.
- **Loaders/rutas**: loader de `/inventory/warehouses` con guard
  `EFeatures.Warehouses` (patrón `loaders.cold-boot.test.ts` /
  `profile-routes.test.tsx`); menú renderiza el ítem solo cuando el feature
  está disponible.

### 3. E2E frontend (Playwright — `warehouses.spec.ts`, nuevo, sin tocar specs existentes)

#### Estado de cobertura del spec (`warehouses.spec.ts`, 4 tests, todos verdes)

| # | Escenario del plan | Estado |
|---|---|---|
| 1 | Crear almacén → aparece en la lista activa. | ✅ Cubierto (test "crear almacén…") |
| 2 | Entrada por compra (`purchase_in`) → stock y costo promedio visibles. | ✅ Cubierto (test 1: on-hand 24, `$660`) |
| 3 | `sale_out` → `InventoryEntry` en **Entradas del día** + stock decrece. | ✅ Cubierto (test 2: 24 → 12, entrada con 660) |
| 4 | `sale_out` con stock insuficiente → error, sin entrada. | ✅ Cubierto (test 3: mensaje `No hay suficiente stock…`) |
| 5 | Transferencia A → B → stock A decrece, stock B crece (mismo costo). | ✅ Cubierto (test 4: 24 → 14 / 10 con `$660`) |
| 6 | Desactivar almacén con stock → bloqueado con aviso. | ✅ Cubierto (test "desactivar almacén con stock se bloquea y almacén vacío sí se desactiva") |
| 7 | Cantidad decimal en `purchase_in`/`sale_out` → aceptada con round2. | ✅ Cubierto (test "cantidad decimal se acepta con round2 en compra y salida": 10.555 → 10.56, sale_out 2.5 → 8.06) |
| 8 | Exportar e importar con las 3 entidades presentes → roundtrip íntegro. | ✅ Cubierto (test "exportar e importar el backup restaura las tres entidades de almacenes": ZIP real + 3 localStorage keys reseteadas) |
| 9 | Menú: el ítem Almacenes no aparece sin el feature `Warehouses`. | ✅ Cubierto (test "el ítem de menú Almacenes solo aparece con el feature Warehouses") |
| 10 | **Regresión venta**: tras `sale_out`, vender descuenta FIFO con el costo del almacén y `today-sales-profit` muestra el margen correcto. | ✅ Cubierto (test "venta tras salida a tienda descuenta FIFO con el costo del almacén": margen 10 − 660 → `-$650`) |
| 11 | **Acceso por rol**: solo el OwnerAdmin de la tienda accede a Almacenes. | ✅ Cubierto (test "un usuario de tienda (StoreUser) no ve Almacenes y la ruta lo desloguea", rol 3 vía API: menú ausente + `/inventory/warehouses` → redirect `/login`; `WarehousesAdmin` es `[HasRoles(OwnerAdmin)]` en `StoreRoleFeatures.cs:86-89`) |

#### Escenarios E2E 6–10 añadidos a `warehouses.spec.ts` (detalle implementado)

6. **Desactivar almacén con stock → bloqueado con aviso**
   - Crear almacén, `purchase_in` con stock (p. ej. 24), intentar desactivar
     desde el botón "Desactivar".
   - Esperado: error visible (`No se puede desactivar un almacén con stock o
     movimientos.` — `WarehouseErrors.CannotDeactivate`), el almacén sigue
     activo en la lista.
   - Contraste: un almacén vacío (sin stock ni movimientos) sí se desactiva y
     queda marcado `(Inactivo)`.

7. **Cantidad decimal → aceptada con round2**
   - `purchase_in` de `10.555` unidades → el `StockLevel.onHand` queda en
     `10.56` (round2) y el movimiento registra `10.56`.
   - `sale_out` de `2.5` unidades sobre ese stock → el almacén queda en
     `8.06` y la `InventoryEntry` de la tienda se crea con `quantity 2.5`.

8. **Exportar e importar con las 3 entidades presentes → roundtrip íntegro**
   - Con un almacén + stock + movimientos creados, exportar (descarga del ZIP).
   - Reimportar el backup (flujo real de `/sync/import`) y verificar que
     `warehouses`, `warehouse-stock-levels` y `warehouse-stock-movements`
     quedan restaurados (misma UI de Almacenes), sin duplicar movimientos
     (append-only) ni duplicar almacenes.

9. **Menú: el ítem Almacenes no aparece sin el feature `Warehouses`**
   - Usar una persona/tienda cuyo plan NO incluya `EFeatures.Warehouses` (36):
     navegar a `/inventory/warehouses` redirige/deniega y el ítem de menú
     "🏬 Almacenes" no se renderiza en Inventario.
   - Activar el feature (seam de `auth/me` en localStorage, como hace el spec
     actual en `enableWarehouseFeatures`) → el ítem aparece y la ruta carga.

10. **Regresión venta: FIFO con costo del almacén**
    - Crear almacén + `purchase_in` con costo conocido (p. ej. 24 × $660).
    - `sale_out` de 12 unidades → la tienda tiene una `InventoryEntry` de 12 ×
      $660 (el costo del almacén, no el retail).
    - Vender el producto en `/sales/new` (descuenta la entrada por FIFO a $660)
      y abrir `today-sales-profit`: el margen usa `precio_venta − 660` — la
      tienda "no sabe" que la entrada vino del almacén.

> Los 5 escenarios (6–10) se añadieron a `warehouses.spec.ts` (mismo
> `describe.serial`), uno por test, sin tocar los specs existentes. **Resultado:
> 9/9 tests verdes** (4 existentes intactos + 5 nuevos).
>
> **Fix de producción incluido:** `purchase_in` no persistía el stock level a
> localStorage (el backup exportaba niveles vacíos y el stock desaparecía al
> recargar). Se añadió `setLocalStorage('warehouse-stock-levels', …)` a la rama
> `purchase_in` de `WarehouseOfflineService.recordMovement`, igual que
> `sale_out`/`transfer_*` ya hacían.

### 4. Backend E2E (xUnit — `SMCA.WebApi.E2ETests`, con `WebAppFixture`)

- **Seeding de features**: el plan de la tienda incluye el feature `Warehouses`
  (mismo patrón que los tests de `Features` existentes).
- **Guard del menú**: una tienda sin el feature no recibe `Warehouses` en su
  lista de features/`auth/me`; una tienda con el feature sí.
- **Sin regresión**: suite completa del backend sigue verde (cero endpoints
  nuevos, solo seeder de feature).

---

## Decisiones finales (respondidas 2026-09-04)

4. **Costo en transferencias**: se propaga el costo unitario tal cual entre
   almacenes (transferir no cambia el valor por unidad).
5. **Desactivar almacén**: bloqueado si tiene stock (`onHand > 0`) o movimientos.
6. **`reason`**: opcional en todos los tipos de movimiento (nullable, como la
   referencia).
7. **Cantidades**: aceptan decimales con `round2` (no solo enteros) — coherente
   con el inventario de la tienda.