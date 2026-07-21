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

## Batch 1 — sales + inventory + expenses — COMPLETE (5/5)

### WU3 — `sales/components/edit-products-modal.tsx` bulk-CREATE rework
Angular ref: `edit-products-modal.component.ts`/`.html` (frontend/src/app/presentation/products/edit-products-modal/).

- [x] 3.1 RED: rewrite `sales/components/__tests__/edit-products-modal.test.tsx` — modal opens with 4 blank Nombre/Precio rows (not existing-product rows); "+ Nuevo" button adds a row; Save with an empty required name shows a per-row required error and does NOT call `onSave`/`createProducts`; Save with two rows sharing the same (trimmed, case-insensitive) name blocks submit silently (Angular has no visible duplicate message — matches source, mat-error only for required/price); Save with valid distinct rows calls `createProducts(categoryId, [{name, price}, ...])` with only rows where BOTH name and price are non-empty.
- [x] 3.2 GREEN: change props to `{ categoryId: string; onSave: (categoryId: string, items: {name;price}[]) => void; onClose }` (or keep category object per current caller shape — match `sales/routes/products.tsx` `modal.category`); replace `editedPrices` state with a `products: {name:string; price:string}[]` array state initialized to 4 blank rows; add row handler (+Nuevo, `GENERAL.NEW` i18n key — add if missing); per-row validation: name required, price required + `/^\d+(\.\d{1,2})?$/` format + `>0`; `hasDuplicateNames()` blocks submit (trim+lowercase compare); on submit, filter rows where `name && price`, map to `{name: name.trim(), price: parseFloat(price)}`, call `createProducts(categoryId, items)`.
- [x] 3.3 GREEN: update caller `sales/routes/products.tsx` — replace `handleBulkSave` (currently loops `updateProduct`) with a call to `createProductService(storeId).createProducts(modal.category.id, items)`; keep post-save reload/close behavior.
- [x] 3.4 Add `PRODUCT.ADD_PRODUCTS` and `GENERAL.NEW` keys to `shared/lib/i18n/es.ts` if absent (verified absent).
- [x] 3.5 Commit: `55f81ba fix(products): make "Nuevo Productos" modal create products to match Angular`

### WU5 — `inventory/routes/available.tsx` empty-state
Angular ref: Angular's `InventoryAvailableComponent` template, `INVENTORY.NO_ENTRY_FOUND` key.

- [x] 5.1 RED, [x] 5.2 GREEN, [x] 5.3 Commit `a9dc81f fix(inventory): correct empty-inventory message on Available screen`

### WU6 — `expenses/components/expense-form-modal.tsx` default type
Angular ref: `edit-expense-modal.component.ts:60` create-mode default `ExpenseType.Salario`.

- [x] 6.1 RED, [x] 6.2 GREEN, [x] 6.3 Commit combined with WU7 into `399b0a5 fix(expenses): default new expense type to Salario and require an explicit total`

### WU7 — `expenses/components/expense-form-modal.tsx` total required
Angular ref: `edit-expense-modal.component.ts:88-92` `Validators.required` (no default-0-is-valid).

- [x] 7.1 RED, [x] 7.2 GREEN, [x] 7.3 Commit combined with WU6 into `399b0a5`

### WU8 — `inventory/components/edit-inventory-entry-modal.tsx` disable product select
Angular ref: `edit-inventory-entry-modal.component.html` `[disabled]="true"` on the product select.

- [x] 8.1 RED, [x] 8.2 GREEN, [x] 8.3 Commit `15fa7e8 fix(inventory): disable product select in edit-entry modal to match Angular`

### Batch 1 verification
- [x] B1.1 `pnpm test` — 1886/1886 passed, 128 files.
- [x] B1.2 tsc clean
- [x] B1.3 build succeeded

---

## Batch 2 — admin + statistics + features + profile + auth — COMPLETE (5/5)

### WU1 — `admin/stores/components/store-card-list.tsx` color fix
Angular ref: `store-list.component.ts:205-209` (`disapproved-store` → `$warning`, `deactive-store` → `$danger`).

- [x] 1.1 RED, [x] 1.2 GREEN (`getStoreCardClass` not-approved branch → `bg-warning/10 border-warning`), [x] 1.3 Commit `ccc3d54 fix(admin): store card not-approved state uses warning color matching Angular`

### WU2 — `statistics/routes/dashboard.tsx` full rework (LARGEST)
Angular ref: `statistics/dashboard/dashboard.component.ts`/`.html`. Kept existing `SalesChart`/`ProfitChart` (recharts) untouched — only ADDED content.

- [x] 2a currency selector, [x] 2b 4 gated KPI cards w/ trend logic, [x] 2c 2 top-products lists, [x] 2d chart-regression test, [x] 2.5 Commit `a2f5cd8 fix(statistics): restore KPI cards, currency selector and top-products lists`

### WU9 — `admin/features/routes/features.tsx` icon + blocking alerts
Angular ref: `features.component.html:10` `<mat-icon>edit</mat-icon>`.

- [x] 9.1 RED, [x] 9.2 GREEN (SettingsIcon→EditIcon; `showBlockingSuccess`/`showBlockingError` replace static `<p>`), [x] 9.3 Commit `8f0cef0 fix(admin): features activation uses EditIcon and blocking alerts matching Angular`

### WU4 — `profile/components/edit-profile-form.tsx` cellPhone mask + required
- [x] 4.1 RED, [x] 4.2 GREEN (`toDigits`/`formatCellPhone` from `management/users/lib/cell-phone-mask`; `!cellPhone.trim()` added to required-check), [x] 4.3 Commit `cc909e1 fix(profile): mask and require cellPhone to match Angular`

### WU10 — auth footer + register cleanup (LARGE)
Angular ref: `layouts/guest/guest-footer/guest-footer.component.html`.

- [x] 10.1 RED / 10.2 GREEN — reused existing shared `shared/components/footer.tsx` inside `auth-layout.tsx`; fixed a `target="_blank"` parity gap on the shared Footer's 3 legal links (benefits both layouts); Contact `<span>` converted to no-op `<button>` trigger (Angular's own `showEmailDialog()` is empty).
- [x] 10.3 RED / 10.4 GREEN — removed invented `success` state/screen in `register.tsx`; removed dead `REGISTRATION.SUCCESS_REDIRECT` i18n key.
- [x] 10.5 Commit `928f716 fix(auth): add guest footer and drop invented register success screen`

### Batch 2 verification
- [x] B2.1 `pnpm test` — 1913/1913 passed, 129 files, no regressions.
- [x] B2.2 tsc clean
- [x] B2.3 build succeeded

---

## Final (overall) — COMPLETE
- [x] F.1 `pnpm test` — 1913/1913 passed, 129 files.
- [x] F.2 tsc clean
- [x] F.3 build succeeded
- [x] F.4 All 10 fixes present as 9 commits (WU6+WU7 share one) on `feat/presentation-parity-batch-1`, no PR opened: `15fa7e8`(WU8) `399b0a5`(WU6+7) `a9dc81f`(WU5) `55f81ba`(WU3) `ccc3d54`(WU1) `8f0cef0`(WU9) `cc909e1`(WU4) `928f716`(WU10) `a2f5cd8`(WU2). Plus 2 `chore(tasks)` bookkeeping commits (`a508e82`, `9ae1f72`).

---

## Post-Verify: Adversarial Parity Review Follow-up — COMPLETE
After `sdd-verify` PASS, an adversarial Angular↔React parity review of the footer/auth area found 3 minor nits:
- **F-1** (missing email icon on Contact trigger) — FIXED, commit `7171171`.
- **F-2** (guest-footer underline claim) — REFUTED by orchestrator: the guest-footer SCSS does underline legal links; not a real divergence. No code change.
- **F-3** (Features error-title i18n key) — left as-is; React's copy is more correct than Angular's. No code change.
