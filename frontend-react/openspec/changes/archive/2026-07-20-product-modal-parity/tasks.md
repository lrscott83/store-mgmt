# Tasks: Product Modal Parity (Create/Edit)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280-340 (5 impl files ~120 net + 3 test rewrites ~180-220) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (commits-only per work unit, no PR per repo policy) |
| Delivery strategy | commits-only on feature branch (no PR workflow per project convention) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | i18n copy fix (DISCOUNT_FROM_INVENTORY) | commit 1 | Independent, zero risk, unblocks label assertions in later units |
| 2 | CreateProductModal field/prop rework | commit 2 | Depends on unit 1 (label text) |
| 3 | EditProductModal field/prop rework + delete removal | commit 3 | Independent of unit 2, depends on unit 1 |
| 4 | products.tsx wiring (defaultOrder precompute, prop threading) | commit 4 | Depends on units 2+3 (new prop shapes) |

## Phase 1: i18n Foundation

- [x] 1.1 RED: in `es.ts` test/usage site (or a focused assertion within unit 2/3 RED tests), assert discount label renders exactly "Descuenta del Inventario". GREEN: edit `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` line 222, change `PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY` value from `'Descontar del inventario'` to `'Descuenta del Inventario'`. Satisfies spec req "i18n copy for titles and inventory-discount label".
- [x] 1.2 Confirm `PRODUCT.NEW_PRODUCT` ('Producto') and `PRODUCT.EDIT_PRODUCT` ('Editar Producto') already exist in `es.ts` (lines 256, 258) — no new keys needed, only new call sites in Phase 2/3.

## Phase 2: CreateProductModal Rework

- [x] 2.1 RED: rewrite `frontend-react/apps/web-store-pos/app/sales/components/__tests__/create-product-modal.test.tsx` — replace `categories` prop usage with `category: {id, name}` + `defaultOrder: number` props; assert Orden input prefilled with `defaultOrder`; assert Activo checkbox default checked; assert Precio input has `$` prefix; assert NO barcode input, NO category select; assert title resolves `PRODUCT.NEW_PRODUCT`; assert submit payload includes `categoryId: category.id`, `order: defaultOrder` (or edited value), `isActive`. Run `./node_modules/.bin/vitest run create-product-modal.test.tsx` — confirm RED.
- [x] 2.2 GREEN: edit `frontend-react/apps/web-store-pos/app/sales/components/create-product-modal.tsx` — change props `categories: ProductCategory[]` → `category: ProductCategory` + `defaultOrder: number`; remove `barcode` field from form state/payload/JSX; remove category `<select>` JSX; add `order` (init `defaultOrder`, numeric input, required) and `isActive` (checkbox, init `true`) to form state + JSX; add `$` prefix span/text on Precio input; change title key `PRODUCTS.CREATE` → `PRODUCT.NEW_PRODUCT`; update `onSave` payload to use `category.id` (not `form.categoryId`), include `order` and `isActive`; keep `autoFocus` on name input unchanged. Re-run vitest — confirm GREEN.
- [x] 2.3 Confirm existing `PRODUCTS.FORM.CATEGORY` / `PRODUCTS.FORM.BARCODE` i18n keys become unused-but-harmless (no cleanup required — other call sites unaffected).

## Phase 3: EditProductModal Rework

- [x] 3.1 RED: rewrite `frontend-react/apps/web-store-pos/app/sales/components/__tests__/edit-product-modal.test.tsx` — remove `categories` and `onDelete` from render props in all test cases; DELETE the "does not alter the orphan delete-confirm footer block" test entirely; remove any barcode-input / category-select assertions; add assertions: Orden input value = `product.order`, editable; Activo checkbox reflects `product.isActive`; Precio has `$` prefix; title resolves `PRODUCT.EDIT_PRODUCT`; query for `delete-product-button`/`confirm-delete-button` returns not-found; submit payload preserves `categoryId: product.categoryId` unchanged. Run vitest — confirm RED.
- [x] 3.2 GREEN: edit `frontend-react/apps/web-store-pos/app/sales/components/edit-product-modal.tsx` — drop `categories` and `onDelete` from `EditProductModalProps` and destructure; remove `confirmDelete` state, the entire delete/confirm footer JSX block (`delete-product-button`/`confirm-delete-button`), and the category `<select>` + barcode input JSX/state fields; add `order` (init `product.order`, numeric input) and `isActive` (checkbox, init `product.isActive`) to form state + JSX; add `$` prefix on Precio; change title key `PRODUCTS.EDIT` → `PRODUCT.EDIT_PRODUCT`; keep `categoryId: product.categoryId` fixed (no picker) in `onSave` payload, include `order`/`isActive`; keep `autoFocus` on name input unchanged. Re-run vitest — confirm GREEN.

## Phase 4: products.tsx Wiring

- [x] 4.1 RED: rewrite `frontend-react/apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx` — assert clicking "add product" awaits `productService.getMaxOrder(category.id)` and opens `CreateProductModal` with `category={clickedCategory}` and `defaultOrder = maxOrder.data + 1`; assert `EditProductModal` is rendered without an `onDelete` prop and without a `categories` prop; assert `handleCreateProduct` forwards the modal's real `order`/`isActive` values into `productService.createProduct(...)` (not hardcoded `1`/`true`). Run vitest — confirm RED.
- [x] 4.2 GREEN: edit `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx` — extend `Modal` union `'create'` variant to `{ type: 'create'; category: ProductCategory; defaultOrder: number }`; change the `onAddProduct` handler (currently `() => setModal({ type: 'create', category })` at the `CategoryActionsMenu` call site) to an async function that awaits `productService.getMaxOrder(category.id)`, computes `defaultOrder = (result.data ?? 0) + 1`, then calls `setModal({ type: 'create', category, defaultOrder })`; update `CreateProductModal` render to pass `category={modal.category}` + `defaultOrder={modal.defaultOrder}` instead of `categories={categories}`; update `EditProductModal` render to drop `categories={categories}` and `onDelete={handleDeleteProduct}` props; update `handleCreateProduct` signature to accept `order: number` + `isActive: boolean` from the modal payload and pass them into `productService.createProduct(...)` positional args (replacing hardcoded `1`/`true`), remove the now-stale comment about hardcoded order. Re-run vitest — confirm GREEN.
- [x] 4.3 Run full affected-file suite: `./node_modules/.bin/vitest run create-product-modal.test.tsx edit-product-modal.test.tsx products.test.tsx` from `frontend-react/apps/web-store-pos/` — confirm all GREEN together (no cross-file regression).

## Phase 5: Verification

- [x] 5.1 Manual/spec cross-check: confirm every spec requirement (create field set/order, edit field set/order, barcode+category-dropdown absence, in-modal-delete removal, CreateProductModal prop signature, EditProductModal prop signature, products.tsx wiring, i18n copy, no service/domain signature changes) is covered by a passing test from Phases 2-4.
- [x] 5.2 Grep confirm no remaining references to removed props (`categories=` on either modal, `onDelete=` on EditProductModal) anywhere in the codebase outside `edit-products-modal.tsx` (bulk-grid modal, out of scope, untouched).

## Phase 6: Post-verify follow-up parity fixes (found by a second parity review vs edit-product-modal.component.{html,ts})

A follow-up parity review against Angular's `onSubmit()`/`loadForm()` (component.ts:80-157) and the mat-error blocks (html:44-64) found 3 real divergences the original spec (Phase 1-5) did not cover: no `Validators.min(0)` on price, no `Validators.pattern(/^[0-9]\d*$/)` on order, and `updateProduct`'s barcode arg not forced to `undefined` on edit (Angular's barcode FormControl is permanently commented out, so `barcodeValue` is always `undefined`, even for a product with a stored barcode).

- [x] 6.1 RED/GREEN: `create-product-modal.tsx` + `edit-product-modal.tsx` — add `min="0"` to the price input; `validate()` now checks `parseFloat(price) < 0` (after the required check) and sets `errors.price` to `GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO` interpolated with `GENERAL.PRICE` (both i18n keys already existed in es.ts, exact Angular Spanish text `'{name} mínimo valor es 0'` confirmed against `frontend/src/app/_modules/i18n/vocabs/es.ts:243`). Negative price blocks `onSave`.
- [x] 6.2 RED/GREEN: same two files — `validate()` now also checks the order value against `/^[0-9]\d*$/` (Angular's `RegExExtensions.numeric`) when non-empty; a pattern mismatch (decimal, negative, non-numeric) blocks `onSave` with NO visible error message (Angular's HTML has no mat-error for the pattern failure, only for `required`).
- [x] 6.3 Discovered + fixed during 6.1 GREEN: both `<form>` elements needed `noValidate` added — the new `min="0"` attribute on the price input was triggering the browser's native constraint-validation API, which silently cancels the `submit` event (and our `onSubmit`/`validate()` never runs) before our custom validators get a chance to run. Angular's reactive forms never rely on native HTML5 validation either, so this is parity-neutral, not a new divergence.
- [x] 6.4 RED/GREEN: `products.tsx` `handleEditProduct` — changed the `product.barcode` positional arg passed to `updateProduct(...)` to a hardcoded `undefined`, with a comment citing `edit-product-modal.component.ts:125` (mirrors Angular exactly; USER DECISION to replicate, not "fix", since it's the literal Angular source behavior).
- [x] 6.5 Tests: added 4 new specs each to `create-product-modal.test.tsx` and `edit-product-modal.test.tsx` (negative price blocks + shows message, decimal/negative order blocks silently, valid integer order still submits) and 1 new spec to `products.test.tsx` (barcode threads as `undefined` into `updateProduct` even when `product.barcode` is set). Full suite: 125 files / 1824 tests passing (was 1815; +9). `npm run typecheck` clean.

Note: Phase 6 was verified via a focused parity re-review (not a full `sdd-verify` re-run against the pre-Phase-6 `verify-report.md`). See `archive-report.md` in this folder for the closure note reconciling this.
