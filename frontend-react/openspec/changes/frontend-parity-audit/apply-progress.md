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

## Batch 7 — Stage 1 Sales, TODAY STATS + CATEGORY STATS strict Angular parity (FINAL Sales slice)

### Why (Batch 7)

User explicitly requested the final Stage 1 (Sales) slice: strict Angular parity for the
Today Stats ("Cuadre del día") and Category Stats views — the two Sales views not yet
touched by batches 3-6. The prior React versions were entirely React-invented: `today-stats.tsx`
was a "TodayStatsPage" with summary cards (Ingresos totales / Artículos), a
revenue-by-payment-type breakdown list, and a `CategoryStats` component computing
per-category revenue from raw `Order[]` client-side — none of this has an Angular equivalent.
Angular's `TodayStatsComponent` ("Cuadre del día") is a Material accordion of five
collapsed-by-default expansion panels (Resumen Efectivo / Gastos / Créditos Por Cobrar /
Créditos Pagados / Ventas) built from five distinct getter formulas and gated by
`hasExpensesModuleAvailable()`/`hasCreditsModuleAvailable()` (module-based, NOT feature-based
— a check that didn't exist anywhere in React's `authorization-service.ts` before this batch).
`CategoryStatsComponent` is a bare two-level table (category summary row + one row per
product), fed by `OrderOfflineService.getCategoryCartItemsView()` — an aggregation method
that also didn't exist in React.

### Where (Batch 7)

- `app/sales/lib/category-cart-items-view.ts` — NEW. `CategoryCartItemsView` /
  `ProductCartItemsView` view-model interfaces, 1:1 port of Angular's
  `application/orders/category-cart-items.view.ts` / `product-cart-items.view.ts`. Lives in
  `sales/lib` (not `@store-mgmt/domain`) because these are a service-layer projection, not
  domain entities — matching where Angular itself puts them (`application/`, not
  `domain/entities/`).
- `app/sales/lib/services/order-offline-service.ts` — ADDED `getCategoryCartItemsView(date)`:
  1:1 port of Angular's `OrderOfflineService.getCategoryCartItemsView`. Flattens today's
  active orders' `orderItems`, groups by `categoryId` then by `productId` (custom `groupBy`
  helper matching Angular's `Map`-based one), sums `total`/`itemsCount` per group via ported
  `getOrderItemsTotal`/`getOrderItemsCount` helpers. Resolves each category's `order` field
  from a new `ProductCategoryOfflineService` instance, falling back to `Number.MAX_VALUE`
  when the category isn't found in storage — Angular's exact fallback, preserved. Also
  preserves an Angular QUIRK verbatim: the returned array is NOT explicitly sorted by
  `order` — iteration follows `Map` insertion order (first-seen category among the flattened
  order items), not the resolved `order` field. Flagged, not silently fixed.
- `app/sales/lib/services/sale-credit-offline-service.ts` — ADDED two new day-filter methods
  Angular has but React didn't: `getUnpaidCreatedToday()` (1:1 port of
  `getUnPaidSaleCreditsInDayObservable` — active credits CREATED today via `date`, filtered
  to `!isPaid`; feeds "Créditos Por Cobrar") and `getPaidToday()` (1:1 port of
  `getPaidSaleCreditsInDayObservable` — active credits whose `paidDate` falls in today's
  range, REGARDLESS of creation date; feeds "Créditos Pagados"). These are genuinely
  different filters — reusing the existing `getActiveToday()` (created-today only) for both
  panels would have been WRONG for "Créditos Pagados", since a credit created yesterday and
  paid today must still appear there. `getActiveToday()` itself is unchanged.
- `app/shared/lib/auth/authorization-service.ts` — ADDED `isModuleAvailable(user, moduleId)`
  (1:1 port of Angular's private `AuthorizationService.hasModuleAvailable` —
  `storeModuleIds.some(id => id === moduleId)`, a module-based check DISTINCT from the
  existing feature-based `isUserAuthorized`), plus `hasExpensesModuleAvailable(user)` and
  `hasCreditsModuleAvailable(user)` thin wrappers, matching Angular's own public API shape.
  `EModules` enum already existed in `@store-mgmt/domain` with matching numeric values
  (Expenses=8, Credits=11) — reused, not redefined.
- `app/sales/routes/today-stats.tsx` — REWRITTEN wholesale. Card with `TODAY_STATS.HEADER`
  title ("Cuadre del día") + running total in the toolbar (`getTotal()` formula:
  `ordersTotal + paidSaleCreditsTotal - creditsTotal - expensesTotal`, colored via
  success/danger/neutral like Angular's `getTotalClassName()`). Body is a `<details>`/
  `<summary>`-based accordion (semantic HTML substitute for Angular Material's
  `mat-accordion`/`mat-expansion-panel`, collapsed by default matching every panel's
  `[expanded]="false"`) with, in Angular's exact order: (1) "Resumen Efectivo" — ALWAYS
  rendered, a 1-3 row table (Ventas always; Créditos Pagados / Gastos rows only when their
  respective module is available), amounts colored success/danger; (2) "Gastos (N)" — only
  when `hasExpensesModuleAvailable`, listing today's expenses with expense-type text +
  danger-colored total + payment-type badge, using a locally-duplicated
  `EXPENSE_TYPE_KEYS`/`PAYMENT_TYPE_KEYS` map (not imported from
  `app/expenses/components/expense-list.tsx`, since that file doesn't export them and Sales
  should not couple to Expenses-module internals — Stage 3 scope boundary preserved), empty
  state uses `TODAY_STATS.NO_EXPENSE_FOUND`; (3) "Créditos Por Cobrar (N)" — only when
  `hasCreditsModuleAvailable`, a read-only `SaleCreditsTable` (bare table, no actions column,
  matching Angular's `<app-sale-credit-list>` with no `[readOnly]` binding here — default
  `true`); (4) "Créditos Pagados (N)" — only when `hasCreditsModuleAvailable`; FLAGGED
  ANGULAR QUIRK preserved verbatim: the header's `(...)` slot shows
  `{{getPaidSaleCreditsTotal()}}` (a currency SUM), not a count, unlike every other panel
  header on this view — Angular's own template literally does this, not a paraphrase or bug
  fix; (5) "Ventas (N productos)" — ALWAYS rendered, one `CategoryStats` row per category
  from `getCategoryCartItemsView()`. `SaleCreditsTable` is a small local helper duplicating
  the read-only rendering path already established in `sale-credit-list.tsx` (kept local
  since Today Stats doesn't need edit/pay actions or the actions-menu/modal wiring at all).
- `app/sales/components/category-stats.tsx` — REWRITTEN wholesale from a
  `computeCategoryStats(orders)`-based revenue-card list into a 1:1 port of
  `category-stats.component.html`: a bare table (no header row), one summary row for the
  category (name, `(itemsCount)` badge, green total) followed by one row per
  `category.productItems` entry with the identical column layout. Takes a single
  `category: CategoryCartItemsView` prop (was `orders: Order[]` before — the aggregation now
  lives in `OrderOfflineService`, matching where Angular puts it). No i18n keys — Angular's
  own template has zero static Spanish text in this component, only currency-formatted
  numbers and names.
- `app/shared/lib/i18n/es.ts` — ADDED `TODAY_STATS.HEADER` ('Cuadre del día',
  previously only used inline, not as a key) and `TODAY_STATS.NO_EXPENSE_FOUND` ('No se ha
  realizado ningun gasto en el día de hoy.', Angular's typo `ningun` without accent preserved
  verbatim). The remaining panel labels ("Resumen Efectivo", "Ventas", "Créditos Pagados",
  "Gastos", "Créditos Por Cobrar") are HARDCODED Spanish literals in Angular's own template
  (no `[translate]` pipe on them at all) — preserved as literal strings in the React
  components too, NOT invented as new i18n keys, to stay byte-identical to Angular's actual
  i18n boundary.
- Test files: `category-stats.test.tsx` (NEW, 3 tests), `today-stats.test.tsx` (NEW, 6
  tests, includes a module-availability-gated describe block), `order-offline-service.test.ts`
  (+6 tests for `getCategoryCartItemsView`), `sale-credit-offline-service.test.ts` (+5 tests
  for `getUnpaidCreatedToday`/`getPaidToday`), `authorization-service.test.ts` (+7 tests for
  `isModuleAvailable`/`hasExpensesModuleAvailable`/`hasCreditsModuleAvailable`),
  `sales-routes.test.tsx` (updated shared `OrderOfflineService`/`SaleCreditOfflineService`
  mocks + added an `ExpenseOfflineService` mock + `storeModuleIds: []` on the shared mock
  user, needed because the rewritten `TodayStatsPage` now calls
  `hasExpensesModuleAvailable`/`hasCreditsModuleAvailable` on every render).

### Removed / Relocated (Batch 7, strict parity)

1. `today-stats.tsx`'s summary cards (Ingresos totales / Artículos vendidos) and
   revenue-by-payment-type breakdown list — REMOVED entirely, no Angular equivalent.
2. `category-stats.tsx`'s client-side `computeCategoryStats(orders)` aggregation and its
   `CategoryStat` interface — REMOVED/RELOCATED: the aggregation now lives in
   `OrderOfflineService.getCategoryCartItemsView`, matching where Angular's own
   `CategoryStatsComponent` gets its `[category]` input from (`OrderOfflineService`, not the
   presentational component).
3. `today-stats.tsx`'s old `PAYMENT_LABELS` map and `ORDERS.STATS_TITLE`/`ORDERS.STATS.*`/
   `ORDERS.PAYMENT_TYPE` i18n key usages — ORPHANED (left in `es.ts`, not pruned, per the
   established no-instruction-to-prune-orphans precedent from batch 5/6). Confirmed via grep
   these keys are not consumed by any other rewritten file in this batch.

### Flagged gap (out of Batch 7 scope — Stage 3 Expenses)

`ExpenseOfflineService.getByDateRange`/`getActiveToday()` (React) does NOT filter
`isActive`, unlike Angular's `getExpensesInDay` (`expense.isActive && ...`). This means a
deleted/inactive expense would still count toward `expensesCashTotal`/`expensesTotal` on
Today Stats if such a record ever existed. Not fixed in this batch — `ExpenseOfflineService`
internals are Stage 3 (Expenses module) scope; Today Stats simply consumes the existing
`getActiveToday()` as-is, same as `today-expenses.tsx`/`expenses-history.tsx` already do.
Flagged here for Stage 3's L4 functional diff pass.

### TDD Cycle Evidence (Batch 7)

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| `OrderOfflineService.getCategoryCartItemsView` | wrote 6 tests (empty case, category-level grouping/totals, product-level grouping/totals, category `order` resolution, `Number.MAX_VALUE` fallback, excludes inactive orders) against the not-yet-existing method; confirmed RED (`TypeError: service.getCategoryCartItemsView is not a function`, 6/6 new tests failed, 26/26 pre-existing still passed) | implemented the method — 32/32 passed first run | none needed |
| `authorization-service.isModuleAvailable`/`hasExpensesModuleAvailable`/`hasCreditsModuleAvailable` | wrote 7 tests against not-yet-exported functions; confirmed RED (`TypeError: (0, hasCreditsModuleAvailable) is not a function`, 7/7 new failed, 16/16 pre-existing passed) | implemented — 23/23 passed first run | none needed |
| `SaleCreditOfflineService.getUnpaidCreatedToday`/`getPaidToday` | wrote 5 tests against not-yet-existing methods; confirmed RED (`TypeError: service.getPaidToday is not a function`, 5/5 new failed, 26/26 pre-existing passed) | implemented — initially 30/31 (one test used an untyped-and-unverified backdating approach); revised the "excludes credits not created today" test to directly backdate `localStorage` and assert via the real method instead of a placeholder assertion — 31/31 passed | tightened one test's assertion from a placeholder `expect(credit).toBeTruthy()` to an actual behavioral check against `getUnpaidCreatedToday()` |
| `CategoryStats` component rewrite | wrote 3 tests (category summary row, per-product rows, null-category guard) against the already-drafted component in the same edit pass (component written first, tests immediately after, both verified together — see Issues Found) | 3/3 passed on first run, no fix needed | none needed |
| `TodayStatsPage` route rewrite | wrote 6 tests (header, Resumen Efectivo panel + Gastos-row visibility gating, salesCashTotal formula, Ventas-panel item count, Gastos/Créditos panels hidden without modules, Gastos/Créditos panels shown + literal "Créditos Pagados (60)" quirk with modules) against the not-yet-rewritten route; confirmed RED (5/6 failed against the old summary-card implementation) | rewrote the route — 6/6 passed first run | none needed |

### Issues Found (Batch 7)

`CategoryStats` was implemented before its test file in this batch (design decided while
reading Angular's `category-stats.component.html`, tests written immediately after against
the already-typed component) — a deviation from strict RED-before-GREEN sequencing for that
one component. All 3 tests passed on first run with no fix needed, so no incorrect behavior
shipped, but this is noted as a process deviation, not silently glossed over. Every other
unit in this batch (service methods, authorization helpers, the route) followed strict
RED-confirmed-failing → GREEN sequencing.

### Test/Build Results (Batch 7)

- `pnpm exec tsc --noEmit` (web-store-pos): one error found and fixed (a test-only unsafe
  type assertion in `sale-credit-offline-service.test.ts`'s backdating helper — narrowed to
  `Record<string, unknown>` instead of asserting through `SaleCredit`); clean after fix, zero
  errors.
- `pnpm exec vitest run` (full suite): 84 test files / 946 tests passed, 0 failed. Baseline
  before this batch: 82 files / 918 tests (Batch 6) → +2 files (`category-stats.test.tsx`,
  `today-stats.test.tsx`), +28 tests net. Same pre-existing unrelated stderr noise from
  `api-client.test.ts`'s AUTH-06 jsdom navigation warning (documented in batches 3-6 too, not
  a failure).
- `pnpm exec react-router build`: succeeded. `today-stats-CpPApVTL.js` chunk emitted. No
  errors/warnings introduced.

### Workload / PR Boundary (Batch 7)

- Mode: direct work-unit commit on `feat/frontend-parity-audit`, NO PR, per explicit user
  instruction (same as batches 1-6).
- 1 work-unit commit: `bea961f` (913 insertions / 124 deletions across 13 files: 3 new files
  + 10 modified). Exceeds the 400-line single-PR review budget on raw insertion count;
  explicitly instructed as a direct-commit, no-PR, single-slice batch (same
  accepted-exception pattern as prior batches).
- Boundary: this batch = Today Stats (`today-stats.tsx`) + Category Stats
  (`category-stats.tsx`) + their two new service methods (`getCategoryCartItemsView`,
  `getUnpaidCreatedToday`/`getPaidToday`) + the new `authorization-service.ts` module-check
  helpers + their i18n keys ONLY. Does NOT touch `ExpenseOfflineService` internals (flagged
  gap noted above, deferred to Stage 3) or `SaleCreditList`/`EditSaleCreditModal`/
  `SaleCreditPaymentModal` (unchanged from Batch 6 — Today Stats renders its own local
  read-only `SaleCreditsTable`, does not reuse the actions-capable `SaleCreditList`).

### Status (Batch 7) — Stage 1 (Sales) COMPLETE

7 batches complete (2 targeted UI/shell batches + Stage 1 Sales Products-view + Sale/POS-view
+ Orders-views + Sale-Credits-views + Today-Stats/Category-Stats parity slices). **Stage 1
(Sales) is now FULLY parity-complete** — every Sales view listed in the tasks artifact's
Stage 1 template has undergone its own L4 (functional diff) + L5 (visual/token) + L6 (i18n)
pass: Products, Sale/POS, Orders (`orders.tsx`/`today-orders.tsx`), Sale Credits
(`credits.tsx`/`today-credits.tsx`), and now Today Stats (`today-stats.tsx`) + Category Stats
(`category-stats.tsx`). No Sales view remains untouched. Ready for `sdd-verify` on the full
Stage 1 (Sales) module, or to proceed to Stage 2 (Inventory) per the tasks artifact's module
order. Stage 1's full-module chained-PR delivery strategy question is now moot for delivery
purposes (all 7 batches were delivered as direct work-unit commits, no PR, per explicit user
instruction throughout) — but the orchestrator/user should still confirm chain strategy
(stacked-to-main vs feature-branch-chain) before Stage 2 (Inventory) `sdd-apply` begins if a
PR-based workflow is desired going forward, per the tasks artifact's Review Workload
Forecast.

## Batch 8 — Stage 1 Sales, Cart (nav-right) parity + docs reconciliation

### What (Batch 8)

Closed the Shopping Cart's remaining Stage 1 (Sales) parity gaps against Angular's
`NavRightComponent`/`nav-right.component.html` (the cart dropdown), AND reconciled a
documented contradiction: `explore.md` said "verify [shopping-cart] in Sales stage" while
`design.md`/`tasks.md` had routed the shopping-cart service to Stage 6 (Sync).
RESOLUTION applied (see `tasks.md` 1.5/6.1 and `design.md`'s Service Parity Method note):
the cart UI + POS checkout FLOW parity is Stage 1 (Sales) scope — done in this batch. Only
the cross-cutting offline `ShoppingCartService`/inventory-availability-on-increase/decrease
audit stays Stage 6 (Sync) scope, left untouched here (deferred sub-item, see below).

Gaps closed (previously React had only badge + header total from an earlier batch):
1. Dropdown header replaced generic `CART.TITLE` with Angular's exact "Venta actual" title
   + order-type subtitle (`getOrderTypeText(OrderType.Normal)` = "Normal").
2. Added the `payment` (Pago) numeric input + Vuelto (change) readout, colored
   success/danger/neutral to match Angular's `payment-return-positive`/`-negative` CSS
   classes (React uses semantic Tailwind color classes instead of literal class names).
   `payment` is UI-only local state, NOT persisted to the created Order — matches Angular
   (`NavRightComponent.payment` lives on the component, not `ShoppingCartService`/`Order`).
3. Added the payment-type selector with inline SVG icons per option (cash/card/phone),
   replacing the plain-text-only selector — semantic 1:1 port of Angular's
   `PaymentTypeUtils.getPaymentTypeIcon()` (`bi-cash-stack`/`bi-credit-card`/`bi-phone`),
   no bootstrap-icons dependency added.
4. Gated the credit toggle + client input behind `hasCreditsModuleAvailable(user)` (React
   port already existed from Batch 7's `authorization-service.ts`) — previously the credit
   toggle was unconditionally rendered, an ungated behavior gap vs Angular's
   `@if (hasCreditsModuleAvailable)`.
5. Added the print-invoice toggle (`SHOPPING_CART.PRINT_INVOICE`, "Imprimir Factura
   (prueba)") as UI-only state (`mustGenerateFacture`) with explicitly NO print behavior —
   parity with Angular, where `generateTicket`/`generateFacture` are dead/disabled no-op
   `console.log` stubs (jsPDF generation commented out).
6. Renamed the action buttons to Angular's exact texts: "Limpiar" (`SHOPPING_CART.CLEAR`,
   clears cart) and "Registrar" (`SHOPPING_CART.REGISTER`, creates order) — replacing the
   React-invented "Cancelar"/"Crear pedido" labels. Both buttons are now ALWAYS rendered but
   `disabled` when `itemCount === 0`, matching Angular's `[disabled]="getItemsCount() === 0"`
   binding on both mat-fab buttons (previously the whole payment-controls block, including
   the create button, was conditionally unmounted when the cart was empty — a structural
   difference from Angular's always-rendered/conditionally-disabled buttons).
7. Ported `createOrder()`'s exact validation order and messages from
   `NavRightComponent.createOrder()`: (a) empty cart -> `SHOPPING_CART.DON_NOT_PAY_EMPTY_CART`,
   (b) `payment && payment < total` -> `SHOPPING_CART.DON_NOT_PAY_LESS_THAN_CART_TOTAL`
   (NEW check, did not exist in React before this batch), (c) `isCredit && !client` ->
   `SHOPPING_CART.DON_NOT_SALE_CREDIT_WITHOUT_CLIENT`. Success path now shows
   `SHOPPING_CART.ORDER_CREATED` inline (React's existing inline-message pattern, not
   SweetAlert/toastr) before clearing the cart.
8. Added all `SHOPPING_CART.*` i18n keys (+ `GENERAL.PAY`) to React `es.ts`, byte-identical
   Spanish to Angular's `vocabs/es.ts` `SHOPPING_CART` block. Existing `CART.*` keys
   (`CART.TITLE`, `CART.EFECTIVO`/`TARJETA`/`ZELLE`, etc.) were left in place, not renamed,
   to avoid churn in unrelated call sites — `SHOPPING_CART.*` is the new keyset used by the
   literal Angular-matching strings this batch introduces.

### Deferred sub-item (explicitly OUT of Batch 8 scope)

Inventory-availability validation on cart increase/decrease — Angular's
`ShoppingCartService.increaseCartItem`/`decreaseCartItem` check stock availability before
allowing a quantity change; React's `cart-store.ts` is local-only (zustand + persist) and
does NOT validate stock. NOT implemented here — flagged as a candidate for either Stage 2
(Inventory) or the Stage 6 Sync cross-cutting `ShoppingCartService` audit (see `tasks.md`
6.1's updated scope note). jsPDF ticket/factura generation and
`editOrderDetails`/`EditOrderDetailsModalComponent` also confirmed out of scope (dead/unused
in Angular's own template) — not ported, per the batch's exact-scope instruction.

### Where (Batch 8)

- `app/shared/components/cart-shell.tsx` — REWRITTEN (header, payment/Vuelto, payment-type
  icons, credit gating, print-invoice toggle, Limpiar/Registrar, validations wired to the
  new pure helpers below).
- `app/shared/components/__tests__/cart-shell.test.tsx` — REWRITTEN/EXTENDED (23 tests,
  was 6; mock user now carries `storeModuleIds` for the credits-module gate).
- `app/sales/lib/order-type-utils.ts` — NEW. `getOrderTypeText(orderType)`, 1:1 port of
  Angular's `OrderTypeUtils.getOrderTypeText` (enum-name reverse lookup, not an i18n key —
  Angular's own template has no `[translate]` pipe on this value).
- `app/sales/lib/__tests__/order-type-utils.test.ts` — NEW (2 tests).
- `app/shared/lib/payment-type-icon.ts` — NEW. `getPaymentTypeIconKind(paymentType)`, pure
  discriminant-key port of Angular's `PaymentTypeUtils.getPaymentTypeIcon` semantics, mapped
  to inline SVGs in the component (no bootstrap-icons dependency).
- `app/shared/lib/payment-type-icon.test.ts` — NEW (4 tests).
- `app/shared/lib/payment-return.ts` — NEW. `getPaymentReturn`/`getPaymentReturnKind`, 1:1
  port of `NavRightComponent.getPaymentReturn()`/`getPaymentReturnClass()`.
- `app/shared/lib/payment-return.test.ts` — NEW (6 tests).
- `app/shared/lib/cart-submission-validation.ts` — NEW. `validateCartSubmission(...)`, 1:1
  port of `NavRightComponent.createOrder()`'s three-check validation sequence, extracted as
  a pure function (Extract-Before-Mock — zero mocks needed to test the validation logic).
- `app/shared/lib/cart-submission-validation.test.ts` — NEW (5 tests).
- `app/shared/lib/i18n/es.ts` — ADDED `SHOPPING_CART.*` keys (`PRODUCTS_LABEL`,
  `PRODUCT_LABEL`, `REGISTER`, `PRICE_LABEL`, `ORDER_CREATED`, `ORDER_NOT_CREATED`,
  `DON_NOT_PAY_EMPTY_CART`, `PRINT_INVOICE`, `CLEAR`,
  `DON_NOT_PAY_LESS_THAN_CART_TOTAL`, `DON_NOT_SALE_CREDIT_WITHOUT_CLIENT`) + `GENERAL.PAY`,
  byte-identical Spanish to `frontend/src/app/_modules/i18n/vocabs/es.ts`.
- `frontend-react/openspec/changes/frontend-parity-audit/tasks.md` — added explicit `1.5`
  Stage 1 cart task; edited Stage 6's `6.1` note to scope the shopping-cart reference to the
  service/inventory-availability audit only, cross-referencing 1.5.
- `frontend-react/openspec/changes/frontend-parity-audit/design.md` — adjusted the Service
  Parity Method note so the cart UI/flow is marked Stage 1, only the cross-cutting service
  remains a Sync design question.
- `frontend-react/openspec/changes/frontend-parity-audit/specs/frontend-parity-audit/spec.md`
  — added a cart-scope bullet to the Sales row and a cross-reference note to the Sync row of
  the Per-Module Acceptance table.

### TDD Cycle Evidence (Batch 8)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| `getOrderTypeText` | `sales/lib/__tests__/order-type-utils.test.ts` | Unit | N/A (new) | Written, confirmed RED (module not found) | 2/2 passed first run | 2 cases (Normal, Mayorista) | None needed |
| `getPaymentTypeIconKind` | `shared/lib/payment-type-icon.test.ts` | Unit | N/A (new) | Written, confirmed RED | 4/4 passed first run | 4 cases (cash/card/phone/default) | None needed |
| `getPaymentReturn`/`getPaymentReturnKind` | `shared/lib/payment-return.test.ts` | Unit | N/A (new) | Written, confirmed RED | 6/6 passed first run | 6 cases across both functions | None needed |
| `validateCartSubmission` | `shared/lib/cart-submission-validation.test.ts` | Unit | N/A (new) | Written, confirmed RED | 5/5 passed first run | 5 cases (all 3 error codes + 2 null-path cases) | None needed |
| `CartShell` component rewrite | `shared/components/__tests__/cart-shell.test.tsx` | Integration (RTL) | Baseline 6/6 passing before edit | Written first (22/23 new assertions RED against pre-rewrite component) | Fixed 1 bug found by GREEN run (success message wiped by a shared `handleClear` reset) — 23/23 passed after fix | Multiple scenarios per behavior (empty vs non-empty cart, credits-module gated vs ungated, all 3 validation branches, success path) | Extracted `clearCartAfterSuccessfulOrder` to avoid clobbering `submitSuccess` |

### Issues Found (Batch 8)

One real bug caught by the GREEN execution gate (not glossed over): the first
`handleCreateOrder` implementation called the same `handleClear()` used by the "Limpiar"
button after a successful order, which also reset `submitSuccess` to `null` — so the
"La venta fue creada satisfactoriamente." message never rendered. Fixed by splitting a
`clearCartAfterSuccessfulOrder()` helper that resets cart/transient-field state but leaves
`submitSuccess` alone. Caught by the CART-07 test failing on first GREEN run, not silently
shipped.

### Test/Build Results (Batch 8)

- `tsc -p apps/web-store-pos/tsconfig.json --noEmit` (from `frontend-react/`): clean, zero
  errors.
- `vitest run` (full suite): 88 test files / 980 tests passed, 0 failed. Baseline before this
  batch: 84 files / 946 tests (Batch 7) -> +4 files (`order-type-utils.test.ts`,
  `payment-type-icon.test.ts`, `payment-return.test.ts`, `cart-submission-validation.test.ts`),
  +34 tests net (17 new pure-function tests + 17 net new cart-shell assertions: was 6, now 23).
- `react-router build`: succeeded, no errors/warnings introduced.

### Workload / PR Boundary (Batch 8)

- Mode: no git commit/push performed by this batch — user handles commit per explicit
  instruction (differs from Batches 1-7, which were direct work-unit commits; this batch's
  changes are staged in the working tree only).
- Boundary: this batch = `cart-shell.tsx` + its 4 new pure-function lib modules + their
  tests + `es.ts` `SHOPPING_CART.*`/`GENERAL.PAY` keys + the 4 openspec docs (`tasks.md`,
  `design.md`, `specs/frontend-parity-audit/spec.md`, this file) ONLY. Does NOT touch
  `cart-store.ts` (zustand store shape unchanged — `payment`/`mustGenerateFacture` are local
  component state, not store fields, matching Angular's component-vs-service field split)
  or `order-offline-service.ts`'s `create()` signature (unchanged).

### Status (Batch 8) — Stage 1 (Sales) cart parity gap CLOSED; contradiction reconciled

Stage 1 (Sales) was previously marked complete across 7 batches but had left the shopping
cart at a partial state (badge + header total only, from an earlier targeted UI/shell
batch) with an unresolved scope contradiction between `explore.md` and
`design.md`/`tasks.md`. This batch closes that gap: the cart dropdown now has full L4/L5/L6
parity with Angular's `NavRightComponent`, and the scope contradiction is resolved and
documented in `tasks.md`/`design.md`/`spec.md` (cart UI/flow = Stage 1 Sales; cart
service/inventory-availability audit = Stage 6 Sync). The one deliberately deferred
sub-item (inventory-availability validation on cart increase/decrease) is flagged, not
silently dropped, and carries forward to Stage 2 (Inventory) or Stage 6 (Sync) per the
updated `tasks.md` 6.1 note.

### Post-Batch-8 scope work (2026-07-02, docs-only — no code)

1. Stage 2 carry-overs formalized (`tasks.md` 2.5/2.6, `design.md`, `spec.md`): cart
   increase/decrease stock validation + `sale.tsx` `checkAvailability` wiring (both depend on
   `InventoryOfflineService`) and login/auth parity folded into Stage 2. Sync (Stage 6) keeps
   only generic PWA services.
2. Stage 0 RE-VERIFY run (2026-07-02): PASS-WITH-WARNINGS, 0 CRITICAL, NO regression from the
   cart/i18n/shared-chrome churn. `verify-report.md` rewritten (supersedes 2026-07-01). W1
   (spec.md scope drift) fixed same day.
3. Login copy gap logged in `tasks.md` 2.6.1: React invented English "POS Management"
   (`auth-layout.tsx:9`, `es.ts:4` `GENERAL.APP_SUBTITLE`, manifest description) that Angular
   has nowhere; Angular shows brand "VendeDTo" + Spanish tagline "Automatiza tu Negocio". Fix
   deferred to Stage 2 task 2.6.1.

### NEXT ACTION

**Run `sdd-verify` for Stage 1 (Sales).** Stage 1 was marked apply-complete across 8 batches
but has NEVER been verified (only Stage 0 has a verify-report). This is the immediate next
step before proceeding to Stage 2 (Inventory) `sdd-apply`.
