# ODD: propagación del costo de una entrada y candado del costo de almacén

**Feature**: `entry-cost-edit-propagation`
**Fecha de apertura**: 2026-09-23
**Alcance**: frontend únicamente (`frontend-react/apps/web-store-pos` + `frontend-react/packages/domain`). Backend `backend/**` **intocable / fuera de scope**.
**Working tree**: `D:\Projects\AutoBusinessPro\Store\test-env\store-mgmt`
**Idioma**: prosa en español; identificadores, claves i18n y comentarios de código en inglés.
**Estado**: PLANIFICADO — todas las decisiones de producto cerradas (ver §9). Pendiente de inicio de implementación.

---

## 1. Objetivo

Que el costo de una **entrada de inventario** sea consistente en todo el sistema:

1. Una entrada que **vino del almacén** no se puede editar en la tienda: el modal muestra el
   **Costo deshabilitado** con un mensaje que indica que ese costo se actualiza en la entrada del
   almacén, y no permite guardar cambios desde la tienda.
2. Cuando el costo de una entrada **sí cambia**, las **ventas ya registradas** que consumieron esa
   entrada deben reflejar el costo nuevo (su ganancia deja de estar congelada en el costo viejo).
3. Esa corrección debe **viajar por import/export**, de modo que otro dispositivo que ya tiene la
   orden no se quede con el costo viejo.

---

## 2. Problema (explicación simple para el usuario)

Cuando vendes un producto, el sistema guarda una **foto del costo** de la entrada que se consumió
(el "snapshot"). Los reportes y las estadísticas de ganancia calculan con esa foto, no con el costo
actual:

```
ganancia = precio × cantidad − Σ(costo_snapshot × cantidad)
```

Consecuencias reales:

- Si a una entrada se le pone por error **costo = precio de venta**, todas las ventas que consumieron
  esa entrada muestran **ganancia 0 y margen 0** — y seguirán mostrándolo aunque después corrijas el
  costo de la entrada.
- Si corriges el costo **en el almacén**, la corrección **sí** llega a las ventas del dispositivo
  actual (ya existe). Pero si **exportas/importas** el respaldo, en el **otro dispositivo** las
  órdenes que ya tenía **no se actualizan**: se quedan con el costo viejo (`updateImportedOrder`
  solo mezcla `date/isActive/updatedDate/updatedByName`).
- Una entrada que **vino del almacén** no debería poder corregirse en la tienda: el costo lo manda
  el movimiento de salida del almacén. Hoy la edición se rechaza por completo con un mensaje
  genérico, sin explicarle al usuario **dónde** se corrige.

## 3. Propuesta de solución

1. **Candado claro en tienda**: en el modal de edición, si la entrada trae
   `warehouseSaleOutMovementId`, el campo **Costo** se renderiza deshabilitado y se muestra el
   mensaje «El costo de esta entrada se actualiza en el almacén (así no se desincroniza).». El resto
   de campos queda igual de sellado que hoy y no se permite guardar desde tienda. El guard del
   servicio se mantiene como segunda línea de defensa.
2. **Propagación uniforme**: que **todo** camino que cambie el costo de una entrada propague a
   `orderItem.productCosts` de las órdenes que la referencian (reutilizando el seam existente).
3. **Import/export transporta la corrección**: al importar, propagar `costPrice` a las entradas que
   ya existen y `productCosts` a las órdenes que ya existen.

---

## 4. Estado actual (evidencia file:line)

| # | Hecho | Evidencia |
|---|---|---|
| 1 | La venta guarda el snapshot del costo por entrada consumida | `sales/lib/services/order-offline-service.ts:470-505` (`productCosts`), `inventory/lib/services/inventory-offline-service.ts:443-487` (`getAvailableInventoryCosts`) |
| 2 | La ganancia se calcula **solo** del snapshot | `inventory/lib/profit-calculator.ts:19-27` |
| 3 | Entradas de almacén ya se **rechazan enteras** (cantidad y costo) | `inventory-offline-service.ts:671-675` y `:843-847`; error `Inventory.WarehouseEntryNotEditable` (`packages/domain/src/errors/inventory-errors.ts:26-30`) |
| 4 | El modal hoy **no sabe** si la entrada es de almacén (el route descarta la bandera) | `inventory/routes/today-entries.tsx:62-91` — `handleEdit` reconstruye un `InventoryEntry` **sin** `warehouseSaleOutMovementId` |
| 5 | El route de tienda **no propaga** | `inventory/routes/today-entries.tsx:143-163` (`handleSave` → `svc.update(...)`, sin llamada al seam) |
| 6 | El seam de propagación existe y **solo lo usa almacén** | `order-offline-service.ts:678-705` (`updateProductCostsByInventoryIds`); único llamador `warehouse-offline-service.ts:1111-1115` |
| 7 | El **export SÍ incluye** `productCosts` (orden completa serializada) | `sync/lib/services/data-serializer-service.ts:359` (`JSON.stringify(getStorageOrders())`) |
| 8 | El **import de orden nueva** conserva `productCosts` | `order-offline-service.ts:641-646` (`addImportedOrder`, spread completo) |
| 9 | El **import de orden existente NO** toca `productCosts` | `order-offline-service.ts:655-665` (merge de 4 campos) |
| 10 | El **import de entradas NO** toca `costPrice` | `inventory-offline-service.ts:984-1004` (merge de 4 campos) |
| 11 | El backend **no tiene** endpoints de órdenes ni de inventario | `SMCA.WebApi/Controllers/v1/**` (solo `Products`, `ProductCategories`) |
| 12 | Las órdenes desactivadas se excluyen a propósito | `order-offline-service.ts:669-673`; decisión ratificada #2 del doc previo |

**Diseño previo relacionado**: `odd/tasks/warehouse-cost-propagation-design.md` (feature
`warehouse-movements-fases-3-5`, Fase 3). Su **decisión ratificada #3 (2026-09-20)** era
*local-only: la corrección NO viaja por import/export*. **Este documento revierte esa decisión**
por pedido explícito del usuario (2026-09-23). El doc previo **no se reescribe**: es registro
histórico; la reversión queda registrada aquí con fecha.

---

## 5. Decisiones ratificadas por el usuario (2026-09-23)

1. **Entrada de almacén en tienda** → **bloquear solo el Costo** mostrando un mensaje, y **solo el
   mensaje**: producto/cantidad siguen sellados como hoy y **no se permite guardar** cambios desde
   tienda. (Sin desincronizar el movimiento del almacén.)
2. **Alcance de la propagación** → **tienda + almacén + import/export**.
3. **Órdenes desactivadas** → **se excluyen** (se mantiene la decisión #2 del 2026-09-20: solo las
   activas reciben el costo nuevo).
4. **Backend** → **fuera de scope**. No se crean endpoints.
5. **E2E** → **solo frontend (Playwright)**. Los specs existentes y sus support files son
   **intocables** (ver §8). Solo se **agregan** specs nuevos.

---

## 6. Scope

### Dentro
- `packages/domain/src/errors/inventory-errors.ts` — (si hace falta) mensaje accionable.
- `app/inventory/lib/services/inventory-offline-service.ts` — merge de `costPrice` en
  `updateImportedEntries`; propagación en el camino de edición de tienda.
- `app/sales/lib/services/order-offline-service.ts` — `updateImportedOrder` propaga `productCosts`.
- `app/inventory/components/edit-inventory-entry-modal.tsx` — Costo deshabilitado + mensaje.
- `app/inventory/routes/today-entries.tsx` — pasar la bandera real al modal y coordinar la propagación.
- `app/shared/lib/i18n/es.ts` (y locales pares si existen) — claves nuevas.
- Tests unitarios (vitest) y **nuevos** specs E2E (Playwright).

### Fuera
- `backend/**` (intocable).
- `frontend/**` (Angular legacy — intocable).
- Specs E2E existentes y sus `support/*` (intocables sin autorización explícita).
- Órdenes desactivadas (no reciben la corrección).
- Cambios de `quantity` en `productCosts` (solo se corrige `costPrice`).

---

## 7. Tareas

Regla de rutas: `inline` = cambio mecánico ya entendido; `delegated` = 2+ archivos no triviales o
lectura previa de 4+ archivos. La evidencia del disparador queda anotada.

### T1 — Modal: candado de Costo para entradas de almacén
- **Ruta**: delegated (toca modal + route + i18n; requiere explorar cómo se pasa el entry).
- **Qué**: `edit-inventory-entry-modal.tsx` recibe la entrada real (con la bandera). Si
  `warehouseSaleOutMovementId` está presente: campo **Costo deshabilitado**, mensaje i18n visible y
  botón Guardar deshabilitado/no-op. `today-entries.tsx:handleEdit` deja de descartar la bandera.
  El guard del servicio (`update()`) se mantiene.
- **Aceptación**: con entrada de almacén, el costo no es editable, el mensaje aparece y no se guarda
  nada; con entrada normal, el modal se comporta igual que hoy.
- **Checks**: unit del modal (render/disabled/no-op) + unit de `today-entries` (bandera preservada).

### T2 — Propagación en la edición de tienda
- **Ruta**: delegated (servicio + route; requisito de diseño sobre dónde orquestar).
- **Qué**: tras un `update()` exitoso de una entrada editable (sin ventas), propagar el costo nuevo
  a `orderItem.productCosts` que referencien esa entrada, reutilizando
  `updateProductCostsByInventoryIds`. En la práctica suele ser **no-op** (el guard `isNotSoldEntry`
  exige `quantity === available`), pero el contrato queda uniforme y cubre casos de órdenes
  desactivadas/reactivadas. Si el service no debe conocer órdenes, orquestar en el route con un
  puerto mínimo (mismo patrón que `PurchaseCostOrderPort`).
- **Decisión de diseño a tomar en implementación**: puerto inyectado en el servicio vs. coordinación
  en el route. Se elige la opción con menor acoplamiento y se documenta en el PR/tarea.
- **Aceptación**: corregir el costo de una entrada editable deja cualquier línea de `productCosts`
  que la referencia en el valor nuevo; no toca `quantity` ni líneas ajenas.
- **Checks**: unit (seam ya pineado en `order-offline-service.test.ts:1663+` — solo se agrega el caso
  de llamada desde tienda).

### T3 — Import/export transporta la corrección de costo
- **Ruta**: delegated (serializer/synchronizer + 2 servicios; 4+ archivos de contexto).
- **Qué**:
  - `inventory-offline-service.ts` → `updateImportedEntries`: además de
    `available/isActive/updatedDate/updatedByName`, mergear **`costPrice`** cuando el importado lo
    traiga. (La moneda **no** se mergea: la corrección de almacén tampoco la cambia —
    `updateWarehouseOriginEntryCost` la preserva. Se documenta la exclusión.)
  - `order-offline-service.ts` → `updateImportedOrder`: además del merge estrecho actual, reemplazar
    `orderItems[i].productCosts` por el del orden importada (emparejando `orderItems` por
    `productId`; los ítems de una orden son inmutables). Solo `productCosts`; el resto sigue con el
    merge estrecho.
- **Aceptación**: exportar en el dispositivo A tras corregir, e importar en un dispositivo B que ya
  tenía la orden, deja `productCosts` con el costo corregido en B; sin `productCosts` en el import,
  el valor local no se borra.
- **Checks**: unit de `updateImportedEntries` (costPrice sí/no viaja) y de `updateImportedOrder`
  (productCosts viaja; resto del merge intacto); los tests actuales de sync deben seguir verdes.
- **Decisión aplicada**: §9 (a) — último import gana.

### T4 — E2E nuevas (Playwright) — solo agregar
- **Ruta**: delegated (spec nueva + posible support nuevo).
- **Qué**: specs nuevos descritos en §8.3. Ningún spec existente se modifica.
- **Checks**: `pnpm test:e2e` en verde con el backend `http-e2e` levantado.

### T5 — Cierre documental
- **Ruta**: inline.
- **Qué**: registrar en este doc la reversión de la decisión #3 del 2026-09-20 (ya anotada en §4),
  evidencia de commits y checks observados. **No** reescribir el doc previo.

---

## 8. Plan de pruebas

Regla dura (AGENTS.md): **no modificar, borrar, renombrar ni «arreglar» specs E2E existentes ni sus
support files**. Solo **agregar**. Tocar algo existente requiere autorización explícita del usuario.

### 8.1 Unitarias (vitest)
- Modal: entrada de almacén → costo deshabilitado + mensaje + guardar no-op; entrada normal → sin cambios.
- `today-entries`: la bandera `warehouseSaleOutMovementId` llega al modal (hoy se pierde).
- `updateImportedEntries`: mergea `costPrice`; no borra el local si el importado no lo trae.
- `updateImportedOrder`: mergea `productCosts`; conserva el merge estrecho de los otros 4 campos.
- Propaga desde el camino de tienda: solo las líneas que referencian la entrada; `quantity` intacta.

### 8.2 E2E existentes que deben seguir verdes (no se tocan)
- `warehouse-cost-propagation.spec.ts` (E-CP-1/2) — propagación por edición de compra.
- `warehouse-movement-edit-cap.spec.ts` (E-UI-3) y `movement-reversal.spec.ts` (E-R5/E-R6).
- `inventory-entry.spec.ts`, `inventory-profit.spec.ts`, `sync-roundtrip.spec.ts`,
  `data-export.spec.ts`, `data-import.spec.ts`.

### 8.3 E2E NUEVAS (archivos nuevos)

Cada una con: **qué prueba**, **problema (simple)**, **solución**.

**E2E-1 — `entry-cost-guard.spec.ts`**
- **Qué prueba**: que al abrir la edición de una entrada originada por una salida de almacén, el
  campo Costo está **deshabilitado**, se muestra el mensaje de que se corrige en el almacén, y no se
  puede guardar desde tienda.
- **Problema**: «Si intento corregir en la tienda el costo de una entrada que se gestiona en el
  almacén, mi cambio se rechaza con un mensaje que no me dice dónde corregirlo.»
- **Solución**: bloquear el costo y decir explícitamente que se actualiza en la entrada del almacén.
- **Flujo**: features (Warehouses 36 / Entries 31 / Movements 37) → crear almacén → `purchaseIn` →
  `saleOut` a tienda (entrada espejo) → abrir hoy entradas → editar esa entrada → verificar costo
  deshabilitado + mensaje + guardar sin efecto.

**E2E-2 — `entry-cost-propagation.spec.ts`**
- **Qué prueba**: que al corregir el costo de una **entrada de tienda normal** (sin ventas), la
  valoración de inventario y futuras ventas usan el costo nuevo, y que no se corrompe el snapshot
  ajeno.
- **Problema**: «Cambio el costo de una entrada y necesito saber si mis ganancias ya calculadas
  quedan bien o mal.»
- **Solución**: el snapshot solo cambia cuando corresponde; el costo vivo de la entrada se refleja
  al instante.
- **Flujo**: crear entrada @ $50 → verificar valoración con $50 → editar a $70 → verificar valoración
  con $70 (guardado directo, sin diálogo).

**E2E-3 — `entry-cost-sync-roundtrip.spec.ts`** (el caso que te preocupaba)
- **Qué prueba**: que una orden **ya existente en otro dispositivo** recibe el costo corregido tras
  un **export → import**.
- **Problema**: «Corrijo el costo de una venta en un dispositivo, exporto el respaldo, y en el otro
  dispositivo esa venta sigue mostrando la ganancia vieja.»
- **Solución**: que el import actualice `productCosts` de las órdenes ya existentes.
- **Flujo (dos contextos de navegador)**: contexto A crea venta con costo viejo → exporta → contexto
  A corrige (almacén, ya soportado) → exporta de nuevo → contexto B, que ya tenía la orden, importa →
  verificar que la venta muestra el costo/ganancia corregidos.

---

## 9. Decisión ratificada: conflicto de importación (2026-09-23)

**Conflicto de importación (last-write-wins).** Al hacer que `updateImportedOrder` propague
`productCosts`, si el dispositivo B ya corrigió el costo y luego importa un ZIP **más viejo** de A,
la orden de B **retrocede** al costo viejo.

- ✅ **Ratificado (usuario, 2026-09-23): (a) Último import gana.** El ZIP es la fuente de verdad:
  `productCosts` se aplica siempre al importar. Riesgo aceptado y documentado: un ZIP viejo
  retrocede el costo. Mitigación operativa: exportar después de corregir.
- (b) No retroceder — descartada (requeriría `updatedDate` por línea en `productCosts`, hoy inexistente).
- (c) Descartar la propagación en import — descartada.

**T3 queda desbloqueada.**

---

## 10. Estimación y estrategia de entrega

- **Forecast** (líneas de autor, incluye tests): **~450–650**. Supera el presupuesto de ~400.
- **Estrategia de entrega**: **sin PR** — el usuario pidió solo commits en la rama actual (`test`).
  Se trabaja task-by-task con commits de unidad de trabajo (Conventional Commits). No hay estrategia
  de cadena. La revisión de riesgo `ask-on-risk` queda sin efecto al no haber PR.
- **TDD**: no hay configuración explícita de TDD habilitada en el proyecto; se resuelve como
  **modo estándar** (tests nuevos junto al código, checks funcionales por tarea: `pnpm turbo run
  typecheck lint test` + Playwright). Si el usuario habilita TDD estricto, se ajusta antes de T1.

---

## 11. Checks aplicables (del README raíz)

```bash
# Backend (solo para no romper; no se toca código)
dotnet test backend/src/SMCA.sln

# Frontend: checks + unit
cd frontend-react && pnpm turbo run typecheck lint test

# E2E (terminal aparte desde la raíz):
dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e
# en frontend-react/:
pnpm test:e2e
```

Specs E2E nuevas se corren individualmente durante desarrollo:
`pnpm exec playwright test e2e/<archivo>.spec.ts`.

---

## 12. Criterios de aceptación

1. Una entrada con `warehouseSaleOutMovementId` **no** permite editar el Costo en tienda; se muestra
   el mensaje que indica actualizarlo en el almacén; el guardado desde tienda no tiene efecto.
2. Una entrada normal sigue editándose igual que hoy.
3. Corregir el costo de una entrada propaga a las líneas `productCosts` que la referencian (solo
   `costPrice`, solo órdenes activas).
4. Tras export→import en un segundo dispositivo que ya tenía la orden, `productCosts` refleja el
   costo del ZIP (decisión §9a: último import gana).
5. `updateImportedEntries` propaga `costPrice` sin borrar el valor local cuando el importado no lo trae.
6. Ningún spec E2E existente ni support file fue modificado.
7. `pnpm turbo run typecheck lint test` y `pnpm test:e2e` en verde.

---

## 13. Progreso

- [x] T1 — Candado de Costo en modal (`38a8d84`) — verificado: `inventory-components` + `inventory-routes` = 106 tests, sin type errors.
- [ ] T2 — Propagación en edición de tienda (pendiente)
- [ ] T3 — Import/export propaga el costo (desbloqueada; decisión §9a aplicada)
- [ ] T4 — E2E nuevas (pendiente)
- [ ] T5 — Cierre documental (pendiente)

**Notas de T1**:
- `getActiveInventoryEntriesStorage()` proyecta a `InventoryEntryView` y **descarta**
  `warehouseSaleOutMovementId`; el route ahora lee la entrada completa desde
  `getStorageInventoriesMap()` para preservar el sello. Hallazgo relevante para T4.
- Fallo preexistente (no introducido por T1, confirmado con árbol limpio): test de
  `sales-routes.test.tsx` (`SaleCreditsPage … has no date-range or paid/unpaid filters`).
- RDD está en **on** (global); la revisión nativa de OpenCode V2 no está disponible por contrato,
  no se inició ningún lifecycle de review.

## 14. Próximo paso

Iniciar **T2** (propagación en la edición de tienda) en la misma rama `test`. Sin PR:
el usuario pidió solo commits en esta rama.
