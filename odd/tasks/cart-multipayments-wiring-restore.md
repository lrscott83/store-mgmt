# cart-multipayments-wiring-restore

- Estado: completado
- Fecha: 2026-09-24
- Rama: `qa`
- Autorización: usuario aprobó restaurar (pregunta "¿Aplico la restauración?" → Sí, restaura)
- Verificación: `cart-shell.test.tsx` 79/79 ✓ · suite completa `pnpm test` 298 files / 4237 tests ✓ · type errors: no errors

## Objetivo y problema

El merge `0efb01d6` (`Merge origin/qa into test`, fast-forward a `qa`) resolvió
`frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx` hacia el
lado de qa, descartando 3 deltas de la línea dev que implementaban el wiring de
multipayments (T3/T4/T5 de `payment-channels-and-multipayment`).

Síntoma: 5 tests de vitest fallando en `cart-shell.test.tsx` (T3-01, T4-01,
T4-03, T8-03 guard, T5). Los tests, el i18n (`es.ts`), `cart-currency-select.tsx`
(canChange/onRejected) y `multi-payment-list.tsx` (createPaymentRow) SOBREVIVIERON
al merge; solo `cart-shell.tsx` perdió los deltas.

## Commits con la implementación original (perdida en el merge)

1. `e45c1673` feat(cart): move the currency selector into the header row before Limpiar
   - selector dentro de la fila del encabezado (antes de "Limpiar"), + `flex-wrap`
2. `c641287b` fix(cart): block currency changes that cannot convert every line
   - fallback load-time a moneda nativa, guard `canChangeCartCurrency`, aviso
     `cart-currency-change-error`, import `currencyLabel`
3. `64e56aac` feat(cart): seed a default Efectivo row for the sale total
   - efecto de siembra `multiPaymentsSeededRef` + `createPaymentRow`

## Adaptaciones a la línea qa

Los deltas se aplican sobre el archivo actual, que contiene cambios
`cart-wholesale-by-order-type` (496b4544) y `store-payment-methods-config`
(543ff0c2) que la línea dev no tenía. Conservar sin cambios:

- `cartBadgeCount(items, orderType)` (NO la variante sin orderType de la línea dev)
- `formatWholesaleLine(item, currency, orderType)` con el parametro orderType
- el resto del flujo wholesale/legacy

## Checklist

- [x] Import `currencyLabel` y `createPaymentRow` agregados
- [x] Estado `currencyChangeError` agregado
- [x] `nativeCurrency` + `preferredConversion` + `preferredCurrencyUnconvertible`
- [x] `saleCurrency` con fallback T4 (nativo si la preferencia no convierte)
- [x] `canChangeCartCurrency` + `handleCurrencyChange`
- [x] `multiPaymentRates` memo movido ANTES de saleCurrency (lo necesita el guard)
- [x] Select conectado: `value={saleCurrency}` `onChange={handleCurrencyChange}` `canChange={canChangeCartCurrency}`
- [x] Select reubicado en el header ANTES de "Limpiar" (+ flex-wrap)
- [x] Aviso `cart-currency-change-error` renderizado (SOLO con el módulo 16)
- [x] Efecto T5: siembra `createPaymentRow(Efectivo, saleCurrency, totalAmount)` en la transición a activo
- [x] `cart-shell.test.tsx` verde (5 antes rojos + resto del archivo)
- [x] Suite `pnpm test` verde en todos los paquetes
- [x] Commit `fix(cart): restore multipayments wiring lost in merge 0efb01d6` (`ad9f9b34`)

## Verificación

```bash
pnpm exec vitest run app/shared/components/__tests__/cart-shell.test.tsx   # en apps/web-store-pos
pnpm test                                                                   # suite completa desde frontend-react
```

## Hallazgos

- Un merge puede dejar tests sin implementación; antes de reescribir tests o
  código, buscar los deltas perdidos en `git log -- <archivo>` / `git show <commit>`.
- El E2E intocable `multipayments-currency-block.spec.ts` pinna el comportamiento
  canónico (fallback a nativo al cargar; bloqueo con aviso al cambiar) — el código,
  no los tests, estaba mal.