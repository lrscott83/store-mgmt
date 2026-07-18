# Tasks: Gear Menu & Action Styling Consistency

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-950 (1 new component + test ~220, icons +60, 9 menu files ~50-90 each incl. test edits) |
| 400-line budget risk | High |
| Chained PRs recommended | No (delivery is commits-per-work-unit on main, not PRs) |
| Suggested split | N/A — sequential work-unit commits, not PR chain |
| Delivery strategy | commits-only on feature branch (per project convention; no chained PRs) |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

Note: this repo's established delivery convention (`delivery-commits-only-on-feature-branch`) is work-unit commits directly on the working branch — no PRs, no chaining, no `size:exception` gate. The 400-line estimate is informational only; each work unit below is independently committable and revertable.

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Icons + ActionMenu/ActionMenuItem primitive | Foundation; own test file; nothing else depends-on until this lands |
| 2-7 | Restyle 6 existing gear menus (1 commit each) | Independent per file; existing tests preserved + extended |
| 8-10 | Gear-ify 3 flat-button screens (1 commit each) | Independent per file; tests rewritten for gear interaction |
| 11 | Full verification | typecheck + full suite + grep sweep |

## Phase 1: Foundation

- [x] 1.1 RED: write `apps/web-store-pos/app/shared/components/ui/__tests__/action-menu.test.tsx` covering S-GM-MENU-1..4, S-GM-ITEM-1..5 (closed-by-default, trigger opens, click-outside closes, custom label/testId, each intent's color+icon, neutral `text-text`+no icon, `icon={null}` suppression, `separatorBefore` divider, click fires onClick + closes).
- [x] 1.2 GREEN: add `PayIcon`, `CheckCircleIcon`, `BanIcon` to `shared/components/ui/icons.tsx` (BASE `h-5 w-5 shrink-0`, `viewBox 0 0 24 24`, `stroke="currentColor"`, `fill="none"`, `aria-hidden="true"`) per design ADR-3 paths.
- [x] 1.3 GREEN: create `shared/components/ui/action-menu.tsx` — `ActionMenu` (trigger+`SettingsIcon`+`role="menu"` dropdown+`useClickOutside`+private Context) and `ActionMenuItem` (intent->color/icon `const` map, `separatorBefore`, `icon` escape hatch, `close(); onClick();`) per design ADR-1/ADR-2. Run 1.1's tests to green.
- [x] 1.4 REFACTOR: confirm no duplicate intent-map logic remains anywhere; run targeted test file + `tsc --noEmit` on this file only.

## Phase 2: Restyle Existing Gear Menus (6, one work-unit each)

- [x] 2.1 `sales/components/category-actions-menu.tsx` — RED: extend `sales/components/__tests__/category-actions-menu.test.tsx` with S-GM-CAT-ACTIONS-1 (3 `intent="create"/"edit"` items, `text-primary`, no separator). GREEN: swap inline gear scaffold for `<ActionMenu testId="category-actions-toggle-${category.id}" label="Opciones de categoría" widthClass="w-52">`; preserve `edit-category-button`/`add-products-button`/`add-product-button` testids + i18n keys.
- [x] 2.2 `sales/components/category-product-list.tsx` (ProductRow) — RED: extend `sales/components/__tests__/category-product-list.test.tsx` with S-GM-PRODUCT-ROW-1 (Editar `text-primary`, Eliminar `text-danger` + separator). GREEN: swap inline menu for `<ActionMenu label="Acciones">` with Editar (`intent="edit"`) / Eliminar (`intent="delete"`, `separatorBefore`); keep `PRODUCT.EDIT_PRODUCT`/`PRODUCT.DELETE_PRODUCT`.
- [x] 2.3 `sales/components/sale-credit-list.tsx` — RED: extend `sales/components/__tests__/credit-components.test.tsx` with S-GM-SALE-CREDIT-1..3 (unpaid shows Editar+Pagar por, paid hides Pagar por, per-row isolation). GREEN: replace hand-rolled 16-viewBox svg with `ActionMenu` (testId `sale-credit-actions-toggle-${saleCredit.id}`); items Editar (`intent="edit"`, `GENERAL.EDIT`) + Pagar por (`intent="pay"`, `SALE_CREDIT.TO_PAY`, only when `!paid`); drop list-level `openMenuId`/`setOpenMenuId`, keep `handleSave`/`handlePay` unchanged.
- [x] 2.4 `admin/owners/components/owner-card-list.tsx` — RED: extend `admin/owners/components/__tests__/owner-card-list.test.tsx` with S-GM-OWNER-1 (color+separator assertions only; existing `menuitem`/`/acciones/i` assertions MUST stay unedited). GREEN: swap to `ActionMenu widthClass="w-40"` with Editar (`intent="edit"`)/Eliminar (`intent="delete"`, `separatorBefore`); preserve `OWNER.EDIT_OWNER`/`GENERAL.DELETE`/testids/handlers.
- [x] 2.5 `admin/resellers/components/reseller-card-list.tsx` — first re-read the file to confirm it is a structural twin of owner-card-list (design risk note). RED: extend `admin/resellers/components/__tests__/reseller-card-list.test.tsx` with S-GM-RESELLER-1. GREEN: identical migration to 2.4, own i18n keys/testids/handlers preserved. **DEVIATION**: re-read confirmed reseller-card-list is NOT an item-level twin of owner (no `onDelete` prop, no Eliminar action exists in source/tests) — migrated to `ActionMenu` with Editar (`intent="edit"`) ONLY, no Eliminar/separator added (would invent new behavior, violating GM-NGOAL-2).
- [x] 2.6 `management/users/components/user-card-list.tsx` — RED: extend `management/users/components/__tests__/user-card-list.test.tsx` with S-GM-USER-1..3 (inactive shows Editar+Activar no Desactivar; active shows Editar+Desactivar no Activar; no separator). GREEN: `ActionMenu widthClass="w-40"` with Editar (always), Activar (`intent="activate"`, `!isActive`), Desactivar (`intent="deactivate"`, `isActive`); "Adicionar" stays a plain `Button`; `handleEdit/handleActivate/handleDeactivate` unchanged.

## Phase 3: Gear-ify Flat-Button Screens (3, one work-unit each, tests rewritten under TDD)

- [x] 3.1 `inventory/components/entry-list.tsx` — RED: rewrite the relevant cases in `inventory/components/__tests__/inventory-components.test.tsx` for S-GM-ENTRY-1..3 (gear only when `isOwnerAdmin && !readOnly`; Editar calls `onEdit?.(entry)`; Eliminar calls `onDeactivate?.(entry)` with separator; hidden otherwise). GREEN: wrap the `showActions` cell in `<ActionMenu testId="entry-actions-toggle-${entry.id}">`; Editar (`intent="edit"`, `GENERAL.EDIT`), Eliminar (`intent="delete"`, `separatorBefore`, `GENERAL.DELETE`); keep `onEdit`/`onDeactivate` handler names and the existing gate condition.
- [x] 3.2 `expenses/components/expense-list.tsx` — RED: rewrite relevant cases in `expenses/components/__tests__/expense-components.test.tsx` for S-GM-EXPENSE-1..3 (`!readOnly` + `onDelete` shows both; no `onDelete` hides only Eliminar; `readOnly` hides the whole cell). GREEN: wrap in `<ActionMenu testId="expense-actions-toggle-${expense.id}">`; Editar (`intent="edit"`, `EXPENSES.EDIT`, `onEdit?.(expense)`), Eliminar (`intent="delete"`, `separatorBefore`, `EXPENSES.DELETE`, `onDelete(expense)`, gated on `onDelete` presence); drop the manual `<TrashIcon className="h-3.5 w-3.5">` in favor of the primitive's default. Also fixed a downstream route test (`expenses-routes.test.tsx`) that clicked "Editar" text directly without opening the new gear first.
- [x] 3.3 `admin/stores/components/store-card-list.tsx` — RED: rewrite relevant cases in `admin/stores/components/__tests__/store-card-list.test.tsx` for S-GM-STORE-1..3 (approved shows Editar+Desaprobar not Aprobar; unapproved shows Editar+Aprobar not Desaprobar; no separator either way). GREEN: replace the flat `Button` row with `<ActionMenu testId="store-actions-toggle-${store.id}" widthClass="w-40">`; Editar (`intent="edit"`, `STORES.EDIT`, `onEdit(store.id)`) then XOR Desaprobar (`intent="disapprove"`, `STORES.DISAPPROVE`, `onDisapprove(store.id)`) / Aprobar (`intent="approve"`, `STORES.APPROVE`, `onApprove(store.id)`) by `store.approved`; keep Activate/Deactivate dead-coded out; leave `getStoreCardClass` untouched. Also fixed a downstream route test (`admin/stores/routes/__tests__/store-list.test.tsx`) that clicked Aprobar/Desaprobar buttons directly — now opens the gear first.

## Phase 4: Verification

- [x] 4.1 Run full `pnpm test` (all suites) — zero regressions, including the 3 unmodified owner/reseller/user assertion blocks (S-GM-PARITY-1). Final result: 125 test files, 1789 tests, all passing.
- [x] 4.2 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — zero errors.
- [x] 4.3 Grep sweep for leftover hand-rolled gear markup (`viewBox="0 0 16 16"`, inline `setIsOpen`/`openMenuId` menu scaffolds, manual `<TrashIcon className="h-3.5` etc.) across the 9 target files — confirmed none remain outside `action-menu.tsx`.
- [x] 4.4 Re-verify no cross-row menu-open leakage in `sale-credit-list.tsx` (S-GM-SALE-CREDIT-3, test passes) and confirm `reseller-card-list.tsx` ended up structurally identical to `owner-card-list.tsx` per the 2.5 pre-check — NOT identical at the item level (see 2.5 deviation note); same primitive/pattern used, only Editar item.
