# Proposal: Collapsible Panel Chevron Parity

## Intent

Angular Material's `mat-expansion-panel`/`mat-accordion` renders a built-in chevron that rotates 180° on expand in every collapsible panel header. The React migration ported most panels WITHOUT any chevron — they toggle open/closed on click but give NO visual indicator. User reported it on the "Cuadre del día" (today-stats) screen, whose local `ExpansionPanel` uses `<details>/<summary>` with `list-none`, stripping the native triangle AND adding no replacement. `products.tsx` is the ONE React screen that already implemented the chevron correctly. Goal: restore Angular-parity expand/collapse affordance across all migrated panels.

## Scope

### In Scope
- Extract a shared `ChevronDownIcon` (Material-style, `rotate-180` on expand) into `shared/components/ui/icons.tsx`.
- Add the chevron to 7 screens: today-stats, expenses-history, inventory/entries, inventory-product-list (available), sales/order-list (Orders + Today Orders), sales/orders, sales/credits.
- Restructure today-stats `<details>/<summary>` `ExpansionPanel` into the div+button header pattern used elsewhere so the icon drops in cleanly.
- Refactor `products.tsx` to consume the shared icon (remove its one-off inline SVG) → single source of truth.

### Out of Scope
- Any change to toggle logic, state shape, animation semantics, or panel bodies.
- `tutorial.tsx` (item 8): keeps browser-native OS triangle (`<details>` without `list-none`). Consistency-only, lower priority. **Recommendation: DEFER** — it is already functional/visible; fold into a later cosmetic pass rather than risk scope creep on a parity fix.
- Statistics & Reports screens — Angular has no accordion there.

## Capabilities

### New Capabilities
- `collapsible-panel-chevron`: shared Material-style chevron indicator for React collapsible panel headers, mirroring Angular Material expansion-panel affordance.

### Modified Capabilities
- None.

## Approach

Create one shared `ChevronDownIcon` prop-driven component (`isExpanded`/`className` → `transition-transform rotate-180`), matching the `products.tsx` reference SVG (`M19.5 8.25l-7.5 7.5-7.5-7.5`). Drop it into each panel's header button. Refactor products.tsx to use it. For today-stats only, convert `<details>/<summary>` to the div+button toggle pattern (state-driven, same open/close behavior) so the chevron sits in the header row. Purely additive everywhere else. Angular source-of-truth HTML paired per screen (see Affected Areas). Strict TDD (`pnpm test`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `shared/components/ui/icons.tsx` | New | Export shared `ChevronDownIcon`. |
| `sales/routes/products.tsx` | Modified | Replace inline SVG with shared icon. |
| `sales/routes/today-stats.tsx` | Modified | Restructure `<details>` → div+button; add chevron. |
| `expenses/routes/expenses-history.tsx` | Modified | Add chevron to day-panel header. |
| `inventory/routes/entries.tsx` | Modified | Add chevron to day-panel header. |
| `inventory/components/inventory-product-list.tsx` | Modified | Add chevron to category-panel header. |
| `sales/components/order-list.tsx` | Modified | Add chevron to order-panel header. |
| `sales/routes/orders.tsx` | Modified | Add chevron to date-group header. |
| `sales/routes/credits.tsx` | Modified | Add chevron to date-group header. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| today-stats `<details>` → div+button restructure breaks open/close | Med | Preserve exact state/behavior; TDD before edit; only markup wrapper changes. |
| Chevron drifts from products.tsx look | Low | Extract from the exact reference SVG; refactor products.tsx to same component. |
| Over-engineering a shared abstraction Angular lacks | Low | Single minimal icon only, to avoid duplicating SVG 8×; no new panel framework. |

## Rollback Plan

Revert the work-unit commits. The shared `ChevronDownIcon` is additive; removing its imports and the new icon file restores prior state. today-stats can revert to the `<details>/<summary>` version independently.

## Dependencies

- None. No new packages; inline SVG only.

## Success Criteria

- [x] All 7 in-scope panels show a Material-style chevron that rotates 180° on expand, matching products.tsx (tutorial.tsx was additionally locked in-scope during tasks phase — 8 screens total, see tasks.md).
- [x] products.tsx uses the shared `ChevronDownIcon` (no duplicated inline SVG).
- [x] No change to toggle logic, state shape, animation, or panel bodies.
- [x] today-stats "Cuadre del día" panels show the arrow (original bug fixed).
- [x] `pnpm test` passes (1871/1871).
