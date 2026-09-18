# Plan — Ganancia y margen con monedas mixtas (dashboard Owner)

**Fecha:** 2026-09-17 · **Estado:** PLANIFICADO (decisión B1 para el alcance A; manejo estricto diferido)
**Plan maestro:** `docs/plans/2026-09-16-dashboard-kpi.md` · **Plan de moneda:** `docs/plans/2026-09-17-dashboard-moneda-plan.md`

## 1. Contexto (evidencia)

- `calculateOrderProfit` (`app/inventory/lib/profit-calculator.ts:19`) = `price × quantity − Σ(costPrice × quantity)` **sin conversión de moneda**.
- `getAvailableInventoryCosts` (`app/inventory/lib/services/inventory-offline-service.ts:406-450`) **no filtra por moneda**: descuenta el FIFO disponible y estampa la moneda de cada entrada.
- Consecuencia: un producto con precio en **USD** y costo de inventario en **CUP** produce una resta mixta (ej. `10 − 500`).
- Es un comportamiento **preexistente y global** (afecta cuadre, hoy-stat y reportes). El dashboard no lo introduce; lo hace visible al mostrar todo por moneda.

## 2. Decisión acordada (B1)

- La ganancia se resta **tal cual** (sin conversión), **igual que el resto de la app**.
- El ítem entra en la ganancia de la moneda de la **venta**.
- **Ganancias Bruta** y **Margen %** se calculan y muestran **por moneda** (regla del plan de moneda).
- `Margen % = Ganancias Bruta ÷ Ventas × 100` (guard: 0 cuando Ventas = 0).
- `Ganancias = Ganancias Bruta − Gastos` (ambas por moneda).

## 3. Consecuencia conocida y aceptada

- Un ítem con costos en moneda distinta a la de la venta queda **conceptualmente mezclado**.
- En esta etapa **no se marca ni se excluye** — se mantiene la consistencia con el resto de la app.

## 4. Fase futura — manejo estricto (trabajo diferido, ex opción B2)

Opciones a evaluar (requiere decisión de negocio):

- **a)** Calcular la ganancia solo con costos de la **misma moneda** que la venta; marcar/excluir los ítems mixtos (ej. "2 ítems no comparables").
- **b)** Bloquear a nivel de negocio que un producto con costo en una moneda se venda en otra (guard, como el de "una sola moneda por venta").
- **c)** Conversión con tasa por moneda (requiere tabla de tasas — **no existe hoy**).

Consideración: cualquier opción debe revisarse contra el cuadre y los reportes para no introducir descuadres entre vistas.

## 5. Tests

- Unitarios: `calculateOrderProfit` con costos en la misma moneda (sin cambio de comportamiento); el agrupador por moneda coloca el ítem en el grupo de la **venta** aunque el costo tenga otra moneda.
- E2E: **solo tests nuevos** (los existentes son intocables sin autorización explícita).

## 6. Verificación

- `pnpm typecheck` + `pnpm lint` + `pnpm test` (frontend).
- Prueba manual: producto USD con entrada de inventario CUP → verificar en qué grupo aparece la ganancia y que Ventas/Margen % de cada moneda cuadran con el cuadre del mismo rango.
