# Plan de movimientos de almacén — trabajo pendiente

**Fecha**: 2026-09-16 · **Workspace**: `D:\Projects\AutoBusinessPro\Store\store-mgmt` · **Alcance**: frontend (`frontend-react/apps/web-store-pos`)

**Este es el único plan de movimientos de almacén.** Es autocontenido: incluye todo el contexto y el detalle necesarios para implementarlo en una sesión nueva. Contiene solo el trabajo pendiente.

---

## 0. Reglas de trabajo (no negociables)

1. **E2E intocables**: `frontend-react/e2e/**`. No modificar / borrar / renombrar / saltar tests existentes. **Agregar tests E2E nuevos: permitido.** Si un cambio exigiera tocar un E2E existente → DETENERSE y pedir autorización explícita del usuario (explicar: qué prueba el test / problema en lenguaje simple / solución propuesta).
2. **Backend intocable**: `backend/**`. La feature es 100 % frontend (localStorage cifrado por tienda).
3. Tests unitarios / integración: libres de editar y agregar.
4. Sin commit / push / PR sin pedido explícito.
5. Código y comentarios en inglés; textos de UI en español (`es.ts`).

---

## 1. Contexto (qué existe hoy)

**Vista**: `/inventory/warehouse-movements` — `app/inventory/routes/warehouse-movements.tsx`
- Historial global agrupado por día (acordeón). Cada movimiento es un card compacto de 3 filas: (1) producto + `(cantidad)` + gear Editar/Eliminar; (2) tipo/importe (Compra + total; salida con ícono `<-`; transferencia/reversa con `⇄`, reversa violeta); (3) ruta (almacén → tienda / almacén → almacén). Badge "Revertido" en las filas revertidas. El gear solo lo ve OwnerAdmin.

**Servicio** (dueño de la lógica): `app/inventory/lib/services/warehouse-offline-service.ts`
- `recordMovement`: registra compra / salida / transferencia con **lotes FIFO exactos** (una tanda por costo; una salida se divide por tanda y genera su entrada espejo en tienda; una transferencia acredita las tandas exactas al destino).
- `reverseMovement`: revierte — compra → devuelve al almacén **solo lo que queda** de sus tandas (si no queda nada → bloquea); salida → restaura la tienda **solo si no fue consumida por ventas** (si lo fue → bloquea) y borra la entrada espejo; transferencia → resta del destino y devuelve al origen. La fila original queda marcada (badge) y se agrega una fila nueva de tipo `reversal`.
- **Editar** (UI): reversa de la fila + recreación con los valores nuevos (dos escrituras; hoy no atómico). La edición de costo aplica **solo a compras**.
- `deactivateWarehouse`, `updateImportedStockLevel` (importación), `addImportedMovement`.
- **Import/Export**: movimientos append-only por id; niveles de stock last-writer-wins; una reversa duplicada se salta en la importación.

**Dominio**: `frontend-react/packages/domain/src/models/warehouse.ts` — lote `{costPrice, quantity}`; fila de reversa con `reversalOfMovementId`.
**Sync**: `app/sync/lib/services/data-synchronizer-service.ts`.
**i18n**: `app/shared/lib/i18n/es.ts` (claves `WAREHOUSES.*`).
**Tests hoy**: unitarios en `app/inventory/**/__tests__/` (+ sync); E2E en `frontend-react/e2e/movement-reversal.spec.ts` (20 casos) y suites de apoyo `warehouse-movements-extended.spec.ts`, `warehouses.spec.ts`.

### Contratos E2E congelados (NO romper)
| Testid / contrato | Restricción |
|---|---|
| `mv-day-panel-toggle-{dayKey}` | Acordeón por día + `aria-expanded` |
| `mv-qty-{id}` | SOLO el número exacto (los paréntesis FUERA del span) |
| `mv-actions-toggle-{id}` | Gear; 0 para StoreUser |
| `mv-edit-{id}` | Abre el modal de edición precargado |
| `mv-revert-{id}` | Confirmación con botones `Si`/`No`; toast `Movimiento revertido.` byte-idéntico |
| `mv-reversal-badge-{id}` | Badge en la fila original revertida |
| Icono violeta | `mv-type-icon-{id}` + `text-violet-600` en la fila de reversa |

---

## 2. Trabajo a realizar

### 2.1 Correcciones (problema actual → fix)

| # | Problema actual | Fix |
|---|-----------------|-----|
| A1 | Editar una compra ya usada precarga la cantidad **original**: al guardar, devuelve lo restante y recrea la cantidad original → **unidades fantasma** (compra 10, quedan 6 → vuelven 10). | El máximo editable = **lo que queda**: el modal precarga el restante, avisa si se intenta más y no permite guardar más. |
| A2 | La reversa de una transferencia puede fallar a mitad (tras mutar) → la instancia queda inconsistente hasta recargar. | **"Todo o nada"**: snapshot del estado en memoria; si algo falla, restaurar y devolver error sin tocar el storage. |
| A3 | El stock devuelto al revertir se agrega al final de la lista de tandas → pasa a ser "lo más nuevo" para el FIFO. | La tanda restaurada vuelve a su **posición original** (por antigüedad). |
| A4 | La reversa de compra ubica la tanda **solo por costo**: con dos compras al mismo costo puede descontar de la otra. | Referencia **`lotOriginMovementId`** (campo opcional) en cada tanda creada por una compra; la reversa restaura esa tanda (fallback por costo para datos antiguos). |
| A5 | Importar un respaldo sobrescribe `onHand`/`costPrice` pero **no copia `lots`** → `onHand ≠ Σ lotes` y el FIFO queda desincronizado. | `updateImportedStockLevel` copia también `lots`. |
| A6 | Una fila `transfer_in` de varias tandas se persiste **sin `costPrice`**. | Persistir el costo exacto ponderado de sus tandas. |
| A7 | Revertir una transferencia antigua (sin costo guardado) puede acreditar stock **valorado en $0**. | Fallback: **costo promedio del nivel** cuando el movimiento no trae costo. |
| A8 | Si editaron la entrada espejo de tienda subiendo la cantidad y se revierte la salida, al almacén solo vuelve la cantidad original → **el excedente desaparece**. | La reversa acredita la **cantidad real de la entrada espejo**; si el estado no permite un reverso exacto → **bloquear** con error claro. |
| A9 | Menores: (a) el contador de importación cuenta como insertados los duplicados saltados; (b) la reversa de una compra antigua usa el costo de la tanda más vieja (no el promedio); (c) el guard de sync no deduplica reversas sin `reversalOfMovementId`; (d) si falla el segundo paso de la edición, el modal se cierra antes de mostrar el error; (e) el aviso de compra parcial no explica el tope. | Corregir los cinco. |
| A10 | Faltan pruebas (detalle en §3 Fase 4). | Agregarlas como pruebas NUEVAS (sin tocar las existentes). |

### 2.2 Decisiones de diseño ratificadas (NO cambiar)

- Compra usada: **revertir solo lo que queda** (no bloquear la reversa completa).
- Transferencias: **una sola fila** (el stock ya se descuenta del origen y se suma al destino).
- **Editar = reversa + recreación** (sin modelo de ediciones por diferencia).
- **Motivo opcional**: no se exige ni se pide en la UI.
- **Costo exacto por tanda** (sin promedios para las salidas).
- Reversa de salidas multi-tanda: **fila por fila**.
- Fuera de alcance: devoluciones de ventas al almacén.

### 2.3 Edición de costo de compras + propagación

- Editar el costo aplica **solo a compras** (como hoy).
- Si la compra ya tiene unidades vendidas en tiendas, al editar el costo: **validar** qué quedó afectado, **avisar** (confirmación con detalle) y **actualizar** el costo en:
  (a) **las ventas ya hechas** que usaron esas unidades, y
  (b) **el stock que sigue en tienda** proveniente de esa compra,
  para que todo cuadre en adelante.
- **Mini-diseño previo obligatorio** (documentar antes de implementar): el vínculo venta ↔ entrada de tienda ↔ compra, apoyándose en A4 (`lotOriginMovementId`) y en los campos existentes de la salida (`inventoryEntryId` / `reversalInventoryEntryId`); revisar el snapshot de costos de las órdenes en el servicio offline de órdenes (`order-offline-service`).

---

## 3. Fases de implementación

### Fase 1 — Integridad del servicio (A2–A8, A9a–c)
**Archivos**: `warehouse-offline-service.ts`, `packages/domain/src/models/warehouse.ts`, errores de almacén si hace falta; tests unitarios de servicio/dominio.
1. **A2**: "todo o nada" en la reversa de transferencia (snapshot/rollback en memoria; storage intacto al fallar).
2. **A3**: la tanda restaurada conserva su posición FIFO original.
3. **A4**: `lotOriginMovementId` (opcional) + localización por referencia (fallback por costo). Compatible con datos viejos, import/export y sync.
4. **A5**: el import de niveles copia `lots` (mantiene `onHand == Σ lotes`).
5. **A6**: `transfer_in` de varias tandas persiste su costo ponderado.
6. **A7**: fallback a costo promedio cuando el movimiento no trae costo.
7. **A8**: la reversa de salida acredita la cantidad real de la entrada espejo; bloquear con error claro si no cuadra (estudiar antes el ciclo de vida de las entradas de tienda y su edición por CRUD).
8. **A9a–c**: contador de importación; costo promedio en compra antigua; guard de sync.
**Criterio**: suite unitaria completa verde + tests nuevos por cada punto (incluye ruta de fallo de A2).

### Fase 2 — UI (A1, A9d–e)
**Archivos**: `warehouse-movements.tsx`, `warehouse-movement-modal.tsx`, `es.ts`, tests de UI.
1. **A1**: tope de edición = lo que queda (precarga del restante; aviso claro; guardado bloqueado si excede).
2. **A9d**: mostrar el error del segundo paso ANTES de cerrar el modal.
3. **A9e**: mensaje claro de edición parcial ("solo hasta lo que queda").
**Criterio**: tests de UI verdes; contratos E2E de §1 intactos.

### Fase 3 — Propagación de costo (B7 de §2.3)
1. Mini-diseño documentado del vínculo (ver §2.3).
2. Implementar: validación + aviso + actualización (ventas ya hechas + stock en tienda).
3. Pruebas: unit + **E2E NUEVO** (flujo completo: compra → salida a tienda → venta → editar costo → verificar que la venta y el stock en tienda muestran el costo nuevo).
**Criterio**: flujo completo verificado; sin regresiones en ventas/reportes.

### Fase 4 — Pruebas faltantes (A10)
Pruebas NUEVAS (sin modificar las existentes):
- **E2E nuevos**: E-R7b (editar una transferencia cuando el destino ya no tiene stock → la reversa falla con error de stock insuficiente), E-R13 (reversa duplicada por import → skip silencioso, sin duplicado), E-R15 (reversa con almacén desactivado involucrado → error de almacén no activo), E-R16 (i18n: sin claves crudas visibles en la UI).
- **Unitarios/integración nuevos**: U-S14 (persistencia: reversa + niveles/tandas re-persistidos, cifrado intacto), U-S19 (aislamiento por tienda: reversas de una tienda no aparecen en otra), U-M8 (acordeón por día con muchas reversas intercaladas), U-C1 (el modal de edición precarga valores del original por tipo), U-C2 (la validación por tipo reutiliza el validador existente), I-3f (ganancia multi-tanda: salida de 15 hecha de 10@$5 + 5@$10 → venta de 12 → el FIFO consume 10@$5 + 2@$10 → ganancia con DOS tramos en `productCosts`), I-4 (export→import con reversa: id-presencia + niveles last-writer-wins), I-4c (movimiento nuevo en el destino entre la reversa y la importación → el nivel adopta el del origen), I-4e (import en otra tienda → las reversas no cruzan tiendas), I-5 (reversa de salida cuya entrada fue editada por el CRUD → la huella no coincide → error de entrada no encontrada).
- Nota: el helper `applyReversal` (diseño descartado) no aplica — el delta por tipo ya quedó cubierto a nivel de servicio.

### Fase 5 — Verificación final y cierre
1. `pnpm vitest run` (app completa), `pnpm typecheck`, `pnpm lint` — verdes.
2. E2E: ejecutar solo si el entorno está disponible (dev server + backend + PostgreSQL + personas sembradas); verificar antes de prometer corridas.
3. Confirmar que los E2E nuevos no tocan specs existentes.
4. Commits por unidad de trabajo (sin push sin pedido).

---

## 4. Comandos y notas

- Workdir app: `frontend-react/apps/web-store-pos`
  - `pnpm vitest run app/inventory` · `pnpm test` · `pnpm typecheck` · `pnpm lint`
- E2E: `pnpm test:e2e` (requiere entorno completo).
- No correr `prettier --write` global (la base del repo no está 100 % limpia; el lint no lo exige).
- Datos persistidos compatibles: los campos nuevos son **opcionales**; los datos viejos siguen funcionando con fallbacks.
