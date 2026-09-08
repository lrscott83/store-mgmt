# Plan: Revisión, arreglos y cobertura de tests para Movimientos de Almacenes

**Fecha:** 2026-09-08
**Rama:** `dev`
**Alcance:** Funcionalidad de movimientos de almacenes — `purchase_in`, `sale_out`, `transfer_out` (y la vía inversa `transfer_in`).
**Contexto:** Revisión completa solicitada por el usuario porque la funcionalidad "parece no funcionar correctamente". Se realizó una auditoría de código + verificación de los flujos núcleo (los E2E del happy path pasan, los 46 tests unit/integration pasan). Este plan entrega: arreglos de bugs reales, cierre de gaps de robustez y una batería de tests unit/integration/E2E para cubrir lo máximo posible.

**Reglas del repo vigentes (CLAUDE.md):**
- NO modificar código de producción del backend ni tests E2E existentes sin autorización explícita del usuario.
- Los tests E2E existentes (`frontend-react/e2e/*.spec.ts`) NO se tocan. Nuevos tests van en ARCHIVOS NUEVOS.
- Solo se permite añadir tests: unit (`__tests__/*.test.tsx`) e integration son de libre edición; E2E nuevos van en specs nuevos.
- NINGÚN cambio en este plan toca producción backend. Todos los arreglos son frontend (React/TS).

---

## 1. Estado actual (verificado)

### 1.1. Tests que pasan hoy
- `warehouse-offline-service.test.ts` (384 líneas): purchase_in, sale_out, transfer_out, transfer_in, import seams. **46 tests pasan.**
- `warehouse-movement-modal.test.tsx` (180 líneas): gating del Save, payload de `onSubmit`, campos por modo.
- `warehouses.test.tsx` (332 líneas): orquestación con **mock** del service (no ejerce la lógica real).
- `warehouse.test.ts` (81 líneas): funciones puras (`applyMovement`, `computeWeightedCost`, `validateMovementQuantity`).
- E2E `warehouses.spec.ts` (660 líneas): happy path compra/salida/transferencia/desactivación/decimales/backup — pasa.

### 1.2. Arquitectura
```
warehouses.tsx (ruta) ──> warehouse-movement-modal.tsx ──> warehouse-offline-service.ts
                                                            │  (recordMovement)
                                                            ├─> warehouse.ts (funciones puras)
                                                            └─> inventory-offline-service.ts (createInventoryEntry, sale_out)
```

---

## 2. Hallazgos

### 2.1. Bugs reales (corregir)

**BUG-1 — `validateMovementQuantity` acepta `+Infinity`** (`app/inventory/lib/warehouse.ts:44-49`)
- `!(Infinity > 0)` → `false` (no rechaza), `Number.isNaN(Infinity)` → `false` (no rechaza) → devuelve `Success`.
- `applyMovement(level, type, Infinity)` → `round2(Infinity)` = `Infinity`, y `Infinity < 0` es `false` → `onHand = Infinity`, sin excepción.
- **No alcanzable desde la UI** (el modal bloquea con `Number.isFinite(qty)`), pero es un hueco en el límite del **servicio**.
- **Fix:** usar `Number.isFinite(quantity)` en `validateMovementQuantity` (rechaza `Infinity`, `-Infinity` y `NaN` de una vez).

**BUG-2 — `sale_out` sin atomicidad entre almacén y entrada de tienda** (`warehouse-offline-service.ts:277-295`)
- Secuencia: débita stock del almacén (`applyMovement`) → `setLocalStorage('warehouse-stock-levels')` → **luego** `createInventoryEntry(...)` (línea 283).
- El `DataResult` de `createInventoryEntry` se **descarta** (retorno ignorado) y **no hay rollback**.
- Si `createInventoryEntry` fallara, el almacén quedaría debitado + movimiento registrado, pero SIN entrada en la tienda → inconsistencia silenciosa.
- `createInventoryEntry` está documentado "never throws", pero su `DataResult` puede traer `success: false`.
- **Fix:** comprobar el `DataResult` de `createInventoryEntry`; si es `null` (producto inexistente) o `!success`, devolver `Result.Failure` y **no** persistir el débito del almacén. Mover la persistencia del débito DESPUÉS de la entrada de tienda (o revertir sobre fallo).

### 2.2. Gaps (estado: ANOTADO o RESUELTO)

**GAP-1 — Relectura/redescifrado por caché vacía** (`warehouse-offline-service.ts:86-90, 155-159, 183-187`) — **ANOTADO (2026-09-08), pendiente, SIN resolver en este pase**
- Condición de invalidación: `!this.warehouses || this.warehouses.length === 0 || key changed`.
- Cuando una colección persistida es `[]`, el getter relee y redescifra `localStorage` en CADA llamada, y `createWarehouse`/`recordMovement` llaman a los getters antes de mutar.
- Impacto: solo rendimiento, no correcto. Se difiere a un pase futuro de optimización.
- Fix futuro (recordado aquí): distinguir "no cargado aún" (`=== null`) de "cargado y vacío" (array), invalidando solo por `key changed` tras la primera carga.

**GAP-2 — Tabla de movimientos global sin filtro por almacén** (`warehouses.tsx:500-522`) — **ANOTADO (2026-09-08), pendiente, SIN resolver en este pase**
- Muestra TODO el histórico (`getStorageMovements()`), mezclando todos los almacenes, sin filtro.
- El servicio YA expone `getMovements(warehouseId)` (líneas 196-202), pero la ruta nunca lo usa.
- Impacto: mejora UX opcional, no bug. Se difiere (si se desea) a un pase futuro de frontend.

**GAP-3 — Transferencia a destino con stock previo sin cobertura** — **RESUELTO en este pase (Paso 4)**
- El E2E y el test de servicio solo cubren destino **nuevo** (rama `target.onHand === quantity` → costo directo).
- La rama `computeWeightedCost` del destino (cuando ya tiene stock) no estaba cubierta.
- Resolución: añadir cobertura de test de servicio (Paso 4) que fija la ponderación del costo en el destino con stock previo. No requiere cambio de código.

### 2.3. Decisiones de diseño (NO cambiar — documentar)
- **Modal sin validación de stock:** la fuente de verdad es el servicio (`InsufficientStock` aparece al submit). Intencional, comentado en el modal (líneas 42-43).
- **`deactivateWarehouse` bloquea con CUALQUIER movimiento histórico** (incluso con stock 0) — decisión documentada #5 y fijada por test (service test líneas 117-137). Cambiar esto requiere aprobación del usuario.
- **JSON inválido lanza `EntityUnreadableError`** — decisión D4/D5, no escribir sobre un almacén ilegible. No es bug.

---

## 3. Plan de arreglos (implementación)

Orden de trabajo, cada paso con su test primero (donde aplique).

### Paso 1 — Fix BUG-1 (validator)
- **Cambio:** `app/inventory/lib/warehouse.ts` — `validateMovementQuantity` usa `Number.isFinite(quantity)` en vez de `!(quantity > 0) || Number.isNaN(quantity)`.
- **Test:** añadir casos `Infinity`, `-Infinity`, `NaN`, `0`, `-1`, `0.001` a `app/inventory/lib/__tests__/warehouse.test.ts`.
- **Verificación:** `pnpm vitest run app/inventory/lib/__tests__/warehouse.test.ts`.

### Paso 2 — Fix BUG-2 (atomicidad sale_out)
- **Cambio:** `app/inventory/lib/services/warehouse-offline-service.ts` — dentro de `recordMovement`, para `sale_out`:
  1. Comprobar `createInventoryEntry(...)`; si devuelve `null` (producto no existe) o `!success`, devolver `Result.Failure` y NO persistir el débito del almacén.
  2. Mover la escritura del débito a DESPUÉS de la entrada de tienda confirmada.
- **Test:** en `warehouse-offline-service.test.ts` (o un test de integration nuevo): simular/sellar el fallo de `createInventoryEntry` y verificar que el almacén NO se debita y que NO queda movimiento `sale_out`.
- **Verificación:** `pnpm vitest run app/inventory/lib/services/__tests__/warehouse-offline-service.test.ts`.

### Paso 3 — GAP-1 quedará ANOTADO (no se implementa en este pase)
- **Decisión del usuario (2026-09-08):** GAP-1 (caché relee/redescifra cuando la colección está vacía) queda anotado, **sin resolver**.
- **No aplicar** el cambio de invalidación (`length === 0` → `key changed`) ni su test en este pase.
- **Motivo:** es solo un problema de rendimiento, sin impacto funcional. Se puede retomar en un pase futuro de optimización.

### Paso 4 — Resolver GAP-3 (transferencia a destino con stock previo)
- **Objetivo:** cubrir la rama `computeWeightedCost` del destino cuando YA tiene stock del mismo producto (transferencia `transfer_out` / `transfer_in` hacia un destino con stock previo). Hoy solo se testea la rama de destino nuevo (`target.onHand === quantity` → costo directo).
- **Cambio de código:** ninguno — el servicio ya implementa la propagación correcta (líneas 312-319). Es **solo cobertura de tests** para fijar el comportamiento.
- **Test (unit/integration):** en `warehouse-offline-service.test.ts`:
  - Conjunto: origen tiene producto X a costo $10 (∈ N unid); destino YA tiene el mismo producto X a costo $6 (∈ M unid).
  - `transfer_out` de `k` unid a ese destino → verificar `destino.onHand = M + k` y `destino.costPrice = weightedAvg((M*6)+(k*10))/(M+k)` (round2).
  - Variante inversa `transfer_in` idéntica semántica.
- **Verificación:** suite de servicio.

### Paso 5 — Cobertura E2E (spec NUEVO, no tocar `warehouses.spec.ts`)
- Crear `frontend-react/e2e/warehouse-movements-extended.spec.ts` (nuevo) con:
  - `purchase_in` con cost (verifica costo promedio ponderado visible).
  - `sale_out` que NO deja stock insuficiente (bloqueado + mensaje Swal).
  - `transfer_out` a un almacén destino que YA tiene stock del mismo producto (verifica el costo ponderado mezclado).
  - `sale_out` y luego venta en tienda que descuenta con el costo del almacén (FIFO).
  - Edición de cantidad decimal (`0.5`) en compra y salida.
- Reusar los helpers existentes de `warehouses.spec.ts` (patrón fixture/seeder/page objects de `e2e/support/`).

### Paso 6 — GAP-2 quedará ANOTADO (no se implementa en este pase)
- **Decisión del usuario (2026-09-08):** GAP-2 (filtro por almacén en la tabla de movimientos) queda anotado, **sin resolver**.
- **No aplicar** el cambio UI de filtro (`warehouses.tsx` selector) ni su test en este pase.
- **Motivo:** es una mejora UX opcional, no un bug. Retomar en un pase futuro de frontend si se desea.

---

## 4. Matriz de cobertura objetivo

| Área | Unidad | Integration | E2E |
|---|---|---|---|
| `validateMovementQuantity` (Infinity/−Inf/NaN/0/neg/dec) | ✅ (Paso 1) | — | — |
| `applyMovement` decimal/tope/insuficiente/cero | ✅ (existe) | — | — |
| `computeWeightedCost` primer/ponderado/round | ✅ (existe) | — | — |
| `purchase_in` (con/sin costo, decimal) | ✅ (existe) | ✅ (existe) | ✅ (nuevo, Paso 5) |
| `sale_out` (débito + entrada tienda, insuficiente) | ✅ (existe) | ✅ (existe) | ✅ (existe + nuevo) |
| `sale_out` atomicidad (fallo createInventoryEntry) | ✅ (nuevo, Paso 2) | — | — |
| `transfer_out` destino nuevo | ✅ (existe) | ✅ (existe) | ✅ (existe) |
| `transfer_out` destino con stock previo **(GAP-3 → RESUELTO)** | ✅ (nuevo, Paso 4) | — | ✅ (nuevo, Paso 5) |
| Caché vacía no re-lee **(GAP-1 → ANOTADO, no se implementa)** | ❌ | — | — |
| Filtro por almacén (tabla) **(GAP-2 → ANOTADO, no se implementa)** | ❌ | — | — |

---

## 5. Verificación final

```bash
# Unit + integration (frontend)
pnpm vitest run app/inventory/lib/__tests__ app/inventory/lib/services/__tests__ app/inventory/components/__tests__ app/inventory/routes/__tests__

# E2E (nuevo spec + regresión del spec existente sin tocarlo)
pnpm playwright test e2e/warehouse-movements-extended.spec.ts
pnpm playwright test e2e/warehouses.spec.ts

# Lint/typecheck
pnpm run lint
pnpm run typecheck
```

Requiere PostgreSQL en `localhost:5432`, base `smca_test`.

---

## 6. Reglas de entrega

- **No commits en este pase hasta que el usuario apruebe el plan.**
- Ningún cambio a `warehouses.spec.ts` ni a producción backend.
- **Alcance de este pase aprobado por el usuario (2026-09-08):** resolver **GAP-3** (cobertura de transferencia a destino con stock previo) mediante los Pasos 1, 2, 4 y 5. Dejar **GAP-1 y GAP-2 ANOTADOS** (sin resolver, no se implementan en este pase).
- Los fixes de UI (GAP-2) y de caché (GAP-1) se retoman solo en un pase futuro, bajo decisión explícita del usuario.
- Tras aprobar este plan, ejecutar Pasos 1→2→4 (fixes BUG-1/BUG-2 + cobertura GAP-3 unit/integration), luego Paso 5 (E2E nuevo), en commits separados por unidad de trabajo, y verificar con la sección 5.
