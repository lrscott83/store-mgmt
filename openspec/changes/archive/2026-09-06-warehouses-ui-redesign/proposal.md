# Proposal: warehouses-ui-redesign

## Intent

Bring the Warehouses screen (`/inventory/warehouses`) in line with the app's established UI patterns and finish two loose ends from the warehouses feature:

1. **Header counters**: each collapsed warehouse panel should surface a **product count** (distinct products with stock) and **total cost** (Σ `onHand × costPrice`), in addition to the existing total-units counter.
2. **Gear menu**: replace the flat `Editar` / `Desactivar` outline buttons with the shared `ActionMenu` gear (`Editar` + `Desactivar`; "eliminar" maps to deactivate — the domain has no warehouse hard-delete).
3. **Popup create/edit**: replace the inline input rows (create + rename) with a single modal dialog (create / edit), following the `expense-form-modal.tsx` precedent.
4. **Menu icon removal**: drop `icon: '🏬'` from the Warehouses menu item — the only menu item with an icon, in violation of the convention already documented in `menu-config.ts:139-140`. Remove the `icon?` property from `MenuItem` and the sidebar render branch so the rule is structurally enforced.
5. **Agent documentation**: add the "menu items never get icons" rule to `frontend-react/AGENTS.md` so future agent work cannot reintroduce icons.

## Why

- The user asked for this specific redesign (gear + popup + counters) after noticing the current screen deviates from every other list screen in the app (all of which use gear menus and modals).
- The 🏬 icon violates the menu convention documented in the codebase itself; the wholesale 📦 and exchange-rate 💱 icons were already removed for the same reason (2026-09-04).

## Scope

### In

- `frontend-react/apps/web-store-pos/app/inventory/routes/warehouses.tsx` — restructured header row (counters), gear `ActionMenu`, modal open state.
- NEW `frontend-react/apps/web-store-pos/app/inventory/components/warehouse-form-modal.tsx` — create/edit modal (single name field, validation: non-empty), precedent `expenses/components/expense-form-modal.tsx`.
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` — new keys: `WAREHOUSES.EDIT_WAREHOUSE` ("Editar almacén"), `WAREHOUSES.PRODUCT_COUNT` ("Productos"), `WAREHOUSES.TOTAL_COST` ("Costo total").
- `frontend-react/apps/web-store-pos/app/shared/lib/config/menu-config.ts` — drop `icon: '🏬'` from Warehouses item; remove `icon?` from `MenuItem` interface (with updated convention comment).
- `frontend-react/apps/web-store-pos/app/shared/components/sidebar.tsx` — remove the `item.icon` render branch (lines 87-89).
- `frontend-react/AGENTS.md` — new rule: menu items are plain-text labels; icons are prohibited.
- `frontend-react/e2e/warehouses.spec.ts` — **AUTHORIZED single exception (user-approved this session)**: the "desactivar almacén con stock…" test, lines ~399 and ~407, change `getByText('Desactivar').click()` to open the warehouse gear first then click the `menuitem` "Desactivar" (pattern `expense-crud.spec.ts:46-51`). No other line changes.
- `frontend-react/apps/web-store-pos/app/inventory/routes/__tests__/warehouses.test.tsx` — adapt affected unit tests to the modal/gear interaction (unit tests are outside the E2E untouchable scope; interaction adapts, assertions do not weaken); add NEW unit tests for counters, gear menu, and modal.
- NEW E2E assertions inside the existing authorized spec file are allowed only via new tests? NO — per the untouchable-E2E rule, no new tests are added to the existing spec; new E2E coverage for the redesign is deferred (the redesign is preservable by the existing spec's selectors, adapted only where authorized).

### Out

- Backend production code (the module-13 backend change is closed and archived).
- Warehouse domain logic (`warehouse-offline-service.ts`) — zero behavior changes.
- Hard-delete of warehouses (does not exist in the domain).
- Other menu items (no icons exist to remove).
- Any other screen's UI.

## Approach

Approach 1 from exploration: in-place restructure of `warehouses.tsx` + one new modal component. The redesign is **additive for counters** (keep "Cantidad: N" so the unit test `/Cantidad: 24/` and E2E expectations stay green) and **preservative for testids** (`warehouse-name-input` moves into the modal; `warehouse-toggle-*`, `purchase-select-*`, `stock-*`, movement form testids unchanged). Gear testid: `warehouse-actions-toggle-{id}`; menu items `Editar` (intent `edit`) and `Desactivar` (intent `deactivate`, `separatorBefore`).

## Success Criteria

- All existing frontend E2E specs pass, with only the authorized test-6 lines changed.
- New unit tests cover: header counters (product count + total cost), gear menu (Editar opens modal prefilled; Desactivar blocked with stock / allowed empty), modal (create validates empty name, saves; edit prefills and updates).
- `pnpm typecheck` green after removing `icon?` (no other consumer breaks).
- Sidebar renders the Warehouses item with the NEW badge, no icon.

## Review Workload Forecast

~250-350 changed lines (warehouses.tsx restructure ~150, modal ~100, i18n + menu-config + sidebar + AGENTS.md ~50, tests ~100+) — **within the 800-line session budget**. Chained PRs: No (session strategy: no PRs, work-unit commits on the current branch).
