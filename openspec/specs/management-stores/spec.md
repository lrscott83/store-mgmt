# Delta for management-stores

Angular is the source of truth: `frontend/src/app/management/stores/edit-store/edit-store.component.ts` (53, 58-59, 62-63, 216-225). React target: `frontend-react/apps/web-store-pos/app/management/stores/**`.

## REMOVED Requirements

### Requirement: List-Table Route at management/stores
(Reason: Angular has no list view for this audience — `management/stores`, `/create`, `/edit/:id` all resolve to the single `EditStoreComponent`. React's `store-list.tsx` route/component and lifecycle buttons have no Angular equivalent here.)

### Requirement: Offline Cache Layer in Management
(Reason: Angular `store.service.ts` is pure HTTP with no local persistence. React's `BaseRepository<Store>` cache + degraded/offline banner is an invented layer with no Angular counterpart and MUST be deleted from this flow.)

## ADDED Requirements

### Requirement: Unified Edit-Store Route Model
The system MUST render all three URLs (`/management/stores`, `/management/stores/create`, `/management/stores/edit/:id`) via one component that resolves `storeId = params.id ?? user.selectedStoreId ?? ''` and switches title/mode on its truthiness. No list table MUST render at any of the three URLs.

#### Scenario: No id param, user has a selected store
- GIVEN a user visits `/management/stores` and `user.selectedStoreId` is set
- WHEN the route resolves
- THEN the form renders in edit mode for that store with title "Editar la tienda"

#### Scenario: Create route with no selected store
- GIVEN a user visits `/management/stores/create` and has no `selectedStoreId`
- WHEN the route resolves
- THEN the form renders in create mode with title "Crear una tienda"

#### Scenario: Explicit edit id param
- GIVEN a user visits `/management/stores/edit/:id`
- WHEN the route resolves
- THEN `storeId` is the param value, mode is edit, title is "Editar la tienda"

### Requirement: HTTP-Only Data Access
The system MUST NOT read from or write to any local/offline cache for stores inside `management/stores`; all reads/writes go through `storeHttpService` directly, and no offline/degraded notice MUST render.

#### Scenario: Fetch and save go straight to HTTP
- GIVEN the unified edit form loads or submits
- WHEN a store is fetched or saved
- THEN only an HTTP call executes, no cache read/write occurs, and no offline/degraded banner text is rendered

### Requirement: No Lifecycle Actions in Management
The unified edit form MUST NOT render Approve, Disapprove, Activate, or Deactivate controls.

#### Scenario: Lifecycle controls absent
- GIVEN the unified edit form renders in any mode
- WHEN the DOM is inspected
- THEN no Approve/Disapprove/Activate/Deactivate control exists

### Requirement: Field-Name-Aware Required Validation
Required-field validation messages MUST name the specific field, matching Angular, instead of a generic message.

#### Scenario: Owner missing
- GIVEN the form is submitted with the owner field empty
- WHEN validation runs
- THEN the message "El propietario es obligatorio." is shown

#### Scenario: Payment start date missing
- GIVEN the form is submitted with payment start date empty
- WHEN validation runs
- THEN the message "La fecha de inicio de pago es obligatoria." is shown

### Requirement: Shared Visual Chrome
The unified form MUST use the shared `Button`/`Card`/`InfoBox` components and shared icon set (matching the Expenses module) instead of raw markup.

#### Scenario: Form renders with shared components
- GIVEN the unified edit form is rendered
- WHEN the component tree is inspected
- THEN `Button`, `Card`, and `InfoBox` (for errors) are used, with icons from `shared/components/ui/icons.tsx`

### Requirement: Spanish Text Parity, No Voseo
All Stores-flow copy MUST match Angular text exactly and use neutral (non-voseo) register.

#### Scenario: Titles match Angular
- GIVEN create or edit mode renders
- WHEN the title displays
- THEN it reads exactly "Crear una tienda" or "Editar la tienda" respectively

#### Scenario: Error copy is register-neutral
- GIVEN an error message renders in the Stores flow
- WHEN the text is inspected
- THEN it reads "Intente de nuevo." (or equivalent formal form), never "Intentá" or "Conectate"

### Requirement: Correct isActive/isSuperAdmin Gating Preserved
The system MUST keep gating any store activation-status control on `isSuperAdmin` and MUST NOT replicate Angular's template bug of showing the control for `isOwnerAdmin` without wiring it.

#### Scenario: Non-super-admin sees no dangling control
- GIVEN a user with `isOwnerAdmin` but not `isSuperAdmin`
- WHEN any store activation-status control would render
- THEN it is not shown (no visible-but-unwired control)

### Requirement: Soft Refresh After Update
After a successful store update, the system MUST refresh the current user via `getMe()` + `updateUser` instead of a hard page reload.

#### Scenario: Update succeeds
- GIVEN the edit form submits an update successfully
- WHEN the success handler runs
- THEN `getMe()` is called and the store updates via `updateUser`, with no `document.location.reload()`

### Requirement: deactivateStore Is Removed As Rule-12 Invention

`storeHttpService.deactivateStore(id)` MUST NOT exist, because Angular's `store.service.ts` has no
deactivate/delete method for stores, and in React only its own test file references it — no UI
consumer exists (no store-list delete/deactivate action anywhere in `management/stores`).

**Rules**: 10 (call-site parity — zero live UI consumers), 12 (no invention — no Angular method
of this name or purpose to mirror).

#### Scenario: No production call-site references deactivateStore
- GIVEN `storeHttpService`
- WHEN grepping `apps/web-store-pos` (excluding `__tests__`) for `deactivateStore(`
- THEN zero matches are found outside test files

#### Scenario: Method and its tests are removed together
- GIVEN `deactivateStore` is removed from `storeHttpService`
- WHEN the removal lands
- THEN its dedicated test case is removed from `store-http-service.test.ts`
- AND the full test suite and typecheck still pass
