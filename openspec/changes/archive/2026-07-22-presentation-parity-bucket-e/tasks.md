# Tasks: Presentation Parity — Bucket E

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~90-130 total across 5 WUs + verification (commits-only) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Not needed — commit per work unit on branch |
| Delivery strategy | commits-only (no PRs) |
| Chain strategy | pending (not applicable — no PRs) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

Strict TDD is ACTIVE. Every implementation task pairs with a RED test task first.
Test runner: `pnpm test` (vitest + @testing-library/react, jsdom). Type check:
`pnpm -C apps/web-store-pos exec tsc --noEmit`. Components using `useIntl` MUST be
wrapped in `IntlProvider` in tests (existing test files already do this — extend,
don't rewrite).

### Suggested Work Units

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| WU1 | Payment-method icon, 2 views (item 1a+1b) | 1 commit | Reuse `PaymentMethodIcon` + `getPaymentTypeIconKind` — already wired in expense-list.tsx |
| WU2 | Admin dashboard range-button active state (item 2) | 1 commit | `statistics/dashboard` untouched |
| WU3 | Owner Gestor field reorder, create+edit (item 3) | 1 commit | JSX move only, no state/handler change |
| WU4 | Owner card price·stores label order (item 4) | 1 commit | Keep React pluralization, fix order/connective |
| WU5 | Inventory Disponible row cleanup (item 5) | 1 commit | Inline qty, drop 2 nodes |
| WU6 | Final verification | none (no code) | test + typecheck + build |

## Phase 1: WU1 — Payment-method icon before Gastos total (items 1a, 1b)

- [x] 1.1 RED — `sales/routes/__tests__/today-stats.test.tsx`: add/extend a Gastos-row
      test asserting a `PaymentMethodIcon` (or its rendered glyph test-id/class)
      appears immediately before the `${expense.total}` text node for an expense row.
- [x] 1.2 GREEN — `sales/routes/today-stats.tsx:232`: import `PaymentMethodIcon` +
      `getPaymentTypeIconKind`, render `<PaymentMethodIcon kind={getPaymentTypeIconKind(expense.paymentType)} className="text-success" />`
      immediately before the total `<td>` text.
- [x] 1.3 RED — `expenses/routes/__tests__/expenses-routes.test.tsx` (ExpensesHistoryPage
      block): assert each non-null `PAYMENT_TYPE_OPTIONS` radio label contains a
      `PaymentMethodIcon` before the label text, AND the `null` ("Todas") option
      contains none.
- [x] 1.4 GREEN — `expenses/routes/expenses-history.tsx:146-157`: render
      `{opt.value != null && <PaymentMethodIcon kind={getPaymentTypeIconKind(opt.value)} className="text-success" />}`
      before `{intl.formatMessage({ id: opt.labelKey })}` inside the radio label.

## Phase 2: WU2 — Admin dashboard range-button active state (item 2)

- [x] 2.1 RED — `admin/dashboard/routes/__tests__/dashboard.test.tsx`: assert that
      after initial load (`viewType === '7days'`) the "7 días" button carries an
      active class/attribute (e.g. `aria-pressed="true"` or `.active` in
      `className`) and the "30 días" button does not; then simulate a click on
      "30 días" and assert the active state moves to it.
- [x] 2.2 GREEN — `admin/dashboard/routes/dashboard.tsx:56-74`: bind a conditional
      class (or `aria-pressed`) to each button using `viewType === '7days'` /
      `viewType === '30days'`, mirroring `admin-dashboard.component.html:13-14`.
      Do NOT touch `statistics/routes/dashboard.tsx`.

## Phase 3: WU3 — Owner "Gestor" field position (item 3)

- [x] 3.1 RED — `admin/owners/routes/__tests__/owner-create.test.tsx`: assert DOM
      order — the reSeller `<select>` (rendered when `isSuperAdmin`) appears
      before the Full Name `<input id="fullName">`.
- [x] 3.2 GREEN — `admin/owners/routes/owner-create.tsx:242-260`: move the
      `isSuperAdmin` reSeller block to render first, before the Full Name field
      (line ~122). State/handlers unchanged — move JSX only.
- [x] 3.3 RED — `admin/owners/routes/__tests__/owner-edit.test.tsx`: assert DOM
      order — the reSeller `<select>` appears after Full Name (`#fullName`) and
      before the `isActive` toggle (`#isActive`).
- [x] 3.4 GREEN — `admin/owners/routes/owner-edit.tsx:270-289`: move the
      `isSuperAdmin` reSeller block to sit between the Full Name field
      (line ~201) and the `isActive` block (line ~214). State/handlers unchanged.

## Phase 4: WU4 — Owner card price·stores label order (item 4)

- [x] 4.1 RED — `admin/owners/components/__tests__/owner-card-list.test.tsx`:
      render a card with `totalPrice = 100` and `storeCount = 3`, assert the label
      text equals `"$100.00 en 3 tiendas"`; render with `storeCount = 1`, assert
      `"$100.00 en 1 tienda"` (singular preserved).
- [x] 4.2 GREEN — `admin/owners/components/owner-card-list.tsx:41-45`: reorder to
      `{intl.formatNumber(totalPrice, {...})} en {intl.formatMessage({ id: 'OWNER.STORE_PRICE_LABEL' }, { count: storeCount })}`,
      removing `OWNER.STORE_PRICE_LABEL`'s own leading text if it duplicates "en"
      — keep `OWNER.STORE_PRICE_LABEL`'s pluralization, drop the em-dash
      separator entirely.
      DEVIATION: `intl.formatNumber(..., { style: 'currency', currency: 'USD' })`
      under the app's `es` IntlProvider locale renders "100,00 US$" (comma decimal,
      suffixed symbol) — it does NOT produce the literal "$100.00" the spec/RED
      test requires, and Angular's `| currency` pipe (no configured LOCALE_ID
      override) renders en-US-style regardless of app language. Used a local
      `formatUSD` helper (`new Intl.NumberFormat('en-US', {...})`), mirroring the
      existing precedent in `management/stores/components/module-picker.tsx`,
      instead of `intl.formatNumber`.

## Phase 5: WU5 — Inventory Disponible row cleanup (item 5)

- [x] 5.1 RED — `inventory/components/__tests__/inventory-components.test.tsx`:
      render a product row with `productName: "Coca-Cola"`, `totalAvailable: 12`,
      `categoryName: "Bebidas"`; assert the name cell text equals
      `"Coca-Cola (12)"`; assert no element renders the literal `categoryName`
      text as a sub-label under the product name; assert no element renders the
      `INVENTORY.ENTRY.AVAILABLE` label text for that row; assert the avg-cost and
      total-value currency cells still render.
- [x] 5.2 GREEN — `inventory/components/inventory-product-list.tsx:101-122`:
      replace `<p>{p.productName}</p>` + the `categoryName` sub-label `<p>` with a
      single `<p>{p.productName} ({p.totalAvailable})</p>`; delete the
      `totalAvailable` stat block and its `INVENTORY.ENTRY.AVAILABLE` label
      paragraph; keep the two currency `<p>` lines (avg cost, total value)
      unchanged.
      Updated 4 pre-existing tests (inventory-components.test.tsx x3,
      inventory-routes.test.tsx x1) that asserted bare product-name text —
      switched to the new inline `"{name} ({qty})"` text, an expected
      side-effect of the row markup change, not a new divergence.

## Phase 6: WU6 — Final verification

- [x] 6.1 Run `pnpm test` (full `web-store-pos` suite) — expect all tests green,
      including the 5 new/extended assertions above.
      RESULT: 129 files, 1978 tests passed (0 failed).
- [x] 6.2 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — expect zero errors.
      RESULT: zero errors (no output).
- [x] 6.3 Run `pnpm -C apps/web-store-pos build` — expect a clean build.
      RESULT: clean build (client + PWA precache + SPA mode).
- [x] 6.4 Confirm `statistics/dashboard`, Buckets B/C/D, and owner gear-menu
      actions were not touched (git diff review against the affected-files list
      in the proposal).
      CONFIRMED via `git diff --stat` against the 5 commits — only the 7 files
      listed in the proposal's Affected Areas table (+ their test files) changed.

## Out of Scope (no tasks) — confirmed untouched

- `statistics/routes/dashboard.tsx` — different component (currency toggle), not the admin range-button dashboard.
- Angular's commented-out markup (gear menus, owner toolbar fab) — not replicated.
- Owner card gear-menu actions — settled in a prior change, no change here.
