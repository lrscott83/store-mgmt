# gear-menu-action-styling Specification

**Change:** gear-menu-action-styling
**Phase:** Spec
**Status:** Done
**Date:** 2026-07-18
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

Standardize all gear/action ("Acciones") dropdown menus in `apps/web-store-pos` onto one
shared `ActionMenu`/`ActionMenuItem` primitive with a centralized `intent -> color` map,
restyle the 6 existing gear menus, and restore gear-menu parity on 3 screens that currently
render flat inline buttons where Angular shows a gear + `mat-menu`. Presentation + parity
only — no data-layer or handler-signature changes.

---

## Requirements

### Requirement: Shared ActionMenu Trigger & Dropdown (GM-MENU)

A shared `ActionMenu` component MUST exist at
`apps/web-store-pos/app/shared/components/ui/action-menu.tsx`. It MUST render a gear trigger
button using the shared `SettingsIcon`, with a default accessible name of `'Acciones'`
(overridable via a `label` prop) and an optional `testId` prop forwarded to the trigger as
`data-testid`.

Clicking the trigger MUST toggle a dropdown container with `role="menu"`. The dropdown MUST
NOT be present in the DOM when closed. `aria-expanded` on the trigger MUST reflect the open
state.

Clicking outside the open menu (mousedown outside the component's root) MUST close it, using
the existing `useClickOutside` hook — no new click-outside implementation.

`ActionMenu` MUST accept a `widthClass` prop (default `w-44`) controlling the dropdown's
Tailwind width utility, and `children` (the `ActionMenuItem`s).

#### Scenario: S-GM-MENU-1 — Menu closed by default

- GIVEN `ActionMenu` renders with one `ActionMenuItem` child
- THEN `queryByRole('menu')` is `null`

#### Scenario: S-GM-MENU-2 — Trigger opens the menu

- GIVEN `ActionMenu` is rendered
- WHEN the user clicks `getByRole('button', { name: /acciones/i })`
- THEN `getByRole('menu')` is present
- AND the trigger's `aria-expanded` is `"true"`

#### Scenario: S-GM-MENU-3 — Click outside closes the menu

- GIVEN the menu is open
- WHEN a `mousedown` event fires on `document.body` outside the menu
- THEN `queryByRole('menu')` becomes `null`

#### Scenario: S-GM-MENU-4 — Custom label and testId are honored

- GIVEN `ActionMenu` renders with `label="Opciones de categoría"` and
  `testId="category-actions-toggle-1"`
- THEN `getByRole('button', { name: /opciones de categoría/i })` is present
- AND `getByTestId('category-actions-toggle-1')` is present

---

### Requirement: ActionMenuItem Intent Colors, Icon, and Separator (GM-ITEM)

`ActionMenuItem` MUST render a `role="menuitem"` element inside the open `ActionMenu`. It
MUST accept `onClick`, `children` (label), an optional `intent`, an optional `icon`
(`ReactNode | null`, where `null` renders no icon and `undefined` renders the intent's default
icon), an optional `separatorBefore` (default `false`), and an optional `data-testid`.

Clicking an item MUST invoke its `onClick` callback AND close the parent `ActionMenu` (the
menu MUST no longer be present after the click).

The item's foreground color MUST be driven by `intent` per this map:

| intent | color class | default icon |
|---|---|---|
| `edit` | `text-primary` | `EditIcon` |
| `create` | `text-primary` | `PlusIcon` |
| `pay` | `text-success` | `PayIcon` |
| `activate` | `text-success` | `CheckCircleIcon` |
| `approve` | `text-success` | `CheckCircleIcon` |
| `deactivate` | `text-warning` | `BanIcon` |
| `disapprove` | `text-warning` | `BanIcon` |
| `delete` | `text-danger` | `TrashIcon` |
| _(no intent)_ | `text-text` | none |

When `separatorBefore` is `true`, a `role="separator"` divider element MUST render
immediately before the item's `menuitem` element.

#### Scenario: S-GM-ITEM-1 — Click fires onClick and closes the menu

- GIVEN an open `ActionMenu` containing one `ActionMenuItem` with `intent="edit"` and a mock
  `onClick`
- WHEN the user clicks `getByRole('menuitem', { name: <label> })`
- THEN the mock `onClick` is called exactly once
- AND `queryByRole('menu')` becomes `null`

#### Scenario: S-GM-ITEM-2 — Each intent maps to its color class and default icon

- GIVEN one `ActionMenuItem` per intent value (`edit`, `create`, `pay`, `activate`,
  `approve`, `deactivate`, `disapprove`, `delete`) is rendered inside an open `ActionMenu`
- THEN each `menuitem`'s `className` contains the intent's expected token class
  (`text-primary` / `text-success` / `text-warning` / `text-danger`)
- AND each `menuitem.querySelector('svg')` is non-null

#### Scenario: S-GM-ITEM-3 — Neutral item with no intent

- GIVEN an `ActionMenuItem` with no `intent` prop
- THEN its `menuitem` `className` contains `text-text`
- AND `menuitem.querySelector('svg')` is `null` (no icon by default)

#### Scenario: S-GM-ITEM-4 — icon={null} suppresses the icon

- GIVEN an `ActionMenuItem` with `intent="edit"` and `icon={null}`
- THEN `menuitem.querySelector('svg')` is `null`

#### Scenario: S-GM-ITEM-5 — separatorBefore renders a divider

- GIVEN an `ActionMenu` with two items, the second having `separatorBefore` and
  `intent="delete"`
- THEN a `[role="separator"]` element is present immediately before the delete `menuitem` in
  document order
- AND the first item has no preceding separator

---

### Requirement: category-actions-menu Restyled (GM-MENU-CATEGORY-ACTIONS)

`sales/components/category-actions-menu.tsx` MUST render its gear via `ActionMenu` with items:
Editar Categoría (`intent="edit"`), Nuevo Productos (`intent="create"`), Nuevo Producto
(`intent="create"`). No item has `separatorBefore`. All existing `data-testid`s and i18n keys
MUST be preserved.

#### Scenario: S-GM-CAT-ACTIONS-1 — Items render with correct intents, no separator

- GIVEN the category actions gear is opened
- THEN `menuitem`s for "Editar Categoría", "Nuevo Productos", and "Nuevo Producto" are present
- AND "Editar Categoría"'s `menuitem` has `text-primary`; both "Nuevo..." items have
  `text-primary`
- AND no `[role="separator"]` is present

---

### Requirement: category-product-list ProductRow Restyled (GM-MENU-PRODUCT-ROW)

The `ProductRow` gear menu in `sales/components/category-product-list.tsx` MUST render via
`ActionMenu` with items: Editar Producto (`intent="edit"`), Eliminar Producto (`intent="delete"`,
`separatorBefore`).

#### Scenario: S-GM-PRODUCT-ROW-1 — Edit and delete with separator above delete

- GIVEN a product row's gear is opened
- THEN "Editar Producto" `menuitem` has `text-primary`
- AND "Eliminar Producto" `menuitem` has `text-danger`
- AND a `[role="separator"]` precedes the "Eliminar Producto" `menuitem`

---

### Requirement: sale-credit-list Restyled with Shared Gear (GM-MENU-SALE-CREDIT)

`sales/components/sale-credit-list.tsx` MUST replace its hand-rolled inline gear SVG with
`ActionMenu` (using the shared `SettingsIcon`), preserving the trigger testid pattern
`sale-credit-actions-toggle-${saleCredit.id}`. Items: Editar (`intent="edit"`), "Pagar por"
(`intent="pay"`, rendered only when `!saleCredit.paid`). No separator. Each row MUST manage
its own open/close state via `ActionMenu` (no shared `openMenuId` across rows).

#### Scenario: S-GM-SALE-CREDIT-1 — Unpaid credit shows Editar and Pagar por

- GIVEN a sale credit row with `paid: false`
- WHEN its gear (`sale-credit-actions-toggle-<id>`) is opened
- THEN `menuitem`s "Editar" (`text-primary`) and "Pagar por" (`text-success`) are both present

#### Scenario: S-GM-SALE-CREDIT-2 — Paid credit hides Pagar por

- GIVEN a sale credit row with `paid: true`
- WHEN its gear is opened
- THEN "Editar" is present
- AND no "Pagar por" `menuitem` is present

#### Scenario: S-GM-SALE-CREDIT-3 — Opening one row's menu does not open another's

- GIVEN two sale credit rows are rendered
- WHEN row A's gear is opened
- THEN row B's `menu` is not present

---

### Requirement: owner-card-list Restyled (GM-MENU-OWNER)

`admin/owners/components/owner-card-list.tsx` MUST render via `ActionMenu`. Items: Editar
(`intent="edit"`), Eliminar (`intent="delete"`, `separatorBefore`). All existing handlers,
i18n keys (`OWNER.EDIT_OWNER`, `GENERAL.DELETE`), and testids MUST be preserved; the existing
`getByRole('menuitem', { name })` and trigger `/acciones/i` assertions MUST keep passing
without test edits.

#### Scenario: S-GM-OWNER-1 — Edit and delete with correct colors and separator

- GIVEN an owner card's gear is opened
- THEN "Editar" `menuitem` has `text-primary`
- AND "Eliminar" `menuitem` has `text-danger` and is preceded by a `[role="separator"]`

---

### Requirement: reseller-card-list Restyled (GM-MENU-RESELLER)

`admin/resellers/components/reseller-card-list.tsx` MUST apply the identical migration as
owner-card-list (structural mirror): `ActionMenu` with Editar (`intent="edit"`) and Eliminar
(`intent="delete"`, `separatorBefore`), preserving its own i18n keys, testids, and handlers.

> **Applied deviation (verified during apply/verify, see Traceability):** the actual React
> source has no `onDelete` prop and no wired Eliminar action (Angular's
> `resellers.component.ts` `deleteReSeller`/`activateReSeller`/`deactivateReSeller` are
> genuine empty no-op stubs; only Edit is wired via `routerLink`). The shipped implementation
> migrates `reseller-card-list.tsx` to `ActionMenu` with **Editar only** (`intent="edit"`, no
> separator) — adding Eliminar would have invented behavior with no real handler behind it.
> This requirement's literal text ("identical migration") is retained as the original design
> intent; the deviation is the accepted, verified final behavior.

#### Scenario: S-GM-RESELLER-1 — Edit and delete with correct colors and separator

- GIVEN a reseller card's gear is opened
- THEN "Editar" `menuitem` has `text-primary`
- AND "Eliminar" `menuitem` has `text-danger` and is preceded by a `[role="separator"]`

> Note: as shipped, only the "Editar" assertion applies — no "Eliminar" `menuitem` exists for
> reseller cards (see deviation note above).

---

### Requirement: user-card-list Restyled (GM-MENU-USER)

`management/users/components/user-card-list.tsx` MUST render via `ActionMenu`. Items: Editar
(`intent="edit"`, always present); Activar (`intent="activate"`, present only when
`!user.isActive`); Desactivar (`intent="deactivate"`, present only when `user.isActive`). No
delete item, no separator. The "Adicionar" create button remains a standalone `Button`, NOT an
`ActionMenuItem`.

#### Scenario: S-GM-USER-1 — Inactive user shows Editar and Activar

- GIVEN a user card for a user with `isActive: false`
- WHEN its gear is opened
- THEN "Editar" (`text-primary`) and "Activar" (`text-success`) `menuitem`s are present
- AND no "Desactivar" `menuitem` is present

#### Scenario: S-GM-USER-2 — Active user shows Editar and Desactivar

- GIVEN a user card for a user with `isActive: true`
- WHEN its gear is opened
- THEN "Editar" (`text-primary`) and "Desactivar" (`text-warning`) `menuitem`s are present
- AND no "Activar" `menuitem` is present

#### Scenario: S-GM-USER-3 — No separator present

- GIVEN any user card's gear is opened
- THEN no `[role="separator"]` is present

---

### Requirement: entry-list Gains a Gear Menu (GM-MENU-ENTRY)

`inventory/components/entry-list.tsx` MUST replace its two flat action buttons (currently
rendered when `isOwnerAdmin && !readOnly`) with an `ActionMenu` per row, matching Angular
`entry-list.component.html:24-38`. Items: Editar (`intent="edit"`, invokes the existing
`onEdit?.(entry)` handler), Eliminar (`intent="delete"`, `separatorBefore`, invokes the
existing `onDeactivate?.(entry)` handler — handler name unchanged). Each row MUST expose a
stable trigger testid (e.g. `entry-actions-toggle-${entry.id}`). The gate condition
(`isOwnerAdmin && !readOnly`) for showing the actions cell MUST be preserved unchanged.

#### Scenario: S-GM-ENTRY-1 — Owner-admin, not read-only sees the gear with both actions

- GIVEN `isOwnerAdmin: true` and `readOnly: false` for an entry row
- WHEN the row's actions gear is opened
- THEN "Editar" (`text-primary`) and "Eliminar" (`text-danger`, preceded by a separator)
  `menuitem`s are present

#### Scenario: S-GM-ENTRY-2 — Read-only or non-owner-admin hides the actions cell

- GIVEN `isOwnerAdmin: false` OR `readOnly: true` for an entry row
- THEN no actions gear trigger is rendered for that row

#### Scenario: S-GM-ENTRY-3 — Editar and Eliminar invoke existing handlers

- GIVEN the entry row's gear is opened with mocked `onEdit` and `onDeactivate`
- WHEN "Editar" is clicked
- THEN `onEdit` is called with the entry
- WHEN the gear is reopened and "Eliminar" is clicked
- THEN `onDeactivate` is called with the entry

---

### Requirement: expense-list Gains a Gear Menu (GM-MENU-EXPENSE)

`expenses/components/expense-list.tsx` MUST replace its flat Editar/Eliminar buttons
(rendered when `!readOnly`) with an `ActionMenu` per row, matching Angular
`expense-list.component.html:20-37`. Items: Editar (`intent="edit"`, invokes existing
`onEdit?.(expense)`), Eliminar (`intent="delete"`, `separatorBefore`, invokes existing
`onDelete(expense)`, rendered only when `onDelete` is provided). Each row MUST expose a stable
trigger testid (e.g. `expense-actions-toggle-${expense.id}`).

#### Scenario: S-GM-EXPENSE-1 — Not read-only with onDelete shows both actions

- GIVEN `readOnly: false` and an `onDelete` handler is provided
- WHEN the row's gear is opened
- THEN "Editar" (`text-primary`) and "Eliminar" (`text-danger`, preceded by a separator)
  `menuitem`s are present

#### Scenario: S-GM-EXPENSE-2 — No onDelete hides Eliminar only

- GIVEN `readOnly: false` and no `onDelete` handler is provided
- WHEN the row's gear is opened
- THEN "Editar" is present
- AND no "Eliminar" `menuitem` is present

#### Scenario: S-GM-EXPENSE-3 — Read-only hides the actions cell entirely

- GIVEN `readOnly: true`
- THEN no actions gear trigger is rendered for that row

---

### Requirement: store-card-list Gains a Gear Menu (GM-MENU-STORE)

`admin/stores/components/store-card-list.tsx` MUST replace its flat Editar/Aprobar/Desaprobar
`Button` row with an `ActionMenu` per store card, matching Angular
`store-list.component.html:17-51`. Items: Editar (`intent="edit"`, invokes existing
`onEdit(store.id)`), then exactly one of: Desaprobar (`intent="disapprove"`, invokes existing
`onDisapprove(store.id)`) when `store.approved` is `true`, OR Aprobar (`intent="approve"`,
invokes existing `onApprove(store.id)`) when `store.approved` is `false`. No delete item, no
separator. Activate/Deactivate MUST remain dead-coded out (unchanged from current behavior).
Each row MUST expose a stable trigger testid (e.g. `store-actions-toggle-${store.id}`).
`getStoreCardClass` MUST remain untouched.

#### Scenario: S-GM-STORE-1 — Approved store shows Editar and Desaprobar

- GIVEN a store card with `approved: true`
- WHEN its gear is opened
- THEN "Editar" (`text-primary`) and "Desaprobar" (`text-warning`) `menuitem`s are present
- AND no "Aprobar" `menuitem` is present

#### Scenario: S-GM-STORE-2 — Unapproved store shows Editar and Aprobar

- GIVEN a store card with `approved: false`
- WHEN its gear is opened
- THEN "Editar" (`text-primary`) and "Aprobar" (`text-success`) `menuitem`s are present
- AND no "Desaprobar" `menuitem` is present

#### Scenario: S-GM-STORE-3 — No separator present

- GIVEN any store card's gear is opened
- THEN no `[role="separator"]` is present

---

### Requirement: New Intent Icons (GM-ICONS)

`shared/components/ui/icons.tsx` MUST gain exactly 3 new icon components: `PayIcon`,
`CheckCircleIcon`, `BanIcon`. Each MUST follow the existing icon convention: `h-5 w-5 shrink-0`
base classes, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `fill="none"`,
`aria-hidden="true"`, so color is driven entirely by the parent's `text-*` class. No other new
icon components MUST be added. `approve` intent reuses `CheckCircleIcon`; `disapprove` intent
reuses `BanIcon`.

#### Scenario: S-GM-ICONS-1 — New icons are aria-hidden and colorless by default

- GIVEN `PayIcon`, `CheckCircleIcon`, and `BanIcon` are each rendered standalone
- THEN each root `<svg>` has `aria-hidden="true"`
- AND none hardcode a `fill` or `stroke` color other than `currentColor`/`none`

---

### Requirement: Behavior and Accessibility Preservation (GM-PARITY)

For every one of the 9 menus, the change MUST preserve: existing action handlers (same
functions, same call arguments), existing `data-testid`s not tied to the old inline-svg gear
markup, existing i18n keys, and existing conditional-rendering/gating logic. The 3 restyle-only
card-menu screens (owner, reseller, user) MUST keep their existing `getByRole('menuitem',
{ name })` and trigger `/acciones/i` test assertions passing WITHOUT modification. The gear
trigger's accessible name MUST default to `'Acciones'` unless a menu explicitly overrides
`label` (category-actions-menu uses `'Opciones de categoría'`).

#### Scenario: S-GM-PARITY-1 — Existing owner/reseller/user menuitem tests pass unmodified

- GIVEN the pre-existing test assertions `getByRole('button', { name: /acciones/i })` followed
  by `getByRole('menuitem', { name: ... })` for owner-card-list, reseller-card-list, and
  user-card-list
- WHEN those components are migrated to `ActionMenu`
- THEN the same assertions continue to pass without editing the assertions themselves

#### Scenario: S-GM-PARITY-2 — All handler call signatures are unchanged

- GIVEN each of the 9 migrated menus
- WHEN an action item is clicked
- THEN the underlying handler is invoked with the exact same arguments as before migration
  (e.g. `onEdit(store.id)`, `onDeactivate?.(entry)`, `handlePay`)

---

## Non-Goals (Explicit Negative Requirements)

### GM-NGOAL-1 — Raw fab buttons out of scope

Fab/action buttons in login, register, profile, `*-creates` screens, csv-importer, and modals
missing icons MUST NOT be touched by this change. They are addressed in a separate later
change.

### GM-NGOAL-2 — No data-layer or handler-signature changes

No store, service, repository, or handler function signature MUST change as part of this
change. This is presentation + accessibility only.

### GM-NGOAL-3 — No new dependencies

No headless-UI/Radix menu library or portal rendering MUST be introduced. The primitive uses
only the existing `useClickOutside` hook and in-flow `absolute` positioning.

### GM-NGOAL-4 — No auto-derived separator

`separatorBefore` MUST NOT be automatically inferred from `intent === 'delete'`. It is always
an explicit prop at each call site.

### GM-NGOAL-5 — Store card Activate/Deactivate stay unreachable

`store-card-list.tsx` MUST NOT surface Activate/Deactivate actions; they remain dead-coded out
exactly as before this change, matching current Angular-parity state.

---

## Traceability

- Proposal: `sdd/gear-menu-action-styling/proposal` (Engram #1252)
- Design: `sdd/gear-menu-action-styling/design` (Engram #1253)
- Spec (delta, source of this document): `sdd/gear-menu-action-styling/spec` (Engram #1254)
- Tasks: `sdd/gear-menu-action-styling/tasks` (Engram #1255) — 17/17 complete
- Apply Progress: `sdd/gear-menu-action-styling/apply-progress` (Engram #1257)
- Verify Report: `sdd/gear-menu-action-styling/verify-report` (Engram #1259) — Verdict: PASS
- Implementation commits: `c179e60`, `0fb4b25`, `e0aa116` (main)
