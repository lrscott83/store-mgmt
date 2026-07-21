# Tasks: Collapsible Panel Chevron Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-260 (icon +test ~60, products refactor ~15, 6 list screens ~5-10 each ~50, today-stats restructure ~40, tutorial restructure ~40, tests ~60) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (commits-only per work unit, no chained PRs needed) |
| Delivery strategy | commits-only on current branch (per project convention) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU1 | Shared `ChevronDownIcon` + `products.tsx` refactor | single PR (commit 1) | Foundation; other WUs depend on this icon existing |
| WU2 | 6 uniform list screens get the chevron | single PR (commit 2) | Additive, low-risk, depends on WU1 |
| WU3 | `today-stats.tsx` `<details>` → controlled restructure + chevron | single PR (commit 3) | RED tests first; depends on WU1 |
| WU4 | `tutorial.tsx` `<details>` → controlled restructure + chevron | single PR (commit 4) | RED tests first; depends on WU1; locked in-scope by orchestrator despite design ADR-4 deferral |
| WU5 | Full verification sweep | single PR (commit 5) | tests + typecheck + build |

## Phase 1: Foundation — Shared ChevronDownIcon

- [x] 1.1 RED: Add `icons.test.tsx` (colocated with `icons.tsx`) asserting `ChevronDownIcon` renders reference path `M19.5 8.25l-7.5 7.5-7.5-7.5`, always has `transition-transform`, has `rotate-180` iff `isExpanded=true`, and forwards `className`.
- [x] 1.2 GREEN: Add `ChevronDownIcon({ className, isExpanded })` to `apps/web-store-pos/app/shared/components/ui/icons.tsx` per design (BASE `h-5 w-5 shrink-0`, fill=none, viewBox 24, stroke currentColor, strokeWidth 2, `aria-hidden`, path lifted verbatim from `products.tsx`).
- [x] 1.3 REFACTOR: In `apps/web-store-pos/app/sales/routes/products.tsx` (L313-321), replace the inline `<svg>` chevron with `<ChevronDownIcon isExpanded={isExpanded} />`; keep the existing toggle `<button aria-expanded>` wrapper unchanged.
- [x] 1.4 Run existing `products.test.tsx` chevron/toggle assertions — confirm they stay green after the swap (regression guard per design).

## Phase 2: 6 Uniform List Screens (additive, no new state)

Each screen already has `<button className="flex ... justify-between">` header with a right-side span and per-item `isExpanded` derived from a `Set<string>`. Wrap the existing right-side content plus `<ChevronDownIcon isExpanded={...} />` in `<span className="flex items-center gap-2">` (or append to the existing right-side flex span for `order-list.tsx`, which already has one).

- [x] 2.1 RED: `expenses-history.test.tsx` — add assertion: day-panel header renders a chevron; chevron has `rotate-180` iff panel expanded; clicking header still toggles body (extend existing toggle test, don't replace it). (Actual file: `expenses/routes/__tests__/expenses-routes.test.tsx`.)
- [x] 2.2 GREEN: `apps/web-store-pos/app/expenses/routes/expenses-history.tsx` (~L177-184) — wrap amount span + `ChevronDownIcon isExpanded={isExpanded}` in a right-cluster span.
- [x] 2.3 RED: `entries.test.tsx` — same 3 assertions as 2.1 for the inventory-entries day-panel. (Actual file: `inventory/routes/__tests__/inventory-routes.test.tsx`.)
- [x] 2.4 GREEN: `apps/web-store-pos/app/inventory/routes/entries.tsx` (~L155-161) — same wrap pattern as 2.2.
- [x] 2.5 RED: `inventory-product-list.test.tsx` — same 3 assertions for the category panel (covers `available.tsx` consumer transitively). (Actual file: `inventory/components/__tests__/inventory-components.test.tsx`.)
- [x] 2.6 GREEN: `apps/web-store-pos/app/inventory/components/inventory-product-list.tsx` (~L86-93) — same wrap pattern.
- [x] 2.7 RED: `order-list.test.tsx` — same 3 assertions for the order panel (covers `orders.tsx`/`today-orders` route consumers transitively). (Actual file: `sales/components/__tests__/order-components.test.tsx`.)
- [x] 2.8 GREEN: `apps/web-store-pos/app/sales/components/order-list.tsx` (~L95-103) — right side is ALREADY `flex items-center gap-2` (PaymentTypeIcon+amount); append `<ChevronDownIcon isExpanded={isExpanded} />` as the last child, no new wrapper.
- [x] 2.9 RED: `orders.test.tsx` — same 3 assertions for the date-group panel. (Actual file: `sales/routes/__tests__/sales-routes.test.tsx`.)
- [x] 2.10 GREEN: `apps/web-store-pos/app/sales/routes/orders.tsx` (~L189-192) — same wrap pattern as 2.2.
- [x] 2.11 RED: `credits.test.tsx` — same 3 assertions for the date-group panel. (Actual file: `sales/routes/__tests__/credits-routes.test.tsx`; actual page path is `sales/routes/credits.tsx`, not `credits/routes/credits.tsx`.)
- [x] 2.12 GREEN: `apps/web-store-pos/app/sales/routes/credits.tsx` (~L126-131) — wrap amount span + chevron.

## Phase 3: today-stats.tsx Restructure (details → controlled)

- [x] 3.1 RED: In `apps/web-store-pos/app/sales/routes/today-stats.test.tsx`, add tests for the local `ExpansionPanel`: defaults to collapsed (body not in DOM/hidden), clicking header opens it, clicking again closes it, and two independent panel instances toggle independently (guards ADR-2). (Actual file: `sales/routes/__tests__/today-stats.test.tsx`.)
- [x] 3.2 RED: Extend the same test file to assert each panel header renders `ChevronDownIcon` with `rotate-180` present only when that panel is expanded.
- [x] 3.3 GREEN: In `apps/web-store-pos/app/sales/routes/today-stats.tsx`, convert `ExpansionPanel` (L48-68) from `<details>/<summary>` to `div + button(aria-expanded) + conditional body`, backed by local `useState(false)` per instance (component-scoped, not lifted to parent) — preserving default-collapsed + independent-toggle semantics.
- [x] 3.4 GREEN: In the same `ExpansionPanel`, render `<ChevronDownIcon isExpanded={isOpen} />` next to the amount span in the header's right cluster.
- [x] 3.5 Verify panel body content/markup for all 5 `ExpansionPanel` call sites (Resumen Efectivo, Gastos, Créditos Por Cobrar, Créditos Pagados, Ventas) is byte-identical to pre-change — no accidental content diffs. (Confirmed: only wrapper markup changed `<details>`→`div+button`; children props/JSX passed to each call site untouched.)

## Phase 4: tutorial.tsx Restructure (details → controlled)

Locked in-scope by the orchestrator (overrides design ADR-4 deferral). Same TDD care as Phase 3: uncontrolled `<details>` → controlled div+button+state, since there is currently no React state backing this component at all.

- [x] 4.1 RED: Create `apps/web-store-pos/app/help/routes/tutorial.test.tsx` (new file — none exists today) asserting: each step panel defaults to collapsed, clicking a step's header opens only that step's body, clicking again closes it, and two step panels toggle independently. **Deviation**: a `tutorial.test.tsx` already existed on disk (S-HELP-CONTENT-1/2/3, S-HELP-TEST-2) asserting the OLD `<details>/<summary>` structure and unconditional image visibility. Updated its S-HELP-CONTENT-2/3 assertions to match the new div+button markup (structural change only — step count/labels/image set unchanged) instead of creating a duplicate file, then added the new collapsed/toggle/independent-toggle assertions in a new describe block.
- [x] 4.2 RED: Extend the same test to assert each step header renders `ChevronDownIcon` with `rotate-180` present only when that step is expanded.
- [x] 4.3 GREEN: In `apps/web-store-pos/app/help/routes/tutorial.tsx` (L79-84), replace the `STEPS.map` `<details><summary>` block with a per-step component (`TutorialStep`) using local `useState(false)` (mirroring the `today-stats.tsx` `ExpansionPanel` pattern) + `div + button(aria-expanded) + conditional body`.
- [x] 4.4 GREEN: Render `<ChevronDownIcon isExpanded={isOpen} />` next to the step title in the header.
- [x] 4.5 Verify each step's `content` (images/paragraphs, L6-65) renders unchanged inside the new conditional body wrapper (props passed through untouched; only the wrapper changed).

## Phase 5: Full Verification

- [x] 5.1 Run `pnpm test` (full suite) — confirm all new and existing tests are green, no regressions. Result: 128 test files, 1871/1871 tests passing.
- [x] 5.2 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirm no type errors introduced. Result: clean, zero errors.
- [x] 5.3 Run `pnpm -C apps/web-store-pos build` — confirm production build succeeds. Result: client + SSR + service-worker builds all succeeded.
