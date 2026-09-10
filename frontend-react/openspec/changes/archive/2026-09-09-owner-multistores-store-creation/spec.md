# Spec — owner-multistores-store-creation

## ADDED Requirements

### Requirement: Owner store creation via POST /v1/stores
The stores create endpoint SHALL admit OwnerAdmin callers meeting all gates, with owner-branch semantics (own-owner-only, derived modules, forced approved), while preserving the SuperAdmin contract byte-for-byte.

#### Scenario: OwnerAdmin with MultiStores creates own store
- **WHEN** an authenticated OwnerAdmin (selected store has module 14 billing-active) POSTs /v1/stores with body OwnerId = own OwnerId, Name = unique, Address/Description = "", Approved = true, ModuleIds = []
- **THEN** the response is 201 with Location /v1/stores/{id} and the persisted Store has Approved=true, IsActive=true, OwnerId = caller's owner, StorePlanId=Superior, PaymentStartDate=today, StoreModule rows equal to the selected store's module ids, and StoreRoleFeature rows generated for the inherited feature set

#### Scenario: OwnerAdmin without MultiStores gets 403
- **WHEN** an OwnerAdmin whose selected store lacks module 14 (or billing Vencido filtered it out) POSTs /v1/stores
- **THEN** the response is 403 and NO Store/StoreModule/StoreRoleFeature rows are persisted and SelectedStoreId is not repointed

#### Scenario: OwnerAdmin creating for another owner gets 403
- **WHEN** an OwnerAdmin (MultiStores active) POSTs with body OwnerId ≠ own OwnerId
- **THEN** the response is 403 and nothing is persisted

#### Scenario: StoreUser and ReSeller get 403
- **WHEN** a StoreUser (even holding feature 73 via StoreRoleFeature) or a ReSeller POSTs /v1/stores
- **THEN** the response is 403 (action gate: StoresAdmin roles = OwnerAdmin only) and nothing is persisted

#### Scenario: SuperAdmin contract unchanged
- **WHEN** a SuperAdmin POSTs with arbitrary valid body (OwnerIds of others, Approved as sent, ModuleIds chosen)
- **THEN** behavior is byte-identical to today: 201, body-controlled modules/approved, Location header (pinned by existing untouchable StoreCreateTests)

#### Scenario: Unauthenticated caller gets 401
- **WHEN** no bearer token POSTs /v1/stores
- **THEN** the response is 401 (pinned by existing StoreCreateTests)

#### Scenario: Validation on owner branch
- **WHEN** an OwnerAdmin (MultiStores active) POSTs with empty Name or duplicate Name or unknown body OwnerId
- **THEN** the response is 400 with the SAME error codes as today (Name required/unique, OwnerId OwnerNotFound); empty ModuleIds is NOT a validation error on the owner branch (modules are server-derived)

### Requirement: "+ Tienda" button and creation modal in my-stores view
The owner's my-stores view SHALL show a right-aligned header button (PlusIcon + "Tienda") visible ONLY to OwnerAdmin users whose session storeModuleIds includes MultiStores (14); clicking opens a name-only creation modal; successful creation reloads the list (new card appears) and shows a success toast.

#### Scenario: Button visibility matrix
- **WHEN** user.isOwnerAdmin && storeModuleIds includes 14 → button visible
- **WHEN** OwnerAdmin without 14 (free plan, or paid-but-Vencido) → button absent from the DOM
- **WHEN** SuperAdmin views /management/my-stores → button absent (owner-only affordance)

#### Scenario: Creation happy path
- **WHEN** the owner clicks "+ Tienda", types a name, submits
- **THEN** POST /v1/stores fires with (own ownerId, name, address:"", description:"", approved:true, moduleIds:[]); on 201 the modal closes, STORES.CREATE_SUCCESS toast shows, and the cards grid refetches showing the new store (inheriting the selected store's plan shape — same plan type/next-due-date derivation as siblings)

#### Scenario: Validation and error display
- **WHEN** name is empty/whitespace → STORES.NAME_REQUIRED inline error, NO service call
- **WHEN** the POST fails (e.g., duplicate name 400, or 403) → modal stays open with the localized error message, list unchanged

#### Scenario: Button hidden state is session-driven
- **WHEN** session storeModuleIds lacks 14 the button is absent; the page itself still renders (page gate is feature 73, unchanged)

## CONSTRAINTS (repo rules, binding)
- Existing E2E tests untouchable EXCEPT backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs (user-authorized update: keep owner-without-module 403 pin, add MultiStores variants).
- New E2E coverage ONLY in new files (backend OwnerCreateStoreTests.cs, frontend e2e/owner-create-store.spec.ts, vitest __tests__/my-stores-create-button.test.tsx, Application.Tests CreateStoreCommandHandlerTests).
- Unit/integration tests freely editable.
- Backend production changes: StoresController.cs, CreateStoreCommand.cs, CreateStoreCommandValidator.cs ONLY (all user-approved).
- Frontend production changes: my-stores.tsx, NEW create-store-modal.tsx, es.ts (new keys), nothing else. store-http-service.ts unchanged.
- No migration. No new endpoints. No DTO changes.