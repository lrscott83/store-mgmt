# Spec: Admin → Stores Parity

**Capability**: React `app/admin/stores/**`  
**Source of Truth**: Angular `frontend/src/app/admin/stores/store-list/**`  
**Status**: Stage 5 (admin-stores-parity-followup)

---

## Requirements

### Requirement: Approve/Disapprove Require Confirmation

Approve and Disapprove actions on a store card MUST trigger a confirmation dialog before executing the HTTP call. The dialog MUST use the shared confirmDialog (from `shared/lib/blocking-alert.ts`).

- **Approve Dialog**: Title "Confirmación para aprobar", Message "¿Está seguro que desea aprobar esta tienda?"
- **Disapprove Dialog**: Title "Confirmación para desaprobar", Message "¿Está seguro que desea desaprobar esta tienda?"
- Confirmed ("Si") → Issue HTTP call + reload list
- Cancelled ("No") → No HTTP call; status unchanged

#### Scenario: Approve triggers confirmation
- GIVEN a super-admin views a store card
- WHEN the user clicks Approve
- THEN a confirmation dialog appears with the approve title and message
- AND if confirmed, the HTTP call executes

#### Scenario: Disapprove triggers confirmation
- GIVEN a super-admin views a store card
- WHEN the user clicks Disapprove
- THEN a confirmation dialog appears with the disapprove title and message
- AND if confirmed, the HTTP call executes

#### Scenario: Cancelled confirmation does not execute call
- GIVEN a confirmation dialog is open
- WHEN the user clicks "No" (Cancel)
- THEN no HTTP call is made
- AND the store status remains unchanged

---

### Requirement: Confirm-Dialog Copy Parity

The confirmation dialogs for approve and disapprove actions MUST use exact Spanish copy matching the Angular implementation. Button text MUST reuse the shared `GENERAL.YES` ("Si") and `GENERAL.NO` ("No") keys.

#### Scenario: Dialog buttons use GENERAL.YES and GENERAL.NO
- GIVEN a confirm dialog is displayed
- WHEN the user sees the buttons
- THEN the confirm button reads "Si" (from GENERAL.YES)
- AND the cancel button reads "No" (from GENERAL.NO)

---

### Requirement: Card-Grid List Uses Shared Chrome

The sole lifecycle list at `/admin/stores` MUST render as a Card grid using shared `Card`/`Button` components and icons, replacing raw table markup. Each card MUST show Approve XOR Disapprove — never both — based on `store.approved`: unapproved stores (`approved=false`) show only Approve; approved stores (`approved=true`) show only Disapprove. Activate/Deactivate controls MUST NOT render.

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

---

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

---

### Requirement: Store List Create Label Copy Parity

The store list's create/add action MUST display the literal text "Adicionar", matching Angular's `GENERAL.ADD` key usage (`store-list.component.html`), replacing the prior "Crear tienda" copy.

#### Scenario: Create label reads Adicionar
- GIVEN an admin views `/admin/stores`
- WHEN the create/add action renders
- THEN its visible text reads "Adicionar"

---

### Requirement: Store List Surfaces succeeded:false via STORES.ERROR

`store-list.tsx`'s `loadStores` MUST treat a `succeeded: false` response from `storeHttpService.listStores()` the same as a thrown/rejected call: it MUST NOT call `setStores` with the response's `data` and MUST set the error state to `STORES.ERROR`, reusing the existing catch-branch idiom (the same idiom already used for `handleApprove`/`handleDisapprove` failures).

#### Scenario: List resolves with succeeded:false renders STORES.ERROR, not null stores
- GIVEN `storeHttpService.listStores()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN `loadStores` runs
- THEN `stores` state is NOT set to `null`
- AND the error banner is set to `STORES.ERROR`

**Note**: No change to the Approve/Disapprove confirmation flow, card-grid rendering, or lifecycle-state CSS specified above — only the list load's `succeeded: false` handling is added.
