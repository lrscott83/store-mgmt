# Feature: payment-channels-in-breakdowns (canales de pago en los desgloses)

Workflow: **ODD**. Rama: `dev`.
Entrega: commits por unidad de trabajo; push y PR los decide el owner.

**Continúa a:** `odd/tasks/currency-filter-per-view.md` (ese metió el filtro de moneda; este
arregla los desgloses de pago que quedaron fundiendo canales y rotulándolos mal).

## Objetivo

En los **desgloses de pago**, mostrar los **canales** (par método × moneda) en vez de métodos
sueltos: `Efectivo (CUP)`, `Zelle (USD)`, `Transferencia (USD)`…

## Modelo (fijado por el owner)

- Un **canal** es un par `(método, moneda)`. El catálogo es único y global.
- **Gate por módulo:** MultiMonedas **OFF** → solo `Efectivo (CUP)` y `Transferencia (CUP)`.
  **ON** → los canales **de la moneda que la vista está mostrando**.
- Rótulo: `channelLabel(method, currency, formatMessage)`.
- **Alcance: SOLO los desgloses.** Los selectores de método (carrito, multipago, gasto, pago de
  crédito, editar orden) **conservan sus rótulos actuales** — hay un comentario explícito en
  `channel-label.ts` que los protege.

## Problema / Por qué

1. `today-stats` y `cuadre-por-fechas` agrupan los pagos con `normalizedOrderPaymentMethod`, que
   **funde Zelle dentro de Transferencia**. Si Zelle es un canal como cualquier otro, no debe
   desaparecer.
2. Los desgloses rotulan con `salePaymentMethodLabel`, que muestra `Efectivo` y `Zelle` **sin
   moneda** — dos filas de monedas distintas se leen igual.
3. El panel rotulado **"Pago por Transferencia"** incluye Zelle. Al partir Zelle a su propio canal,
   el rótulo queda exacto por construcción.

## Piezas existentes que se reutilizan (no reinventar)

- **Catálogo de canales:** `paymentMethodOptionsForCurrency(currency)` →
  `packages/domain/src/commons/payment-pricing.ts:58`. Es la fuente única. Devuelve:
  CUP → [Efectivo, Transferencia]; USD → [Efectivo, Zelle, Transferencia];
  EUR/CAD/MXN → [Efectivo]; MLC/CLA → [Transferencia].
- **Rótulo de canal:** `channelLabel(method, currency, formatMessage)` →
  `app/management/channel-rates/lib/channel-label.ts:23` → "Efectivo (CUP)", "Zelle (USD)".
- **Canal real de una orden:** `resolvedOrderPaymentMethod(order)` →
  `app/shared/lib/payment-method-resolved.ts` (**NO** `normalizedOrderPaymentMethod`, que colapsa
  Zelle).
- **Validez de un par:** `isValidChannel(method, currency)` → `payment-channel.ts:48`.

## Alcance

Frontend React únicamente. **Sin backend. Sin tocar E2E.**

- `app/sales/routes/today-stats.tsx`
- `app/statistics/routes/cuadre-por-fechas.tsx` (single-store **y** multi-store)
- `app/shared/lib/multistore/multi-store-aggregator.ts` (el resumen multi-store hoy trae un split
  de DOS vías efectivo/tarjeta; el cuadre multi-store necesita el desglose por canal)
- El donut de pagos del dashboard (`app/statistics/components/dashboard-metrics-body.tsx` +
  `app/statistics/lib/dashboard-breakdowns.ts`)

**Fuera de alcance (a propósito):** carrito, multipago, modal de gasto, modal de pago de crédito,
editar orden, y los filtros de método de las vistas de órdenes.

## Modo TDD

**off** — se ejecutan checks funcionales + tests nuevos/actualizados por tarea.
Runners: `pnpm test`, `pnpm typecheck`, `pnpm lint` desde `frontend-react/`.

## Tareas

- [ ] **T1** Mover `channelLabel` a una ubicación compartida (`app/shared/lib/payment-methods/`),
  actualizando sus 2 consumidores (`channel-rates.tsx`, `configurations.tsx`). Refactor puro, mismo
  comportamiento. Motivo: las vistas de ventas/estadísticas no deben importar de una carpeta de
  `management`.
- [ ] **T2** `today-stats`: los desgloses de pago pasan a ser por **canal de la moneda mostrada**,
  derivados de `paymentMethodOptionsForCurrency` + `resolvedOrderPaymentMethod`, rotulados con
  `channelLabel`. Con MultiMonedas OFF → los 2 canales de CUP.
- [ ] **T3** `cuadre-por-fechas` single-store: idem.
- [ ] **T4** `cuadre-por-fechas` multi-store + `multi-store-aggregator`: el resumen por tienda debe
  exponer el desglose por canal para que los paneles multi-store muestren los canales de la moneda.
- [ ] **T5** Donut de pagos del dashboard: rótulo a `channelLabel` y slices por canal de la moneda.
- [ ] **T6** Checks verdes + evidencia.

## Criterios de aceptación

1. Con MultiMonedas **OFF**: los desgloses muestran exactamente 2 canales, `Efectivo (CUP)` y
   `Transferencia (CUP)`. Salida equivalente a la actual.
2. Con MultiMonedas **ON**: los desgloses muestran los canales **de la moneda mostrada**
   (USD → 3, CUP → 2, EUR/CAD/MXN → 1, MLC/CLA → 1). Sin filas de otras monedas.
3. Una venta por **Zelle (USD)** aparece como **Zelle (USD)**, nunca dentro de Transferencia.
4. Ningún canal aparece rotulado sin su moneda.
5. Los selectores (carrito, gastos, crédito, editar orden) quedan **byte-idénticos**.
6. Ningún canal puede duplicarse entre filas (partición exacta: cada orden en un solo canal).
7. Los E2E no se tocan.

## Verificación

- Evidencia por tarea: comando ejecutado + resultado observado.
- `git status` sin cambios fuera del alcance (backend/E2E/Angular intactos).

## Estado

- 2026-09-26: documento creado. El owner fijó el modelo tras corregir al orquestador (que había
  respondido con el enum `SalePaymentMethod` en vez del catálogo de canales, y que había propuesto
  fundir Zelle "por consistencia"). **Sin código escrito todavía.**

## Hallazgos / antecedentes

- El orquestador se equivocó dos veces en esta área: (a) contestó con el enum en vez del catálogo
  de canales; (b) en T13 de la feature anterior usó `normalizedOrderPaymentMethod`, fundiendo
  Zelle, cuando la decisión escrita de esa feature ya decía `resolvedOrderPaymentMethod`.
- `multi-store-aggregator.ts` hoy parte en dos (efectivo / no-efectivo) con el lado no-efectivo
  como **complemento** de efectivo. Eso evita perder Zelle, pero no es un desglose por canal.
