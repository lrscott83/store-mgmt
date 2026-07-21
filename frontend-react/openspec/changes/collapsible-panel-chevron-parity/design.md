# Design: Collapsible Panel Chevron Parity

## Architecture Approach

Purely **additive parity restoration**. Angular Material's `mat-expansion-panel` ships a
built-in right-side chevron that rotates 180deg on expand. The React migration reproduced the
open/close behavior but dropped the affordance on every screen except `products.tsx` (which
carries a one-off inline SVG). The design introduces **exactly one** new abstraction — a shared
`ChevronDownIcon` in the existing icon barrel — and threads the already-present `isExpanded`
boolean into each panel header. No new component framework, no hook, no state change, no toggle
logic change. `today-stats.tsx` is the only screen requiring a structural edit (its `<details>`/
`<summary>` panel is converted to the controlled `div + button + conditional body` pattern used
everywhere else) because a `list-none` `<summary>` has no place to host a state-driven chevron.

Pattern: single-source-of-truth presentational icon (same container as `PlusIcon`, `EditIcon`,
etc.), consumed by dumb panel headers that already own their expanded state. This is the minimal
change that satisfies parity without inventing structure Angular does not have.

## Component Design

### New: `ChevronDownIcon` (shared/components/ui/icons.tsx)

Matches the existing export style exactly (`IconProps`, `BASE = 'h-5 w-5 shrink-0'`,
`fill="none"`, 24px viewBox, `currentColor` stroke, `strokeWidth={2}`). Adds one prop,
`isExpanded`, which drives the rotation via `transition-transform` + conditional `rotate-180`.
Color is inherited (`currentColor`) so each header keeps its own `text-text-muted`/token color.

```tsx
type ChevronIconProps = IconProps & { isExpanded?: boolean };

/** Material `expand_more` — Angular Material's mat-expansion-panel toggle indicator
 *  (rotates 180deg when the panel is open). Reference SVG lifted verbatim from the
 *  former inline chevron in sales/routes/products.tsx. */
export function ChevronDownIcon({ className = '', isExpanded = false }: ChevronIconProps) {
  return (
    <svg
      className={`${BASE} transition-transform ${isExpanded ? 'rotate-180' : ''} ${className}`.trim()}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
```

Notes:
- The exact path `M19.5 8.25l-7.5 7.5-7.5-7.5` and size `h-5 w-5` come straight from
  `products.tsx` (lines 313-321). `BASE` adds `shrink-0`, which is strictly beneficial (prevents
  the icon squashing in a flex row) and does not alter the visual size.
- `isExpanded` defaults `false` so a caller that only wants a static chevron still works.
- `aria-hidden="true"`: the toggle semantics live on the wrapping `<button aria-expanded>`; the
  icon is decorative, consistent with every other icon in the barrel.

## Integration Map (per screen)

All six list screens below already render the header as a single
`<button ... className="flex w-full items-center justify-between ...">` with a left title span
and a right value span. To keep the chevron pinned right (matching Angular Material's right-side
indicator and `products.tsx`), the chevron is grouped with the existing right-side content inside
a `flex items-center gap-2` wrapper, so `justify-between` still pushes title left / value+chevron
right. The screen's own `isExpanded` is passed through; no new state.

| Screen | File | Header anchor | Placement |
| --- | --- | --- | --- |
| Expenses history | `expenses/routes/expenses-history.tsx` (~L177-184) | day-panel `<button>` | wrap amount `<span>` + `<ChevronDownIcon isExpanded={isExpanded} />` in `flex items-center gap-2` |
| Inventory entries | `inventory/routes/entries.tsx` (~L155-161) | day-panel `<button>` | same wrap around the `text-primary` amount span |
| Inventory available | `inventory/components/inventory-product-list.tsx` (~L86-93) | category `<button>` | wrap `totalCostPrice` span + chevron |
| Orders (per order) | `sales/components/order-list.tsx` (~L95-103) | order `<button>` | right side is **already** a `flex items-center gap-2` span (PaymentTypeIcon + amount) — append `<ChevronDownIcon isExpanded={isExpanded} />` as its last child |
| Orders (date group) | `sales/routes/orders.tsx` (~L189-192) | date `<button>` | wrap amount span + chevron |
| Credits (date group) | `sales/routes/credits.tsx` (~L126-131) | date `<button>` | wrap `text-danger` amount span + chevron |

Standard wrap for the five that need it:

```tsx
<span className="flex items-center gap-2">
  <span className="text-sm font-semibold ...">${value.toFixed(2)}</span>
  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
</span>
```

`order-list.tsx` only appends the icon to its existing right-side span (no new wrapper).

### products.tsx refactor (remove duplicate)

Replace the inline `<svg className={\`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}\`} ...>` at lines 313-321 with `<ChevronDownIcon isExpanded={isExpanded} />`, keeping the surrounding dedicated toggle `<button>` (lines 305-322) untouched. Visual output is identical: same path, same `h-5 w-5`, same `transition-transform` + `rotate-180`, same inherited `text-text-muted` from the button. `shrink-0` (added by `BASE`) is the only class delta and is inert here. Add `ChevronDownIcon` to the existing icons import.

### today-stats.tsx restructure (`<details>` -> controlled panel)

The local `ExpansionPanel` (lines 48-68) uses an **uncontrolled** `<details>`/`<summary
class="list-none">`: browser-managed open state, collapsed by default (no `open` attr), each
panel independent. To host a state-driven chevron, convert to the same
`div + button + conditional body` pattern used across the app, backed by a **local per-instance
`useState(false)`**. This preserves the exact semantics:
- Default collapsed (`useState(false)` == no `open` attr).
- Each panel toggles independently (local state per instance == independent `<details>`).
- Click header toggles open/close.

```tsx
function ExpansionPanel({ title, amount, amountClassName, children }: {
  title: string; amount: string; amountClassName: string; children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between p-2 text-sm font-medium text-text hover:bg-primary-light/40"
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className={amountClassName}>{amount}</span>
          <ChevronDownIcon isExpanded={isOpen} className="text-text-muted" />
        </span>
      </button>
      {isOpen && <div className="p-2">{children}</div>}
    </div>
  );
}
```

Behavior preserved: no panel's default-open/closed state changes (all were collapsed, all remain
collapsed). Only the disclosure mechanism changes from native to controlled. `useState` import
is already present in this file.

### tutorial.tsx (item 4 — DEFERRED per proposal)

The proposal explicitly lists tutorial.tsx as **out of scope / DEFER** (it keeps the browser-
native OS triangle and is already functional/visible; consistency-only). Design decision:
**do NOT touch tutorial.tsx in this change.** If a later cosmetic pass picks it up, the identical
recipe applies: convert the `<details>`/`<summary>` (tutorial.tsx L80-83) to
`div + button + useState(false) + conditional body`, dropping `<ChevronDownIcon isExpanded={isOpen} />`
right-aligned in the header. Recording it here so the recipe is captured; the tasks phase should
mark it as deferred and NOT generate implementation tasks for it unless the user re-scopes.

## Data Flow

No data flow changes. `isExpanded` already computed in each render (from the screen's
`Set<string>` membership test, or `useState` in `today-stats`) flows one-way into
`ChevronDownIcon`. The icon is stateless and side-effect free. Toggle handlers
(`togglePanel`/`toggleDayPanel`/`toggleDatePanel`/`toggleCategory`/`setIsOpen`) are unchanged.

## Integration Points

- Import site: every modified screen adds `ChevronDownIcon` to its existing
  `~/shared/components/ui/icons` import (products already imports from there; today-stats and the
  list screens add the named import).
- No routing, loader, service, store, or i18n changes.
- No new package. Inline SVG only (dependency section of proposal: none).

## ADR-style Decisions

### ADR-1: One shared icon, not a shared panel component
- **Decision**: Extract only `ChevronDownIcon`; leave each screen's header/panel markup in place.
- **Rationale**: Angular has no shared "panel" abstraction beyond Material's directive; the React
  screens already diverge in header content (payment icon, badges, chips, gear menu). A shared
  panel wrapper would be a React invention (violates the migration "invent nothing new" rule) and
  would force-fit heterogeneous headers. The only genuine duplication is the 8x SVG, so only the
  SVG is extracted.
- **Rejected**: A `<CollapsiblePanel>` component owning header+body+state. Rejected as
  over-engineering and non-parity; explicitly flagged Low risk in the proposal.

### ADR-2: today-stats moves to controlled state, not a CSS-only chevron on `<details>`
- **Decision**: Convert `<details>`/`<summary>` to `div + button + useState + conditional body`.
- **Rationale**: A chevron that rotates with state needs the open flag in React. `<details>`
  open state is DOM-owned and not reactively readable without extra wiring (`onToggle` +
  mirror state), which is more code and more fragile than the app-standard controlled pattern
  already proven on the other six screens. Converting yields consistency and a single tested
  pattern.
- **Rejected**: Keep `<details>`, style the marker via CSS `list-item`/`::marker` or a
  `group-open:rotate-180` Tailwind trick. Rejected: `<details>` marker styling is inconsistent
  cross-browser (the reason `list-none` was used originally), and `group-open` would introduce a
  second, divergent chevron mechanism from the other six screens.

### ADR-3: Chevron grouped with the right-side value, inherits color
- **Decision**: Wrap value + chevron in `flex items-center gap-2`, chevron `className="text-text-muted"`.
- **Rationale**: Mirrors Angular Material's right-aligned indicator and `products.tsx`. Keeping
  the chevron muted (not the value's success/danger color) matches Material's neutral indicator
  and avoids implying the arrow is part of the monetary value.
- **Rejected**: Third top-level flex child under `justify-between` (would space value and chevron
  apart, breaking the right-cluster look).

### ADR-4: tutorial.tsx stays native (honor proposal scope)
- **Decision**: Do not modify tutorial.tsx in this change.
- **Rationale**: Proposal marked it DEFER/out-of-scope; it is already functional with a native
  triangle. Touching it is scope creep on a parity fix. Recipe captured above for a future pass.
- **Rejected**: Fold it in now. Rejected to keep the change tight and honor the ratified scope.

## Testing Strategy (Strict TDD)

Vitest + `@testing-library/react`. Per project convention, components using `useIntl` must render
inside an `IntlProvider` wrapper (existing route tests already do this; reuse the shared test
render helper / wrap with `IntlProvider locale=... messages=...`). Write tests RED first, then
implement.

1. **`ChevronDownIcon` unit test** (`shared/components/ui/__tests__/icons.test.tsx`, new):
   - renders an `<svg>` with the reference path `M19.5 8.25l-7.5 7.5-7.5-7.5`.
   - has `transition-transform` always; has `rotate-180` **iff** `isExpanded` is true (assert both
     `isExpanded` and default/`false` cases).
   - forwards `className`.
2. **Per-screen header assertions** (extend the existing `.test.tsx` for each screen — today-stats,
   expenses-routes, entries via inventory-routes, inventory-components, order-components,
   sales/credits routes):
   - header renders a chevron (query the svg / by role/testid within the toggle button).
   - chevron carries `rotate-180` **iff** the panel is expanded — assert collapsed (no class) then
     after a click on the header, expanded (class present).
   - **behavior preserved**: clicking the header still toggles the body (existing body-visibility
     assertions must continue to pass; add the chevron-class assertion alongside them).
3. **today-stats specifically**: assert the restructured panel still defaults **closed**, opens on
   header click, closes on second click, and each panel toggles independently — guarding ADR-2's
   "behavior preserved" claim. `today-stats.test.tsx` already exists; extend it.
4. **products.tsx refactor**: existing `products.test.tsx` chevron/toggle assertions must remain
   green after swapping to the shared icon (regression guard for identical visual output).

Run: `pnpm test` (strict TDD — RED before GREEN on every unit).

## Risks

- today-stats restructure could regress default-closed / independent-toggle behavior — mitigated
  by ADR-2 controlled pattern + explicit TDD assertions (item 3) before the edit.
- Chevron visual drift from products.tsx — eliminated by extracting the exact path and refactoring
  products.tsx onto the same component (single source of truth).
- Test wrapper omission (`IntlProvider`) causing false RED — mitigated by reusing the existing
  per-screen test setup rather than authoring fresh render scaffolding.
