# Proposal: React List/Table + Card + Page-Margin Parity Compaction

## Intent

React renders list/table views, cards, and page margins looser than Angular's actual on-screen output. Comparing "Gastos del día" Angular vs React surfaced a systemic gap: React invents borders/chips/icons and pads more than the Angular theme resolves at runtime. Bring all list/table views, their cards, and page margins to Angular's RENDERED parity (more compact), without touching views Angular itself does not shrink.

## Scope

### In Scope
- **A. Central shared** — `card.tsx` padding variant (`tight`=p-2 / `default`=p-6) + title weight `font-semibold`→`font-medium`; `app-layout.tsx` `<main>` responsive padding mirroring Angular's 3 breakpoints (mobile 8px sides/16px top; desktop 48px sides/24px top) — NOT a flat shrink; `button.tsx` FAB `px-6`→`px-5` (font unchanged); new `~/shared/lib/format-currency.ts`.
- **B. Per-view lists** — `expense-list`, `entry-list`, `sale-credit-list`, `order-item-list`, `category-stats`: strip outer border wrapper + row dividers, shrink cells to p-1/p-2, chips→plain text, currency via util. `order-list`/`expense-list`: remove payment icon. `order-list` outer panel border KEEPS (mirrors Angular expansion panel).
- **C. Currency + tight threading** — replace `.toFixed(2)` and the duplicated `formatUSD` (module-picker.tsx:18, owner-card-list.tsx:29) with the shared util; `$2000.00`→`$2,000.00`. Add `padding="tight"` to ~18 list/table route Cards (mechanical).

### Out of Scope
- `today-quantities.tsx`, `today-sales-profit.tsx` (bespoke modern Angular design, already tracked).
- Admin card GRIDS (`store-/owner-/reseller-/user-card-list`) — must keep `default` variant (Angular does not shrink them).
- `statistics/` dashboards & charts — STAT-13 keeps `$`-prefix, no Intl.
- Form/detail cards — keep p-6 (matches Angular's 25px base).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — visual parity refactor, no spec-level behavior change.

## Approach

Central-first: fix the 3 shared components + currency util (≈80% of visual impact), then sweep the 5 legacy list components, then thread `padding="tight"` mechanically across ~18 routes. Angular source of truth = its RENDERED output: `.label`/`.gutter-b`/`bi-*` reference dead or never-loaded CSS, so React mirrors the SCREEN (no chips, no icon), not the literal markup.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `shared/components/ui/card.tsx` | Modified | Padding variant + title weight |
| `shared/components/app-layout.tsx` | Modified | Responsive main padding |
| `shared/components/ui/button.tsx` | Modified | FAB px-6→px-5 |
| `shared/lib/format-currency.ts` | New | Shared USD formatter |
| 5 list components + order-list | Modified | Borders/chips/icon/currency |
| ~18 route files | Modified | `padding="tight"` prop |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Flat page-padding shrink hurts desktop | Med | Responsive 3-breakpoint mirror, not flat |
| Admin grids wrongly shrink | Med | Default to `default` variant; verify in tasks |
| Icon/chip removal diverges from literal markup | Low | Confirmed: matches Angular's SCREEN (dead CSS) |
| Unaudited files (today-report, module-picker, category-product-list, sale-product-row) | Low | Flag "verify in tasks phase" |

## Rollback Plan

Work-unit commits on `feat/react-list-table-parity`. Revert per commit; central-component commits isolated from mechanical prop threading for granular rollback.

## Dependencies

None external.

## Success Criteria

- [ ] List/table views render borderless, compact (p-1/p-2 cells) like Angular's screen.
- [ ] Currency shows thousands separators (`$2,000.00`) everywhere except statistics.
- [ ] Page margins responsive (8px mobile / 48px desktop sides), not flat p-4.
- [ ] Admin grids, form cards, statistics, today-quantities/sales-profit unchanged.
- [ ] No payment icon or pill chips in swept list rows.
