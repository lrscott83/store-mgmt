# Tasks: React List/Table + Card + Page-Margin Parity Compaction

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380-450 (4 central files ~90 lines; 5 list components ~140 lines; 3 currency-only files ~15 lines; 16 route files ~1 line each + tests ~180 lines) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (branch `feat/react-list-table-parity`), 8 work-unit commits |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Rationale: bulk of lines are mechanical (16 route files = one `padding="tight"` prop each, ~1 line/file) or test assertions (cheap to review). Real logic concentrates in 4 central files + 5 list components (~230 lines). If actual diff creeps toward 450+ after WU8, orchestrator should re-run the guard and ask about chaining before commit.

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | `format-currency.ts` + migrate module-picker, owner-card-list | Independent, no deps |
| 2 | `card.tsx` padding variant | Depends on nothing; consumed by WU8 |
| 3 | `app-layout.tsx` responsive `<main>` + `button.tsx` FAB trim | Independent |
| 4 | `expense-list.tsx` sweep | Depends on WU1 (currency) |
| 5 | `entry-list.tsx` + `sale-credit-list.tsx` sweep | Depends on WU1 |
| 6 | `order-item-list.tsx` + `order-list.tsx` sweep (keep panel border) | Depends on WU1 |
| 7 | `category-stats.tsx` + `category-product-list.tsx` + `sale-product-row.tsx` (currency-only) | Depends on WU1 |
| 8 | Route sweep: `padding="tight"` threading (16 files) + lint check | Depends on WU2 (Card) |

## Phase 1: Currency util (WU1)

- [x] 1.1 RED: add failing test `format-currency.test.ts` asserting `formatCurrency(2000)==='$2,000.00'`, `(0)==='$0.00'`, negative case.
- [x] 1.2 GREEN: create `app/shared/lib/format-currency.ts` using `Intl.NumberFormat('en-US', {style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2})`.
- [x] 1.3 Migrate `module-picker.tsx:18` dup `formatUSD` to `formatCurrency`; update/adjust its test.
- [x] 1.4 Migrate `owner-card-list.tsx:29` dup `formatUSD` to `formatCurrency`; update/adjust its test.
- [x] 1.5 Commit WU1.

## Phase 2: Card padding variant (WU2)

- [x] 2.1 RED: failing test asserting `Card` default body has `p-6`, `padding="tight"` body has `p-2`, header font uses `font-medium`.
- [x] 2.2 GREEN: add `padding?: 'tight'|'default'` (default `'default'`) to `card.tsx`; body `p-6`/`p-2`, header `px-6 py-4`/`px-6 py-2`; title weight `font-semibold`→`font-medium`.
- [x] 2.3 Confirm existing form/detail Card consumers unaffected (no prop passed → default unchanged).
- [x] 2.4 Commit WU2.

## Phase 3: app-layout + button (WU3)

- [x] 3.1 RED: failing test asserting `<main>` classList contains `px-2 py-4 md:px-12 md:py-6`.
- [x] 3.2 GREEN: replace flat `p-4` in `app-layout.tsx:56` with responsive classes.
- [x] 3.3 RED: failing test asserting FAB button contains `px-5` not `px-6`, keeps `text-sm font-medium`.
- [x] 3.4 GREEN: trim `button.tsx:13` FAB padding `px-6`→`px-5`.
- [x] 3.5 Commit WU3.

## Phase 4: expense-list sweep (WU4)

- [x] 4.1 RED: failing tests — no wrapper `border`/`rounded`, no `divide-y`/`border-b`, cells `p-1`/`p-2`, no `PaymentMethodIcon` SVG, expense type/payment render as plain text (no chip), amount uses `formatCurrency`.
- [x] 4.2 GREEN: strip border/divider wrapper, compact cell padding, remove `PaymentMethodIcon` usage + unused import (lines 4,6,65), replace chips with plain `span` (type muted, payment `font-semibold text-success`), wire `formatCurrency`.
- [x] 4.3 Commit WU4.

## Phase 5: entry-list + sale-credit-list sweep (WU5)

- [x] 5.1 RED: failing tests per component — no wrapper border/divider, compact cells, sale-credit paid-date plain `text-success` span (not chip), amounts via `formatCurrency`.
- [x] 5.2 GREEN: sweep `entry-list.tsx:73` and `sale-credit-list.tsx:66,71` per above.
- [x] 5.3 Commit WU5.

## Phase 6: order-item-list + order-list sweep (WU6)

- [x] 6.1 RED: failing tests — order-item-list no wrapper/divider, qty plain `font-semibold text-primary` span; order-list no payment icon (delete local `PaymentTypeIcon` fn), outer panel border `rounded-lg border border-border` STILL PRESENT (regression guard).
- [x] 6.2 GREEN: sweep `order-item-list.tsx:97,103`; delete `order-list.tsx:15-47,100,102` `PaymentTypeIcon` fn/usage, keep outer panel border, amounts via `formatCurrency`.
- [x] 6.3 Commit WU6.

## Phase 7: category-stats + currency-only files (WU7)

- [ ] 7.1 RED: failing tests — category-stats no chip wrapper, count `font-bold text-success` plain span, no row border/divider; category-product-list and sale-product-row amounts render via `formatCurrency` (no other DOM change).
- [ ] 7.2 GREEN: sweep `category-stats.tsx`; currency-only edit `category-product-list.tsx:63` (keep `ul divide-y`) and `sale-product-row.tsx:58` (keep `border-b`).
- [ ] 7.3 Confirm `statistics/` and `today-report.tsx` untouched (explicitly excluded from currency migration).
- [ ] 7.4 Commit WU7.

## Phase 8: Route `padding="tight"` sweep (WU8)

Per route: CONFIRM the route renders a list/table (not a form) before threading, then add `padding="tight"` to its route-level `Card`.

- [ ] 8.1 `expenses/routes/today-expenses.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.2 `expenses/routes/expenses-history.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.3 `inventory/routes/today-entries.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.4 `inventory/routes/entries.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.5 `inventory/routes/available.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.6 `inventory/routes/egress.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.7 `sales/routes/orders.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.8 `sales/routes/today-orders.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.9 `sales/routes/credits.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.10 `sales/routes/today-credits.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.11 `sales/routes/sale.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.12 `sales/routes/products.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.13 `sales/routes/today-stats.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.14 `admin/features/routes/features.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.15 `sync/routes/import.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.16 `sync/routes/export.tsx` — confirm list, add `padding="tight"`.
- [ ] 8.17 Confirm KEEP-default routes untouched: admin stores/owners/resellers + management/users grids, store-form, all edit-*/modal cards, `today-quantities`, `today-sales-profit`, `landing-deep`.
- [ ] 8.18 Lint-check: verify `PaymentMethodIcon` import in `expenses-history.tsx` is still used (filter dropdown, line ~157) after WU4 removes it from `expense-list.tsx` row — no orphaned import.
- [ ] 8.19 Commit WU8.

## Phase 9: Final gate

- [ ] 9.1 Run `npm run typecheck` — must pass with zero errors.
- [ ] 9.2 Run full `vitest run` — must pass (no regressions).
- [ ] 9.3 Run parity-review-vs-Angular-source on all swept views.
- [ ] 9.4 Run `sdd-verify` against this spec/design before `sdd-archive`.
