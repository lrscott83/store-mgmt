# Delta for management

**Change:** admin-stores
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram + openspec file)

---

## MODIFIED Requirements

### Requirement: Presentational Components (PRES)

`StoreList` MUST be a pure presentational component at
`app/management/stores/components/store-list.tsx` (also exported as `StoreList`). It MUST accept
stores as props and emit action callbacks (`onActivate`, `onApprove`, `onDisapprove`,
`onDeactivate`, `onEdit`, `onCreate`). It MUST NOT import HTTP services or router navigation
directly.

`onActivate` and `onDeactivate` MUST be optional props (`(() => void)?`). When a handler is
absent, the corresponding action button MUST NOT be rendered. When a handler is present, the button
MUST be rendered and function exactly as before.

`onApprove` and `onDisapprove` remain required.

(Previously: `onActivate` and `onDeactivate` were required props — the button was always rendered
regardless of whether a handler was provided.)

`StoreList` MUST show a visible degraded-state indicator when passed a degraded-mode flag from the
container (indicating data came from cache, not the network).

`StoreList` MUST show an empty-state message when the stores array is empty.

`StoreForm` MUST be a shared presentational component at
`app/management/stores/components/StoreForm.tsx`. It MUST handle both create and edit mode (the
container passes a mode prop or an initial store value to distinguish them).

`StoreForm` MUST include a module picker sub-component that renders the available module catalog
and allows the user to select/deselect modules. Modules where `priceIncluded === true` MUST be
auto-selected and rendered as locked (not user-toggleable).

`StoreForm` MUST implement role-conditional field rendering:
- super-admin or owner-admin: render `ownerId` (required, owner picker), `approved`, `description`.
- super-admin + edit mode: render `paymentStartDate` (required).
- super-admin: render `isActive`.
- Non-owner-admin creating a new store: `ownerId` is set to the current user's id (not a picker)
  and `approved` is forced to `false` (not rendered as editable).

`StoreForm` MUST surface an inline error message when the container passes an error prop. It MUST
NOT reset field values on error.

`StoreForm` MUST disable its submit button and show an offline notice when the container passes an
`isOnline = false` prop.

`StoreForm` MUST display the total price of selected modules (sum of `currentPrice` across
selected modules) as a presentational helper. This is display-only and does not affect the
submitted payload.

`StoreForm` MUST NOT import HTTP services, router hooks, or `useOnlineStatus` directly. All data
and callbacks flow through props from the container.

#### Scenario: S-PRES-OPTIONAL-1 — Activate button hidden when handler absent

- GIVEN `StoreList` is rendered without an `onActivate` prop
- WHEN a store row is displayed
- THEN no Activate button is rendered for that row

#### Scenario: S-PRES-OPTIONAL-2 — Deactivate button hidden when handler absent

- GIVEN `StoreList` is rendered without an `onDeactivate` prop
- WHEN a store row is displayed
- THEN no Deactivate button is rendered for that row

#### Scenario: S-PRES-OPTIONAL-3 — Activate button present when handler provided

- GIVEN `StoreList` is rendered with `onActivate` prop supplied
- WHEN a store row is displayed
- THEN the Activate button IS rendered
- AND clicking it calls the provided handler

#### Scenario: S-PRES-OPTIONAL-4 — Deactivate button present when handler provided

- GIVEN `StoreList` is rendered with `onDeactivate` prop supplied
- WHEN a store row is displayed
- THEN the Deactivate button IS rendered
- AND clicking it calls the provided handler

#### Scenario: S-PRES-OPTIONAL-5 — management/stores passes both handlers (no behavior change)

- GIVEN `StoreListPage` (management) is rendered with both `onActivate` and `onDeactivate` wired
- WHEN a store row is displayed
- THEN both Activate and Deactivate buttons are visible and functional
- AND all existing management/stores tests pass unchanged
