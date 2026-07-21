# Verify Report: Collapsible Panel Chevron Parity

**What**: Verified collapsible-panel-chevron-parity on branch feat/collapsible-panel-chevron-parity against spec/design/tasks/apply-progress artifacts, via direct source inspection (not trusting the apply report) plus real gate execution.

**Why**: sdd-verify phase — quality gate before archive.

**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 0 SUGGESTION)

**Gates run (fresh, not cached)**:
- `pnpm test` (forced, --force via turbo): 128 test files, 1871/1871 passing.
- `pnpm -C apps/web-store-pos exec tsc --noEmit`: clean, zero errors.
- `pnpm -C apps/web-store-pos build`: client + SSR + service-worker all succeeded.

**Source verification (all 8 screens read directly)**:
- shared/components/ui/icons.tsx: `ChevronDownIcon({className, isExpanded})` added correctly — BASE h-5 w-5 shrink-0, viewBox 24, currentColor stroke, strokeWidth 2, aria-hidden, path `M19.5 8.25l-7.5 7.5-7.5-7.5` (verbatim from products.tsx), `transition-transform` always + `rotate-180` iff isExpanded. icons.test.tsx (6 tests) covers all these assertions including className forwarding.
- products.tsx: inline `<svg>` chevron removed, replaced by `<ChevronDownIcon isExpanded={isExpanded} />` inside its dedicated toggle button (L305-322 area); no duplicate inline chevron SVG remains anywhere in the repo (grepped `M19.5 8.25` — only match outside icons.tsx is the test file assertion).
- 6 list screens (expenses-history.tsx, entries.tsx, inventory-product-list.tsx, order-list.tsx, orders.tsx, credits.tsx): each imports ChevronDownIcon, derives `isExpanded` from its own `Set<string>.has(...)`, renders it in the right-cluster span, tests assert `rotate-180` toggles with `fireEvent.click` and toggle-still-works. available.tsx (consumes InventoryProductList) and orders.tsx/today-orders.tsx (consume OrderList) inherit the fix transitively — confirmed via import grep.
- today-stats.tsx: local `ExpansionPanel` converted from `<details>/<summary>` to `div+button(aria-expanded)+useState(false)+conditional body`, chevron added. today-stats.test.tsx asserts default-collapsed, click-to-open, click-to-close, TWO independent panel instances toggle independently, and chevron rotate-180 iff expanded — all passing.
- tutorial.tsx: new `TutorialStep` component, same pattern (useState(false) per instance), chevron added next to step title. tutorial.test.tsx (pre-existing file, updated) asserts default-collapsed, independent per-step toggle, chevron rotate-180 iff expanded, plus updated old structural assertions that relied on a jsdom `<details>` quirk (jsdom doesn't hide collapsed `<details>` content, unlike real browsers) — legitimate fix, not a regression.
- No stray `<details>` JSX tags remain in today-stats.tsx or tutorial.tsx (grep hits are comments only, describing the historical conversion).
- All tasks.md checkboxes [x] in openspec/changes/collapsible-panel-chevron-parity/tasks.md match actual code state.

**WARNING 1 — Chevron color parity gap (cosmetic, untested)**: design.md explicitly states "Color inherited (currentColor); callers pass className='text-text-muted'" so screens would match products.tsx's chevron, whose dedicated toggle button explicitly sets `text-text-muted`. In practice NONE of the 7 non-products call sites (6 list screens + today-stats + tutorial) pass a `className` to `ChevronDownIcon`, and none of their wrapping `<button>`/`<span>` elements set a text-color class around the chevron either — so the chevron renders in ambient/default text color, not the muted gray products.tsx uses. This is a real deviation from the design's own stated integration plan and touches the spec's "matching the products.tsx visual style" wording, but is purely cosmetic (no rotation/toggle/existence requirement is broken) and untested (no test asserts color), so it did not fail any TDD gate.

> **RESOLVED post-verify (commit `db8d2ae`)**: `className="text-text-muted"` was passed to `ChevronDownIcon` at all 8 non-products call sites, closing this gap. See archive-report.md for confirmation.

**WARNING 2 — Review workload forecast inaccurate**: tasks.md forecast estimated ~180-260 changed lines ("400-line budget risk: Low"). Actual diff (git diff --shortstat against pre-change baseline b5a5597) is 523 insertions + 52 deletions = 575 changed lines — over 2x the forecast, and would itself trip the 400-line PR-review-budget guard had this been delivered as a single PR rather than commits-only on a feature branch. Not a code defect, but worth noting for future sdd-tasks forecast calibration on similar multi-screen "additive" changes with heavy test-file coverage.

**Where**: apps/web-store-pos/app/shared/components/ui/icons.tsx, sales/routes/{products,today-stats,orders,credits}.tsx, expenses/routes/expenses-history.tsx, inventory/routes/entries.tsx, inventory/components/inventory-product-list.tsx, sales/components/order-list.tsx, help/routes/tutorial.tsx, + corresponding __tests__ files. Commits: 55773af, f67c126, b2abd2b, 47b1496, fad2139.

**Learned**: Actual test filenames diverge from tasks.md's assumed per-screen names (e.g. expenses-routes.test.tsx not expenses-history.test.tsx) — apply-progress already documented this; confirmed accurate on inspection. jsdom's failure to hide collapsed `<details>` content is a real gotcha that masked incomplete test coverage pre-change; the restructure to explicit conditional rendering is a genuine improvement, not scope creep.

Traceability: Engram observation `sdd/collapsible-panel-chevron-parity/verify-report` (#1353)
