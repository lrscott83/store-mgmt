# Tasks: warehouses-ui-redesign

## Review Workload Forecast

- Estimated changed lines: **~300–420** (warehouses.tsx restructure ~140, modal ~110, i18n/menu-config/sidebar/AGENTS.md ~60, unit tests ~80–120, E2E authorized lines ~8).
- 800-line budget risk: **No** (below the session budget of 800).
- Chained PRs recommended: **No** — session strategy is no-PRs (work-unit commits on the current branch).
- Decision needed before apply: **No**.

## Work Units

### WU-1: Menu icon removal + structural enforcement + AGENTS.md rule

- [ ] 1.1 `apps/web-store-pos/app/shared/lib/config/menu-config.ts` — remove `icon: '🏬'` from the Warehouses item; remove `icon?: string` from the `MenuItem` interface; update the L139-140 convention comment to note the structural removal (Warehouses 🏬 removed 2026-09-06).
- [ ] 1.2 `apps/web-store-pos/app/shared/components/sidebar.tsx` — remove the `item.icon &&` render branch (L87-89).
- [ ] 1.3 `frontend-react/AGENTS.md` — add the rule: menu items are plain text labels only; never add icons (including emojis) to menu items (menu-config.ts).
- [ ] 1.4 Verify: `pnpm typecheck` green (proves no other `item.icon` consumer); sidebar vitest suite green (badge tests unaffected).

### WU-2: i18n keys

- [ ] 2.1 `apps/web-store-pos/app/shared/lib/i18n/es.ts` — add `WAREHOUSES.EDIT_WAREHOUSE: 'Editar almacén'`, `WAREHOUSES.PRODUCT_COUNT: 'Productos'`, `WAREHOUSES.TOTAL_COST: 'Costo total'` (place beside the existing `WAREHOUSES.*` block, L543-577).

### WU-3: Warehouse form modal (create/edit)

- [ ] 3.1 Create `apps/web-store-pos/app/inventory/components/warehouse-form-modal.tsx` per design: props `{ open, warehouse?, onClose, onSave }`; `role="dialog"` + `aria-modal="true"` + backdrop-click close + Escape close; title `NEW_WAREHOUSE` / `EDIT_WAREHOUSE`; name input keeps `data-testid="warehouse-name-input"` + `NAME_PLACEHOLDER`; Save disabled on empty/whitespace name; footer `CANCEL` / `SAVE`; `CloseIcon` header button. Model: `expenses/components/expense-form-modal.tsx`.
- [ ] 3.2 Unit tests (NEW file `apps/web-store-pos/app/inventory/components/__tests__/warehouse-form-modal.test.tsx`): create mode renders title + empty input; edit mode prefills; Save disabled on empty/whitespace; Save calls `onSave` with trimmed value and does not close by itself (parent owns close on success); Cancel and backdrop click call `onClose`.

### WU-4: Warehouses page redesign (gear + counters + modal wiring)

- [ ] 4.1 `apps/web-store-pos/app/inventory/routes/warehouses.tsx` — header: keep `Cantidad: {totalOnHand}`, add `Productos: {levels.length}` and `Costo total: {formatCurrency(totalCost)}` where `totalCost = Σ onHand × costPrice`; replace the two flat outline buttons with `ActionMenu` (testid `warehouse-actions-toggle-{id}`, label `Acciones de {name}`, items `Editar` intent=edit + `Desactivar` intent=deactivate separatorBefore); remove the inline create row and the per-warehouse rename row; add modal state (`creating`, `editing: Warehouse | null`); wire `handleCreate`/`handleRename` to the modal's `onSave`; keep every other testid and flow (`warehouse-toggle-*`, `purchase-select-*`, `stock-onhand-*`, `stock-cost-*`, movement form, movements table).
- [ ] 4.2 Adapt `apps/web-store-pos/app/inventory/routes/__tests__/warehouses.test.tsx`: "blocks deactivation…" test now opens the gear (`getByTestId('warehouse-actions-toggle-wh-1')`) before clicking `menuitem` "Desactivar" (same `showBlockingError` + `WarehouseErrors.CannotDeactivate` assertion); "creates a warehouse from the inline form" → modal interaction (click "Nuevo almacén" → dialog → `warehouse-name-input` → "Guardar"); keep `/Cantidad: 24/` assertion green (additive counters).
- [ ] 4.3 Add unit tests: WUI-1-a/b counters (2 rows → "Productos: 2", "$16,840", "Cantidad: 34"; empty → 0/$0); WUI-2-a gear items (Editar + Desactivar after gear click, no flat buttons); WUI-3-c edit flow (gear → Editar → prefilled modal → save calls service and toasts).

### WU-5: Authorized E2E adaptation (test 6 only)

- [ ] 5.1 `frontend-react/e2e/warehouses.spec.ts` — ONLY the test "desactivar almacén con stock se bloquea y almacén vacío sí se desactiva" (~L399, ~L407): insert gear open (`getByTestId('warehouse-actions-toggle-…')` — resolve id from the card or via `getByRole('button', { name: /Acciones de/ })` scoped to the card) before each `getByText('Desactivar').click()` → `getByRole('menuitem', { name: 'Desactivar' }).click()`. Pattern: `expense-crud.spec.ts:46-51`. NOTHING else in the file changes. (User-authorized 2026-09-06.)

### WU-6: Full verification (per AGENTS.md)

- [ ] 6.1 `pnpm typecheck` + `pnpm lint` (frontend-react root).
- [ ] 6.2 Vitest: warehouses page suite + warehouse-form-modal suite + sidebar suite green.
- [ ] 6.3 Playwright: `npx playwright test e2e/warehouses.spec.ts` (needs the real backend per AGENTS.md) — full spec green.
- [ ] 6.4 Record evidence (commands + pass counts) in apply-progress.

## Rollback

Single work-unit commits per WU on `dev`; `git revert` of the commit(s) restores the previous UI. No data migrations (offline-first, service layer untouched).
