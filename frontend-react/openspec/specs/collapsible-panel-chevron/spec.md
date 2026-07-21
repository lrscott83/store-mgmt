# collapsible-panel-chevron Specification

**Change:** collapsible-panel-chevron-parity
**Phase:** Spec
**Status:** Done
**Date:** 2026-07-21
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

Restore the Angular Material `mat-expansion-panel`/`mat-accordion` rotating-chevron affordance
across every React collapsible-panel screen, via one shared `ChevronDownIcon` component. Purely
additive parity fix — no change to toggle logic, state shape, or panel body content.

---

## Requirements

### Requirement: Shared ChevronDownIcon Component
The system MUST expose a single shared `ChevronDownIcon` component in `shared/components/ui/icons.tsx` that every collapsible panel header uses to render its expand/collapse indicator. It MUST accept an `isExpanded` (or equivalent) prop and apply `transition-transform` plus a `rotate-180` class when expanded, matching the reference SVG (`M19.5 8.25l-7.5 7.5-7.5-7.5`) already used in `products.tsx`. No screen MUST duplicate an inline chevron SVG once this component exists.

#### Scenario: products.tsx consumes the shared icon
- GIVEN `products.tsx` renders a category panel header
- WHEN the panel is collapsed
- THEN the header renders `ChevronDownIcon` pointing down, imported from the shared icons module, with no local inline `<svg>` duplicate

#### Scenario: Shared icon rotates when expanded
- GIVEN any panel using `ChevronDownIcon`
- WHEN that panel is expanded
- THEN the icon renders with `rotate-180` applied via `transition-transform`

> **Color parity note (applied post-verify, commit `db8d2ae`):** the design's integration plan
> stated callers should pass `className="text-text-muted"` so the chevron matches
> `products.tsx`'s muted-gray toggle button. The initial apply left this off on all 7
> non-products call sites (cosmetic WARNING in the verify report, no rotation/toggle/existence
> requirement broken). It was subsequently fixed by passing `className="text-text-muted"` to
> `ChevronDownIcon` at all 8 non-products call sites, closing the gap between the shipped
> behavior and this requirement's "matching the `products.tsx` visual style" intent.

### Requirement: Every In-Scope Collapsible Panel Renders a Chevron
Each of the following panel headers MUST render `ChevronDownIcon` next to its title: today-stats.tsx (Cuadre del día summary panels), expenses-history.tsx (day panels), entries.tsx (inventory entries day panels), inventory-product-list.tsx (category panels, including via available.tsx), order-list.tsx (order panels, including via the orders and today-orders routes), orders.tsx (date-group panels), credits.tsx (date-group panels), and tutorial.tsx (step panels).

#### Scenario: today-stats shows the chevron (original bug fixed)
- GIVEN a user opens "Cuadre del día"
- WHEN the screen renders its summary panels (Efectivo, Gastos, Créditos, Ventas)
- THEN every panel header shows a down-pointing chevron

#### Scenario: Remaining screens show the chevron
- GIVEN a user opens Expenses History, Inventory Entries, Available Inventory, Orders, Today Orders, Credits, or the Tutorial screen
- WHEN the screen renders its list of panels
- THEN every panel header shows a chevron matching the `products.tsx` visual style

### Requirement: Chevron Reflects Live Expanded/Collapsed State
The chevron MUST point down when its panel is collapsed and rotate 180° (point up) when its panel is expanded, via CSS transition. Rotation state MUST be derived from that specific panel's own expanded/collapsed state and MUST update immediately on toggle.

#### Scenario: Collapsed panel shows down chevron
- GIVEN any in-scope panel is collapsed
- WHEN it renders
- THEN its chevron has no `rotate-180` class

#### Scenario: Expanding one panel does not affect siblings
- GIVEN a list of collapsed panels
- WHEN the user clicks one panel's header to expand it
- THEN only that panel's chevron gains `rotate-180`; every other panel's chevron is unchanged

#### Scenario: Collapsing reverses the chevron
- GIVEN an expanded panel
- WHEN the user clicks its header again
- THEN the panel collapses and its chevron loses `rotate-180`

### Requirement: Adding the Chevron MUST NOT Change Toggle Behavior
Adding the chevron MUST NOT alter existing expand/collapse behavior: clicking a header still toggles that panel's body open/closed, the underlying open-state data (e.g. expanded id/set) is unchanged, and panel body content/markup is unchanged. Where a header is restructured from native `<details>/<summary>` to a div+button pattern to accommodate the chevron (today-stats.tsx, tutorial.tsx), the replacement MUST preserve the exact same default-collapsed state and click-to-toggle semantics as the `<details>` version it replaces.

#### Scenario: Panels still default to collapsed after restructuring
- GIVEN today-stats.tsx or tutorial.tsx panels defaulted to collapsed before this change
- WHEN the restructured (div+button) markup renders
- THEN every panel still starts collapsed exactly as the previous `<details>` version did

#### Scenario: Click-to-toggle still works after restructuring
- GIVEN a today-stats or tutorial panel is collapsed
- WHEN the user clicks its header
- THEN the panel body becomes visible, identical to the pre-change behavior

#### Scenario: Panel body content is unchanged
- GIVEN any of the 8 in-scope screens
- WHEN comparing panel body markup/content before and after this change
- THEN the panel body is unchanged

---

## Non-Goals (Explicit Negative Requirements)

### Out of scope — pre-existing tutorial.tsx panel-count divergence

The parity review flagged that `tutorial.tsx` renders multiple independent React collapsible
panels (one per tutorial step) where Angular's tutorial component renders a single panel. This
divergence **predates this branch** and was NOT introduced by this change (which only restructured
`tutorial.tsx`'s existing per-step `<details>` markup to div+button and added the chevron,
preserving the pre-existing step count/structure). It is called out here as a known, accepted,
pre-existing condition — not a defect of this change — and is left for a future change to address
if ever prioritized.

---

## Traceability

- Proposal: `sdd/collapsible-panel-chevron-parity/proposal` (Engram #1346)
- Design: `sdd/collapsible-panel-chevron-parity/design` (Engram #1349)
- Spec (delta, source of this document): `sdd/collapsible-panel-chevron-parity/spec` (Engram #1348)
- Tasks: `sdd/collapsible-panel-chevron-parity/tasks` (Engram #1350) — 24/24 complete
- Verify Report: `sdd/collapsible-panel-chevron-parity/verify-report` (Engram #1353) — Verdict: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING — both since addressed: color-parity WARNING fixed in `db8d2ae`; forecast-accuracy WARNING is a process note only, not a code defect)
- Archive Report: `sdd/collapsible-panel-chevron-parity/archive-report`
- Implementation commits (branch `feat/collapsible-panel-chevron-parity`): `55773af`, `f67c126`, `b2abd2b`, `47b1496`, `fad2139`, `db8d2ae`
