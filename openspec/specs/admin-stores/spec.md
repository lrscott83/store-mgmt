# Delta for admin-stores

Angular is the source of truth: `frontend/src/app/admin/stores/store-list/store-list.component.ts` (60-203), template (40-50, dead-coded Activate/Deactivate). React target: `frontend-react/apps/web-store-pos/app/admin/stores/**`.

## MODIFIED Requirements

### Requirement: Approve/Disapprove Require Confirmation
The system MUST prompt a confirm dialog (`confirmDialog` from `shared/lib/blocking-alert.ts`) before executing Approve or Disapprove, and MUST only call the HTTP action when the user confirms.
(Previously: React fired the Approve/Disapprove request immediately with no confirmation step.)

#### Scenario: Approve confirmed
- GIVEN a super-admin clicks Approve on a store
- WHEN the confirm dialog opens with title "Confirmación para aprobar" and message "¿Está seguro que desea aprobar esta tienda?"
- AND the admin selects "Si"
- THEN the approve HTTP call executes and the list reloads

#### Scenario: Approve cancelled
- GIVEN a super-admin clicks Approve on a store
- WHEN the confirm dialog opens and the admin selects "No"
- THEN no HTTP call executes and the store's status is unchanged

#### Scenario: Disapprove confirmed
- GIVEN a super-admin clicks Disapprove on a store
- WHEN the confirm dialog opens with title "Confirmación para desaprobar" and message "¿Está seguro que desea desaprobar esta tienda?"
- AND the admin selects "Si"
- THEN the disapprove HTTP call executes and the list reloads

## REMOVED Requirements

### Requirement: Activate/Deactivate Controls
(Reason: Angular dead-codes these controls out of its DOM — they must not render in React's admin/stores grid regardless of role, matching Angular's actual (not just template-declared) behavior.)

## ADDED Requirements

### Requirement: Card-Grid List Uses Shared Chrome
The sole lifecycle list at `/admin/stores` MUST render as a Card grid using shared `Card`/`Button` components and icons, replacing raw table markup.

#### Scenario: Grid renders with shared components
- GIVEN a super-admin visits `/admin/stores`
- WHEN the list renders
- THEN each store is a `Card` with `Button`-based Approve/Disapprove actions and no Activate/Deactivate control

### Requirement: Confirm-Dialog Copy Parity
Confirm dialog titles/messages MUST use the exact Spanish copy defined for approve/disapprove, and buttons reuse `GENERAL.YES` ("Si") / `GENERAL.NO` ("No").

#### Scenario: Dialog copy matches spec
- GIVEN either confirm dialog opens
- WHEN its text is inspected
- THEN title and message match the approve/disapprove copy exactly, with "Si"/"No" buttons
