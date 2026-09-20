# Feature: multicurrency-view-totals (totales por moneda fuera del dashboard)

Workflow: **ODD** (Organic Driven Development). Rama: `qa` (no es la default `main` → se trabaja aquí).
Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.

**Plan fuente:** `docs/plans/2026-09-17-multimonedas-module-plan.md` §6.
**Índice:** `docs/plans/plan-resumen.md` → P0 #1.

## Objetivo

Que **ventas del día** (`today-stats`), **órdenes** (`today-orders` + historial `orders`),
**créditos** (`credits`) y **cuadre** (`cuadre-por-fechas`) agrupen los totales **por moneda**
—sin sumar monedas distintas— igual que ya hace el dashboard, mostrando un **total primario +
chips de desglose**. Solo con **MultiMonedas activo**; sin el módulo, el comportamiento actual
(todo CUP) no cambia.

## Problema / Por qué

Hoy estas vistas reducen filas de monedas distintas a un único número con `formatCurrency`
(p. ej. `today-orders.tsx:81,96`; `credits.tsx:150`; `today-stats.tsx:167-175`;
`orders.tsx:313,490`; `cuadre-por-fechas.tsx:264`). Como el sistema **no tiene tabla de
conversión**, esa suma mixta es un número sin sentido. El dashboard ya resolvió esto con
`~/shared/lib/currency-totals`; falta propagar el mismo patrón al resto.

## Alcance

- **Frontend React** únicamente:
  `app/sales/routes/today-stats.tsx`, `today-orders.tsx`, `orders.tsx`, `credits.tsx`,
  `app/statistics/routes/cuadre-por-fechas.tsx`.
- Reutilizar `~/shared/lib/currency-totals` (`groupAmountsByCurrency`, `orderCurrencyTotals`)
  y el gate `hasMultiMonedasAvailable(user)` (`~/shared/components/multimonedas/currency-select`).
- **Sin cambios de backend.** **Sin tocar tests E2E** (`frontend-react/e2e/**`,
  `backend/**/SMCA.WebApi.E2ETests/**`) ni código de producción backend.

## Modo TDD

**off** — fuente: engram `sdd/store-mgmt/testing-capabilities` (#820; el `strict_tdd: true` de
`openspec/config.yaml` pertenece a un pipeline retirado). Se ejecutan **checks funcionales + tests
nuevos por tarea** (no "sin tests"). Runners: `pnpm test`, `pnpm typecheck`, `pnpm lint`
(desde `frontend-react/`).

## Tareas

- [x] **T1** Componente presentacional compartido **"total primario + chips por moneda"**
  (siguiendo el patrón visual del dashboard), reutilizable en los headers de las 5 vistas.
  → `app/shared/components/multimonedas/currency-total-amount.tsx` (`CurrencyTotalAmount`);
  reutiliza `groupAmountsByCurrency`+`orderCurrencyTotals`; con el gate OFF devuelve el texto
  legacy exacto. Test: `__tests__/currency-total-amount.test.tsx` (5 casos).
- [x] **T2** `today-orders`: header con total por moneda (chips).
  → `today-orders.tsx` header usa `CurrencyTotalAmount` con `order.currency`. Test
  `today-orders-multicurrency.test.tsx` (gate off/mixed, gate on USB→EUR, single CUP).
- [x] **T3** `credits`: header, totales por día y modo multi-store por moneda.
  → `credits.tsx`: `CreditsCardTitle` + paneles de día (single y multi-store) por moneda.
  Test `credits-multicurrency.test.tsx`.
- [x] **T4** `orders` (historial): totales por moneda.
  → `orders.tsx`: header (single y multi-store) + totales por día por moneda.
  Test `orders-multicurrency.test.tsx`.
- [x] **T5** `today-stats`: ventas / gastos / créditos pagados / caja / neto por moneda
  (la resta `total = ventas + créditosPagados − créditos − gastos` se calcula **por moneda**).
  → `today-stats.tsx`: `netEntries` combinadas por moneda; header, Resumen Efectivo,
  Transferencia, Gastos, Créditos, Créditos Pagados y Ventas usan `CurrencyTotalAmount`.
  Test `today-stats-multicurrency.test.tsx` (USD 30−10=20 primario, EUR 5−2=3 chip).
- [x] **T6** `cuadre-por-fechas`: totales por moneda.
  → `cuadre-por-fechas.tsx`: KPIs (ventas/gastos/bruta/neta) y total de la tarjeta Cuadre por
  moneda (entradas añadidas a `RangeSummary` + `StoreRangeSummary`). Test
  `cuadre-multicurrency.test.tsx`.
- [x] **T7** Checks verdes (`pnpm test`, `pnpm typecheck`, `pnpm lint`).
  → `pnpm test`: 286 files / 3998 tests passed. `pnpm typecheck`: 5 tasks successful.
  `pnpm lint`: 4 tasks successful (max-warnings=0).

## Criterios de aceptación

1. Sin MultiMonedas activo: salida idéntica a la actual (un solo total `formatCurrency`).
2. Con MultiMonedas activo: nunca se muestra una suma que mezcle monedas; el primario es el
   primero del orden acordado (**USD → EUR → CUP → mayor monto**) y las demás van en chips.
3. La lógica de agrupado/orden **no se reimplementa**: se usa `currency-totals`.
4. Tests unitarios nuevos/actualizados cubren el caso multi-moneda; los unit tests existentes
   de estas rutas quedan verdes (los E2E no se tocan).

## Verificación

- Evidencia por tarea: comando ejecutado + resultado observado.
- `git status` no debe mostrar cambios fuera del alcance (backend/E2E intactos).

## Estado

- 2026-09-20: documento creado; implementación iniciada (delegada).
- 2026-09-20: T1–T7 implementadas. `pnpm test` 3998/3998, `pnpm typecheck` y `pnpm lint`
  verdes. Sin cambios fuera de `frontend-react/apps/web-store-pos` (backend y E2E intactos).

## Limitaciones conocidas / desviaciones

- El modo multi-store de `cuadre-por-fechas` (KPIs agregados fuera de los paneles y el rótulo
  "Ganancias" de cada tienda) sigue agregando números planos: el doc solo señalaba el total
  single-store (`~:264`). Las entradas por moneda ya viajan en `StoreRangeSummary`, así que
  es una extensión posterior de bajo costo.
- El rótulo literal de Angular `Créditos Pagados (suma)` muestra el desglose por moneda solo
  con MultiMonedas activo; con el gate OFF se mantiene el string legacy exacto (paridad DOM).
