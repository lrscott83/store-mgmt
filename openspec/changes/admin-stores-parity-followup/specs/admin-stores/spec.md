# Delta for admin-stores

Followup to Stage 4 (`management-stores-parity`, archived). Closes 3 residual gaps in `store-card-list.tsx` per Angular `store-list.component.html:27-39`. Angular is the sole source of truth.

## MODIFIED Requirements

### Requirement: Card-Grid List Uses Shared Chrome
The sole lifecycle list at `/admin/stores` MUST render as a Card grid using shared `Card`/`Button` components and icons, replacing raw table markup. Each card MUST show Approve XOR Disapprove — never both — based on `store.approved`: unapproved stores (`approved=false`) show only Approve; approved stores (`approved=true`) show only Disapprove. Activate/Deactivate controls MUST NOT render.
(Previously: rendered both Approve and Disapprove buttons unconditionally, with no exclusivity by approval state.)

#### Scenario: Grid renders with shared components
- GIVEN a super-admin visits `/admin/stores`
- WHEN the list renders
- THEN each store is a `Card` with `Button`-based actions and no Activate/Deactivate control

#### Scenario: Approved store shows only Disapprove
- GIVEN a store with `approved=true`
- WHEN its card renders
- THEN only the Disapprove button is shown
- AND clicking it invokes `onDisapprove(store.id)`

#### Scenario: Unapproved store shows only Approve
- GIVEN a store with `approved=false`
- WHEN its card renders
- THEN only the Approve button is shown
- AND clicking it invokes `onApprove(store.id)`

## ADDED Requirements

### Requirement: Store Card Visual Lifecycle State
Each store card MUST reflect lifecycle state via a state className, matching the `owner-card-list.tsx getCardClass` convention. Inactive state (`isActive=false`) MUST render the danger style (`bg-danger/10 border border-danger`). Unapproved-but-active state (`approved=false`, `isActive=true`) MUST render the success/highlight style (`bg-success/10 border border-success`). A normal store (`isActive=true`, `approved=true`) MUST render no extra state class. When a store is both inactive and unapproved, the inactive (danger) style MUST take precedence.

#### Scenario: Inactive store shows danger style
- GIVEN a store with `isActive=false`
- WHEN its card renders
- THEN the card applies the danger state class

#### Scenario: Unapproved active store shows success style
- GIVEN a store with `approved=false` and `isActive=true`
- WHEN its card renders
- THEN the card applies the success state class

#### Scenario: Normal store has no extra state class
- GIVEN a store with `approved=true` and `isActive=true`
- WHEN its card renders
- THEN no extra state class is applied

#### Scenario: Inactive precedence over unapproved
- GIVEN a store with `isActive=false` and `approved=false`
- WHEN its card renders
- THEN only the danger state class is applied, not the success class

### Requirement: Store List Create Label Copy Parity
The store list's create/add action MUST display the literal text "Adicionar", matching Angular's `GENERAL.ADD` key usage (`store-list.component.html`), replacing the prior "Crear tienda" copy.

#### Scenario: Create label reads Adicionar
- GIVEN an admin views `/admin/stores`
- WHEN the create/add action renders
- THEN its visible text reads "Adicionar"
