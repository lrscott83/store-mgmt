# Spec: warehouses-ui-redesign (delta)

## ADDED Requirements

### Requirement: Warehouse panel header counters (WUI-1)

The collapsed warehouse panel header SHALL display, alongside the warehouse name, a product count and a total cost, in addition to the existing total-units counter.

- Product count = the number of `WarehouseStockLevel` rows for that warehouse (distinct products with stock).
- Total cost = Σ (`onHand` × `costPrice`) across that warehouse's stock levels, rendered with `formatCurrency`.
- The existing "Cantidad: N" (total units) counter SHALL remain.

#### Scenario: WUI-1-a — Header shows both counters with stock

- GIVEN a warehouse with 2 stock-level rows (24 × $660, 10 × $100)
- WHEN the Warehouses page renders (panel collapsed)
- THEN the header shows "Productos: 2" and "Costo total: $16,840"
- AND the header still shows "Cantidad: 34"

#### Scenario: WUI-1-b — Empty warehouse shows zeroed counters

- GIVEN a warehouse with no stock-level rows
- WHEN the Warehouses page renders
- THEN the header shows "Productos: 0" and "Costo total: $0"
- AND the header still shows "Cantidad: 0"

### Requirement: Warehouse gear menu with Editar and Desactivar (WUI-2)

Each warehouse card SHALL render the shared `ActionMenu` gear (trigger `data-testid="warehouse-actions-toggle-{id}"`, accessible label "Acciones de {name}") with exactly two menu items: "Editar" (intent `edit`) and "Desactivar" (intent `deactivate`, rendered after a separator). The flat outline buttons SHALL be removed.

#### Scenario: WUI-2-a — Gear opens and offers both actions

- GIVEN a warehouse card
- WHEN the gear trigger is clicked
- THEN a `role="menu"` dropdown renders with menu items "Editar" and "Desactivar"
- AND no flat "Editar"/"Desactivar" outline buttons render outside the menu

#### Scenario: WUI-2-b — Desactivar keeps domain guard behavior

- GIVEN a warehouse with stock or movements
- WHEN the gear is opened and "Desactivar" is clicked
- THEN the blocking error `Warehouse.CannotDeactivate` ("No se puede desactivar un almacén con stock o movimientos.") is shown and the warehouse stays active — unchanged from current behavior

#### Scenario: WUI-2-c — Empty warehouse deactivates from the gear

- GIVEN a warehouse with no stock and no movements
- WHEN the gear is opened and "Desactivar" is clicked
- THEN the warehouse is deactivated and its header shows "(Inactivo)"

### Requirement: Popup for create and edit warehouse (WUI-3)

Creating and renaming a warehouse SHALL happen in a modal dialog (`role="dialog"`, `aria-modal="true"`), replacing the inline input rows. The modal reuses testid `warehouse-name-input` for the name field and the existing "Guardar"/"Cancelar"/"Nuevo almacén" labels. Edit mode is prefilled with the current name and titled "Editar almacén" (new key `WAREHOUSES.EDIT_WAREHOUSE`).

#### Scenario: WUI-3-a — Create via modal

- GIVEN the Warehouses page with no modal open
- WHEN "Nuevo almacén" is clicked
- THEN a dialog appears titled "Nuevo almacén" with an empty name input
- WHEN a valid name is typed and "Guardar" is clicked
- THEN `createWarehouse` is called, the modal closes, and the success toast shows

#### Scenario: WUI-3-b — Empty name cannot be saved

- GIVEN the create (or edit) modal open
- WHEN the name input is empty or whitespace-only
- THEN "Guardar" is disabled

#### Scenario: WUI-3-c — Edit via modal prefilled

- GIVEN a warehouse exists
- WHEN its gear is opened and "Editar" is clicked
- THEN a dialog appears titled "Editar almacén" with the input prefilled with the current name
- WHEN the name is changed and "Guardar" is clicked
- THEN `updateWarehouse` is called, the modal closes, and the success toast shows

### Requirement: Menu items never carry icons (WUI-4)

The Warehouses menu item SHALL NOT render the 🏬 icon, and the `MenuItem` interface SHALL NOT expose an `icon` property. The sidebar SHALL NOT render any per-item icon branch.

#### Scenario: WUI-4-a — Warehouses menu item is text-only

- GIVEN a user with the Warehouses feature
- WHEN the sidebar renders
- THEN the Warehouses item shows its label (and NEW badge) with no icon

#### Scenario: WUI-4-b — Structural enforcement

- GIVEN the `MenuItem` type after this change
- THEN no consumer can set an icon (property removed) and `pnpm typecheck` passes

### Requirement: Agent documentation of the no-icon menu rule (WUI-5)

`frontend-react/AGENTS.md` SHALL document that menu items are plain text labels only and that agents must never add icons (including emojis) to menu items.

#### Scenario: WUI-5-a — Rule is documented

- GIVEN `frontend-react/AGENTS.md` after this change
- THEN it contains the no-icon menu rule in the conventions section

## REMOVED Requirements

None.

## MODIFIED Requirements

None — all existing warehouses E2E scenarios remain valid; the single authorized interaction adaptation (gear open before "Desactivar" in the deactivation test) preserves each original assertion.
