# List/Table + Card + Page-Margin Parity Specification

## Purpose

Pure visual-parity compaction of React list/table views, cards, and page
margins to match Angular's RENDERED (screen) output. No data, ordering,
action, or contract change — only DOM/CSS presentation. Every requirement
below is a behavioral-invariant or regression guard for a mechanical prop/CSS
sweep; there is no new or modified business capability.

## Requirements

### Requirement: Borderless, compact list/table rows

Swept list/table components (expense-list, entry-list, sale-credit-list,
order-item-list, category-stats) MUST render rows WITHOUT a per-row
box/border wrapper or row divider, and MUST use compact cell padding
(p-1/p-2), mirroring Angular's resolved (non-dead) CSS. `order-list`'s outer
panel border MUST be kept (mirrors Angular's `mat-expansion-panel`).

#### Scenario: Swept list renders without row borders
- GIVEN expense-list, entry-list, sale-credit-list, order-item-list, or
  category-stats renders N rows
- WHEN the rows are inspected
- THEN no row element carries a border/divider class
- AND each row's cell padding is compact (p-1/p-2)

#### Scenario: Order-list panel border is preserved
- GIVEN order-list renders
- WHEN the outer panel is inspected
- THEN the outer panel border is still present

### Requirement: Card padding variant (tight vs default)

`shared/components/ui/card.tsx` MUST support a `padding` prop with `"tight"`
(8px / p-2, for list/table route cards) and `"default"` (24px / p-6, current
behavior, for form/detail cards). Route cards not part of the swept
list/table set MUST remain on `"default"`.

#### Scenario: Tight card used on a swept list route
- GIVEN a route Card wraps a swept list/table view
- WHEN the Card renders with `padding="tight"`
- THEN the Card's body padding is 8px (p-2)

#### Scenario: Form/detail card padding unchanged
- GIVEN a form or detail Card with no `padding` prop (or `padding="default"`)
- WHEN the Card renders
- THEN the Card's body padding remains 24px (p-6)

### Requirement: Responsive page `<main>` padding

`shared/components/app-layout.tsx`'s `<main>` MUST apply responsive padding
mirroring Angular's 3 breakpoints: mobile (<768px) = 8px sides / 16px top;
desktop (>=768px) = 48px sides / 24px top. This MUST NOT be a flat shrink.

#### Scenario: Mobile viewport padding
- GIVEN viewport width < 768px
- WHEN `<main>` renders
- THEN horizontal padding is 8px and top padding is 16px

#### Scenario: Desktop viewport padding
- GIVEN viewport width >= 768px
- WHEN `<main>` renders
- THEN horizontal padding is 48px and top padding is 24px

### Requirement: No payment-method icon in swept list rows

`order-list` and `expense-list` rows MUST NOT render a payment-method icon
SVG.

#### Scenario: Row renders without payment icon
- GIVEN an order-list or expense-list row with any payment type
- WHEN the row renders
- THEN no `PaymentMethodIcon` (or equivalent icon element) is present

### Requirement: Category and payment method render as plain text

Swept list components MUST render category and payment-method values as
plain text, not as a chip/badge/pill element.

#### Scenario: Category/payment text has no chip wrapper
- GIVEN a swept row displaying a category name or payment method
- WHEN the row renders
- THEN the value is a plain text node, not wrapped in a chip/badge component

### Requirement: Thousands-separated currency formatting

Monetary amounts rendered via the shared `format-currency` utility MUST
display a thousands separator and exactly 2 decimals (e.g. `$2,000.00`),
EXCEPT statistics charts/tooltips, which are unchanged (per STAT-13,
`$`-prefix, no `Intl`).

#### Scenario: List amount shows thousands separator
- GIVEN a monetary value of 2000 rendered by a swept list/table view
- WHEN the amount renders
- THEN the text equals "$2,000.00"

#### Scenario: Statistics charts remain unformatted by this change
- GIVEN a statistics chart/tooltip rendering a monetary value
- WHEN the value renders
- THEN its format is unchanged from current behavior (no thousands
  separator required, STAT-13 unaffected)

### Requirement: Regression invariant — data and behavior unchanged

For every swept view, data content, row ordering, filtering, and available
actions (including the gear/action menu) MUST be identical before and after
this change. Only presentation (borders, padding, icons, chips, currency
format, page margins) may differ.

#### Scenario: Swept view behavior is unchanged
- GIVEN a swept list/table view with a fixed data set
- WHEN the view is compared before and after the change
- THEN the same rows render in the same order with the same actions
  available, differing only in visual presentation

### Requirement: Excluded views remain untouched

`today-quantities.tsx`, `today-sales-profit.tsx`, admin card GRIDS
(store-/owner-/reseller-/user-card-list), and `statistics/` dashboards/charts
MUST NOT change padding, borders, chips, icons, or currency formatting as a
result of this change.

#### Scenario: Excluded view unchanged
- GIVEN one of the excluded views (today-quantities, today-sales-profit,
  admin card grids, statistics dashboards/charts)
- WHEN the view renders after this change
- THEN its padding, borders, chips, icons, and currency formatting are
  identical to before the change
