# Exploration: warehouses-ui-redesign

Change: `warehouses-ui-redesign` — frontend-only UI redesign of the Warehouses screen (`/inventory/warehouses`), menu icon removal, and agent-doc rule.

## Current State

- `frontend-react/apps/web-store-pos/app/inventory/routes/warehouses.tsx` (592 lines): single-file page. Collapsed warehouse header shows `name + (Inactivo) + "Cantidad: {totalOnHand}"`; flat outline buttons `Editar` / `Desactivar` sit beside the header; create and rename are inline input rows (testids `warehouse-name-input`, `warehouse-rename-{name}`); stock table per product (`stock-onhand-*`, `stock-cost-*` testids); movement form (`movement-form-{mode}`, `movement-quantity`, `movement-cost`, `movement-target`, `movement-reason`).
- Shared gear `ActionMenu` at `app/shared/components/ui/action-menu.tsx`: props `{ label?, testId?, widthClass?, children }`; trigger renders `SettingsIcon` (gear); items are `ActionMenuItem` with `intent` (`edit`, `deactivate`, ... — color/icon map), `onClick`, `data-testid`; items render `role="menuitem"`. Testid convention across the app: `{prefix}-actions-toggle-{id}` (e.g. `entry-actions-toggle-e1`, `expense-actions-toggle-…`).
- Modal pattern (no shared modal component exists; each screen has its own): `expenses/components/expense-form-modal.tsx` and `inventory/components/edit-inventory-entry-modal.tsx` are the closest precedents — `role="dialog"`, `aria-modal="true"`, overlay `fixed inset-0 z-50 bg-black/60` closing on backdrop click (`e.target === e.currentTarget`), inner card `w-full max-w-md bg-surface p-6 shadow-xl`, header title + `CloseIcon` button, footer Cancel/Save.
- i18n: single locale `app/shared/lib/i18n/es.ts`, keys `WAREHOUSES.*` at lines 543–577 (full CRUD/movement strings exist).
- Menu: `app/shared/lib/config/menu-config.ts` — `MenuItem.icon?: string` (line 9) exists; the ONLY item using it is Warehouses `icon: '🏬'` (line 89). Lines 139–140 already document the convention "NO menu item carries an icon — plain text labels only (the wholesale 📦 and exchange-rate 💱 icons were removed 2026-09-04)". The 🏬 violates it. Sidebar renders `item.icon` at `shared/components/sidebar.tsx:87-89`.

## Affected Areas

- `app/inventory/routes/warehouses.tsx` — the redesign target (header counters, gear, modal create/edit).
- `app/inventory/components/warehouse-form-modal.tsx` — NEW modal (create/edit), following `expense-form-modal.tsx` precedent.
- `app/shared/lib/i18n/es.ts` — new keys: modal titles (`EDIT_WAREHOUSE`), product-count + total-cost header labels.
- `app/shared/lib/config/menu-config.ts` — drop `icon: '🏬'`; optionally drop `icon?` from `MenuItem` interface to structurally enforce the no-icon rule.
- `app/shared/components/sidebar.tsx` — only if `icon?` prop is removed structurally (lines 87–89).
- `frontend-react/AGENTS.md` — new agent rule: menu items never get icons.
- `frontend-react/e2e/warehouses.spec.ts` — test "desactivar almacén con stock…" lines ~399/407 (authorized exception, gear-open before clicking Desactivar). All other selectors preserved by design.
- `app/inventory/routes/__tests__/warehouses.test.tsx` — vitest unit test (NOT protected by the E2E untouchable rule; normal adaptation allowed): 'blocks deactivation…' clicks `getByText('Desactivar')` directly → needs gear-open first; 'creates a warehouse from the inline form' passes unchanged if modal keeps `warehouse-name-input` testid and 'Guardar'/'Nuevo almacén' texts; 'lists warehouses with their total on-hand' asserts `/Cantidad: 24/` → keep the units counter in the header (additive redesign) so it stays green.
- `app/shared/components/__tests__/sidebar.test.tsx` — asserts the NEW badge (`menu-new-badge-/inventory/warehouses`), NOT the icon. Icon removal is invisible to it.

## E2E impact classification (`frontend-react/e2e/warehouses.spec.ts`)

- (a) Unaffected: sale_out flow, insufficient-stock Swal, transfer, decimals, export/import roundtrip (testids `warehouse-card-{name}`, `warehouse-toggle-{name}`, `purchase-select-{name}`, `stock-onhand-*`, `stock-cost-*`, movement form testids all preserved), menu feature gate (test 9 asserts `a[href="/inventory/warehouses"]` — no icon assertion), FIFO regression, StoreUser logout.
- (b) Affected but preservable: create flow (`getByText('Nuevo almacén')` → opens modal; `warehouse-name-input` + 'Guardar' kept inside modal), `(Inactivo)` tag stays in the collapsed header.
- (c) Requires change — AUTHORIZED BY USER (this session): test "desactivar almacén con stock se bloquea y almacén vacío sí se desactiva", lines ~399 and ~407: `getByText('Desactivar').click()` → must open the warehouse gear first, then click the `menuitem` "Desactivar" (pattern: `expense-crud.spec.ts:46-51`, `inventory-entry.spec.ts:71-76`). No other line of the spec changes.

## Approaches

1. **In-place restructure + one modal component (recommended)**
   - Keep `warehouses.tsx` as the page; add `warehouse-form-modal.tsx` in `inventory/components/` (mirrors `expense-form-modal.tsx`); header row gains product-count + total-cost counters (additive — keep `Cantidad: N`); gear `ActionMenu` per warehouse replaces the two flat buttons.
   - Pros: minimal footprint (~1 new file + 1 restructured file + i18n + menu-config), follows existing precedents exactly, keeps E2E/unit couplings green by design, YAGNI-compliant.
   - Cons: `warehouses.tsx` stays large.
   - Effort: Low-Medium.

2. **Extract WarehouseCard + WarehouseStockTable sub-components**
   - Pros: smaller units.
   - Cons: no reuse exists, more churn, higher risk of breaking testid contracts for zero current benefit; violates YAGNI.
   - Effort: Medium-High.

## Recommendation

Approach 1. Header counters are additive (keep the units counter so unit test `/Cantidad: 24/` and E2E expectations stay green). Gear testid: `warehouse-actions-toggle-{id}`; menu items: `Editar` (intent `edit`) + `Desactivar` (intent `deactivate`, `separatorBefore`). Modal keeps `warehouse-name-input` testid + 'Guardar'/'Cancelar'/'Nuevo almacén' texts. Menu icon removal: drop `icon: '🏬'` AND remove the `icon?` prop + sidebar render branch so the rule is structurally enforced (sidebar tests don't assert icons); keep the NEW badge. AGENTS.md rule under "Code Style" / styling section: menu items are plain text labels only — never add icons.

## Risks

- The E2E untouchable rule: only the authorized test-6 lines ~399/407 may change; every other E2E selector must be preserved exactly (testids listed above are the contract).
- react-intl silently renders the key id if a new key is misspelled — add keys carefully and run vitest.
- Removing `icon?` from `MenuItem` touches shared `sidebar.tsx`; existing sidebar tests don't assert icons, so risk is low, but `typecheck` must pass (any other consumer of `item.icon` would break — grep found only `landing-deep.tsx` which uses `feature.icon`, a different object).
- Vitest unit test adaptation (`warehouses.test.tsx` deactivation test) is allowed (unit tests are outside the E2E untouchable scope) but must adapt the interaction, not weaken the assertion.

## Ready for Proposal

Yes. Ambiguity resolved by additive design: header keeps the units counter AND adds product count + total cost (sum of `onHand × costPrice` per stock level of that warehouse). User-approved: auto mode, openspec store, no PRs (work-unit commits on current branch), 800-line review budget, test-6 gear adaptation authorized.
