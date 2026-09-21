# Feature: multicurrency-followups (hallazgos no bloqueantes de la revisión RDD)

Workflow: **ODD**. Rama: `qa`. Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.

**Origen:** revisión RDD de `multicurrency-view-totals` (lineage `review-0f25edfbdaddef0b`, aprobada).
Los 3 hallazgos son **no bloqueantes**; se abordan como trabajo posterior, uno a uno.

## Objetivo

Cerrar los 3 follow-ups que la revisión dejó abiertos, sin reabrir la revisión aprobada.

## Tareas

- [x] **F1 — R3-001 (WARNING):** dar cobertura al camino **multi-store por moneda** en
  `app/sales/routes/credits.tsx:190-193` y `app/sales/routes/orders.tsx:277-282` (hoy sin test;
  las suites nuevas mockean solo el auth store y nunca habilitan multi-store).
  → Añadidos bloques multi-store en `credits-multicurrency.test.tsx` y `orders-multicurrency.test.tsx`
  (mockean `use-multi-store` + lectores por tienda). Cubren multi-store ON con MultiMonedas OFF
  (legacy) y ON (primario + chips, nunca suma mixta). `pnpm test` 4002/4002, typecheck y lint verdes.
  RDD: `under_budget` (no requiere revisión).
- [x] **F2 — R3-002 (SUGGESTION):** el **cuadre multi-store** sigue mostrando el KPI agregado
  mezclado (`multi-store-aggregator.ts:489-493` ya lleva entradas por moneda en `StoreRangeSummary`,
  pero `cuadre-por-fechas.tsx` no las consume en su rama multi-store).
  → `cuadre-por-fechas.tsx` rama multi-store por moneda: `MultiStoreKpis` (privado del archivo) y
  las etiquetas "Ganancias" (agregada y por tienda) usan `CurrencyTotalAmount` con las entradas por
  moneda de cada `StoreRangeSummary`; con el gate OFF la salida es idéntica. Tests multi-store
  añadidos. `pnpm test` 4004/4004, typecheck y lint verdes. RDD: `under_budget`.
  Nota: un `pnpm test` inicial reportó un fallo flaky no reproducible (2 corridas posteriores 4004/4004).
- [x] **F3 — R3-003 (SUGGESTION):** `today-stats.tsx:188-192` deriva las ventas por moneda de los
  ítems (`price×qty`) mientras el escalar legacy y `valueClassName` vienen de `order.total`; la
  equivalencia no está fijada por test.
  → Verificado: **ambos derivan de la misma fuente** (`getCategoryCartItemsView` agrega
  `getActiveOrdersInDay().orderItems` con `price×qty`); solo difieren en el redondeo. Añadido
  comentario en `salesEntries` y 2 tests en `today-stats-multicurrency.test.tsx` que fijan
  (a) la igualdad numérica gate-ON vs gate-OFF del total "Ventas" y (b) que "Ventas" sigue la suma
  de ÍTEMS, no `order.total`. Sin cambio de comportamiento. `pnpm test` 4006/4006, typecheck y lint
  verdes. RDD: `under_budget`.

## Observación

- En F2 y F3, corridas iniciales de `pnpm test` reportaron un fallo **flaky** no reproducible
  (corridas posteriores 4004/4006 verdes, sin test nombrado). No bloquea, pero conviene investigar
  la inestabilidad del suite en una tarea aparte.

## Modo TDD

**off** (engram `sdd/store-mgmt/testing-capabilities` #820). Checks: `pnpm test`, `pnpm typecheck`,
`pnpm lint` (desde `frontend-react/`).

## Restricciones (AGENTS.md)

Sin tocar tests E2E (`frontend-react/e2e/**`, `backend/**/SMCA.WebApi.E2ETests/**`) ni sus support
files; sin tocar código de producción backend; el frontend Angular es legacy.

## Verificación

Comando + resultado por tarea. Sin cambios fuera del alcance.
