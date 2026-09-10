# Proposal — owner-multistores-store-creation

## Why
Owners with the MultiStores module (14, Superior/VIP plans) currently cannot create additional stores themselves: POST /v1/stores is SuperAdmin-only (StoresController.cs:137) and no owner-facing UI exists (/management/stores/create is edit-mode-locked for OwnerAdmin by untouchable E2E S2-03). Today the owner must ask a SuperAdmin to create each store.

## What Changes
1. **Backend rule (production, user-approved 2026-09-09):** POST /v1/stores admits a second caller class — an OwnerAdmin whose SELECTED store has MultiStores (14) active after billing filtering. Rules: SuperAdmin branch unchanged (body controls everything, Approved as sent, 201 pinned by untouchable StoreCreateTests). OwnerAdmin branch: body OwnerId must equal the caller's own OwnerId (else 403); MultiStores must be active on the selected store via the billing-filtered module check (else 403); moduleIds are DERIVED from the selected store's StoreModule rows (inheritance); approved=true forced; address/description from body (frontend sends empty). New store = immediately usable and switchable (StoreRoleFeatures auto-generated, Owner relation gives SetMyStore reach — no StoreUser row needed for owners).
2. **Frontend:** "+ Tienda" button in /management/my-stores header (right-aligned, PlusIcon + "Tienda"), visible only when user.isOwnerAdmin && storeModuleIds includes EModules.MultiStores. Opens CreateStoreModal (name-only form, EditStoreModal pattern) → storeHttpService.createStore → toast + list reload. Address/description editable later via existing gear→Editar.
3. **Tests:** Update StoreCreateAuthorizationGapTests.cs (the ONLY existing E2E file user authorized): owner WITHOUT MultiStores still 403 (existing fixtures unchanged), ADD owner WITH MultiStores creating for ANOTHER owner → 403, owner WITH MultiStores own store → 201. NEW OwnerCreateStoreTests.cs (backend E2E): full matrix — 401, store-user 403, reseller 403, owner-no-module 403, owner-foreign-owner 403, owner-vencido-billing 403, owner happy 201 (inherits modules, approved=true, plan fields, no SelectedStoreId repoint), SuperAdmin parity 201. NEW owner-create-store.spec.ts (Playwright): button visible (persona has module 14 by default), hidden after degradeStoreToFreePlan, happy-path create via modal (card appears), error path. NEW vitest file for button/modal. NEW Application.Tests handler tests (owner branch: gates, inheritance, forced approved).

## Impact
- Production backend: StoresController.cs (action gate), CreateStoreCommand.cs (handler branch), CreateStoreCommandValidator.cs (owner branch skips moduleIds validation, keeps OwnerId/Name rules).
- Production frontend: my-stores.tsx (header + modal wiring), NEW create-store-modal.tsx, es.ts (+3 keys), store-http-service unchanged (createStore payload reused; owner branch sends moduleIds:[] + approved:true).
- All new E2E/unit test files listed above; ONE existing E2E file updated (user-authorized).
- No migration, no new endpoint, no DTO changes, no menu/route changes.

## Non-goals
- No changes to /admin/stores (superadmin flow), /management/stores/create (edit-mode behavior stays), store-plan view, DG-7 locks, or the register flow (register keeps seeding all modules).
- No owner auto-switch to the new store (no selectedStoreId repoint); no bulk creation; no per-store user management at creation.
- No changes to any other existing E2E test (backend or frontend).

## User decisions encoded (2026-09-09)
Button in my-stores view; SuperAdmin keeps access; owner-with-MultiStores creates only for self; inherit selected store's modules; in-view modal; name-only form; approved=true; backend+frontend E2E + update StoreCreateAuthorizationGapTests.cs; MultiStores gate on selected store (billing-filtered → Vencido hides button + 403).

## Consequences to accept (flagged from exploration)
- New store starts its trial clock today (PaymentStartDate=now, Superior plan id) — same as every CreateStoreService path. "Hereda módulos" inherits the module SET, not payment history.
- Owner creating a store while on Vencido billing loses the button AND gets 403 (paid modules filtered out).
- SuperAdmin visiting /management/my-stores does NOT see the + button (gate isOwnerAdmin).