# ODD: snapshot completo de toda venta guardada

**Feature**: `sale-snapshot-completeness`
**Fecha de apertura**: 2026-10-06
**Alcance**: `frontend-react/**` únicamente. Backend `backend/**` **fuera de scope**. El angular legacy `frontend/**` es intocable y no se lee.
**Idioma**: prosa en español; identificadores, claves y comentarios de código en inglés.
**Estado**: PLANIFICADO — decisiones de producto cerradas por el usuario (ver §6). Pendiente de implementación.

---

## 1. Objetivo

Que **toda orden guardada** en `localStorage` lleve el snapshot completo de la operación, de modo que
los reportes y estadísticas puedan reconstruir exactamente el estado en que estaban las cosas en el
momento de la venta:

1. **Precio** en su moneda original **y** en la moneda de venta, con **la tasa que se usó** para
   convertir.
2. **Costo** con su moneda.
3. **Canal de pago** con su moneda y **la tasa de cada conversión que ocurrió**, en ambas
   direcciones (origen y destino).
4. El **id de la fila de tasa** aplicada.
5. **Descuentos/recargos** (`percent`/`tax`) tal como quedan hoy.
6. **Escalón mayorista** aplicado.
7. **Quién** vendió (nombre e id), **a qué tienda**, **a qué cliente**, **con cuánto pagó** y **el
   vuelto**.

## 2. Problema

Hoy el snapshot es **parcial**. Verificado en código:

| Hueco | Evidencia |
|---|---|
| El precio original del producto y su moneda se pierden al convertir la línea | `cart-shell.tsx:570-578` sobrescribe `price` y fuerza `product.currency = saleCurrency` |
| La tasa de la conversión de línea no se guarda | `cart-line-conversion.ts:61` devuelve solo `convertedUnitPrice` y `total` |
| La tasa **destino** del pago no se guarda | `multi-payment-settlement.ts:72-75` solo resuelve la moneda origen |
| El id de la fila de tasa no se guarda | `ResolvedChannelRate.id` existe (`channel-conversion.ts:37`) y no se persiste |
| El escalón mayorista solo deja el precio final | `order-offline-service.ts:421` guarda `price` y `quantity`, nada más |
| Sin módulo MultiPayments no hay `payments[]` | `order-offline-service.ts:486` solo lo escribe si hay multi-pago |
| El cliente se pierde en ventas de contado | `order-offline-service.ts:474` — `details \|\| (isCredit ? client : '')` |
| El vuelto y "con cuánto pagó" solo se muestran | `cart-shell.tsx:323` |
| Solo se guarda el nombre de quien vendió, no el id | `order-offline-service.ts:488` |
| La orden no lleva `storeId` explícito | `models/order.ts:22-50` |

**Ejemplo concreto**: producto a **10 USD**, venta en **CUP**, tasa USD→CUP **720**. Hoy se guarda
`price: 7200, currency: CUP`. Se pierde que eran 10 USD y que la tasa era 720. Si el cliente paga en
CUP (misma moneda que la venta), el pago queda con `rateApplied: 1` y sin provenance → **no hay
rastro de la tasa 720 en toda la orden**.

## 3. Reglas de negocio (fijadas por el usuario)

- Scope es **solo `localStorage` del dispositivo**. No entra base de datos ni servidor.
- **Sin MultiMonedas**: moneda = **CUP** y tasa = **1x1**.
- Monedas distintas **solo** existen con MultiMonedas activo, donde las tasas existen y funcionan.
  El bloqueo por `RateNotFound` **sigue vigente** en ese caso — no se convierte en un 1x1 silencioso.
- Si el producto **no descuenta de inventario**, el costo es **0**.
- **Ninguna** de las 11 mejoras cambia lógica de negocio: solo agregan datos.
- `percent`/`tax` **se mantienen como están hoy** (0 en multi-pago). No se toca.

## 4. Diseño

### 4.1 Modelos (`frontend-react/packages/domain/src/models`)

**`order.ts` → `OrderItem`** agrega:

| Campo | Tipo | Semántica |
|---|---|---|
| `originalPrice` | `number?` | Precio en la moneda **original** del producto, antes de convertir. Ausente = igual a `price`. |
| `originalCurrency` | `Currency?` | Moneda de `originalPrice`. Ausente = igual a `currency`. |
| `conversionRate` | `number \| null?` | Tasa usada para convertir (moneda-por-USD de la moneda **original**). `1` cuando no hubo conversión. |
| `conversionRateId` | `string \| null?` | Id de la fila de `ChannelRate` usada. |
| `conversionRateEffectiveFrom` | `Date \| null?` | Momento desde el que aplicaba esa tasa. |
| `wholesalePackSize` | `number \| null?` | Unidades por paquete del escalón aplicado. |
| `wholesalePacks` | `number \| null?` | Paquetes vendidos (`quantity / packSize`). |
| `wholesaleTierMinPacks` | `number \| null?` | `minPacks` del escalón aplicado. |
| `wholesaleTierUnitPrice` | `number \| null?` | `pricePerUnit` del escalón aplicado. |

**`order.ts` → `Order`** agrega:

| Campo | Tipo | Semántica |
|---|---|---|
| `storeId` | `string?` | Tienda de la venta (hoy implícita en la clave de almacenamiento). |
| `createdById` | `string?` | `userId` de quien registró la venta. |
| `client` | `string?` | Nombre del cliente (hoy solo en `description` y solo si es crédito). |
| `tenderedAmount` | `number?` | Con cuánto pagó el cliente (efectivo). |
| `change` | `number?` | Vuelto entregado. |
| `saleCurrencyRateApplied` | `number \| null?` | Tasa de la **moneda de venta** en ese momento (moneda-por-USD). `1` sin MultiMonedas. |
| `saleCurrencyRateId` | `string \| null?` | Id de la fila de tasa de la moneda de venta. |
| `saleCurrencyRateEffectiveFrom` | `Date \| null?` | Momento desde el que aplicaba. |

**`order-payment.ts` → `OrderPayment`** agrega:

| Campo | Tipo | Semántica |
|---|---|---|
| `rateId` | `string \| null?` | Id de la fila de tasa **origen** (complementa `rateApplied`/`rateMethod`/`rateCurrency`/`rateEffectiveFrom`). |
| `targetRateApplied` | `number \| null?` | Tasa de la moneda **destino** (la de la venta). `1` cuando no hubo conversión. |
| `targetRateId` | `string \| null?` | Id de la fila de tasa destino. |
| `targetRateEffectiveFrom` | `Date \| null?` | Momento desde el que aplicaba. |

> Todos los campos nuevos son **opcionales**: las órdenes ya guardadas siguen leyéndose sin backfill
> obligatorio en el archivo (ver §4.4).

### 4.2 Conversión de líneas (`multi-payments`)

`cart-line-conversion.ts`:
- `CartLineConversion` agrega `originalUnitPrice`, `originalCurrency`, `conversionRate`,
  `conversionRateId`, `conversionRateEffectiveFrom`.
- La tasa se resuelve con `resolveCurrencyRate(rates, fromCurrency, at)` — la misma cascada que ya
  usa `convertLineAmount` internamente, en el mismo instante, así que el resultado no puede diferir.
- Cuando `fromCurrency === saleCurrency` → `conversionRate = 1`, sin id ni fecha.
- `CartConversionResult` agrega `saleCurrencyRate` (`{ value, id, effectiveFrom } | null`) — la tasa
  de la moneda de venta, compartida por todas las líneas.

`multi-payment-settlement.ts`:
- Resolver también la tasa **destino** con `resolveCurrencyRate(rates, orderCurrency, at)` y persistir
  `targetRateApplied` / `targetRateId` / `targetRateEffectiveFrom`.
- Persistir `rate.id` como `rateId` (origen).
- Mismo-cuenta: `rateApplied = 1`, `targetRateApplied = 1`, sin provenance.

### 4.3 `order-offline-service.ts`

- `createOrder` recibe una **9ª param opcional** con el snapshot por línea (alineado por índice) y el
  snapshot de la moneda de venta. Sin ese param, todo funciona exactamente como hoy.
- **`payments[]` siempre**: si no llega una lista no vacía, se construye **una fila** con
  `method = salePaymentMethod`, `currency = orderCurrency`, `amount = orderTotal`,
  `amountInOrderCurrency = orderTotal`, `rateApplied = 1`, `targetRateApplied = 1`, sin provenance.
- Sella `storeId`, `createdById` (`user.userId`), `client`, `tenderedAmount`, `change`,
  `saleCurrencyRate*`.
- Sella en cada ítem `originalPrice`, `originalCurrency`, `conversionRate*` y el escalón mayorista
  (`wholesalePackSize`/`wholesalePacks`/`wholesaleTierMinPacks`/`wholesaleTierUnitPrice`) derivado de
  `quantity` y `getWholesaleConfig(product)` cuando `type === OrderType.Mayorista`.
- Si un producto **no descuenta de inventario**, `productCosts` queda `[]` — el costo es 0 y así lo
  calcula ya `calculateOrderProfit` (`profit-calculator.ts:21-23`). **No se inventa** una fila con
  `inventoryId` falso.

### 4.4 Lectura y backfill (`reviveAndBackfillOrder`)

- Revive a `Date` los campos nuevos que son fecha (`conversionRateEffectiveFrom`,
  `saleCurrencyRateEffectiveFrom`, `targetRateEffectiveFrom`) y los ya existentes (`rateEffectiveFrom`).
- Rellena defaults en órdenes viejas: `originalPrice = price`, `originalCurrency = currency`,
  `conversionRate = 1`, `saleCurrencyRateApplied = 1`, sin ids ni fechas.
- El resultado rellenado **se persiste** (decisión del usuario: *"se salvan así mismo"*). No hay datos
  en producción, así que el riesgo es nulo.

### 4.5 `cart-shell.tsx`

- Pasa `lineConversion.lines`, el snapshot de la moneda de venta, `payment` (con cuánto pagó),
  `paymentReturn` (vuelto), `clientName` y el `storeId` al `createOrder`.

## 5. Tareas

| ID | Tarea | Archivos | Verificación |
|---|---|---|---|
| T1 | Campos nuevos en los modelos de dominio | `packages/domain/src/models/order.ts`, `order-payment.ts` | `pnpm --filter @store-mgmt/domain test` + `typecheck` |
| T2 | `settleMultiPayments` persiste tasa destino e ids | `shared/components/multipayments/multi-payment-settlement.ts` | tests del archivo |
| T3 | `convertCartLines` expone la tasa usada y el precio original | `shared/components/multipayments/cart-line-conversion.ts` | tests del archivo |
| T4 | `createOrder` sella todo el snapshot y `payments[]` siempre | `sales/lib/services/order-offline-service.ts` | tests del archivo |
| T5 | Backfill + revive de los campos nuevos | `sales/lib/services/order-offline-service.ts` | tests del archivo |
| T6 | `cart-shell` pasa los datos al servicio | `shared/components/cart-shell.tsx` | tests del archivo |
| T7 | Actualizar los E2E existentes afectados | `e2e/*.spec.ts` | **NO se ejecutan** (autorización expresa del usuario) |

**Checks de cierre**: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest) en `frontend-react`.

## 6. Rutas y decisiones aceptadas

- **Ruta**: `delegated direct` (1 writer) — 5+ archivos no triviales con acoplamiento fuerte.
- **TDD**: aplica (hay suite vitest determinista). RED → GREEN por tarea.
- **E2E**: el usuario **autorizó explícitamente actualizarlos** (excepción puntual a la regla de
  intocabilidad) y ordenó **no ejecutarlos**.
- **Costo 0 sin inventario**: se deja `productCosts: []` (ya equivale a costo 0). No se sintetiza una
  fila con `inventoryId` inventado.
- **Descuentos**: sin cambios; `percent`/`tax` se mantienen como hoy.

## 7. Progreso

- [x] T1 — campos nuevos en los modelos de dominio · `0a429c30`
- [x] T2 — `settleMultiPayments`: tasa destino + ids · `7dc63149`
- [x] T3 — `convertCartLines`: tasa usada + precio original · `509dce3f`
- [x] T4 — `createOrder`: snapshot completo + `payments[]` siempre · `feb0a8fe`
- [x] T5 — backfill + revive · `1d162e36`
- [x] T6 — `cart-shell` cablea los datos · `4b89ace5`
- [x] T7 — E2E: **no-op justificado** (ver §8.3); ningún E2E ejecutado

## 8. Evidencia de verificación

### 8.1 Comandos (desde `frontend-react/`)

| Comando | Resultado observado |
|---|---|
| `pnpm --filter @store-mgmt/domain test` | 23 files, **222 passed** |
| `pnpm --filter @store-mgmt/web-store-pos test` | 345 files, **5073 passed, 0 failed** |
| `pnpm --filter @store-mgmt/domain typecheck` | passed |
| `pnpm --filter @store-mgmt/web-store-pos typecheck` | passed |
| `pnpm --filter @store-mgmt/domain lint` | passed |
| `pnpm --filter @store-mgmt/web-store-pos lint` | passed |
| spot check del orquestador: 3 suites de `order-offline-service` | **149 passed** |

**Baseline vs final**: baseline `5056 passed / 1 failed` (`sync-routes.test.tsx`, timeout flaky) → final
`5073 passed / 0 failed`. **0 fallos nuevos.** El delta +16 tests son exactamente los 4 archivos nuevos.

### 8.2 TDD (RED → GREEN)

| Tarea | RED | GREEN |
|---|---|---|
| T2 | `multi-payment-settlement.test.ts` → 2 failed | 2 passed |
| T4 | `order-offline-service.snapshot.test.ts` → 6 failed / 2 passed | 8 passed |
| T5 | `order-offline-service.backfill.test.ts` → 3 failed / 1 passed | 3 suites → 149 passed |
| T6 | `cart-shell.snapshot.test.tsx` → 2 failed | 2 passed |
| T1 / T3 | T3: `cart-line-conversion.test.ts` → 6 failed | 17 passed |

### 8.3 E2E

Ningún archivo E2E fue editado y **ningún E2E fue ejecutado**. La búsqueda en `frontend-react/e2e/`
no encontró ninguna aserción sobre la forma cambiada: `originalPrice`, `conversionRate`,
`saleCurrencyRate`, `tenderedAmount` → 0 coincidencias; `payments` solo en nombres/comentarios, nunca
`order.payments`; los únicos specs que leen órdenes guardadas
(`entry-cost-sync-roundtrip.spec.ts`, `warehouse-cost-propagation.spec.ts`) leen solo
`id`/`isActive`/`orderItems[].productCosts[].costPrice`. **T7 queda como no-op justificado.**

### 8.4 Tests existentes actualizados (contrato revocado por el usuario)

- `cart-shell.test.tsx` (~1372) y `order-offline-service.test.ts` (~1921, ~1953): autorizados
  explícitamente por el orquestador, porque las reglas nuevas del usuario revocan la forma vieja
  ("la orden siempre tiene `payments[]`", "todos esos datos siempre"). Se conservó la igualdad
  profunda completa; no se debilitó ni se borró ninguna aserción.
- `order-offline-service.test.ts` ORD-19/ORD-22: consecuencia directa del backfill en lectura (T5).
  Se mantuvo la igualdad profunda contra la forma sanada.

## 9. Siguiente paso

Implementación completa y verificada. Pendiente: revisión nativa RDD del candidato
(`54007a17..HEAD`). Sin push y sin PR — decisión del usuario.
