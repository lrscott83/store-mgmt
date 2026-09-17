# Feature: warehouse-movements — Fase 2 (UI: A1, A9d, A9e)

Plan: `docs/plans/2026-09-16-warehouse-movements-plan.md` §3 Fase 2.
Fase 1 (servicio) ya implementada y verificada en este mismo árbol de trabajo (sin commit).

## Decisiones ratificadas por el usuario (2026-09-16)

- **A1 — tope por tipo**: en la edición, el tope de cantidad aplica **solo a compras** (`purchase_in`),
  donde es calculable con exactitud: el modal precarga **lo que queda** del lote y bloquea guardar más.
  Salida y transferencia no llevan tope (su límite real depende de ventas/stock destino y lo valida el servicio).
- **A9d + A9e**: si el **segundo** paso de la edición falla (la reversa ya quedó persistida), el error se
  muestra **inline dentro del modal**, el modal **no se cierra**, y se explica el tope ("solo hasta lo que queda").
  El usuario corrige la cantidad y reintenta sin perder el trabajo.
- **E-R5 (ajuste autorizado)**: el E2E existente `E-R5` (comprar 10@$50 y editar a 15@$70) choca con el tope
  estricto. Se autorizó ajustarlo a una cantidad legal (10 → 6, stock final 6) conservando su propósito, y la
  cobertura del tope (bloqueo de 15) va en un **spec E2E NUEVO**.

## Reglas vigentes (CLAUDE.md + plan §0)

- E2E existentes intocables **salvo** el ajuste autorizado de E-R5 y el spec nuevo.
- Backend intocado. Sin commit/push. Código/comentarios en inglés; UI en español (`es.ts`).

## Tasks

1. [x] i18n: claves del tope (`WAREHOUSES.EDIT_REMAINING_HINT`, `WAREHOUSES.EDIT_MAX_EXCEEDED`).
2. [x] Modal: prop `maxQuantity` + aviso del tope + guarda de Guardar; prop `errorMessage` inline (A9d).
3. [x] Ruta: calcular el restante de la compra, precargarlo como cantidad inicial y pasar el tope;
       mostrar el error del paso 2 inline sin cerrar el modal; permitir reintento sin repetir la reversa.
4. [x] Tests unitarios: modal (tope + error inline), ruta (precarga del restante, bloqueo, error inline).
5. [x] E2E: ajustar E-R5 (autorizado) y crear spec NUEVO para el tope.
6. [x] Verificación: vitest (inventory + sync + modal + i18n), typecheck, lint.

## Criterio de cierre (plan §3 Fase 2)

Tests de UI verdes y contratos E2E de §1 intactos (los 7 testid congelados siguen igual).

## Archivos tocados

- `app/shared/lib/i18n/es.ts` — 2 claves nuevas (aditivo, nada eliminado).
- `app/inventory/lib/warehouse.ts` — `remainingPurchaseUnits` extraído (fuente única).
- `app/inventory/lib/services/warehouse-offline-service.ts` — `reversePurchase` ahora consume
  `remainingPurchaseUnits` (refactor sin cambio de comportamiento; ver Desviaciones).
- `app/inventory/components/warehouse-movement-modal.tsx` — props `maxQuantity` / `errorMessage`,
  testids nuevos `movement-max-hint`, `movement-max-error`, `movement-form-error`.
- `app/inventory/routes/warehouse-movements.tsx` — `editError`, `editReversed`, tope congelado
  (`editMaxQuantity`), `editInitial` memoizado, sin `load()` tras fallar el paso 2.
- Tests: `warehouse-movements.test.tsx`, `warehouse-movement-modal.test.tsx`, `warehouse.test.ts`,
  `es-provisioning-ids.test.ts`.
- E2E: `movement-reversal.spec.ts` (ajuste autorizado E-R5), `warehouse-movement-edit-cap.spec.ts` (NUEVO).

## Verificación (2026-09-16)

- **Unitarias / i18n**: `npx vitest run app/inventory app/shared/lib/i18n` → **421 passed (15 files)**.
- **Typecheck**: `pnpm turbo run typecheck` → limpio.
- **Lint**: `pnpm turbo run lint` → limpio (9 archivos tocados).
- **E2E** (backend `http-e2e` en 5019 + PostgreSQL `smca_test`):
  - `movement-reversal.spec.ts` + `warehouse-movement-edit-cap.spec.ts` → **23 passed**.
  - `warehouses.spec.ts` + `warehouse-movements-extended.spec.ts` → **15 passed**.
  - Total: **38 passed, 0 failed**.

## Incidencias y hallazgos

- **Caché obsoleta de Vite (ambiental, no del código)**: la primera corrida completa dio `E-R4` en rojo
  (Swal "Error" con body vacío). Causa raíz: `apps/web-store-pos/node_modules/.vite/deps/@store-mgmt_domain.js`
  estaba congelado el **2026-09-07**, antes de que el plan de reversa (2026-09-09) agregara
  `SaleOutAlreadyConsumed` al paquete `@store-mgmt/domain`. El bundle servido no contenía el objeto de error
  (`undefined`), así que `errors[0].description` llegaba vacío y el Swal salía sin texto — pero **el bloqueo
  sí ocurría**. Confirmado por doble vía: (a) test de servicio aislado devolvía el error correcto con su
  descripción exacta; (b) tras purgar `node_modules/.vite`, `E-R4` pasa y los 23 tests quedan verdes.
  Conclusión: fallo ambiental de caché derivada, **no una regresión** de Fase 1 ni Fase 2.
- **Fallos preexistentes, no relacionados**: `store-usage-tracker.test.ts` (7 tests) falla por frontera de
  día local vs UTC (reloj del sistema 2026-09-16, UTC 2026-09-17). Archivo no tocado por este trabajo.

## Desviaciones del plan

- `app/inventory/lib/services/warehouse-offline-service.ts` no figuraba en la lista de archivos de Fase 2;
  se tocó para evitar duplicar la fórmula del restante (fuente única con la ruta). El cambio es un refactor
  equivalente y queda cubierto por los tests de Fase 1 + los E2E de reversa.