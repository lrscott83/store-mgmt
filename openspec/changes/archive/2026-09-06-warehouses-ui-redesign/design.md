# Design: warehouses-ui-redesign

## Technical Approach

Restructure the Warehouses page header row and centralize create/edit into a modal component, reusing the app's existing shared primitives (`ActionMenu`, `Button`, `Card`, `InfoBox`) and the established modal precedent (`expense-form-modal.tsx`). Zero domain/service changes — the redesign is purely presentational wiring.

## Architecture Decisions

### Decision: Additive header counters (keep "Cantidad: N")
**Choice**: the collapsed header keeps the existing `WAREHOUSES.ON_HAND` ("Cantidad: N") counter and adds two new counters: product count (`WAREHOUSES.PRODUCT_COUNT`, distinct products with a stock level row in that warehouse) and total cost (`WAREHOUSES.TOTAL_COST`, Σ `onHand × costPrice`, formatted via `formatCurrency`).
**Alternatives considered**: replacing the units counter (breaks unit test `/Cantidad: 24/` and E2E on-hand expectations — rejected).
**Rationale**: additive design keeps every existing assertion green without touching protected specs.

### Decision: Per-warehouse gear via shared ActionMenu
**Choice**: one `ActionMenu` per warehouse card, `testId="warehouse-actions-toggle-{warehouse.id}"`, `label` = warehouse name (accessible "Acciones de {name}"), items: `ActionMenuItem intent="edit"` → "Editar" opens the modal prefilled; `ActionMenuItem intent="deactivate" separatorBefore` → "Desactivar" runs the existing `handleDeactivate` (Swal-blocked when stock/movements exist, unchanged).
**Alternatives considered**: keeping a visible "Desactivar" button (user explicitly asked for gear edit/delete); a custom hand-rolled gear (violates the gear-menu-action-styling canonical spec).
**Rationale**: matches `entry-list` / `expense-list` interaction exactly, which is also what the authorized E2E test-6 adaptation expects (gear toggle → `menuitem`).

### Decision: Single modal for create + edit
**Choice**: NEW `inventory/components/warehouse-form-modal.tsx`, props `{ open, warehouse?: Warehouse (edit mode), onClose, onSave(name) }`. Structure mirrors `expense-form-modal.tsx`: overlay `fixed inset-0 z-50 bg-black/60` (backdrop click closes), inner `w-full max-w-md bg-surface p-6 shadow-xl`, header title (`WAREHOUSES.NEW_WAREHOUSE` / `WAREHOUSES.EDIT_WAREHOUSE`) + `CloseIcon`, single labeled name input keeping `data-testid="warehouse-name-input"` and placeholder `WAREHOUSES.NAME_PLACEHOLDER`, footer `Cancelar` / `Guardar` (`WAREHOUSES.CANCEL` / `WAREHOUSES.SAVE`). Empty/whitespace name → Save disabled (the domain's `createWarehouse` already validates too — UI guard is best-effort, domain is the source of truth).
**Alternatives considered**: two separate modals; keeping inline rows (user asked for popup).
**Rationale**: one component, two modes, exactly like `expense-form-modal` (expense ? edit : create title).

### Decision: Remove `icon?` from MenuItem + sidebar branch, not just the 🏬 value
**Choice**: delete `icon: '🏬'` from the Warehouses item AND remove the `icon?: string` property from the `MenuItem` interface AND the `item.icon &&` render branch in `sidebar.tsx:87-89`. Update the convention comment.
**Alternatives considered**: only dropping the value (leaves the escape hatch open for future violations).
**Rationale**: structural enforcement; the user asked to document the rule for agents, and dead props invite regression. `typecheck` proves no other consumer (grep: only `landing-deep.tsx` uses `feature.icon`, a different object; sidebar tests assert the NEW badge, never icons).

### Decision: AGENTS.md rule placement
**Choice**: add to `frontend-react/AGENTS.md` under a menu/sidebar-relevant section (next to Code Style conventions): "Menu items are plain text labels only. Never add icons (including emojis) to menu items in `menu-config.ts`."
**Alternatives considered**: CLAUDE.md (backend-rooted file; the frontend rule belongs in the frontend AGENTS.md).
**Rationale**: the file agents read before touching frontend code; the rule lives next to the code it governs.

## Data Flow

Unchanged service calls; only presentation state changes:

```
stockLevels (already loaded) ──derive──▶ productCount = levels(wh).length
                                   └────▶ totalCost = Σ onHand × costPrice (formatCurrency)

gear "Editar" ──▶ modal open, prefilled with warehouse.name
modal "Guardar" ──▶ service.updateWarehouse(id, name) | createWarehouse(name) ──▶ load() + toast

menu-config: MenuItem loses icon? ──▶ sidebar renders label text (+ NEW badge) only
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/inventory/components/warehouse-form-modal.tsx` | Create | Create/edit modal (name field, empty-name guard, i18n, testid `warehouse-name-input`) |
| `apps/web-store-pos/app/inventory/routes/warehouses.tsx` | Modify | Header: + product-count + total-cost counters (keep Cantidad), replace flat buttons with `ActionMenu` gear, replace inline create/rename rows with modal state (`creating`, `editing`), keep all other testids/flows |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modify | + `WAREHOUSES.EDIT_WAREHOUSE` ("Editar almacén"), `WAREHOUSES.PRODUCT_COUNT` ("Productos"), `WAREHOUSES.TOTAL_COST` ("Costo total") |
| `apps/web-store-pos/app/shared/lib/config/menu-config.ts` | Modify | Remove `icon: '🏬'`; remove `icon?: string` from `MenuItem`; update convention comment |
| `apps/web-store-pos/app/shared/components/sidebar.tsx` | Modify | Remove `item.icon` render branch (L87-89) |
| `frontend-react/AGENTS.md` | Modify | Add "no icons in menu items" rule |
| `frontend-react/e2e/warehouses.spec.ts` | Modify | AUTHORIZED ONLY: test "desactivar almacén con stock…", lines ~399/~407 — open gear (`warehouse-actions-toggle-{id}`) before clicking `menuitem` "Desactivar" |
| `apps/web-store-pos/app/inventory/routes/__tests__/warehouses.test.tsx` | Modify | Adapt deactivation unit test to gear interaction; adapt create test to modal; ADD new unit tests: counters, gear items, modal create/edit validation |

## Interfaces / Contracts

```tsx
// warehouse-form-modal.tsx
interface WarehouseFormModalProps {
  open: boolean;
  /** Present → edit mode (prefilled). Absent → create mode. */
  warehouse?: Warehouse;
  onClose: () => void;
  onSave: (name: string) => void;
}
// render: role="dialog", aria-modal, backdrop-click close, Escape close (via useClickOutside + keydown, matching expense-form-modal)

// warehouses.tsx header (per warehouse card):
<ActionMenu
  testId={`warehouse-actions-toggle-${warehouse.id}`}
  label={`Acciones de ${warehouse.name}`}
>
  <ActionMenuItem intent="edit" onClick={() => setEditing(warehouse)}>Editar</ActionMenuItem>
  <ActionMenuItem intent="deactivate" separatorBefore onClick={() => handleDeactivate(warehouse)}>Desactivar</ActionMenuItem>
</ActionMenu>

// Header counters (collapsed row, after name):
// Productos: {levels.length} · Costo total: {formatCurrency(totalCost)} · Cantidad: {totalOnHand} (existing)
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (vitest) | Header counters | levels = 2 rows → "Productos: 2"; costPrice 660×24 + 100×10 → "Costo total: $16,840" (formatCurrency shape) |
| Unit | Gear menu | toggle opens; "Editar" opens modal prefilled; "Desactivar" with stock → `showBlockingError` with `WarehouseErrors.CannotDeactivate` (same assertion as today, interaction adapts); empty warehouse → deactivates |
| Unit | Modal | create: empty name → save disabled; valid → `createWarehouseImpl` called; edit: prefilled `warehouse.name`, save → `updateWarehouse` path; Cancel/close resets |
| Unit | Menu icon | `menu-config.ts` has no `icon` property anywhere (structural) — sidebar tests already cover badge rendering |
| E2E | Existing spec green | Only authorized test-6 lines changed (gear open → menuitem); create flow passes through modal (`Nuevo almacén` → modal → `warehouse-name-input` → `Guardar`) |
| Typecheck | `icon?` removal | `pnpm typecheck` green proves no other consumer |

## Threat Matrix

N/A — presentational frontend change; no routing, subprocess, VCS automation, or process-integration boundaries. The E2E protection rule is the main hazard and is handled by scope + the single authorized exception.

## Migration / Rollout

Single work-unit commit on the current branch (`dev`): production UI + i18n + tests in one reviewable unit, followed by full frontend verification (`pnpm typecheck`, `pnpm lint`, vitest suites, Playwright `warehouses.spec.ts`). No staged rollout — offline-first app, no server coordination needed.

## Open Questions

None blocking. (Product count definition = number of stock-level rows for that warehouse — a stock row exists only when a product has been purchased/transferred in, matching "products in stock".)
