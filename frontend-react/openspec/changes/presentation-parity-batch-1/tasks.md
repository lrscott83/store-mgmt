# Tasks: Presentation Parity Batch 1

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1200 (WU2 ~350-450, WU3 ~150, WU10 ~120, others ~40-100 each incl. tests) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only on `feat/presentation-parity-batch-1`, no PR |
| Suggested split | 2 apply batches (disjoint dirs), 1 commit per WU |
| Delivery strategy | commits-only (project convention, no PR/size:exception ceremony) |
| Chain strategy | n/a |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

Informational only per project convention (`delivery-commits-only-on-feature-branch`): no PR gating, no size:exception needed even though total exceeds 400 lines. Each WU is its own commit and independently revertible.

### Suggested Work Units

| Unit | Goal | Batch | Notes |
|------|------|-------|-------|
| WU3 | edit-products-modal bulk-create rework | 1 | Largest in batch 1; `createProducts` verified to exist |
| WU5 | available.tsx empty-state | 1 | Small |
| WU6 | expense-form-modal default type | 1 | Tiny, 1-line default |
| WU7 | expense-form-modal total required | 1 | Small, validation only |
| WU8 | edit-inventory-entry-modal disable select | 1 | Tiny |
| WU1 | store-card-list color fix | 2 | Tiny |
| WU2 | statistics dashboard rework | 2 | Largest overall; sub-tasks 2a/2b/2c |
| WU9 | features.tsx icon + blocking alerts | 2 | Small |
| WU4 | edit-profile-form cellPhone mask | 2 | Small, reuse existing mask lib |
| WU10 | auth footer + register cleanup | 2 | Medium |

All fixes are independent (disjoint files); order within a batch is not dependency-driven, just filed by proposal number.

---

## Batch 1 — sales + inventory + expenses

### WU3 — `sales/components/edit-products-modal.tsx` bulk-CREATE rework
Angular ref: `edit-products-modal.component.ts`/`.html` (frontend/src/app/presentation/products/edit-products-modal/).

- [x] 3.1 RED: rewrite `sales/components/__tests__/edit-products-modal.test.tsx` — modal opens with 4 blank Nombre/Precio rows (not existing-product rows); "+ Nuevo" button adds a row; Save with an empty required name shows a per-row required error and does NOT call `onSave`/`createProducts`; Save with two rows sharing the same (trimmed, case-insensitive) name blocks submit silently (Angular has no visible duplicate message — matches source, mat-error only for required/price); Save with valid distinct rows calls `createProducts(categoryId, [{name, price}, ...])` with only rows where BOTH name and price are non-empty.
- [x] 3.2 GREEN: change props to `{ categoryId: string; onSave: (categoryId: string, items: {name;price}[]) => void; onClose }` (or keep category object per current caller shape — match `sales/routes/products.tsx` `modal.category`); replace `editedPrices` state with a `products: {name:string; price:string}[]` array state initialized to 4 blank rows; add row handler (+Nuevo, `GENERAL.NEW` i18n key — add if missing); per-row validation: name required, price required + `/^\d+(\.\d{1,2})?$/` format + `>0`; `hasDuplicateNames()` blocks submit (trim+lowercase compare); on submit, filter rows where `name && price`, map to `{name: name.trim(), price: parseFloat(price)}`, call `createProducts(categoryId, items)`.
- [x] 3.3 GREEN: update caller `sales/routes/products.tsx` — replace `handleBulkSave` (currently loops `updateProduct`) with a call to `createProductService(storeId).createProducts(modal.category.id, items)`; keep post-save reload/close behavior.
- [x] 3.4 Add `PRODUCT.ADD_PRODUCTS` and `GENERAL.NEW` keys to `shared/lib/i18n/es.ts` if absent (verified absent).
- [x] 3.5 Commit: `fix(sales): rework edit-products-modal to bulk-create matching Angular` — actual commit `55f81ba fix(products): make "Nuevo Productos" modal create products to match Angular`

### WU5 — `inventory/routes/available.tsx` empty-state
Angular ref: Angular's `InventoryAvailableComponent` template, `INVENTORY.NO_ENTRY_FOUND` key (verify exact key name in `es.ts`; per-category empty message stays for a populated-categories-list-with-one-empty-category case).

- [x] 5.1 RED: add test in `inventory/routes/__tests__/inventory-routes.test.tsx` — when `getInventoryCategoriesView()` returns `[]`, page renders `INVENTORY.NO_ENTRY_FOUND` message instead of the per-category "empty category" message; when categories.length > 0 (even if one category has zero products), the per-category message still renders as today.
- [x] 5.2 GREEN: in `InventoryAvailablePage`, branch on `categories.length === 0` → render `intl.formatMessage({id:'INVENTORY.NO_ENTRY_FOUND'})` instead of `<InventoryProductList categories={[]} />`.
- [x] 5.3 Commit: `fix(inventory): show NO_ENTRY_FOUND empty state when zero categories` — actual commit `a9dc81f fix(inventory): correct empty-inventory message on Available screen`

### WU6 — `expenses/components/expense-form-modal.tsx` default type
Angular ref: `edit-expense-modal.component.ts:60` create-mode default `ExpenseType.Salario`.

- [x] 6.1 RED: test in `expenses/components/__tests__/expense-components.test.tsx` — opening the modal in create mode (no `expense` prop) preselects `ExpenseType.Salario` in the type `<select>`.
- [x] 6.2 GREEN: change `emptyForm()`'s create-mode default `type: ExpenseType.Otro` → `type: ExpenseType.Salario`.
- [x] 6.3 Commit: `fix(expenses): default new-expense type to Salario matching Angular` — combined with WU7 into `399b0a5 fix(expenses): default new expense type to Salario and require an explicit total`

### WU7 — `expenses/components/expense-form-modal.tsx` total required
Angular ref: `edit-expense-modal.component.ts:88-92` `Validators.required` (no default-0-is-valid).

- [x] 7.1 RED: test — create mode with `total` left blank/never touched is invalid (Save button disabled, `EXPENSES.FORM.TOTAL_REQUIRED` shown); entering `0` explicitly stays valid (existing `>=0` rule preserved); leaving the field truly empty (`''`/`NaN`) is invalid.
- [x] 7.2 GREEN: change create-mode default `total: 0` → `total: NaN` (or a sentinel `''`-parsed-to-NaN) so `isValid` (`Number.isFinite(form.total) && form.total >= 0`) is false until user types a value; keep the existing edit-mode branch (`total: expense.total`) unchanged.
- [x] 7.3 Commit: `fix(expenses): total is required (no longer defaults to valid 0)` — combined with WU6 into `399b0a5 fix(expenses): default new expense type to Salario and require an explicit total`

### WU8 — `inventory/components/edit-inventory-entry-modal.tsx` disable product select
Angular ref: `edit-inventory-entry-modal.component.html` `[disabled]="true"` on the product select (verify exact line — file has no local Angular copy path noted in proposal; confirm in Angular source before commit).

- [x] 8.1 RED: test in `inventory/components/__tests__/inventory-components.test.tsx` — the product `<select>` is disabled in BOTH create and edit mode (always, not conditional on `entry`).
- [x] 8.2 GREEN: add `disabled` attribute unconditionally to the product `<select>` at line ~143.
- [x] 8.3 Commit: `fix(inventory): disable product select in edit-inventory-entry-modal` — actual commit `15fa7e8 fix(inventory): disable product select in edit-entry modal to match Angular`

### Batch 1 verification
- [x] B1.1 `pnpm test` — all green, no regressions. (1886/1886 passed, 128 files)
- [x] B1.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` (clean, no errors)
- [x] B1.3 `pnpm -C apps/web-store-pos build` (succeeded)

---

## Batch 2 — admin + statistics + features + profile + auth

### WU1 — `admin/stores/components/store-card-list.tsx` color fix
Angular ref: `store-list.component.ts:205-209` `getStoreBackgroundColor` + `.scss` (`disapproved-store` → `$warning`, `deactive-store` → `$danger`).

- [x] 1.1 RED: test in `admin/stores/components/__tests__/store-card-list.test.tsx` — a not-approved-but-active store's card has `bg-warning/10 border-warning` classes (NOT `bg-success/...`); a deactivated store still gets `bg-danger/10 border-danger` (unchanged); an approved+active store has no state class.
- [x] 1.2 GREEN: in `getStoreCardClass`, change `if (!store.approved) return 'bg-success/10 border border-success';` → `'bg-warning/10 border border-warning';`.
- [x] 1.3 Commit: `fix(admin): store card not-approved state uses warning color matching Angular` — actual commit `ccc3d54`

### WU2 — `statistics/routes/dashboard.tsx` full rework (LARGEST)
Angular ref: `frontend/src/app/presentation/statistics/dashboard/dashboard.component.ts`/`.html`. All backing service methods already exist and are ported (no service changes needed): `OrderOfflineService.getActiveOrdersPriceToday/Yesterday`, `getActiveOrdersProfitToday/Yesterday`, `getTopProductsProfitInLastMonth`, `getTopProductsSaleQuantityInLastMonth`; `ExpenseOfflineService.getActiveExpensesPriceToday/Yesterday`; `SaleCreditOfflineService.getActiveUnpaidSaleCreditsPriceToday/Yesterday`; `authorization-service.hasExpensesModuleAvailable/hasCreditsModuleAvailable`; `statistics/lib/services/currency-service.ts` (`getCurrentCurrency`/`setCurrency`). KEEP the existing `SalesChart`/`ProfitChart` (recharts) sections untouched — do not remove or replace with tables.

- [x] 2a.1 RED: currency selector test — renders a CUP/USD `<select>` seeded from `getCurrentCurrency()`; selecting USD reveals a rate `<input type="number">`; changing either calls `setCurrency({currency, rate})` (mock the module).
- [x] 2a.2 GREEN: add local `currency`/`rate` state seeded from `getCurrentCurrency()`; on change, update state + call `setCurrency`; compute `divisor = currency === 'USD' ? rate : 1` and `sufijo = currency` for use across KPIs/lists.
- [x] 2b.1 RED: KPI cards test — "Ventas Hoy" card always renders with `(getActiveOrdersPriceToday()/divisor).toFixed(2)`; "Gastos Hoy" card renders ONLY when `hasExpensesModuleAvailable(user)` is true; "Créditos Por Cobrar" card renders ONLY when `hasCreditsModuleAvailable(user)` is true; "Ganancias Hoy" always renders, value = `profitToday - (hasExpensesModuleAvailable ? expenseToday : 0)`, all divided by `divisor`.
- [x] 2b.2 GREEN: read `user` via `useAuthStore`; compute today/yesterday values from the services above; render the 4 KPI cards with the same trend logic as Angular's `getTrendClass`/`getTrendIcon` (`actual===anterior→secondary/dash`, `actual>=anterior→success/up`, else `danger/down`) — reuse Tailwind `text-success`/`text-danger`/`text-secondary` equivalents; gate Gastos/Créditos cards on the two `hasXModuleAvailable` checks.
- [x] 2c.1 RED: top-products test — top-profit list renders `getTopProductsProfitInLastMonth()` items as `name` + `(value/divisor).toFixed(2) sufijo`; top-sale-quantity list renders `getTopProductsSaleQuantityInLastMonth()` items as `name` + raw `value` (no currency suffix).
- [x] 2c.2 GREEN: add the 2 list sections (`<ul>`/rows), sourced from `OrderOfflineService`.
- [x] 2d RED+GREEN: regression test asserting `SalesChart`/`ProfitChart` sections still render with their existing data/props unchanged after the rework.
- [x] 2.5 Commit: `feat(statistics): wire currency selector, KPI cards, and top-products lists on dashboard` — actual commit `a2f5cd8 fix(statistics): restore KPI cards, currency selector and top-products lists`

### WU9 — `admin/features/routes/features.tsx` icon + blocking alerts
Angular ref: `features.component.html:10` `<mat-icon>edit</mat-icon>`.

- [x] 9.1 RED: test in a new/existing `admin/features/routes/__tests__/*` — button renders `EditIcon` (not `SettingsIcon`); on `activateFeatures` success, `showBlockingSuccess` is called with `FEATURES.FEATURES_ACTIVATED` (mock `blocking-alert`), and the static `<p>` success/error text nodes are gone; on failure/thrown error, `showBlockingError` is called with `FEATURES.UNEXPECTED_ERROR`.
- [x] 9.2 GREEN: swap `SettingsIcon`→`EditIcon`; replace `setSuccessMessage`/`setErrorMessage` + `<p>` rendering with `showBlockingSuccess(...)`/`showBlockingError(title, message)` calls from `~/shared/lib/blocking-alert`.
- [x] 9.3 Commit: `fix(admin): features activation uses EditIcon and blocking alerts matching Angular` — actual commit `8f0cef0`

### WU4 — `profile/components/edit-profile-form.tsx` cellPhone mask + required
Angular ref: mirrors `management/users` cellPhone pattern already ported (`UserDetailsForm.tsx`/`UserCreateForm.tsx` using `management/users/lib/cell-phone-mask`).

- [x] 4.1 RED: test — cellPhone input displays `formatCellPhone(digits)` (e.g. raw `51234567` renders `+53 5 123-4567`); typing non-digit chars is stripped via `toDigits` before storage; submitting with an empty cellPhone shows a required validation error (new check — Angular parity) and does NOT call `onSubmit`.
- [x] 4.2 GREEN: import `toDigits`/`formatCellPhone` from `~/management/users/lib/cell-phone-mask`; store `cellPhone` as raw digits in state (`toDigits` on change), display via `formatCellPhone(cellPhone)`; add `!cellPhone.trim()` to the existing required-field validation block (alongside `fullName`).
- [x] 4.3 Commit: `fix(profile): mask cellPhone field and make it required matching Angular` — actual commit `cc909e1`

### WU10 — auth footer + register cleanup (LARGE)
Angular ref: `layouts/guest/guest-footer/guest-footer.component.html` (Cookies/Privacy/Terms links + Contact + copyright, 2 `<p>` lines with `{year}` interpolation).

- [x] 10.1 RED: `auth-layout.tsx` test — renders links to `/cookies-private` (Cookies), `/private-police` (Privacy), `/terms-conditions` (Terms) each `target="_blank"`; renders a Contact trigger; renders 2 copyright lines, one interpolating the current year.
- [x] 10.2 GREEN: add a footer block below `<Outlet/>` in `auth-layout.tsx` porting the 3 legal `<Link>`s + a Contact action (can be a `mailto:`/simple link — no Angular modal port required beyond the existing scope) + copyright `<p>`s using `FOOTER.COOKIES_POLICE`/`FOOTER.PRIVACY_POLICE`/`FOOTER.TERMS_CONDITIONS`/`FOOTER.CONTACT_US`/`FOOTER.COPYRIGHT1`(`{year}`)/`FOOTER.COPYRIGHT2` i18n keys (add to `es.ts` if missing). Implemented by reusing the existing shared `shared/components/footer.tsx` (already ported from Angular's near-identical `client-footer.component.html`) inside `auth-layout.tsx`, rather than duplicating markup; fixed a `target="_blank"` parity gap on that shared component (benefits both the client and guest layouts) and turned the Contact span into a no-op button trigger (Angular's own `showEmailDialog()` handler is empty).
- [x] 10.3 RED: `register.tsx` test — on successful registration, navigates straight to `/login` and does NOT render the `REGISTRATION.SUCCESS_REDIRECT` interim screen.
- [x] 10.4 GREEN: remove the `success` state branch/`<div>` block in `register.tsx`; `navigate('/login')` already fires on success — just delete the dead `if (success) {...}` early-return and its `setSuccess(true)` call (or keep `setSuccess` removed entirely since it's now unused). Also removed the now-dead `REGISTRATION.SUCCESS_REDIRECT` i18n key from `es.ts` (its own comment confirmed it was a React-invented key with no Angular correlate).
- [x] 10.5 Commit: `fix(auth): port guest-footer to auth-layout and drop invented register success screen` — actual commit `928f716 fix(auth): add guest footer and drop invented register success screen`

### Batch 2 verification
- [x] B2.1 `pnpm test` — 1913/1913 passed, 129 files, no regressions.
- [x] B2.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` (clean, no errors)
- [x] B2.3 `pnpm -C apps/web-store-pos build` (succeeded)

---

## Final (overall)
- [x] F.1 `pnpm test` (full suite, both batches applied) — 1913/1913 passed, 129 files.
- [x] F.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` (clean)
- [x] F.3 `pnpm -C apps/web-store-pos build` (succeeded)
- [x] F.4 Confirm all 10 fixes present as commits on `feat/presentation-parity-batch-1` (9 commits — WU6+WU7 share one commit, all others 1:1), no PR opened. Commits: `15fa7e8`(WU8) `399b0a5`(WU6+7) `a9dc81f`(WU5) `55f81ba`(WU3) `ccc3d54`(WU1) `8f0cef0`(WU9) `cc909e1`(WU4) `928f716`(WU10) `a2f5cd8`(WU2).
