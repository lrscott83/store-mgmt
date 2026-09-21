# Feature: warehouse-movements-fases-3-5 (propagación de costo + tests + cierre)

Workflow: **ODD**. Rama: `qa`. Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.
Alcance: **frontend** (`frontend-react/apps/web-store-pos`).

**Plan fuente:** `docs/plans/2026-09-16-warehouse-movements-plan.md` (§2.3, §3 Fases 3-5).
**Índice:** `docs/plans/plan-resumen.md` → P1 #3.

## Contexto

Fases 1-2 ya implementadas (ver `odd/tasks/warehouse-movements-fase2-ui.md`). Pendiente:

## Tareas

- [ ] **F3.1 — Mini-diseño (obligatorio antes de implementar).** Documentar el vínculo
  **venta ↔ entrada de tienda ↔ compra**: cómo se identifica qué ventas y qué stock en tienda
  provienen de una compra, apoyándose en `lotOriginMovementId` (A4), `inventoryEntryId` /
  `reversalInventoryEntryId` de la salida, y el snapshot de costos (`productCosts`) de las órdenes
  (`order-offline-service`). Entregable: `odd/tasks/warehouse-cost-propagation-design.md`.
- [ ] **F3.2 — Implementar propagación (B7/§2.3).** Al editar el costo de una compra ya usada:
  validar qué quedó afectado, avisar (confirmación con detalle) y **actualizar el costo** en
  (a) las ventas ya hechas que usaron esas unidades y (b) el stock que sigue en tienda de esa compra.
- [ ] **F3.3 — Pruebas de Fase 3**: unit + **E2E NUEVO** (compra → salida a tienda → venta → editar
  costo → verificar venta y stock en tienda con el costo nuevo).
- [ ] **F4 — Tests faltantes (A10)**: E2E nuevos E-R7b, E-R13, E-R15, E-R16; unitarios U-S14, U-S19,
  U-M8, U-C1, U-C2, I-3f, I-4, I-4c, I-4e, I-5.
- [ ] **F4b — A9a**: el contador de importación cuenta como insertados los duplicados saltados
  (`data-synchronizer-service.ts`).
- [ ] **F5 — Verificación final**: `pnpm vitest run`, `pnpm typecheck`, `pnpm lint` verdes; E2E solo
  si el entorno está disponible; confirmar que no se tocó ningún spec E2E existente.

## Restricciones (plan §0 + AGENTS.md)

- **E2E existentes intocables** (`frontend-react/e2e/**`); agregar tests NUEVOS permitido.
- **Backend intocable**; feature 100% frontend (localStorage cifrado por tienda).
- Unitarios/integración libres. Código/comentarios en inglés; UI en español (`es.ts`).
- No correr `prettier --write` global. Sin commit/push sin pedido explícito.

## Verificación

Comando + resultado por tarea. Sin regresiones en ventas/reportes.
