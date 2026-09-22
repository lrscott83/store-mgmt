# Feature: credits-paid-green-filter

## Objective

En las vistas de créditos (`sales/today-credits` y `sales/credits`, frontend React):

1. **Color por estado** — un crédito **pagado** se muestra en **verde**; uno **no pagado** conserva su color actual (ámbar).
2. **Total = solo créditos por pagar** — el total del precio es la suma de los créditos **impagos**; si el total es **0** se muestra en **verde**.
3. **Filtro por estado** — en `sales/credits`, debajo del filtro de fechas actual (otra fila), radio buttons: **"Todos"**, **"Por Pagar"**, **"Pagados"**.

## Problem / Why

Decisión 2026-09-18 dejó el total de créditos contando pagados+impagos; el usuario revierte explícitamente el total a solo impagos y pide señal visual de estado (verde = pagado, verde = total 0). Paridad con el original Angular: `groupSaleCredits` sumaba `!isPaid` por día, y `sale-credit-list` Angular coloreaba `success when paid, danger otherwise`.

## Scope

- `frontend-react/apps/web-store-pos/app/sales/components/sale-credit-list.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/today-credits.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/credits.tsx`
- Tests vitest no-E2E que pinchen el comportamiento viejo (`sale-credit-list.test.tsx`, `credits-routes.test.tsx`, `credits-multicurrency.test.tsx`, `credit-components.test.tsx`, y cualquiera que falle por el cambio).
- Catálogo de mensajes react-intl SOLO si hace falta nueva clave (verificar ids existentes primero).

## Constraints (NON-NEGOCIABLE)

- **NUNCA** tocar E2E: `frontend-react/e2e/**` (specs Y support). El texto «Créditos del día (n)» no cambia de redacción. El **count** del header NO cambia de semántica (sigue siendo todos los créditos) — solo cambian los **totales**.
- **NUNCA** tocar `frontend/` (Angular congelado).
- No tocar producción backend.
- Artifacts técnicos en inglés; UI copy en español (el proyecto ya usa react-intl en español).

## Tasks

- [ ] **T1** — `sale-credit-list.tsx`: total de la fila `text-success` cuando `isPaid`, `text-warning` cuando no (el color que tiene ahora). Corregir el comentario de la línea que dice "Amarillito para el precio en ambos estados".
- [ ] **T2** — `today-credits.tsx`: header total = suma de créditos **impagos**; `text-success` si 0, `text-warning` si > 0. Count sin cambios.
- [ ] **T3** — `credits.tsx`: totales impago-only + verde-si-0 en: header (single + multi-store), total por día en paneles (single + multi-store), `renderStoreTotals` multi-store. Count sin cambios.
- [ ] **T4** — `credits.tsx`: fila de radios "Todos | Por Pagar | Pagados" debajo del filtro de fechas (single-store y multi-store), patrón `role="radiogroup"` de `expenses-history.tsx`; el estado filtra la lista visible; header count/total y totales por día siguen la lista visible.
- [ ] **T5** — Actualizar tests vitest que pinchen el comportamiento viejo y añadir cobertura: fila verde si pagado, total impago-only, verde si 0, filtro por estado.
- [ ] **T6** — Verificación: correr vitest de los archivos afectados + typecheck; reportar `<comando>: <resultado>`.

## Authorized scope

Solo los archivos listados en Scope. Cualquier desvío (p. ej. cambiar el count, tocar E2E o Angular) requiere parar y preguntar.

## Acceptance criteria

- [ ] Crédito pagado → total verde en ambas vistas; no pagado → ámbar.
- [ ] Total del header (y totales por día) = suma de impagos; total 0 → verde.
- [ ] Radios Todos/Por Pagar/Pagados filtran la lista en `sales/credits`; count/totales siguen el filtro.
- [ ] Vitest de archivos afectados en verde; typecheck verde.

## Progress

- 2026-09-22: exploración completa (rutas, componente lista, modelo, patrones radios). Implementación delegada a un escritor (`general`) completada — status success.
- T1 ✅ — `sale-credit-list.tsx`: total `text-success` si `isPaid`, `text-warning` si no; comentario corregido.
- T2 ✅ — `today-credits.tsx`: header total impago-only; `text-success` si 0, `text-warning` si > 0; count sin cambios.
- T3 ✅ — `credits.tsx`: totales impago-only + verde-si-0 (header ambos modos, paneles por día ambos modos, `renderStoreTotals`); count sin cambios.
- T4 ✅ — `credits.tsx`: radios "Todos | Por Pagar | Pagados" debajo del filtro (single + multi-store), patrón radiogroup de `expenses-history.tsx`; filtro client-side antes del agrupado; count/totales siguen la lista visible. Claves i18n nuevas: `SALE_CREDIT.FILTER_ALL/TO_PAY/PAID/LABEL` (es.ts).
- T5 ✅ — Tests: `sale-credit-list.test.tsx` +2 (verde/ámbar); `credits-routes.test.tsx` 4 actualizados + 5 nuevos (filtro radios, $0 verde, impago-only); `credits-multicurrency.test.tsx`, `credit-components.test.tsx`, `sale.test.tsx` sin cambios (verificado no afectados).
- T6 ✅ — Verificación abajo.

## Verification evidence

- `pnpm vitest run <5 archivos afectados>` (writer): **passed** — 5 files, 93/93 (varias corridas limpias).
- `pnpm vitest run sale-credit-list + credits-routes` (spot check padre): **passed** — 2 files, 34/34, sin type errors (12:03:30).
- `pnpm typecheck` (writer): **FAILS pre-existente** — 12 errores byte-idénticos en BASE (`879ae501`, cambios stasheados): `salePaymentMethod` faltante en `Expense` (`app/expenses/*`, `payment-*.ts`, `today-stats.tsx`, `cuadre-por-fechas.tsx`). Cero errores en archivos del cambio.
- **Resolución typecheck (2026-09-22): causa raíz = `dist` STALE del paquete `@store-mgmt/domain`.** El paquete resuelve tipos desde `dist/` (`package.json` → `types: dist/index.d.ts`); el modelo fuente `packages/domain/src/models/expense.ts` ya tenía `salePaymentMethod?` (commit `a537595a`) pero `dist/models/expense.d.ts` no se había reconstruido. Fix: `pnpm --filter @store-mgmt/domain build` → `dist` regenerado con `salePaymentMethod?: SalePaymentMethod`. **`dist/` está en `.gitignore` (no trackeado) → no hay cambio fuente que commitear.** Verificado: `pnpm typecheck` app **PASS** (exit 0, sin errores); tests paquete domain 177/177 ✅ (12:13:01).
- `gentle-ai review assess --cwd . --json --untracked-scope=exclude --expected-untracked-inventory=sha256:3cda…`: **medium** (`executable_change`), 6 paths, 482 líneas, `review_due: true` (`slice_budget_reached`). Transport nativo V2 NO disponible en este runtime → lifecycle de review no lanzado (resultado preservado, no inventado).
- Flake conocido: `sale.test.tsx:590` intermitente (timing, no relacionado; pasa 24/24 aislado).
- E2E NO tocados. Riesgo informado: semántica de totales cambiada (impago-only) — revisados `pay-credit.spec.ts`, `create-credit.spec.ts`, `mayorista-sale.spec.ts`, `credits-history.spec.ts`: ninguno afirma totales con pagados incluidos.
- Mirror Engram: **PENDIENTE** (MCP no disponible esta sesión — resincronizar cuando vuelva).
- Estado: cambios SIN commit (convención del repo: commit/push solo con OK explícito del usuario).