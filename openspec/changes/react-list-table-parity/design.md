# Design: React List/Table + Card + Page-Margin Parity Compaction

## Technical Approach

Visual-parity refactor mirroring Angular's RENDERED screen (dead/never-loaded CSS confirmed:
`bi-*` icon font, Bootstrap-3 `.label`, `.gutter-b`). Central-first: extend 3 shared
primitives (`card.tsx`, `app-layout.tsx`, `button.tsx`) + add one currency util, then sweep the
5 legacy list components, then thread `padding="tight"` mechanically across list/table routes.
No behavior/spec change — only class strings, one deleted local component, and a formatter swap.
All changes are jsdom-unit-verifiable (assert class presence/absence, no icon element, plain
text, formatted `$X,XXX.XX` string). Strict TDD: red test first per work-unit.

## Architecture Decisions

### Decision: Card padding via opt-in variant (default stays roomy)
**Choice**: Add prop `padding?: 'tight' | 'default'` (default `'default'`) to `Card`. Map
`default → p-6`, `tight → p-2` on the `card-body` div (currently hardcoded `p-6`, line 42). Header
vertical padding also compacts: pass the same signal so `tight` header uses `px-6 py-2` (list) and
`default` keeps `px-6 py-4` (form/detail).
**Alternatives**: (a) global shrink of `p-6→p-2` — rejected: Angular does NOT shrink form/detail
(25px≈p-6) nor admin grids. (b) separate `<CompactCard>` component — rejected: duplicates chrome,
breaks the single-source Card. (c) numeric/free `padding` prop — rejected: two discrete Angular
states only, a union is safer and test-assertable.
**Rationale**: Default `'default'` guarantees admin card grids and form cards stay roomy unless a
route explicitly opts in — the exact safety the exploration flagged.

### Decision: Responsive `<main>` padding mirroring Angular's 3 breakpoints
**Choice**: Replace flat `p-4` (`app-layout.tsx:56`) with `px-2 py-4 md:px-12 md:py-6`.
Mapping: mobile 8px sides / 16px top = `px-2 py-4`; desktop (≥768px) 48px sides / 24px top =
`md:px-12 md:py-6`. Tailwind `md` = 768px == Angular `media-breakpoint-down(md)` boundary
(`pc-common.scss .pc-container .coded-content`).
**Alternatives**: flat shrink to smaller value — rejected: makes desktop LESS accurate (Angular
desktop padding is 48px, LARGER than React's current 16px).
**Rationale**: "todo se achica" is really "mobile tighter, desktop rounder" — a responsive mirror,
not a flat shrink.

### Decision: Borderless rows = strip wrapper + dividers, keep panel borders
**Choice**: In the 5 legacy list components, remove outer `rounded border border-border` wrappers,
per-row `divide-y`/`border-b`/`border-b border-black`, and shrink cells to `p-1`/`p-2`. KEEP
`order-list.tsx` outer per-order `rounded-lg border border-border` (mirrors Angular's real
`mat-expansion-panel`).
**Rationale**: Angular `table-borderless` + rows referencing absent `.border` classes render zero
separators; the expansion panel border is a real Material token.

### Decision: Single shared currency formatter
**Choice**: New `app/shared/lib/format-currency.ts` exporting
`formatCurrency(amount: number): string` using `Intl.NumberFormat('en-US', {style:'currency',
currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2})` → `$2,000.00`. Replaces both
duplicated `formatUSD` (`module-picker.tsx:18`, `owner-card-list.tsx:29`) and money `.toFixed(2)`
in list/table views.
**Alternatives**: put it in `packages/web-common` — rejected: all call sites are app-local, and
`payment-type-icon.ts` sets the precedent for app-level `shared/lib` utils. React-intl
`formatNumber` — rejected: app display locale is `'es'`, which breaks to `"2.000,00 US$"`; hard-code
`'en-US'` to match Angular's locale-independent `currency:'USD':'symbol':'1.2-2'` (formatUSD gotcha,
per `products-price`/`formatUSD` memory).
**Rationale**: One tested formatter, zero locale drift, mirrors Angular exactly.

### Decision: Remove visible payment icon; keep the icon component
**Choice**: Delete `PaymentMethodIcon` usage + now-unused imports in `expense-list.tsx` (lines 4,6,65);
delete the entire local `PaymentTypeIcon` function in `order-list.tsx` (lines 15-47,100). Do NOT delete
the shared `PaymentMethodIcon` (`icons.tsx`) or `getPaymentTypeIconKind` — still used by
`expenses-history.tsx:157`, `today-stats.tsx`, `cart-shell` filter dropdowns.
**Rationale**: Angular's `bi-*` font never loads → icon paints invisible on screen; React's always-visible
SVG is the real divergence. Component stays alive elsewhere, so only local/inline usage is removed.

### Decision: Chips → plain text (preserve Angular weight/color)
**Choice**: Replace each pill (`rounded-full bg-*/… px-2 py-0.5`) with a bare `<span>` keeping the
color+weight Angular's enlarged `.label` text renders as: expense type → plain muted text; payment
label → `font-semibold text-success`; sale-credit paid date → plain `text-success`; category-stats
count → `font-bold text-success`; order-item qty → `font-semibold text-primary`.
**Rationale**: Bootstrap 5 dropped `.label`; Angular paints bold enlarged text, no pill.

## Data Flow

    formatCurrency (shared/lib) ──┐
    Card padding="tight" ─────────┤→ list route pages ──→ ExpenseList / EntryList /
    app-layout responsive <main> ─┘                        SaleCreditList / OrderItemList /
                                                           CategoryStats / OrderList

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `shared/lib/format-currency.ts` | Create | `formatCurrency()` en-US USD, thousands + 2 decimals |
| `shared/components/ui/card.tsx` | Modify | `padding` variant (body p-6/p-2 + header py-4/py-2); title `font-semibold`→`font-medium` (line 36) |
| `shared/components/app-layout.tsx` | Modify | `<main>` line 56 `p-4`→`px-2 py-4 md:px-12 md:py-6` |
| `shared/components/ui/button.tsx` | Modify | FAB `px-6`→`px-5` (line 13); font unchanged |
| `expenses/components/expense-list.tsx` | Modify | strip wrapper/divider, `px-4 py-3`→`p-2`, remove icon, chip→text, `formatCurrency` |
| `inventory/components/entry-list.tsx` | Modify | strip wrapper/`divide-y`, cells→`p-1`/`p-2`, `formatCurrency` (line 73) |
| `sales/components/sale-credit-list.tsx` | Modify | remove `border-b`, chip→text (line 71), `formatCurrency` (line 66) |
| `sales/components/order-item-list.tsx` | Modify | remove `border-b`, qty chip→text (line 97), `formatCurrency` (line 103) |
| `sales/components/category-stats.tsx` | Modify | remove `border-b`/`border-b border-black`, chips→text, `formatCurrency` |
| `sales/components/order-list.tsx` | Modify | delete local `PaymentTypeIcon`, `formatCurrency` (line 102); KEEP panel border |
| `management/stores/components/module-picker.tsx` | Modify | delete local `formatUSD`, import `formatCurrency` |
| `admin/owners/components/owner-card-list.tsx` | Modify | delete local `formatUSD`, import `formatCurrency` |
| `sales/components/category-product-list.tsx` | Modify | `formatCurrency` (line 63); borders unchanged |
| `sales/components/sale-product-row.tsx` | Modify | `formatCurrency` price display (line 58); border unchanged |
| ~14 list/table route files | Modify | add `padding="tight"` to `<Card>` (one line each) + route-level money → `formatCurrency` |

**Route `padding="tight"` set** (verify each in tasks): `expenses/routes/today-expenses.tsx`,
`expenses/routes/expenses-history.tsx`, `inventory/routes/today-entries.tsx`, `inventory/routes/entries.tsx`,
`inventory/routes/available.tsx`, `inventory/routes/egress.tsx`, `sales/routes/orders.tsx`,
`sales/routes/today-orders.tsx`, `sales/routes/credits.tsx`, `sales/routes/today-credits.tsx`,
`sales/routes/sale.tsx`, `sales/routes/products.tsx`, `sales/routes/today-stats.tsx`,
`admin/features/routes/features.tsx`, `sync/components/{import,export}-form.tsx`.

**Keep `default` (do NOT pass tight)**: `admin/{stores,owners,resellers}` + `management/users` card
grids; `management/stores/store-form.tsx`; all `edit-*`/`*-modal` cards; `inventory/routes/today-quantities.tsx`
& `today-sales-profit.tsx` (bespoke, OUT); `home/routes/landing-deep.tsx`.

## Unaudited Files — Resolutions

| File | Decision | Reason |
|------|----------|--------|
| `reports/routes/today-report.tsx` | OUT of scope | React-only aggregation page, NO Angular correlate (its own comment). Stat tiles + raw `<section>` (not shared Card). Leave `.toFixed(2)` and borders as-is. |
| `management/stores/module-picker.tsx` | IN — currency only | Replace duplicated `formatUSD` with `formatCurrency`. Not a list-border target. |
| `sales/components/category-product-list.tsx` | IN — currency only | Line 63 → `formatCurrency` (Angular currency-pipe correlate). `<ul> divide-y` kept (not in border-strip set). |
| `sales/components/sale-product-row.tsx` | IN — currency only | Line 58 price → `formatCurrency`. Per-row `border-b` kept (not a flagged parity gap). |

## Interfaces / Contracts

```ts
// app/shared/lib/format-currency.ts
export function formatCurrency(amount: number): string; // 2000 -> "$2,000.00"; -5 -> "-$5.00"
```

```ts
// card.tsx
interface CardProps { /* …existing… */ padding?: 'tight' | 'default'; } // default 'default'
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `formatCurrency` | `expect(formatCurrency(2000)).toBe('$2,000.00')`, `.toBe('$0.00')`, negatives |
| Unit | Card `padding` | `default`→body class `p-6`; `tight`→`p-2`; header weight `font-medium`; assert via `data-slot` querySelector |
| Unit | app-layout | `<main>` className contains `px-2 py-4 md:px-12 md:py-6` |
| Unit | button FAB | fab variant class contains `px-5`, not `px-6`; still `text-sm font-medium` |
| Unit | list components | no wrapper `border`/`rounded`; no `divide-y`/`border-b`; no chip `rounded-full`; no payment-icon SVG (`container.querySelector('svg')` absent in expense/order rows); money text `$1,234.56`; plain-text label present |
| Unit | order-list | panel border PRESENT (regression guard); no local payment icon |

Strict TDD active: write the failing assertion first for every work-unit before editing source.

## Migration / Rollout

No data migration. Work-unit commits on `feat/react-list-table-parity`; each WU is independently
revertible. Central-component WUs isolated from mechanical route prop-threading.

## Work-Unit Sequencing (for clean commits)

1. **WU1 — currency util**: add `format-currency.ts` + tests; migrate `module-picker` + `owner-card-list` dups.
2. **WU2 — Card**: `padding` variant + header weight + tests (default-unchanged regression).
3. **WU3 — app-layout + button**: responsive `<main>` + FAB `px-5` + tests.
4. **WU4 — expense-list**: borderless + icon removal + chip→text + `formatCurrency`.
5. **WU5 — entry-list + sale-credit-list**: borderless + `formatCurrency`.
6. **WU6 — order-item-list + order-list**: chip→text + delete local icon + `formatCurrency` (panel border kept).
7. **WU7 — category-stats + category-product-list + sale-product-row**: chips/text + `formatCurrency`.
8. **WU8 — route sweep**: thread `padding="tight"` across the ~14 list routes + route-level money `formatCurrency`.

## Open Questions

- [ ] Confirm each route in the tight set actually renders a list/table (not a form) before threading — tasks phase per-file check.
- [ ] `expenses-history.tsx` may keep its `PaymentMethodIcon` filter-dropdown import even after `expense-list` drops the row icon — verify no unused-import lint fallout.
