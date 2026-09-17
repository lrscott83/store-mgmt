# Plan — Formas de pago por moneda + percent/tax en el precio de venta

**Fecha:** 2026-09-17 · **Estado:** propuesto (esperando aprobación)

## 1. Problema (lenguaje de usuario)

Hoy el carrito de ventas ofrece dos formas de pago fijas: **Efectivo** y **Tarjeta**.
Con el módulo MultiMonedas la venta puede estar en USD, EUR, MLC, etc., y no tiene
sentido ofrecer "Zelle" o "Tarjeta" para una venta en MLC, ni cobrar "Efectivo" en
monedas que no circulan en efectivo.

Además, el precio de la venta es siempre la suma simple de las líneas. Se necesita
la posibilidad de ajustarlo con un **percent** (porcentaje sobre el total) y un
**tax** (monto fijo), por ejemplo: precio 100 con percent 1 y tax 10 →
`100 + (1% de 100) + 10 = 111`.

## 2. Decisiones acordadas con el owner (2026-09-17)

1. **percent y tax viven por (moneda, forma de pago)**: CUP→Efectivo tiene sus
   propios percent/tax, CUP→Transferencia (CUP) los suyos, USD→Efectivo los suyos, etc.
2. **Tarjeta se reemplaza en todas partes.** Deja de ofrecerse; los datos históricos
   con `Tarjeta` se interpretan como **Transferencia (CUP)** al leerlos (default).
3. Las formas de pago por moneda aplican **siempre** (no dependen del módulo
   MultiMonedas): sin el módulo la moneda es CUP → solo se ven
   Efectivo + Transferencia (CUP).
4. **Esta iteración:** percent/tax solo en el modelo con default 0 y la fórmula
   aplicada. La edición de esos valores será otra tarea.
5. Por defecto toda venta fue/está en CUP, así que al **leer** una venta sin esos
   valores se asumen los defaults (CUP, Efectivo si no hay paymentType, percent 0,
   tax 0).

## 3. Catálogo de formas de pago por moneda

| Moneda | Formas de pago mostradas en el carrito |
| ------ | -------------------------------------- |
| CUP    | Efectivo · Transferencia (CUP)          |
| USD    | Efectivo · Zelle · Transferencia (USD)  |
| EUR    | Efectivo                                |
| CAD    | Efectivo                                |
| MXN    | Efectivo                                |
| MLC    | Transferencia (MLC)                     |
| CLA    | Transferencia (CLA)                     |

Notas:
- "Transferencia (X)" es una única forma de pago nueva cuyo **parámetro es la
  moneda de la venta**. No se crean 7 enums distintos: es `Transferencia` +
  moneda.
- Efectivo **siempre es en la misma moneda de la venta** (no hay cambio de
  efectivo entre monedas en esta iteración).
- El ícono se mantiene el existente: Efectivo → cash, Zelle → phone,
  Transferencia → card (el ícono de tarjeta se reutiliza para transferencia).

## 4. Modelo de datos

### 4.1 Enum `SalePaymentMethod` (nuevo, frontend `packages/domain` y espejo C#)

Congelado por valor desde el día 1 (igual que `Currency`):

```
Efectivo     = 0   (default; coincide con "todas las ventas viejas sin método")
Zelle        = 1
Transferencia= 2
```

La **moneda del método** es la moneda de la venta (campo `currency` que ya existe
en `Order`). "Transferencia (CUP)" = `{ method: Transferencia, currency: CUP }`.

### 4.2 Mapeo de compatibilidad del `PaymentType` histórico

El enum existente `PaymentType { Efectivo=1, Tarjeta=2, Zelle=3 }` **no se borra**
(hay datos históricos en localStorage y en views/statistics). Se añade un adaptador
puro:

```
legacyPaymentTypeToSalePaymentMethod(pt, currency):
  Efectivo  → Efectivo
  Tarjeta   → Transferencia      (moneda CUP por defecto: "Transferencia (CUP)")
  Zelle     → Zelle
```

Todas las lecturas de datos (órdenes, stats, cuadre, historiales, créditos) pasan
por este adaptador: un pago `Tarjeta` viejo se **muestra** como Transferencia (CUP)
y las agregaciones lo agrupan junto a las nuevas Transferencias (CUP).

### 4.3 percent/tax por (moneda, forma de pago)

Nueva tabla estática (constante en `packages/domain`, archivo nuevo
`payment-pricing.ts`):

```
DEFAULT_PAYMENT_PRICING: Record<`${Currency}|${SalePaymentMethod}`, { percent: number; tax: number }>
```

- **Todas las combinaciones empiezan con `{ percent: 0, tax: 0 }`** → el precio
  calculado es idéntico al precio actual (garantía de no-regresión).
- La clave incluye la moneda porque "Transferencia (CUP)" y "Transferencia (USD)"
  tendrán percent/tax independientes en el futuro.
- Fórmula pura:

```
applyPricing(baseTotal, percent, tax) = round2(baseTotal + baseTotal*percent/100 + tax)
```

Ejemplo del owner: 100, percent 1, tax 10 → 100 + 1 + 10 = 111.

### 4.4 Persistencia en `Order` (frontend)

`Order` (y su save/load en `order-offline-service`) gana dos campos opcionales:

```
/** Método de pago de la venta. Ausente = Efectivo (histórico). */
salePaymentMethod?: SalePaymentMethod;
/** percent/tax aplicados en esta venta (auditoría). Ausentes = 0. */
percent?: number;
tax?: number;
```

- `createOrder(...)` recibe el método elegido en el carrito, aplica la fórmula con
  los percent/tax de `(moneda, método)` y persiste `total` ya ajustado, guardando
  `percent`/`tax` para auditoría. `paymentType` legacy se sigue escribiendo con su
  valor mapeado hacia atrás (Efectivo→Efectivo, Zelle→Zelle, Transferencia→Tarjeta
  si currency=CUP… decisión: se escribe `paymentType` solo para compatibilidad de
  datos viejos; el método real vive en `salePaymentMethod`).
- Lectura (`reviveOrder`): si no hay `salePaymentMethod` se deriva del
  `paymentType` con el adaptador (Tarjeta→Transferencia-CUP); si no hay
  `paymentType`, Efectivo. `percent`/`tax` ausentes = 0.

### 4.5 Backend (mínimo, paridad de modelo)

El backend sincroniza `Order` (total/items) pero no conoce formas de pago. Se
replica el modelo para paridad:

- `Domain/Common/Enums/SalePaymentMethod.cs` (Efectivo=0, Zelle=1, Transferencia=2),
  `Order.SalePaymentMethod` (default Efectivo), `Order.Percent`, `Order.Tax`
  (decimal, default 0).
- Migración EF + actualización del `ApplicationDbContextModelSnapshot`
  (los defaults de columna hacen que las filas históricas queden en Efectivo/0/0).
- No hay endpoints nuevos: el valor lo calcula el frontend al crear la venta
  (misma fuente que el total, que ya viaja calculado).

## 5. UI — carrito (`cart-shell.tsx`)

- La lista de formas de pago deja de ser la constante fija
  `PAYMENT_TYPE_OPTIONS` y pasa a ser función de la moneda de la venta:
  `paymentMethodOptionsForCurrency(cartCurrency())` (helper puro en
  `payment-pricing.ts`).
- Etiquetas: "Efectivo", "Zelle", "Transferencia (CUP|USD|MLC|CLA)" — la
  transferencia siempre muestra su moneda entre paréntesis.
- Si la venta cambia de moneda (carrito vacío) y el método seleccionado no existe
  para la nueva moneda, el selector se re-pinnea al primero disponible
  (Efectivo si existe, si no la Transferencia de esa moneda).
- El total del carrito y el "vuelto" siguen mostrándose con la moneda de la
  venta; el total mostrado **incluye** percent/tax del método seleccionado.
- `payment` (el "con cuánto paga") se compara contra el total ajustado; para
  Transferencia/Zelle (no efectivo) el campo de pago con efectivo se deshabilita
  y el vuelto no aplica (queda 0/oculto).

## 6. Vistas afectadas por el reemplazo de Tarjeta (solo lectura/display)

Estas vistas muestran/agrupan `PaymentType`; pasan por el adaptador 4.2 y agrupan
"Transferencia" en vez de "Tarjeta" (una sola etiqueta, los históricos cuentan ahí):

- `sales/today-stats`, `statistics/cuadre-por-fechas`: los bloques "Tarjeta" pasan
  a "Transferencia".
- `sales/orders` (filtro por forma de pago) y `today-orders`: opciones Efectivo /
  Transferencia / Zelle (sin Tarjeta); los datos Tarjeta se filtran bajo Transferencia.
- `expenses` (filtro y formulario): el form de gasto ya solo ofrece Efectivo y
  Tarjeta → pasa a Efectivo y Transferencia (los gastos históricos Tarjeta se
  muestran como Transferencia).
- Íconos: `payment-type-icon.ts` añade el caso Transferencia (reutiliza 'card').

## 7. Tests

### 7.1 Unit (libre de permisos)

- `payment-pricing.test.ts`: catálogo por moneda (los 7 casos de la tabla §3),
  defaults percent/tax = 0 para todas las combinaciones, fórmula (0/0 → sin
  cambio; 1/10 sobre 100 → 111; redondeo a 2 decimales).
- `payment-method-compat.test.ts`: adaptador legacy (Efectivo→Efectivo,
  Tarjeta→Transferencia con CUP, Zelle→Zelle, undefined→Efectivo).
- `order-offline-service.test.ts`: createOrder persiste `salePaymentMethod`,
  `percent`, `tax` y `total` ajustado; revive orders viejas sin los campos con
  defaults.
- `cart-shell.test.tsx`: opciones renderizadas según la moneda del carrito;
  re-pin al cambiar de moneda; total con percent/tax aplicados.

### 7.2 E2E backend (nuevos, archivo nuevo — no se tocan E2E existentes)

`PaymentMethodPricingTests.cs` (1 por regla, contra `smca_test`):

| # | Qué prueba | Escenario |
| - | ---------- | --------- |
| PM1 | Orden creada con defaults | Una orden sincronizada sin los campos nuevos lee SalePaymentMethod=Efectivo, Percent=0, Tax=0 (defaults de columna). |
| PM2 | Persistencia del método | Orden con SalePaymentMethod=Transferencia y Percent/Tax=1/10 persiste y lee exactos. |
| PM3 | Catálogo por moneda vía API del dominio compartido | No aplica a backend: se cubre en frontend (ver 7.3). — *este slot se reserva para la migración: el schema de Orders tiene las 3 columnas nuevas.* |

(El E2E de backend verifica que el schema migrado existe y persiste; la lógica de
catálogo/fórmula es de frontend y vive en unit tests + E2E frontend.)

### 7.3 E2E frontend (nuevos, spec nuevo `payment-methods.spec.ts`)

| # | Qué prueba |
| - | ---------- |
| PMF1 | Carrito en CUP muestra solo Efectivo y Transferencia (CUP) — sin Tarjeta. |
| PMF2 | Producto en USD → carrito muestra Efectivo, Zelle y Transferencia (USD); seleccionar Transferencia (USD) queda persistido en la orden. |
| PMF3 | Venta en MLC muestra solo Transferencia (MLC) (no hay Efectivo). |
| PMF4 | Con percent/tax default 0, el total de la venta es exactamente la suma de las líneas (no-regresión). |
| PMF5 | Orden creada en la venta se persiste con `salePaymentMethod`, `percent` y `tax` correctos (verificación en localStorage). |
| PMF6 | Una orden vieja sembrada con `paymentType: Tarjeta` se muestra como Transferencia (CUP) en Ventas del día. |

## 8. Fuera de alcance (explícito)

- Editor de percent/tax (vendrá después; la constante está preparada para eso).
- Conversión/cambio entre monedas en pagos en efectivo.
- Cobros parciales, propinas o descuentos distintos del percent/tax definidos.
- Cambios en el flujo de créditos más allá del display del método (los créditos
  siguen usando `paidType` legacy con el adaptador de lectura).

## 9. Verificación (readme del root)

- Frontend unit: `cd frontend-react/apps/web-store-pos && pnpm test` (+ `pnpm lint`,
  `tsc --noEmit -p apps/web-store-pos`).
- Backend unit: `dotnet test backend/src/Domain.UnitTests/...` y
  `backend/src/Application.Tests/...`.
- E2E backend: levantar nada — `dotnet test backend/src/SMCA.WebApi.E2ETests/...`
  (aplica migraciones solo contra `smca_test`).
- E2E frontend (readme §6): terminal aparte
  `dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e`
  (perfil `http-e2e`, base `smca_test`, puerto 5019), luego
  `pnpm exec playwright test e2e/payment-methods.spec.ts`.
- Regla innegociable: si algún test E2E **existente** rompe por estos cambios, se
  pide permiso 1 a 1 indicando qué prueba, causa raíz y propuesta — nada se toca
  sin aprobación explícita.
