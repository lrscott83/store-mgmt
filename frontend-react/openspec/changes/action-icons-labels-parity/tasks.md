# Tasks: Action Icons & Labels Parity (Products area)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-260 (7 files: 5 tsx tweaks + 1 i18n value + 2 blast-radius test updates) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 7 in-scope files, one PR | PR 1 | Small mechanical parity change; no dependency boundary needed |

## Phase 1: GENERAL.SAVE i18n value (foundation — global blast radius)

- [x] 1.1 RED: update `expenses/routes/__tests__/expenses-routes.test.tsx:130` `getByText('Guardar')` → `'Salvar'`
- [x] 1.2 RED: update `expenses/components/__tests__/expense-components.test.tsx:29,43` `getByText('Guardar')` → `'Salvar'`
- [x] 1.3 GREEN: `shared/lib/i18n/es.ts` — change `'GENERAL.SAVE': 'Guardar'` → `'Salvar'` (leave `PROFILE.SAVE`/`STORES.SAVE` untouched, different keys)
- [x] 1.4 Verify 1.1/1.2 now pass; confirm `edit-order-details-modal.test.tsx` has no stray `'Guardar'` assertion (already checked — none)

## Phase 2: category-actions-menu.tsx (icons + order)

- [x] 2.1 RED: in `category-actions-menu.test.tsx`, add/update assertions: DOM order is edit-category-button → add-products-button → add-product-button; each button's `querySelector('svg')` is non-null
- [x] 2.2 GREEN: import `EditIcon`, `PlusIcon` from `shared/components/ui/icons`; add icon to each menu item; reorder JSX to Categoría → Productos (bulk, `add-products-button`) → Producto (single, `add-product-button`)

## Phase 3: category-product-list.tsx (ProductRow menu icons)

- [x] 3.1 RED: in `category-product-list.test.tsx`, assert "Editar Producto" button has `text-primary` class and contains an `svg`; assert "Eliminar Producto" button contains an `svg` and keeps `text-danger`
- [x] 3.2 GREEN: import `EditIcon`, `TrashIcon`; add `EditIcon` + change edit button className `text-text` → `text-primary`; add `TrashIcon` to delete button (no color change)

## Phase 4: Modal footers (close/save icons + labels)

- [x] 4.1 RED: `edit-product-category-modal.test.tsx` — close button name is "Cerrar" (not "Cancelar") with svg; confirm button name is "Actualizar" in edit-mode / "Salvar" in create-mode, both with svg
- [x] 4.2 GREEN: `edit-product-category-modal.tsx` — `GENERAL.CANCEL`→`GENERAL.CLOSE` + `CloseIcon`; confirm label `isEditing ? GENERAL.UPDATE : GENERAL.SAVE` + `SaveIcon`
- [x] 4.3 RED: `create-product-modal.test.tsx` — close button name "Cerrar" with svg; confirm button name "Salvar" with svg
- [x] 4.4 GREEN: `create-product-modal.tsx` — cancel→`GENERAL.CLOSE` + `CloseIcon`; add `SaveIcon` to confirm button
- [x] 4.5 RED: `edit-product-modal.test.tsx` — close button name "Cerrar" with svg; confirm button name "Actualizar" with svg (do not touch orphan delete-confirm footer block)
- [x] 4.6 GREEN: `edit-product-modal.tsx` — cancel→`GENERAL.CLOSE` + `CloseIcon`; confirm text→`GENERAL.UPDATE` + `SaveIcon`
- [x] 4.7 RED: add/extend a test for `edit-products-modal.tsx` footer — close button name "Cerrar" with svg; confirm button retains its label and gains an svg (bulk price-edit body untouched)
- [x] 4.8 GREEN: `edit-products-modal.tsx` footer only — cancel→`GENERAL.CLOSE` + `CloseIcon`; add `SaveIcon` to confirm button

## Phase 5: Full Verification

- [x] 5.1 `rg "Guardar" frontend-react/apps/web-store-pos/app` — confirm no remaining test/component asserts the old GENERAL.SAVE-derived text (button.test.tsx literal prop usage and user-create-form.test.tsx "not Guardar" assertion are unaffected, no action needed)
- [x] 5.2 Run `pnpm test` (full suite) — must be green
- [x] 5.3 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — must be clean
