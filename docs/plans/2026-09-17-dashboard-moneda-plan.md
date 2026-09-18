# Plan — Moneda en el dashboard del Owner (presentación por moneda)

**Fecha:** 2026-09-17 · **Estado:** PLANIFICADO (se implementa junto con el alcance A del dashboard)
**Plan maestro:** `docs/plans/2026-09-16-dashboard-kpi.md`

## 1. Contexto

- El módulo **MultiMonedas (15)** ya existe (commit `f1342796`): `currency` en órdenes, items de orden, gastos, créditos, inventario y productos; `EModules.MultiMonedas`; gate `hasMultiMonedasAvailable(user)`.
- `formatMoneyWithCurrency(amount, currency)` ya existe (`shared/lib/format-money-with-currency.ts`).
- **Lo que falta**: la **agregación por moneda**. Hoy el dashboard suma todos los totales crudo y divide por el `rate` del selector legacy → con monedas mezcladas el número mostrado es incorrecto.
- Regla de negocio base: **nunca sumar monedas distintas**.

## 2. Regla acordada

1. Todo agregado (cards, gráficas, donuts, popups, tablas) se **agrupa por moneda** (`currency ?? DEFAULT_CURRENCY`).
2. Prioridad de la moneda principal: **USD → EUR → CUP → la de mayor monto**.
3. Si hay **2 o más monedas**: se muestra el valor de la moneda de mayor prioridad presente + **"+"** al lado → tap → popup con el monto principal y **todas** las demás monedas (monto por moneda, **sin conversión**).
4. Con **una sola moneda**: se muestra esa moneda, sin "+".
5. **Créditos por cobrar**: mismo criterio (global sin filtro de fecha, por moneda).
6. **Multi-tienda**: por tienda y en el agregado general (la agrupación por moneda cruza las tiendas).

## 3. UI

- **Selector legacy "Moneda: CUP/USD + rate"**: se elimina cuando el módulo MultiMonedas está activo. Sin el módulo, todo es CUP y el selector permanece con su comportamiento actual (conversión por `rate`).
- **Cards**: valor principal según prioridad; "+" solo con 2+ monedas.
- **Donuts**: chips de moneda dentro de la card (orden de prioridad); se ocultan si hay una sola moneda.
- **Popup del "+"**: mobile friendly, lista de monedas en orden de prioridad con su monto.

## 4. Implementación (frontend)

- Helper de **agrupación por moneda** (suma por `currency ?? DEFAULT_CURRENCY`) para órdenes, gastos y créditos. No existe hoy: crearlo como util compartido.
- Aplicarlo a: las 8 cards, gráficas (serie por moneda), donuts (una por moneda), popups, tops y **sparklines** (serie de la moneda principal de cada card).
- El trend "vs anterior" también se calcula por moneda.
- Gate: sin MultiMonedas nada cambia (todo CUP, sin "+").

## 5. Tests

- Unitarios nuevos: la agrupación **no suma monedas cruzadas**; orden de prioridad (USD → EUR → CUP → mayor monto); "+" con 2+; sin "+" con 1; popup lista todas las monedas.
- E2E: **solo tests nuevos** (los existentes son intocables sin autorización explícita).

## 6. Fase futura — alineación global (trabajo diferido)

- Aplicar la misma regla a las demás vistas: **cuadre por fechas, créditos, órdenes, hoy-stat, reportes**.
- **Actualizar `docs/plans/2026-09-17-multimonedas-module-plan.md` §6**: hoy dice "total primario (CUP) + chips de desglose"; la regla canónica acordada es **USD → EUR → CUP → mayor monto**.
- No se ejecuta en esta etapa: el alcance acordado es solo el dashboard.

## 7. Verificación

- `pnpm typecheck` + `pnpm lint` + `pnpm test` (frontend).
- Prueba manual con MultiMonedas activo y ventas en ≥2 monedas en el rango.
