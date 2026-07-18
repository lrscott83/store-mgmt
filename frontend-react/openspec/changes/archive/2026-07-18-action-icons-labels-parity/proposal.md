# Proposal: Action Icons & Labels Parity (Products area)

## Intent

React's Products-area action UI diverges from Angular (the source of truth) on ICONS and BUTTON TEXTS. Angular renders a Material icon next to every action button / menu item; React omits them. Two i18n bugs also exist: `GENERAL.SAVE` value (`Guardar` vs Angular `Salvar`) and modal footers using `GENERAL.CANCEL` ("Cancelar") instead of Angular's `GENERAL.CLOSE` ("Cerrar") + close-icon fab. This is a low-risk, mechanical parity change — every icon component already exists in `icons.tsx` (EditIcon, PlusIcon, CloseIcon, SaveIcon, TrashIcon); none are created.

## Scope

### In Scope (footer buttons / menu items / icons / text only)
- **`category-actions-menu.tsx`**: add `EditIcon` to "Editar Categoría", `PlusIcon` to "Nuevo Producto" and "Nuevo Productos"; reorder items to Angular order → Categoría, Productos (bulk), Producto (single).
- **`category-product-list.tsx`** (ProductRow menu): add `EditIcon` (primary color) to "Editar Producto"; add `TrashIcon` to "Eliminar Producto" (inherits red via existing `text-danger`).
- **`edit-product-category-modal.tsx`**: Close `GENERAL.CANCEL` → `GENERAL.CLOSE` + `CloseIcon`; Save `isEditing ? GENERAL.UPDATE : GENERAL.SAVE` + `SaveIcon`.
- **`create-product-modal.tsx`**: Cancel → `GENERAL.CLOSE` + `CloseIcon`; add `SaveIcon`.
- **`edit-product-modal.tsx`**: Cancel → `GENERAL.CLOSE` + `CloseIcon`; Save text → `GENERAL.UPDATE` + `SaveIcon` (always edit-mode).
- **`edit-products-modal.tsx`**: Cancel → `GENERAL.CLOSE` + `CloseIcon`; add `SaveIcon` (FOOTER only).
- **`shared/lib/i18n/es.ts`**: `GENERAL.SAVE` `'Guardar'` → `'Salvar'`.

### Out of Scope (explicitly deferred — do NOT touch)
- Orphan delete/confirm-discard footer block in `edit-product-modal.tsx` (no Angular equivalent) — separate follow-up.
- BODY of `edit-products-modal.tsx` (React bulk price-edit vs Angular bulk-add) — different feature, separate follow-up.
- Invented modal header-title i18n keys, optional `SettingsIcon` DRY cleanup, and any consumers of `GENERAL.SAVE` beyond the i18n value change.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — no spec-level requirement changes. Pure UI parity (icons + i18n values). Behavior of save/close actions is unchanged; only rendered icon and label text move to Angular values.

## Baked Decision (user-approved, do NOT re-open)

`GENERAL.SAVE` fix is GLOBAL: one shared Angular key (`'Salvar'`) → one React value. This intentionally also changes the Save button text in the expenses and orders modals (same key) — that is correct Angular parity, not a regression. A products-scoped key was rejected (violates "migration invents nothing new").

## Approach

Wire already-existing icon components into the 5 in-scope component files using the proven footer pattern from `expenses/components/expense-form-modal.tsx` (`CloseIcon`/`SaveIcon` + `Button variant="fab"` = Angular `mat-fab extended`). Swap the two mislabeled i18n keys and add the missing SAVE-vs-UPDATE branch. Fix the shared `GENERAL.SAVE` value once in `es.ts`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `sales/components/category-actions-menu.tsx` | Modified | Edit/Plus/Plus icons + reorder |
| `sales/components/category-product-list.tsx` | Modified | Edit(primary)/Trash icons in ProductRow menu |
| `sales/components/edit-product-category-modal.tsx` | Modified | Close key+icon; Save UPDATE branch+icon |
| `sales/components/create-product-modal.tsx` | Modified | Close key+icon; Save icon |
| `sales/components/edit-product-modal.tsx` | Modified | Close key+icon; Save→Update+icon |
| `sales/components/edit-products-modal.tsx` | Modified | Footer Close key+icon; Save icon |
| `shared/lib/i18n/es.ts` | Modified | `GENERAL.SAVE` → `'Salvar'` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `GENERAL.SAVE` blast radius into closed expenses/orders modals | Low | User-approved as correct parity; typecheck + full suite |
| Accidentally touching orphan delete block / bulk-edit body | Low | Explicitly out of scope; footer-only edits |
| Icon color/variant mismatch vs Angular | Low | Copy exact `expense-form-modal.tsx` pattern |

## Rollback Plan

Revert the work-unit commit(s). All changes are additive icon wiring + i18n value/key swaps in 7 files — no data, schema, or logic changes; `git revert` is clean.

## Dependencies

None. Strict TDD active — test_command `pnpm test`; typecheck `pnpm -C apps/web-store-pos exec tsc --noEmit`.

## Success Criteria

- [x] All 5 component files render Angular-matching icons on the specified buttons/menu items.
- [x] Category gear menu order = Categoría, Productos, Producto.
- [x] Modal footers use `GENERAL.CLOSE` + `CloseIcon`; Save/Update branches correct with `SaveIcon`.
- [x] `GENERAL.SAVE` resolves to `'Salvar'` everywhere.
- [x] Typecheck clean; full test suite green.
