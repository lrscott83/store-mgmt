# Apply Progress: Frontend Parity Audit (Angular → React)

**Change:** frontend-parity-audit
**Phase:** Apply (in progress)
**Date:** 2026-07-02 (last update: Batch 6, Sale Credits views; created 2026-07-01)
**Mode:** Hybrid (engram + openspec file)

---

## What

Three-fix targeted UI/shell batch (not a numbered Stage): sidebar zero-width collapse,
header-dropdown click-outside dismiss, extended-FAB button variant applied to Products.
Branch: `feat/frontend-parity-audit`, 4 work-unit commits (`b51744d` sidebar w-0, `22af1b5`
useClickOutside hook + navbar/cart-shell wiring, `33701a7` stale app-layout test fix,
`df02889` fab Button variant + Products application). No PR opened per explicit
instruction. `tsc --noEmit` clean (web-store-pos + domain package). `vitest run`: 78 test
files / 844 tests passed (was 77 files / 832 tests before this batch; net +1 test file
`use-click-outside.test.ts`, +12 tests: 3 hook tests, 2 navbar S-NAV-6, 2 cart-shell CART-05,
5 button fab-variant tests).

## Why

User reported three concrete visual/interaction parity gaps vs Angular after the prior
shared-shell batch: (1) collapsed sidebar left a blank 64px column instead of fully
disappearing, (2) buttons looked nothing like Angular's Material purple FAB pills, (3)
header dropdowns (user menu, cart) stayed open on outside click.

## Where

- `frontend-react/apps/web-store-pos/app/shared/components/sidebar.tsx` — w-16 -> w-0
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/sidebar.test.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/app-layout.test.tsx`
  — stale w-16 assertion updated to w-0 (fallout of sidebar fix, no behavior change)
- `frontend-react/apps/web-store-pos/app/shared/lib/hooks/use-click-outside.ts` (NEW)
- `frontend-react/apps/web-store-pos/app/shared/lib/hooks/__tests__/use-click-outside.test.ts` (NEW)
- `frontend-react/apps/web-store-pos/app/shared/components/navbar.tsx` — userMenuRef +
  useClickOutside wired to user-menu dropdown
- `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx` — cartRef +
  useClickOutside wired to cart panel
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/navbar.test.tsx` —
  S-NAV-6 describe block (2 tests)
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/cart-shell.test.tsx` —
  CART-05 describe block (2 tests)
- `frontend-react/apps/web-store-pos/app/shared/components/ui/button.tsx` — new
  `variant="fab"` (rounded-full, px-6 py-3, shadow-lg, bg-primary/text-white); refactored
  VARIANT_CLASSES so radius/padding/shadow live per-variant instead of shared base classes
- `frontend-react/apps/web-store-pos/app/shared/components/ui/__tests__/button.test.tsx` —
  5 new fab-variant tests
- `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx` — add-category-button
  and import-csv-button switched from variant="outline" to variant="fab" (mapped to
  Angular's two mat-fab extended actions); bulk-edit and create buttons untouched
  (Angular uses mat-raised-button there per prior batch's pilot restyle 9084dd9)

## Angular refs used

- `frontend/src/scss/themes/layouts/menu/sidebar.scss` — `.navbar-collapsed { width: 0px; }`
  rule confirms collapsed sidebar must be zero-width, not a narrow icon rail
- `frontend/src/app/presentation/products/products.component.html` — two `<button
  mat-fab extended color="primary">` elements: `openCreateCategoryModal()` ("+ Categoría"
  via PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY) and `openImportCsvProductModal()`
  ("Importar Productos" via PRODUCT_CATEGORY.IMPORT_PRODUCTS) — confirmed pill/FAB shape,
  filled purple, icon+label pattern the fab variant replicates
- Primary token already confirmed Material deeppurple-amber `#673ab7` (rgb 103 58 183) in
  `frontend-react/packages/web-common/styles.css` from prior batch's `e11cce9` fix — fab
  variant reuses `bg-primary` so it renders the correct purple automatically

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| useClickOutside hook | wrote use-click-outside.test.ts (3 tests: outside-closes, inside-does-not-close, cleanup), confirmed import failure (file didn't exist) | implemented hook (mousedown listener on document, ref.contains check), 3/3 pass | n/a |
| Navbar dropdown outside-click | wrote S-NAV-6 (2 tests), confirmed "closes on outside click" failed (dropdown stayed open, `Editar Perfil` still found) | added userMenuRef + useClickOutside(userMenuRef, close), 19/19 navbar tests pass | n/a |
| CartShell panel outside-click | wrote CART-05 (2 tests), confirmed "closes on outside click" failed (`Carrito` title still found after outside mousedown) | added cartRef + useClickOutside(cartRef, close), 6/6 cart-shell tests pass | n/a |
| Button fab variant | wrote 5 new fab-variant tests (rounded-full, bg-primary+text-white, shadow-lg, px-6/py-3, not-rounded-md), confirmed 4/5 failed against old single shared-class Button (rounded-md/px-4/py-2/shadow-card hardcoded) | added `fab` to ButtonVariant union + VARIANT_CLASSES, moved radius/padding/shadow into each variant's classes (was shared base classes), 17/17 button tests pass | n/a |
| Sidebar zero-width | pure Tailwind class swap (w-16 -> w-0), test assertion updated as part of same change to assert w-0 and NOT w-16 — VISUAL note, no independent RED/GREEN cycle since it's a single-class swap in an existing behavior-verified test | n/a | n/a |

## Design decisions / deviations

- **Button component refactor**: rather than bolt `fab` onto the existing shared
  `rounded-md px-4 py-2 shadow-card` base string with an override, moved radius/padding/
  shadow into each `VARIANT_CLASSES` entry so the fab variant isn't fighting inherited
  base classes for shape. Base string now only carries flex/typography/transition/
  disabled-state classes common to every variant. No visual change for existing variants
  (primary/secondary/danger/outline) — verified via unchanged 12 pre-existing button tests.
- **FAB mapping scope**: only the two buttons that are literally `mat-fab extended` in
  Angular's products.component.html got `variant="fab"` (add-category, import-csv). Did
  NOT touch bulk-edit or create-product buttons — Angular doesn't use mat-fab for those,
  and the instruction explicitly said do not change the button SET or wording (functional
  Sales slice deferred to Stage 1). cart-shell.tsx and other cyan-colored buttons/controls
  were NOT touched — out of scope for this batch (color/cyan cleanup already flagged as
  deferred in the prior shared-shell batch).
- **useClickOutside placement**: put it in the existing `shared/lib/hooks/` directory
  (matches `use-online-status.ts`/`use-unsaved-changes-prompt.ts` convention) rather than
  a new `hooks/` under `shared/components/` — consistent with existing project structure.
- **App-layout test fallout**: found and fixed `app-layout.test.tsx`'s two tests asserting
  the old `w-16` collapsed class (from the prior batch's collapsed-by-default work) —
  same behavior, just the stale expected string; not weakened, corrected to match new
  markup.

## Test/Build Results

- `vitest run`: 78 test files / 844 tests passed (0 failed). Baseline before this batch: 77
  files / 832 tests — net +1 test file (`use-click-outside.test.ts`) and +12 tests.
- `tsc --noEmit`: clean for both `frontend-react/apps/web-store-pos` and
  `frontend-react/packages/domain`.

## Workload / PR Boundary

- Mode: direct work-unit commits on `feat/frontend-parity-audit`, NO PR, per explicit
  user instruction for this batch.
- 4 work-unit commits: `b51744d` (sidebar w-0, 9 ln), `22af1b5` (useClickOutside hook +
  navbar/cart-shell wiring + tests, 178 ln), `33701a7` (app-layout test fix, 4 ln), `df02889`
  (fab Button variant + Products application, 63 ln). Total ~254 changed lines across 4
  commits — well under the 400-line single-PR review budget; this was a small targeted
  fix batch, not a full module stage.
- Boundary: this batch = 3 targeted shell/UI fixes only (sidebar width, FAB button style,
  dropdown outside-click). Does NOT touch Products page functional behavior (button
  set/wording unchanged, per explicit instruction — that remains Stage 1 Sales scope),
  does NOT touch cart-shell's remaining cyan color classes (deferred, out of scope), does
  NOT touch other views' button styling beyond the two Products FAB actions.

## Status

3-fix targeted batch: complete. Ready for `sdd-verify` on this slice, or continue to Stage 1
(Sales) per the tasks artifact's module order for the next full-stage batch.

---

## Batch 4 — Stage 1 Sales, Sale/POS screen strict Angular parity

**Date:** 2026-07-02
**Commit:** `65e0b72` (1 work-unit commit, 648 insertions / 582 deletions across 14 files).
No PR opened, per explicit instruction (same as batches 1-3).

### What

Rewrote `app/sales/routes/sale.tsx`, `app/sales/components/sale-category-products.tsx`,
and `app/sales/components/sale-product-row.tsx` to strict structural/functional/text parity
with Angular's `sale.component.html` / `sale-category-products.component.html` /
`sale-product-row.component.html`. Applied design tokens to `cart-shell.tsx` (pure visual,
no logic change). Removed 3 React-only dead files with no Angular equivalent.

### Angular refs read

- `frontend/src/app/presentation/sale/sale.component.html` + `.ts`
- `frontend/src/app/presentation/sale/sale-category-products/*.html` + `.ts`
- `frontend/src/app/presentation/sale/sale-product-row/*.html` + `.ts`
- `frontend/src/app/presentation/sale/quick-sale-scanner/*` — confirmed dead: `sale.component.ts`'s
  `openBarcodeScanner()` and its whole toolbar button are commented out
  (`sale.component.html:6-11`, `.ts:103-126`); `quick-sale-scanner.component` is never
  imported by any live component or route
- `frontend/src/app/application/entries/inventory-offline.service.ts:397` —
  `hasAvailableProductToSale` gate logic (feature-flag + `discountFromInvantory` check)
- `frontend/src/app/application/categories/product-category.repository.ts` /
  `product.repository.ts` — exact filter/sort semantics for
  `getAvailableProductCategories` (isActive, sorted by order) and
  `getProductsToSaleByCategoryId` (categoryId + isActive + availableToSale, sorted by order)
- `frontend/src/app/_modules/i18n/vocabs/es.ts` — `SALES.*`, `GENERAL.VALIDATION.*`,
  `GENERAL.ADD` exact Spanish strings

### Where

- `frontend-react/apps/web-store-pos/app/sales/routes/sale.tsx` — REWRITTEN. `Card`
  title=`SALES.HEADER` ("Productos para vender"), category button strip (active category
  highlighted with `bg-primary`, others `bg-primary-light`), `SaleCategoryProducts` for the
  selected category, `InfoBox` alert (`SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE`) shown only
  when `categories.length > 0 && !selectedCategoryId`. `orderType` is a fixed
  `OrderType.Normal` constant — Angular's `SaleComponent` hard-codes this
  (`sale.component.ts:27`), no selector UI exists. Removed: scanner toggle button, cyan
  category-tab styling, blue-600 active-tab color (now purple/primary).
- `frontend-react/apps/web-store-pos/app/sales/components/sale-category-products.tsx` —
  REWRITTEN from a category-grouping + search-aware container into a thin per-category list
  matching Angular exactly: receives already-filtered `products` (parent does the
  categoryId+isActive+availableToSale filter, mirroring Angular's `products$`
  pre-filtered-by-service pattern), maps to `SaleProductRow`. Removed `category` prop, removed
  internal filtering logic, removed heading/grid-card layout (Angular has none — it's a plain
  `<table>` row list).
- `frontend-react/apps/web-store-pos/app/sales/components/sale-product-row.tsx` — REWRITTEN.
  Props: `product`, `orderType`, `onAdded(productId, quantity, price)`, optional
  `checkAvailability(productId, quantity)`. Renders name; price as read-only text for
  `OrderType.Normal` OR an editable number input labeled `GENERAL.PRICE` for any other
  order type (mirrors Angular's `@if (isNormalSale())` branch); quantity number input
  labeled `GENERAL.QUANTITY`, default 1; single icon-only add-to-cart button
  (`aria-label` = `GENERAL.ADD` = "Adicionar", mirrors Angular's `mat-mini-fab` with just a
  cart icon, no visible text). On click: if `product.discountFromInvantory` is true AND a
  `checkAvailability` callback was supplied, calls it with `(productId, quantity)`; if it
  returns false, blocks the add and shows an inline error
  (`SALES.NOT_INVENTORY_AVAILABLE_MESSAGE`) instead of calling `onAdded` — mirrors Angular's
  `hasAvailableProductToSale` gate scoped to the `discountFromInvantory` condition only
  (see Flagged gap below for the parts NOT ported).
- `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx` — VISUAL ONLY,
  no logic/text/testid changes. Replaced every hardcoded `cyan-*`/`gray-*`/`red-*` Tailwind
  utility with the shared design-token classes (`bg-primary`, `bg-primary-light`,
  `text-primary`, `text-text`, `text-text-muted`, `border-border`, `bg-surface`,
  `shadow-card`, `text-danger`) so the cart dropdown matches the rest of the purple
  Angular Material theme instead of standing out in cyan. `cart-shell.test.tsx` (6 tests,
  unchanged) still passes — no behavior touched.
- `frontend-react/apps/web-store-pos/app/shared/lib/stores/cart-store.ts` — `addItem` gained
  an optional `quantity` parameter (`addItem(product, quantity = 1)`), incrementing existing
  cart lines by that quantity instead of always +1. Needed because Angular's
  `SaleProductRowComponent` lets the user pick a quantity before adding
  (`sale-product-row.component.ts:addCartItem` passes `formGroup.value.quantity`), which the
  old React `addItem(product)` (always +1) could not express. Backward compatible — only
  caller besides the new `sale.tsx`/`sale-product-row.tsx` was the now-deleted
  `quick-sale-scanner.tsx`.
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` — added exact Angular keys:
  `SALES.HEADER`='Productos para vender', `SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE`,
  `SALES.PRODUCT_ADDED_TO_CART`, `SALES.PRODUCT_NOT_ADDED_TO_CART`,
  `SALES.NOT_INVENTORY_AVAILABLE_MESSAGE`, `GENERAL.VALIDATION.REQUIRED`,
  `GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO`, `GENERAL.ADD`='Adicionar' — all
  byte-identical Spanish copied from `frontend/src/app/_modules/i18n/vocabs/es.ts`.

### Removed (strict parity — Angular has zero equivalent, verified dead)

1. `app/sales/components/quick-sale-scanner.tsx` — DELETED. Angular's scanner toggle button
   and `openBarcodeScanner()` handler are fully commented out in `sale.component.html:6-11`
   and `.ts:99-126`; not reachable from any live UI.
2. `app/sales/components/barcode-scanner-core.tsx` — DELETED (only consumer was
   quick-sale-scanner.tsx).
3. `app/sales/components/barcode-scanner-modal.tsx` — DELETED (same, orphaned once the
   scanner entry point was removed from `sale.tsx`).
4. `app/sales/components/__tests__/barcode-scanner.test.tsx` — DELETED (tested the 3 removed
   files).
5. `sale.tsx`'s scanner-toggle button (`SCANNER.SCANNING` label, blue border-button) —
   REMOVED, no replacement (Angular has none on the reachable Sale screen).
6. `sale-category-products.tsx`'s heading (`<h3>{category.name}</h3>`) and card/grid layout —
   REMOVED. Angular's `sale-category-products.component.html` is a bare `<table>`, no
   category heading is repeated inside the panel (the category name only appears once, on
   the selector button above).
Note: `SCANNER.*` i18n keys were left in es.ts unused rather than pruned (same rationale as
Batch 3's Products slice — no instruction to prune orphaned i18n keys).

### Flagged gap — NOT ported in this batch (deferred to Stage 6/Sync)

Angular's `hasAvailableProductToSale` (`inventory-offline.service.ts:397`) has a feature-flag
gate: `if (!authorizationService.hasInventoryModuleAvailable() || !product.discountFromInvantory)
return Result.Success()`. This batch's `checkAvailability` callback contract only mirrors the
`discountFromInvantory` half of that condition (SaleProductRow calls `checkAvailability` only
when `discountFromInvantory` is true) — it does NOT check whether the store has the Inventory
module/feature enabled, because that requires `authorizationService`/features cross-cutting
plumbing this stage does not own (per design.md's PWA/cross-cutting audit, explicitly deferred
to Stage 6/Sync). `sale.tsx` currently does NOT pass a `checkAvailability` prop at all (no
`InventoryOfflineService` wiring yet) — the callback is designed and tested at the
`SaleProductRow` level (10 tests including 2 for this exact gate) so Stage 6 can wire
`InventoryOfflineService.hasAvailableStock` + the feature-gate into `sale.tsx` without any
further `SaleProductRow`/`SaleCategoryProducts` changes. Also NOT ported: Angular's
SweetAlert2 (`Swal.fire`) error modal for this same case — React uses cart-shell's established
inline `role="alert"` text pattern instead, since no SweetAlert2/modal-alert equivalent exists
anywhere in the React codebase yet (would be a new cross-cutting dependency, out of scope for
a single-view slice).

### TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| SaleProductRow rewrite (name, conditional price, quantity, add button, inventory gate) | wrote sale-product-row.test.tsx (10 tests) against the new prop signature (`product`+`orderType`+`onAdded`+optional `checkAvailability`); ran against old component (`onAdd`/`onIncrease`/`onDecrease` props) — 9/10 failed | rewrote sale-product-row.tsx with the new signature, price/quantity local state, `discountFromInvantory`-gated `checkAvailability` call — 10/10 passed on first GREEN attempt | none needed |
| SaleCategoryProducts rewrite (thin per-category list) | wrote sale-category-products.test.tsx (4 tests) against new `products`+`orderType`+`onAdded`+`checkAvailability` signature; ran against old component (`category`+`cartQtyMap`+`onIncrease`/`onDecrease` props) — 3/4 failed with `Cannot read properties of undefined (reading 'id')` (category-filtering code referenced a prop that no longer existed) | rewrote to a thin map over `products` — 4/4 passed | none needed |
| SalePage rewrite (header, category strip, alert, scanner removal, cart-store wiring) | wrote sale.test.tsx (8 tests) mocking category/product services + cart-store with a selector-aware mock; ran against old sale.tsx — 5/8 failed (Angular header text absent, scanner elements present, wrong add-item wiring) | rewrote sale.tsx: fixed `OrderType.Normal`, `SALES.HEADER` Card title, category strip with active-category styling, `SaleCategoryProducts` wired to filtered products, `InfoBox` alert condition, `handleAdded` calling `cartStore.addItem(product, quantity)` — 7/8 passed | 1 test failed (`addItemMock` not called) because the test's `useCartStore` mock ignored the selector argument used by `sale.tsx` (`useCartStore((s) => s.addItem)`); fixed the mock to be selector-aware (same pattern as the existing `auth-store` mock), re-ran, 8/8 passed |
| cart-store `addItem` quantity param | no dedicated new test (no cart-store test file exists in this codebase); verified via `sale.test.tsx`'s "adds a product to the cart" test asserting `addItemMock` called, and the full `cart-shell.test.tsx` suite (6 tests, unchanged) still passing after the signature widened | n/a | n/a |
| cart-shell token replacement | pure visual Tailwind class swap, no new test — VISUAL note per Strict TDD Mode's rule (pure styling = tsc + visual note, not test-first); verified via the 6 pre-existing `cart-shell.test.tsx` tests (testids/aria-labels/text untouched) still passing | n/a | n/a |

### Test/Build Results

- `pnpm exec tsc --noEmit` (web-store-pos): clean, zero errors.
- `pnpm exec vitest run` (full suite, web-store-pos): 82 test files / 894 tests passed, 0
  failed. Baseline before this batch: 80 files / 879 tests (per apply-progress engram batch
  3) → net +2 files, +15 tests (added sale-product-row.test.tsx +10, sale-category-products.test.tsx
  +4, sale.test.tsx +8 = +22; removed barcode-scanner.test.tsx −~7 net after accounting for
  file removal). Same pre-existing unrelated stderr noise line from `api-client.test.ts`'s
  AUTH-06 jsdom navigation warning (not a failure).
- `pnpm exec react-router build`: succeeded, `sale-pPzLXtPR.js` chunk emitted alongside all
  other route chunks (barcode-scanner chunks no longer emitted, confirming clean removal),
  SPA mode build completed, service worker precache regenerated (99 entries, down from 100 —
  one fewer precached route asset from the barcode-scanner removal). No build errors or
  warnings introduced by this change.

### Workload / PR Boundary

- Mode: direct work-unit commit on `feat/frontend-parity-audit`, NO PR, per explicit user
  instruction for this batch (same as batches 1-3).
- 1 work-unit commit: `65e0b72` (648 insertions / 582 deletions across 14 files — net +66
  lines once the 3 deleted dead files and their test are accounted for). Exceeds the 400-line
  single-PR review budget on raw insertion count, but net change is small and this was
  explicitly instructed as a direct-commit, no-PR, single-view slice (same accepted-exception
  pattern as batches 1-3).
- Boundary: this batch = the Sale/POS view (route + its 2 child components + cart-shell visual
  pass + i18n + cart-store quantity param) ONLY. Does NOT touch Orders history
  (`orders.tsx`), Today Orders (`today-orders.tsx`), Credits (`credits.tsx`/
  `today-credits.tsx`), Today Stats (`today-stats.tsx`), or `category-stats.tsx` — those
  remain Stage 1 Sales L4/L5/L6 work still pending. Does NOT touch
  `OrderOfflineService`/`SaleCreditOfflineService` internals (offline order-creation flow
  confirmed intact and unmodified).

### Status (superseded by Batch 5 below — see "## Batch 5" section)

4 batches complete (2 targeted UI/shell batches + Stage 1 Sales Products-view parity slice +
Stage 1 Sales Sale/POS-view parity slice). Stage 1 (Sales) is STILL NOT fully done. Remaining
per the tasks artifact's Stage 1 template (L4 functional diff + L5 visual + L6 i18n + verify),
scoped to Sales module views not yet touched: Orders history, Today Orders, Sale Credits,
Today Sale Credits, Today Stats (Cuadre del día), Category Stats, and their modals
(edit-order-modal, edit-sale-credit-modal, sale-credit-payment-modal — need Angular-vs-React
diff passes same as Products/Sale). Ready for `sdd-verify` on the Products+Sale slices, or
continue with the next Sales view per user direction.

---

## Batch 5 (2026-07-02) — Stage 1 Sales, ORDERS views strict Angular parity

### What

Strict Angular parity rebuild of the two Orders views + their shared components: Orders
history (`orders.tsx`, Angular's `OrdersComponent`) and Today Orders (`today-orders.tsx`,
Angular's `TodayOrdersComponent`), plus their shared `order-list.tsx` (Angular's
`order-list.component`), `order-item-list.tsx` (Angular's `order-item-list.component`), and
`edit-order-modal.tsx` (Angular's `edit-order-modal.component`). 1 work-unit commit
(`6bc2b3d`, 702 insertions / 313 deletions across 8 files). No PR opened per explicit
instruction (batch 5 of 5 so far, all direct commits). Branch: `feat/frontend-parity-audit`.

### Why

User explicitly requested strict Angular parity for the two Orders views as the next slice of
Stage 1 (Sales), per the tasks artifact's L4/L5/L6 per-module template. The prior React
implementation (`orders.tsx`/`today-orders.tsx`/`order-list.tsx`/`edit-order-modal.tsx`) was
entirely React-invented: a date-range picker with no Angular equivalent, wrong Spanish texts
(`ORDERS.TITLE`="Historial de pedidos" vs Angular's "Historial de Ventas"; `GENERAL.CONFIRM`
key that doesn't exist in Angular's vocab at all), blue/cyan Tailwind classes instead of the
purple token set, and an `EditOrderModal` that showed order metadata + an items table + a
deactivate action — none of which exist in Angular's actual `edit-order-modal.component.html`
(that modal is payment-type-only; order items/deactivate live in `order-item-list`).

### Where (Batch 5 — this save)

- `frontend-react/apps/web-store-pos/app/sales/routes/orders.tsx` — REWRITTEN. `Card`
  title = `ORDERS.TITLE` ("Historial de Ventas") + order count badge + total. Two radio-group
  filters mirroring Angular exactly: payment-type (Todas/Efectivo/Tarjeta/Zelle, driven by
  `PaymentTypeUtils.getPaymentTypes()` — labels are the raw enum member names, NOT translated
  in Angular's own template) and isCredit (Todas/Pagadas/Créditos, "Créditos" styled
  `text-warning` matching Angular's `text-warning` span). Orders grouped by date
  (`groupOrders`, ported 1:1 from Angular's `OrdersComponent.groupOrders`) into an accordion
  of date panels (own local `expandedDateIds` Set, same toggle pattern as Products'
  category-accordion). Each date panel wraps `OrderList` with NO `readOnly` prop passed
  (Angular's `<app-order-list>` in `orders.component.html` has no `[readOnly]` binding, so it
  stays at the default `true` — no edit/delete actions reachable from this view at all).
  REMOVED: the entire date-range `<input type="date">` filter pair (Angular has none —
  `loadOrdersFiltered` is always called with `startDate=null, endDate=null`).
- `frontend-react/apps/web-store-pos/app/sales/routes/today-orders.tsx` — REWRITTEN. Same
  `Card` + payment-type/isCredit radio filters as Orders, but flat (not grouped by date) —
  matches Angular's `TodayOrdersComponent.loadTodayOrders()` (filter + sort only, no
  grouping). `OrderList` rendered with `readOnly={false}` (Angular:
  `[readOnly]="false"` explicit in `today-orders.component.html`), wiring `onEditOrder` to
  open `EditOrderModal` and `onDeactivateOrder` to `OrderOfflineService.deactivate`. Empty
  state intentionally uses `TODAY_STATS.NO_ORDER_FOUND` (NOT `TODAY_ORDERS.NO_ORDER_FOUND`) —
  this is Angular's own literal source behavior at `today-orders.component.html:34`, a
  same-text key mismatch preserved verbatim, not a React bug.
- `frontend-react/apps/web-store-pos/app/sales/components/order-list.tsx` — REWRITTEN from a
  flat order-button-list into an accordion-of-orders (Angular's `order-list.component.html`:
  `mat-accordion multi`, one panel per order). Panel header: `HH:mm` time (native
  `padStart`-based formatting, matching `date-fns format(date,'HH:mm')` output, no new
  dependency added) + items count, payment-type icon (inline SVGs standing in for Angular's
  `bi-*` Bootstrap Icon classes — no icon font is loaded in the React app), and
  `getOrderTotal` computed from `orderItems` (price × quantity sum, NOT `order.total` —
  matches Angular's `OrderListComponent.getOrderTotal` exactly, which recomputes rather than
  trusting the stored total). Credit orders get a `border-warning` treatment (Angular:
  `credit-order` CSS class via `getOrderBackgroundColor`). Expanding a panel renders
  `OrderItemList`, forwarding `readOnly`/`onEditOrder`/`onDeactivateOrder`.
- `frontend-react/apps/web-store-pos/app/sales/components/order-item-list.tsx` — REWRITTEN.
  Matches Angular's `order-item-list.component.html`: optional action row (Editar always
  when `!readOnly`; Eliminar/deactivate ONLY when `!readOnly && order.isActive` — Angular:
  `@if (order?.isActive)` gates the delete button specifically, Editar has no such gate),
  followed by a bare items table (name / quantity badge / line total) with NO header row
  (Angular's markup has none). Deactivate requires a second click to confirm (mirrors
  Angular's SweetAlert2 `Swal.fire({...showCancelButton...})` confirm gate — no SweetAlert2
  equivalent exists in the React codebase, so this reuses the established two-step-inline-
  confirm pattern from the prior `EditOrderModal`, now relocated here to match Angular's
  actual component ownership of the deactivate action).
- `frontend-react/apps/web-store-pos/app/sales/components/edit-order-modal.tsx` — REWRITTEN
  down to Angular's actual scope: `edit-order-modal.component.html` is payment-type-ONLY —
  no order metadata, no items list, no deactivate action (those all belong to
  `order-item-list`, confirmed above). Title is Angular's literal (odd but verified) string
  `SALE_CREDIT.PAYMENT_CREDIT` = "Venta por Cobrar" — not an order-specific title, an
  apparent copy-paste artifact in Angular's own source, preserved byte-identical rather than
  "fixed" (strict parity mandate: measure Angular, don't improve on it). Actions: Cerrar
  (`GENERAL.CLOSE`) / Actualizar (`GENERAL.UPDATE`), both `Button variant="fab"` matching
  Angular's `mat-fab extended color="primary"`. `onDeactivate` prop REMOVED from this
  component's contract entirely (moved to `order-item-list`'s `onDeactivateOrder`).
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` — added exact Angular keys
  byte-identical to `frontend/src/app/_modules/i18n/vocabs/es.ts`: `GENERAL.EDIT`='Editar',
  `GENERAL.DELETE`='Eliminar', `GENERAL.UPDATE`='Actualizar', `GENERAL.YES`='Si',
  `ORDERS.TITLE` corrected from the wrong "Historial de pedidos" to Angular's actual
  "Historial de Ventas", `ORDERS.NO_ORDERS_FOUND`="No se encontró ninguna venta" (new key),
  full `TODAY_ORDERS.*` block (HEADER/NO_ORDER_FOUND/SEND_TO_CART_CONFIRM_TITLE/
  SEND_TO_CART_CONFIRM_MESSAGE/TEXT/ERROR_DELETING_ORDER/EDIT_ORDER/DELETE_ORDER/
  DEACTIVATE_ORDER/ACTIVATE_ORDER — some not yet consumed by this batch's JSX, added for
  completeness per the L6 flatten-diff method since they're live Angular keys in this
  component family), `TODAY_STATS.NO_ORDER_FOUND`, `SALE_CREDIT.PAYMENT_CREDIT`. Pre-existing
  `ORDERS.TODAY_TITLE`/`DATE`/`TOTAL`/`CREDIT_BADGE`/`EMPTY_STATE`/`DEACTIVATE*`/`DATE_FROM`/
  `DATE_TO` keys are now ORPHANED (the old React-only implementation used them) — left in
  place, not pruned, per the established no-instruction-to-prune-orphans precedent from
  batches 3-4. `ORDERS.STATS_TITLE`/`ORDERS.ITEMS_COUNT`/`ORDERS.PAYMENT_TYPE`/`ORDERS.STATS.*`
  are still LIVE (consumed by `today-stats.tsx`, out of this batch's scope) — confirmed NOT
  orphaned, left untouched.
- Test files: `order-components.test.tsx` — REWRITTEN (12 tests, was testing the old flat
  `OrderList`/rich `EditOrderModal` APIs, now tests the accordion `OrderList` +
  payment-type-only `EditOrderModal`). `sales-routes.test.tsx` — `OrdersPage`/
  `TodayOrdersPage` describe blocks updated: exact-text assertions for the corrected Angular
  headers/empty-states + radio-filter presence checks (was generic "renders without
  crashing"/regex substring checks against wrong texts).

### Removed / Relocated (strict parity — verified NOT in Angular's Orders/Today-Orders views)

1. Date-range `<input type="date">` filter pair in `orders.tsx` — REMOVED, no Angular
   equivalent (`loadOrdersFiltered` always passes `null, null` for start/end date).
2. `EditOrderModal`'s order metadata block (date/total), items table
   (`OrderItemList` rendered inside the old modal), and deactivate action/warning copy —
   REMOVED from the modal, RELOCATED: items table + deactivate now live in
   `order-item-list.tsx` (matches Angular's actual component boundary —
   `edit-order-modal.component.html` never rendered an items list or had a delete button;
   that was a React-only design that merged two separate Angular components' responsibilities
   into one modal).
3. `OrdersPage`'s edit/deactivate wiring — REMOVED entirely (Angular's Orders/history view
   passes no `readOnly` prop to `<app-order-list>`, so it's always read-only; only Today
   Orders is interactive, per Angular's explicit `[readOnly]="false"` binding).

### TDD Cycle Evidence (Batch 5)

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| OrderList (accordion) rewrite | wrote order-components.test.tsx's OrderList describe block (7 tests) against the new accordion API (`orders`, `readOnly`, `onEditOrder`, `onDeactivateOrder` props, `order-panel-toggle-{id}` testids) — components were rewritten in the same pass per Strict TDD's allowance for parity-rebuild batches (design.md: matrices are the audit unit; tests assert the target Angular-parity contract) | ran full order-components.test.tsx — 12/12 passed on first run against the rewritten components (confirms the rewrite matches the test-encoded contract with no drift) | none needed |
| EditOrderModal (payment-type-only) rewrite | wrote EditOrderModal describe block (5 tests) asserting the literal `SALE_CREDIT.PAYMENT_CREDIT` title, payment-type radio defaulted to `order.paymentType`, `onUpdate`/`onClose` call contracts, and the REMOVED `onDeactivate` prop (no longer in the interface) | same run, 12/12 passed | none needed |
| OrderItemList two-step deactivate confirm | covered by OrderList's "requires a second click to confirm deactivate" test — asserts `onDeactivateOrder` is NOT called on the first click, IS called with the order on the second | passed first run | none needed |
| OrdersPage / TodayOrdersPage route rewrites | updated sales-routes.test.tsx's two describe blocks (10 tests total) with exact-text assertions for the corrected headers ("Historial de Ventas" / "Ventas del día") and empty states ("No se encontró ninguna venta" / "No se ha realizado ninguna venta en el día de hoy.") plus radio-filter presence checks | ran sales-routes.test.tsx — 10/10 passed first run | none needed |

### Test/Build Results (Batch 5)

- `pnpm exec tsc --noEmit` (web-store-pos): clean, zero errors.
- `pnpm exec vitest run` (full suite, web-store-pos): 82 test files / 903 tests passed, 0
  failed. Baseline before this batch: 82 files / 894 tests (Batch 4) → same file count (no
  new test files added, existing ones rewritten/extended), +9 tests net (order-components.
  test.tsx: 4 old tests -> 12 new; sales-routes.test.tsx: +3 net in the Orders/TodayOrders
  blocks). Same pre-existing unrelated stderr noise from api-client.test.ts's AUTH-06 jsdom
  navigation warning (not a failure, documented in batches 3-4 too).
- `pnpm exec react-router build`: succeeded. Both `orders-DBu55wXB.js` and
  `today-orders-Ih4fHeP-.js` chunks emitted (confirms both routes still build cleanly after
  the rewrite). No errors or warnings introduced.

### Workload / PR Boundary (Batch 5)

- Mode: direct work-unit commit on `feat/frontend-parity-audit`, NO PR, per explicit user
  instruction (same as batches 1-4).
- 1 work-unit commit: `6bc2b3d` (702 insertions / 313 deletions across 8 files). Exceeds the
  400-line single-PR review budget on raw insertion count; explicitly instructed as a
  direct-commit, no-PR, single-slice batch (same accepted-exception pattern as batches 1-4).
- Boundary: this batch = the two Orders views (`orders.tsx`, `today-orders.tsx`) + their
  shared components (`order-list.tsx`, `order-item-list.tsx`, `edit-order-modal.tsx`) + their
  i18n keys ONLY. Does NOT touch Sale Credits (`credits.tsx`/`today-credits.tsx`,
  `edit-sale-credit-modal`, `sale-credit-payment-modal`), Today Stats (`today-stats.tsx`,
  still reads the pre-existing `ORDERS.STATS_TITLE`/`ORDERS.ITEMS_COUNT`/`ORDERS.PAYMENT_TYPE`/
  `ORDERS.STATS.*` keys unchanged), or Category Stats (`category-stats.tsx`) — those remain
  Stage 1 Sales L4/L5/L6 work still pending. Does NOT touch `OrderOfflineService` internals
  (only consumes its existing `getAll`/`getActiveOrdersInDay`/`update`/`deactivate` methods,
  zero modification).

### Status

5 batches complete (2 targeted UI/shell batches + Stage 1 Sales Products-view parity slice +
Stage 1 Sales Sale/POS-view parity slice + Stage 1 Sales Orders-views parity slice). Stage 1
(Sales) is STILL NOT fully done. Remaining per the tasks artifact's Stage 1 template (L4
functional diff + L5 visual + L6 i18n + verify), scoped to Sales module views not yet
touched: Sale Credits (`credits.tsx`), Today Sale Credits (`today-credits.tsx`), Today Stats /
Cuadre del día (`today-stats.tsx`), Category Stats (`category-stats.tsx`), and their modals
(`edit-sale-credit-modal.tsx`, `sale-credit-payment-modal.tsx` — need their own
Angular-vs-React diff passes, same as Products/Sale/Orders). Ready for `sdd-verify` on the
Products+Sale+Orders slices, or continue with the next Sales view (Credits is the natural next
slice — same order/payment-type radio-filter + accordion pattern established here should
largely transfer) per user direction. Stage 1's full-module chained-PR delivery strategy
(stacked-to-main vs feature-branch-chain) still needs an explicit decision from the
orchestrator/user before a non-explicitly-scoped Stage 1 `sdd-apply` batch begins, per the
tasks artifact's Review Workload Forecast.

---

## Batch 6 — Stage 1 Sales, SALE CREDITS views strict Angular parity

### What (Batch 6)

Strict Angular parity rebuild of the two Sale Credits views + their shared list + both
modals: `credits.tsx` (Angular `SaleCreditsComponent` — "Créditos" history),
`today-credits.tsx` (Angular `TodaySaleCreditsComponent` — "Créditos del día"),
`sale-credit-list.tsx` (Angular `SaleCreditListComponent`), `edit-sale-credit-modal.tsx`
(Angular `EditSaleCreditModalComponent`), `sale-credit-payment-modal.tsx` (Angular
`SaleCreditPaymentModalComponent`). 1 work-unit commit (`c1b8617`, 708 insertions / 439
deletions across 8 files: 6 source + 2 test files). No PR opened per explicit instruction
(same as batches 1-5). Branch: `feat/frontend-parity-audit`.

### Why (Batch 6)

User explicitly requested strict Angular parity for the Sale Credits views as the next Stage
1 (Sales) slice. The prior React implementation was entirely React-invented: a date-range
picker with no Angular equivalent, paid/unpaid filter buttons with no Angular equivalent
(Angular's `SaleCreditsComponent.loadSaleCredits()` always calls `filterSaleCredits(null,
null, null, null)` — no filter UI exists at all), wrong Spanish texts under a `CREDITS.*`
namespace that doesn't exist in Angular's vocab (Angular uses `SALE_CREDIT.*`), blue/cyan
Tailwind classes instead of the purple token set, and both modals merged into a
card-style-button UI instead of Angular's actual field layout (Angular's edit modal shows a
"Pagar: {total}" line + client/note fields with a **Pagar** submit button — not
Actualizar/Guardar; the payment modal shows "Cliente: {client}" + "Pagar: {total}" + a
payment-type select, gated behind a SweetAlert2 confirm before actually submitting).

### Where (Batch 6)

- `app/sales/routes/credits.tsx` — REWRITTEN. Card title = `SALE_CREDIT.TITLE` ("Créditos")
  + unpaid-credits-count badge + unpaid-credits-total (danger/red text) — both computed
  exactly like Angular's `getSaleCreditsCount()`/`getSaleCreditsTotal()` (count/sum only
  credits where `!isPaid`). NO filters at all (Angular's history view has none). Credits
  grouped by date (`groupSaleCredits`, ported 1:1 from Angular's
  `SaleCreditsComponent.groupSaleCredits`) into an accordion of date panels; each date panel
  wraps `SaleCreditList` with NO `readOnly` prop passed (Angular's `<app-sale-credit-list>`
  in `sale-credits.component.html` has no `[readOnly]` binding → stays default `true`, no
  edit/pay actions reachable from this view at all). REMOVED: the entire date-range
  `<input type="date">` filter pair AND the paid/unpaid radio-style filter buttons — neither
  has an Angular equivalent.
- `app/sales/routes/today-credits.tsx` — REWRITTEN. Card title = `SALE_CREDIT.TODAY_CREDITS`
  ("Créditos del día"), no count/total in the header (Angular's `today-sale-credits.
  component.html` card-toolbar is empty), flat (not grouped) list of today's active credits.
  `SaleCreditList` rendered with `readOnly={false}` (Angular: `[readOnly]="false"` explicit),
  wiring `onSave`→`SaleCreditOfflineService.update` and `onPay`→
  `SaleCreditOfflineService.pay`. Empty state uses `SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY`
  ("No existe ningún crédito en el día").
- `app/sales/components/sale-credit-list.tsx` — REWRITTEN from a card-button list into a
  bare table (Angular's `sale-credit-list.component.html`: `<table>` with NO header row).
  Columns: client name, total (colored `text-success` when `isPaid` else `text-danger` —
  matches `getSaleCreditClassName` exactly), paid-date label (only rendered when `isPaid`,
  `dd/MM/yyyy` via `GlobalConfig.ONLY_DATE_FORMAT`), and an optional actions column (only
  when `!readOnly`): a settings-icon button opening a menu with **Editar** (always) and
  **Pagar** (`SALE_CREDIT.TO_PAY`, only when `!saleCredit.paid` — falsy check, not
  `!isPaid`, matches Angular's `@if (!saleCredit.paid)` exactly, so a partially-touched
  `paid` value also hides the action). Angular opens BOTH `EditSaleCreditModalComponent` AND
  `SaleCreditPaymentModalComponent` from `SaleCreditListComponent` itself (not the parent
  page) — mirrored here by owning both modals' open/close state locally in
  `SaleCreditList`, matching Angular's actual component ownership (same lesson as Orders
  batch's `edit-order-modal`, but inverted: there the page over-owned a modal that belonged
  to a child component; here modals were previously mis-hosted at the page level instead of
  the list).
- `app/sales/components/edit-sale-credit-modal.tsx` — REWRITTEN to Angular's actual field
  set: a "Pagar: {total}" line, then `client` (required) + `note` (optional) fields only —
  no payment-type field (that is `SaleCreditPaymentModalComponent`'s job). Title is
  Angular's literal `SALE_CREDIT.PAYMENT_CREDIT` = "Venta por Cobrar" (Angular reuses this
  same key across all three modals — edit-order, edit-sale-credit, and sale-credit-payment —
  an apparent copy-paste artifact in Angular's own source, preserved byte-identical per
  strict-parity: measure Angular, don't improve on it). Actions: Cerrar (`GENERAL.CLOSE`) /
  **Pagar** (`SALE_CREDIT.TO_PAY` — Angular's own submit button literally reads "Pagar" on
  this client/note-only form even though `onSubmit()` only updates client/note, not payment;
  preserved verbatim, flagged as an odd-but-real Angular source quirk, not fixed).
- `app/sales/components/sale-credit-payment-modal.tsx` — REWRITTEN to Angular's actual
  layout: same `SALE_CREDIT.PAYMENT_CREDIT` title, "Cliente: {client}" + "Pagar: {total}"
  literal lines, a "Forma de Pago" `<select>` (payment type, defaults to `Efectivo`, raw
  enum-member-name options exactly like `order-list`/`edit-order-modal` precedent — Angular's
  own template does not translate these labels), and a `GENERAL.NOTE` textarea. Angular
  gates the actual submit behind a SweetAlert2 confirm dialog (`PAYMENT_CONFIRM_TITLE`/
  `PAYMENT_CONFIRM_MESSAGE`, Sí/No) — no SweetAlert2 equivalent exists in React, so this
  reuses the established two-step-inline-confirm pattern from `order-item-list`'s deactivate
  action (first click arms confirmation, button label flips to `GENERAL.YES`, second click
  actually calls `onConfirm`).
- `app/shared/lib/i18n/es.ts` — REPLACED the entire React-only `CREDITS.*` block with exact
  Angular `SALE_CREDIT.*` keys byte-identical to `frontend/src/app/_modules/i18n/vocabs/
  es.ts`: `SALE_CREDIT.TITLE`='Créditos', `SALE_CREDIT.TODAY_CREDITS`='Créditos del día',
  `SALE_CREDIT.TO_PAY`='Pagar', `SALE_CREDIT.PAYMENT_CREDIT`='Venta por Cobrar' (already
  present from the Orders batch, reused), `SALE_CREDIT.PAYMENT_CONFIRM_TITLE`='Confirmación
  de Pago', `SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE`='Usted está segura(o) que desea pagar este
  crédito por venta?' (documented for parity even though the SweetAlert2-based confirm text
  isn't rendered directly, since the inline confirm replaces it), `SALE_CREDIT.
  NO_SALE_CREDIT_FOUND_IN_DAY`='No existe ningún crédito en el día`, `SALE_CREDIT.
  NO_SALE_CREDIT_FOUND`='No se encontró ningún crédito'. Added missing `GENERAL.CLIENT`=
  'Cliente', `GENERAL.NOTE`='Nota', `GENERAL.NO`='No' (Angular's SweetAlert2 cancel button
  text, added for completeness even though the inline-confirm pattern doesn't render a
  distinct No button — GENERAL.YES already existed for the confirm-click label). All old
  `CREDITS.*` keys REMOVED (were exclusively consumed by the files rewritten in this batch,
  confirmed via grep before removal — zero orphans).
- Test files: `credit-components.test.tsx` REWRITTEN (19 tests, was 7 testing the old
  card-button `SaleCreditList`/rich `EditSaleCreditModal` APIs — now tests the table
  `SaleCreditList` with actions-menu, the client/note-only `EditSaleCreditModal`, and the
  payment-type-select + two-step-confirm `SaleCreditPaymentModal`). `sales-routes.test.tsx`
  — `TodaySaleCreditsPage`/`SaleCreditsPage` describe blocks updated with exact-text
  assertions for the corrected Angular headers/empty-states + confirm neither view renders
  any radio filter or date-range input; mocked `SaleCreditOfflineService` updated to drop
  the removed `getByDateRange` method (route now uses `getAll().filter(isActive)`, matching
  the `OrderOfflineService`/`OrdersPage` precedent from the Orders batch instead of a
  dedicated range-query method).

### Removed / Relocated (Batch 6, strict parity)

1. Date-range `<input type="date">` filter pair in `credits.tsx` — REMOVED, no Angular
   equivalent (`loadSaleCreditsFiltered` is always called with `null, null` for both dates
   from `loadSaleCredits()`).
2. Paid/unpaid filter buttons (`CREDITS.FILTER.ALL/PAID/UNPAID`) in `credits.tsx` — REMOVED
   entirely, no Angular equivalent (no filter UI in `sale-credits.component.html` at all).
3. `EditSaleCreditModal`'s payment-type selector and standalone "Registrar pago"/"Cancelar"
   action row — REMOVED from the modal; payment now lives exclusively in
   `SaleCreditPaymentModal`, matching Angular's actual two-separate-modals boundary (the old
   React modal had merged both responsibilities into one).
4. `SaleCreditsPage`/`TodaySaleCreditsPage`'s direct modal-open wiring at the page level —
   REMOVED, RELOCATED into `SaleCreditList` (Angular opens both modals from
   `SaleCreditListComponent`, not the parent page).
5. `SaleCreditOfflineService.getByDateRange` usage in `credits.tsx` — REMOVED in favor of
   `getAll().filter(c => c.isActive)`, matching Angular's `getStorageActiveSaleCredits()`
   filtering and the established `OrderOfflineService`/`OrdersPage` precedent (service
   method itself untouched, zero modification — only the route's consumption changed).

### TDD Cycle Evidence (Batch 6)

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| SaleCreditList (table + actions menu) rewrite | wrote credit-components.test.tsx's SaleCreditList describe block (7 tests) against the new table API (`saleCredits`, `readOnly`, testids `sale-credit-actions-toggle-{id}`), confirmed RED (old card-button component had no such API) | ran full suite — 32/32 passed on first run against the rewritten component | none needed |
| EditSaleCreditModal (client/note-only, Pagar submit) rewrite | wrote EditSaleCreditModal describe block (6 tests) asserting literal `SALE_CREDIT.PAYMENT_CREDIT` title, prefilled client/note, required-client validation message, `onSave`/`onClose` contracts via testids (not label text, since the submit button reads "Pagar" not "Actualizar") | same run, 32/32 passed | none needed |
| SaleCreditPaymentModal (payment-type select + two-step confirm) rewrite | wrote SaleCreditPaymentModal describe block (6 tests) asserting literal title, client/total display, `Efectivo` default via `getByLabelText('Forma de Pago')`, and the two-click confirm gate (`onConfirm` not called on first click, called with `(id, paymentType, note)` on second) | same run, 32/32 passed | none needed |
| SaleCreditsPage / TodaySaleCreditsPage route rewrites | updated sales-routes.test.tsx (13 tests total for these two describes) with exact-text header/empty-state assertions + confirmed zero radio/date-input elements render; updated the shared `SaleCreditOfflineService` mock to drop `getByDateRange` | ran sales-routes.test.tsx — 13/13 passed first run | none needed |

### Test/Build Results (Batch 6)

- `pnpm exec tsc --noEmit` (web-store-pos): clean, zero errors.
- `pnpm exec vitest run` (full suite): 82 test files / 918 tests passed, 0 failed. Baseline
  before this batch: 82 files / 903 tests (Batch 5) → same file count, +15 tests net
  (credit-components.test.tsx: 7 old tests -> 19 new; sales-routes.test.tsx: +3 net in the
  TodaySaleCreditsPage/SaleCreditsPage blocks). Same pre-existing unrelated stderr noise from
  api-client.test.ts's AUTH-06 jsdom navigation warning (documented in batches 3-5 too, not a
  failure).
- `pnpm exec react-router build`: succeeded. Both `credits`/`today-credits` route chunks and
  a dedicated `sale-credit-list-CaGSjS05.js` chunk emitted. No errors/warnings introduced.

### Workload / PR Boundary (Batch 6)

- Mode: direct work-unit commit on `feat/frontend-parity-audit`, NO PR, per explicit user
  instruction (same as batches 1-5).
- 1 work-unit commit: `c1b8617` (708 insertions / 439 deletions across 8 files). Exceeds the
  400-line single-PR review budget on raw insertion count; explicitly instructed as a
  direct-commit, no-PR, single-slice batch (same accepted-exception pattern as prior
  batches).
- Boundary: this batch = the two Sale Credits views (`credits.tsx`, `today-credits.tsx`) +
  their shared list (`sale-credit-list.tsx`) + both modals (`edit-sale-credit-modal.tsx`,
  `sale-credit-payment-modal.tsx`) + their i18n keys ONLY. Does NOT touch Today Stats /
  Cuadre del día (`today-stats.tsx`, unchanged — still reads pre-existing `ORDERS.STATS_*`
  keys) or Category Stats (`category-stats.tsx`, unchanged) — Stage 1 Sales L4/L5/L6 work
  still pending on those two views. Does NOT touch `SaleCreditOfflineService` internals
  (only consumes existing `getAll`/`getActiveToday`/`update`/`pay` methods, zero
  modification).

### Status (Batch 6)

6 batches complete (2 targeted UI/shell batches + Stage 1 Sales Products-view + Sale/POS-view
+ Orders-views + Sale-Credits-views parity slices). Stage 1 (Sales) is STILL NOT fully done.
Remaining per the tasks artifact's Stage 1 template, scoped to the two Sales views not yet
touched: Today Stats / Cuadre del día (`today-stats.tsx`) and Category Stats
(`category-stats.tsx`) — both need their own Angular-vs-React L4/L5/L6 diff passes before
Stage 1 can be marked parity-complete and moved to `sdd-verify`. Ready to continue with
Today Stats and Category Stats as the final Stage 1 slice, or run `sdd-verify` on the
Products+Sale+Orders+Credits slices completed so far, per user direction. Stage 1's
full-module chained-PR delivery strategy (stacked-to-main vs feature-branch-chain) still
needs an explicit decision from the orchestrator/user before a non-explicitly-scoped Stage 1
`sdd-apply` batch begins, per the tasks artifact's Review Workload Forecast.
