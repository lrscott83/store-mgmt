# Design: Gear Menu & Action Styling Consistency

> Architectural design (the HOW). Apply must be mechanical against this doc.
> Theme facts verified against `frontend-react/packages/web-common/styles.css`
> (Tailwind v4, `@theme` block — there is NO `tailwind.config.*`).

## 1. Architecture Approach

Introduce ONE reusable presentational primitive — `ActionMenu` + `ActionMenuItem`
— in `apps/web-store-pos/app/shared/components/ui/action-menu.tsx`, and refactor
all 9 gear/action menus to consume it. The primitive is the SINGLE SOURCE OF TRUTH
for: gear trigger chrome, dropdown container, `useClickOutside` close behavior, the
`intent -> color` map, default intent icons, and the destructive separator.

Pattern: **compound component with internal React Context**. `ActionMenu` owns the
open/close state and exposes a `close()` callback through a private context;
`ActionMenuItem` consumes it so each item runs `close(); onClick();` — exactly the
reference behavior `setIsOpen(false); action()` from `category-product-list.tsx`
(ProductRow) and `category-actions-menu.tsx`, generalized.

Boundaries: presentation + accessibility only. NO data-layer, handler-signature, or
behavioral change. Every menu keeps its existing props, handlers, testids, i18n keys,
and conditional-rendering logic. This is Angular-parity styling work, not a rewrite.

Composition is verified against the existing `useClickOutside(ref, onClose)` hook
(`shared/lib/hooks/use-click-outside.ts`, `mousedown`-based) — `ActionMenu` wraps its
trigger+dropdown in a single `ref`'d `<div className="relative">`, identical to the
reference implementations, so click-outside composes with zero changes to the hook.

## 2. Verified Theme Tokens (compile-safe class inventory)

From `@theme` in `styles.css` (Tailwind v4 registers a utility per `--color-*`):

| Token | Value | Utilities available |
|---|---|---|
| `primary` | rgb(103 58 183) violet | `text-primary`, `bg-primary`, `bg-primary/10`, `hover:bg-primary/10` |
| `primary-light` | rgb(237 231 246) | `bg-primary-light`, `hover:bg-primary-light` |
| `success` | rgb(82 196 26) green | `text-success`, `hover:bg-success/10` |
| `danger` | rgb(255 77 79) red | `text-danger`, `hover:bg-danger/10` (already used in ProductRow) |
| `warning` | rgb(250 173 20) amber | `text-warning`, `hover:bg-warning/10` |
| `text` / `text-muted` / `surface` / `border` | — | `text-text`, `text-text-muted`, `bg-surface`, `border-border` |

DECISION — amber intent uses the existing `warning` token, NOT an invented
`amber-600`. The theme already defines `--color-warning: rgb(250 173 20)` (Material
amber, identical to `accent`). `text-warning` + `hover:bg-warning/10` are guaranteed
to compile. We do NOT rely on Tailwind's default palette (`amber-*`, `violet-50`,
`red-50`) even though v4 keeps it — using the app's semantic tokens is the parity-
correct, self-documenting choice and matches how the rest of the app is written.

Opacity tints (`bg-<token>/10`) are CONFIRMED to render: `hover:bg-danger/10` is
already live in `category-product-list.tsx` and `owner-card-list.tsx`.

## 3. `ActionMenu` API (ADR-1)

```tsx
interface ActionMenuProps {
  /** Accessible name for the gear trigger. Default 'Acciones'. */
  label?: string;
  /** data-testid forwarded to the trigger button (e.g. `sale-credit-actions-toggle-${id}`). */
  testId?: string;
  /** Tailwind width utility for the dropdown. Default 'w-44'. */
  widthClass?: string;
  /** ActionMenuItem children. */
  children: ReactNode;
}
```

Rendered structure (mirrors the reference pattern exactly):

```tsx
<div className="relative" ref={menuRef}>
  <button
    type="button"
    onClick={() => setIsOpen(v => !v)}
    aria-label={label /* default 'Acciones' */}
    aria-expanded={isOpen}
    data-testid={testId}
    className="rounded-full p-1.5 text-primary hover:bg-primary-light transition-colors"
  >
    <SettingsIcon />
  </button>
  {isOpen && (
    <div
      role="menu"
      className={`absolute right-0 top-full z-10 mt-1 ${widthClass} rounded-xl border border-border bg-surface shadow-lg py-1`}
    >
      <ActionMenuContext.Provider value={{ close: () => setIsOpen(false) }}>
        {children}
      </ActionMenuContext.Provider>
    </div>
  )}
</div>
```

Decisions:
- Trigger uses the shared `SettingsIcon` (replaces every hand-rolled inline gear svg,
  including `sale-credit-list.tsx`'s `viewBox 0 0 16 16` variant).
- `role="menu"` on the dropdown and `aria-label` default `'Acciones'` are MANDATORY —
  existing card-menu tests assert `getByRole('button', { name: /acciones/i })` then
  `getByRole('menuitem', ...)`. Keeping these preserves those tests unchanged.
- State: `useState(isOpen)` + `useRef` + `useClickOutside(menuRef, () => setIsOpen(false))`.
  No portal, no external state — same as ProductRow.

## 4. `ActionMenuItem` API + intent map (ADR-2)

```tsx
export type ActionIntent =
  | 'edit' | 'create' | 'pay' | 'activate'
  | 'deactivate' | 'approve' | 'disapprove' | 'delete';

interface ActionMenuItemProps {
  /** Drives foreground color + default icon. Omit for a neutral item (escape hatch). */
  intent?: ActionIntent;
  onClick: () => void;
  children: ReactNode;               // label text (usually intl.formatMessage(...))
  /** Override/supply the leading icon. Pass `null` to render no icon. */
  icon?: ReactNode;
  /** Renders a thin divider line above this item (destructive grouping). */
  separatorBefore?: boolean;
  'data-testid'?: string;
}
```

Intent -> classes + default icon (SINGLE SOURCE OF TRUTH — hardcode as a `const` map):

| intent | resting fg (icon+text) | soft hover tint | default icon |
|---|---|---|---|
| `edit` | `text-primary` | `hover:bg-primary/10` | `EditIcon` |
| `create` | `text-primary` | `hover:bg-primary/10` | `PlusIcon` |
| `pay` | `text-success` | `hover:bg-success/10` | `PayIcon` (new) |
| `activate` | `text-success` | `hover:bg-success/10` | `CheckCircleIcon` (new) |
| `approve` | `text-success` | `hover:bg-success/10` | `CheckCircleIcon` (reused) |
| `deactivate` | `text-warning` | `hover:bg-warning/10` | `BanIcon` (new) |
| `disapprove` | `text-warning` | `hover:bg-warning/10` | `BanIcon` (reused) |
| `delete` | `text-danger` | `hover:bg-danger/10` | `TrashIcon` |
| _none_ (neutral) | `text-text` | `hover:bg-primary/10` | none (unless `icon` passed) |

DECISION — hover tint is uniformly `hover:bg-<token>/10` across ALL four color
families. Only `primary` has a dedicated `-light` token; success/warning/danger do
not, so the `/10` opacity tint is the only symmetric option. Using `/10` everywhere
keeps hover intensity consistent and the map trivially mechanical. (This intentionally
changes existing edit items from `hover:bg-primary-light` to `hover:bg-primary/10` —
both are soft violet, visually near-identical; it is the deliberate Option A tint.)

Item render:

```tsx
const s = intent ? INTENT_STYLES[intent] : NEUTRAL_STYLE;
const resolvedIcon = icon !== undefined ? icon : s.icon; // `null` suppresses; undefined = default
return (
  <>
    {separatorBefore && <div role="separator" className="my-1 border-t border-border" />}
    <button
      type="button"
      role="menuitem"
      data-testid={dataTestId}
      onClick={() => { close(); onClick(); }}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${s.fg} ${s.hover} transition-colors`}
    >
      {resolvedIcon}
      {children}
    </button>
  </>
);
```

Decisions:
- `role="menuitem"` MANDATORY (test contract).
- Escape hatch: `intent` optional -> neutral `text-text`; `icon` prop overrides the
  default and `icon={null}` renders label-only. Covers any non-standard item without
  widening the intent enum.
- `separatorBefore` is EXPLICIT (default `false`), not auto-derived from `intent==='delete'`.
  Keeps the component predictable; migration notes state exactly where to pass it.
- Close-on-click uses the private context `close()` — no prop drilling, callers just
  nest `<ActionMenuItem>` inside `<ActionMenu>`.

## 5. Icons to add (`shared/components/ui/icons.tsx`) (ADR-3)

Follow the existing convention exactly: `type IconProps`, `const BASE = 'h-5 w-5 shrink-0'`,
`fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"`, `currentColor`
so `text-*` drives color. Three NEW components:

| Component | Material semantic | Path (heroicons/Material outline) |
|---|---|---|
| `PayIcon` | `payments` / cash | `M3 6h18M3 6v12a1 1 0 001 1h16a1 1 0 001-1V6M3 6l2-3h14l2 3M12 10a2.5 2.5 0 100 5 2.5 2.5 0 000-5z` (same cash glyph as `PaymentMethodIcon` kind='cash', promoted to `BASE` size) |
| `CheckCircleIcon` | `check_circle` | `M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z` |
| `BanIcon` | `block` | `M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636` |

DECISION — `approve` reuses `CheckCircleIcon` and `disapprove` reuses `BanIcon`
(affirmative = check, negative = block), matching the proposal's "approve may reuse
check". No separate approve/disapprove glyphs. Net new icons: exactly THREE.
`EditIcon`, `PlusIcon`, `TrashIcon`, `SettingsIcon` already exist and are reused as-is.

## 6. Per-menu migration notes (9 menus)

### A. Restyle — gear already exists (6)

1. **`sales/components/category-actions-menu.tsx`** — Replace inline `<div relative>`
   scaffold with `<ActionMenu testId={`category-actions-toggle-${category.id}`} label="Opciones de categoría" widthClass="w-52">`. Items: Editar Categoría (`intent="edit"`,
   testid `edit-category-button`), Nuevo Productos (`intent="create"`, testid
   `add-products-button`), Nuevo Producto (`intent="create"`, testid `add-product-button`).
   No separator. Preserve all `data-testid`s and i18n keys. Drops the hand-rolled gear svg.

2. **`sales/components/category-product-list.tsx` (ProductRow)** — Replace the inline
   menu with `<ActionMenu label="Acciones">`. Items: Editar Producto (`intent="edit"`),
   Eliminar Producto (`intent="delete"`, `separatorBefore`). Keeps `PRODUCT.EDIT_PRODUCT` /
   `PRODUCT.DELETE_PRODUCT`. This screen already carried colored fg + `hover:bg-danger/10`;
   the only functional visual add is the separator above Eliminar.

3. **`sales/components/sale-credit-list.tsx`** — Replace the hand-rolled 16-viewBox svg
   with `ActionMenu` (`SettingsIcon` via the primitive). Keep trigger testid
   `sale-credit-actions-toggle-${saleCredit.id}` (pass as `testId`). Items: Editar
   (`intent="edit"`, `GENERAL.EDIT`), "Pagar por" (`intent="pay"`, `SALE_CREDIT.TO_PAY`,
   rendered only when `!saleCredit.paid`). No separator. Local modal state
   (`editingCredit`/`payingCredit`) and `handleSave`/`handlePay` UNCHANGED — items just
   call the existing setters. NOTE: this menu currently manages open state via a shared
   `openMenuId` at list level; switching to `ActionMenu`'s per-instance state is fine
   (each row renders its own `ActionMenu`) and drops the `openMenuId`/`setOpenMenuId`
   plumbing. Keep `role="menu"`/`role="menuitem"` (now provided by the primitive).

4. **`admin/owners/components/owner-card-list.tsx`** — Replace inline gear+menu with
   `ActionMenu widthClass="w-40"`. Items: Editar (`intent="edit"`, `OWNER.EDIT_OWNER`),
   Eliminar (`intent="delete"`, `separatorBefore`, `GENERAL.DELETE`). Keeps the
   `openMenuId` -> per-instance conversion. Tests assert `getByRole('menuitem', {name})`
   and trigger `/acciones/i` — both preserved => NO test change. Only additive: edit gains
   `text-primary`+icon, delete gains icon+separator (was `text-danger` already).

5. **`admin/resellers/components/reseller-card-list.tsx`** — Structural mirror of #4
   (same Card + gear + Editar/Eliminar). Same migration: `intent="edit"` + `intent="delete"`
   with `separatorBefore`. Preserve its i18n keys/testids/handlers verbatim.

6. **`management/users/components/user-card-list.tsx`** — `ActionMenu widthClass="w-40"`.
   Items: Editar (`intent="edit"`, `USERS.EDIT`, always); Activar (`intent="activate"`,
   `USERS.ACTIVATE`, when `!user.isActive`); Desactivar (`intent="deactivate"`,
   `USERS.DEACTIVATE`, when `user.isActive`). No delete => no separator. `handleEdit/
   handleActivate/handleDeactivate` unchanged. `menuitem` role + `/acciones/i` preserved
   => NO test change. Fab "Adicionar" create button stays a `Button`, NOT a menu item.

### B. Add a gear — flat buttons -> gear menu (3, Angular parity)

For these three, the interaction model changes (open gear, then click item), so their
existing tests WILL be rewritten under strict TDD: assert gear (`/acciones/i`) opens a
`role="menu"`, then `getByRole('menuitem', {name})`. Handlers, props, i18n keys, and
conditional gating are preserved.

7. **`inventory/components/entry-list.tsx`** — The `showActions` cell (`isOwnerAdmin &&
   !readOnly`) currently renders two flat buttons. Wrap in `<ActionMenu>` inside the same
   `<td>`. Items: Editar (`intent="edit"`, `GENERAL.EDIT`, `onEdit?.(entry)`); Eliminar
   (`intent="delete"`, `separatorBefore`, `GENERAL.DELETE`, `onDeactivate?.(entry)` — keep
   the existing handler name; the CRITICAL i18n fix `GENERAL.DELETE` stays). Matches Angular
   `entry-list.component.html:24-38`. Add a stable trigger `testId` per row (e.g.
   `entry-actions-toggle-${entry.id}`) for the rewritten tests.

8. **`expenses/components/expense-list.tsx`** — The `!readOnly` action `<div>` renders flat
   Editar + (optional) Eliminar. Wrap in `<ActionMenu>`. Items: Editar (`intent="edit"`,
   `EXPENSES.EDIT`, `onEdit?.(expense)`); Eliminar (`intent="delete"`, `separatorBefore`,
   `EXPENSES.DELETE`, `onDelete(expense)`, rendered only when `onDelete` present). The
   primitive's default `TrashIcon` replaces the manual `<TrashIcon className="h-3.5 w-3.5">`.
   Matches Angular `expense-list.component.html:20-37`. Add row trigger `testId`
   (e.g. `expense-actions-toggle-${expense.id}`).

9. **`admin/stores/components/store-card-list.tsx`** — Replace the flat `Button` row
   (Editar outline + Aprobar/Desaprobar XOR) with `<ActionMenu widthClass="w-40">`. Items:
   Editar (`intent="edit"`, `STORES.EDIT`, `onEdit(store.id)`); then XOR — when
   `store.approved`: Desaprobar (`intent="disapprove"`, `STORES.DISAPPROVE`,
   `onDisapprove(store.id)`); else Aprobar (`intent="approve"`, `STORES.APPROVE`,
   `onApprove(store.id)`). No delete => no separator. Angular `store-list.component.html:17-51`
   (Activate/Deactivate stay dead-coded out — unchanged). Add trigger `testId`
   (e.g. `store-actions-toggle-${store.id}`). `getStoreCardClass` untouched. Existing
   `getByRole('button', {name: STORES.EDIT|APPROVE|DISAPPROVE})` tests will change to
   `menuitem` after opening the gear.

## 7. Testability (strict TDD active)

Assertion surface the primitive guarantees:
- Trigger: `getByRole('button', { name: /acciones/i })` (or the custom `label`), and/or
  `getByTestId(testId)`; `aria-expanded` reflects open state.
- Dropdown: `getByRole('menu')` present only when open.
- Items: `getByRole('menuitem', { name })`; click fires `onClick` AND closes the menu
  (assert the menu is gone after click).
- Intent color: locate the `menuitem`, assert `className` contains the expected token
  class — `text-primary` / `text-success` / `text-warning` / `text-danger`.
- Icon: `menuitemEl.querySelector('svg')` is non-null (default intent icon) or null when
  `icon={null}`.
- Separator: `getAllByRole('separator')` (or `container.querySelector('[role="separator"]')`)
  appears above delete items.
- Click-outside: `fireEvent.mouseDown(document.body)` closes the menu (covered by the
  existing `use-click-outside` hook; add one integration assertion in the primitive's test).

New unit test file: `shared/components/ui/__tests__/action-menu.test.tsx` — write it FIRST
(strict TDD) covering: closed-by-default, opens on trigger, renders children as menuitems,
each intent maps to its color class + default icon, `separatorBefore` renders a separator,
click runs `onClick` then closes, `icon={null}` suppresses the icon, neutral (no intent)
uses `text-text`. Then migrate each menu, updating the 3 flat-button screens' tests to the
gear interaction and leaving the 3 role-based card-menu tests (owner/reseller/user) passing
unchanged.

Verification gates: `pnpm -C apps/web-store-pos exec tsc --noEmit` and `pnpm test` green.

## 8. Rejected Alternatives

- **Per-file inline styling (no shared primitive)** — rejected: duplicates the color map
  across 9 files, guarantees drift, contradicts the proposal's architectural gate.
- **`intent='delete'` auto-enables `separatorBefore`** — rejected: hidden behavior; breaks
  when delete is the first item. Explicit prop keeps apply mechanical and predictable.
- **Invented `text-amber-600` / `bg-amber-50`** — rejected: the app has a semantic
  `warning` token (amber) already; using default-palette classes is off-convention and
  risks divergence from the design system.
- **`bg-primary-light` for the primary hover tint** — rejected in favor of uniform
  `/10` opacity tints so the four color families share one symmetric rule (success/
  warning/danger have no `-light` token).
- **Headless-UI / Radix `Menu`** — rejected: adds a dependency Angular lacks and the
  proven `useClickOutside` pattern already satisfies the requirement (migration = parity,
  invent nothing beyond the one shared UI primitive).
- **Portal-rendered dropdown** — rejected: current menus render in-flow with `absolute`
  positioning and pass tests; a portal would complicate `role`/testid queries for no gain.

## 9. Architectural Risks

- The 3 flat-button screens' tests must be rewritten for the gear interaction (expected,
  strict-TDD). Low risk but real churn — mitigate by adding per-row trigger `testId`s.
- `sale-credit-list.tsx` moves from list-level `openMenuId` to per-instance `ActionMenu`
  state; confirm no test asserts single-open-at-a-time across rows (behavior is a superset,
  still parity-correct).
- Reseller/owner mirror assumption: reseller-card-list must be re-read at apply time to
  confirm it is a structural twin before applying the identical migration.
- Icon path fidelity vs Angular `mat-icon` semantics is cosmetic (aria-hidden); Low risk.
