# Proposal: Product Modal Parity (Create/Edit)

## Intent
React's product create/edit modals diverged from the ONE real Angular modal (`EditProductModalComponent`, used for both). They ship invented fields (barcode input, category dropdown, in-modal delete) and omit real ones (Orden, Activo, `$` price prefix). Realign to Angular source. Removing the category dropdown also fixes a live bug: create ignores the click-context category.

## Scope

### In Scope
- REMOVE barcode input + category dropdown from BOTH modals.
- REMOVE in-modal delete block (`delete-product-button`/`confirm-delete-button`) and `onDelete` prop from EditProductModal.
- ADD Orden (required numeric) + Activo (checkbox, default true) to BOTH modals; ADD `$` prefix on Precio.
- Prop reshape: CreateProductModal `categories[]` → single `category` + `defaultOrder`; EditProductModal drop `categories` + `onDelete`.
- products.tsx: precompute default order via `productService.getMaxOrder(category.id)` before opening create; wire `category={modal.category}` and `defaultOrder`; thread real `order`/`isActive` from modal (drop hardcoded `1`/`true`).
- i18n: retitle to `PRODUCT.NEW_PRODUCT` / `PRODUCT.EDIT_PRODUCT`; fix `PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY` value `Descontar del inventario` → `Descuenta del Inventario`.
- Rewrite 3 test files.

### Out of Scope
- Any service/repository/domain change (product-service already 1:1 with Angular).
- businessId/barcode field support (Angular keeps them commented/undefined — unchanged).
- `edit-products-modal.tsx` (separate bulk-grid modal).

## Capabilities
### New Capabilities
- `product-modal-form`: create/edit product modal field contract, prop signatures, and order-prefill wiring in strict parity with Angular's `EditProductModalComponent`.
### Modified Capabilities
- None (no existing modal spec; `products-action-ui` covers the row action menu, untouched).

## Approach
Presentational modals only. Mirror Angular fields exactly; keep the established checkbox-for-toggle substitution (precedent: `edit-product-category-modal.tsx`). Order prefill follows React's precompute-and-pass pattern — `products.tsx` resolves `getMaxOrder(categoryId).data + 1` and passes `defaultOrder`; edit uses `product.order`. `categoryId` stays ambient/immutable via UI.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `sales/components/create-product-modal.tsx` | Modified | field + prop reshape |
| `sales/components/edit-product-modal.tsx` | Modified | field reshape, drop delete + `categories` |
| `sales/routes/products.tsx` | Modified | call sites, getMaxOrder precompute, real order/isActive |
| `shared/lib/i18n/es.ts` | Modified | title keys + discount copy |
| 3 `*.test.tsx` | Modified | rewrite dropped/added contract |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Old delete-orphan test asserts keep | High | Explicitly rewrite/remove it |
| getMaxOrder async before open | Low | Await in handler; existing precompute pattern |

## Rollback Plan
Single-scope commit set; `git revert` the modal + products.tsx + es.ts commits. No data/schema migration.

## Dependencies
- `productService.getMaxOrder(categoryId): Promise<BaseResponseModel<number>>` (exists).

## Success Criteria
- [ ] Both modals: no barcode input, no category dropdown; show Orden, Activo, `$` prefix.
- [ ] Create pinned to context category; order defaults to max+1.
- [ ] EditProductModal has no delete UI/prop; row-level delete still works.
- [ ] Titles use `PRODUCT.NEW_PRODUCT`/`PRODUCT.EDIT_PRODUCT`; discount copy = `Descuenta del Inventario`.
- [ ] 3 test files pass under strict TDD.
