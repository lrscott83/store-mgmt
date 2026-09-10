# Design — owner-multistores-store-creation

## D1 — Backend authorization architecture (two-gate, defense-in-depth)

**Gate 1 (action level):** StoresController.CreateStoreAsync attribute `[HasPermission(StoreRoleFeatures.SuperAdmin)]` → `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]`.
- SuperAdmin: passes (claim short-circuit, HasPermissionAttribute.cs:84).
- OwnerAdmin: AllowedFeaturesService path — needs feature 73 (StoresAdmin ⇒ FeatureType.Stores, module Management=7) in billing-filtered modules of the SELECTED store. Owner viewing /management/my-stores always has 73 (page gate is featureLoader([EFeatures.Stores])). Owner without 73/without module 7 → 403 at gate 1.
- StoreUser with granted feature 73: **PASSES gate 1** — HasUserAnyFeatureInStoreAsync (StoreRoleFeatureRepository.cs:66-76) matches StoreRoleFeature rows regardless of RoleType. This is why gate 2 exists.
- ReSeller: allowed features = OwnersAdmin/StorePaymentAdmin only (AllowedFeaturesService.cs:51-58) — 73 never present → 403 at gate 1.
- Class-level gate (SuperAdmin, StoresAdmin) skips when the action has its own attribute (HasPermissionAttribute.cs:57-78) — unchanged mechanics.

**Gate 2 (handler, CreateStoreCommandHandler):**
```
if (!IsSuperAdmin && !IsOwnerAdmin) → ApiException 403   // StoreUser lands here (E2E pin: 403 not 400)
if (IsOwnerAdmin):
    ownOwner = _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(UserExternalId.ToGuid())
    ownOwner null → 403
    if (request.OwnerId != Guid.Empty && request.OwnerId != ownOwner.Id) → 403   // foreign owner blocked; empty = "derive mine"
    selectedStoreId = _httpContextService.StoreId.ToGuid(); if empty → 403
    storeModules = _storeModuleRepository.GetAvailableModulesByStoreIdAsync(selectedStoreId)
    billing = _billingService.GetStoreBillingSummaryAsync(selectedStoreId)
    if (!StoreBillingUtils.FilterForBilling(storeModules, billing).Contains((int)ModuleType.MultiStores)) → 403   // billing parity with session (Vencido filters paid modules)
    moduleIds = (await _storeModuleRepository.GetStoreModulesByIdAsync(selectedStoreId)).Select(sm => sm.ModuleId).ToList()
    if empty → 403   // selected store without modules: nothing to inherit, fail closed
    approved = true (forced, decision 6); ownerId = ownOwner.Id
SuperAdmin branch: byte-identical to current handler (body controls everything).
```
New handler DI: + IStoreModuleRepository, + IBillingService (both already registered — used by GetMeQuery/HasPermissionAttribute).

## D2 — Validator branching (CreateStoreCommandValidator)

Inject IHttpContextService (validators registered via AddValidatorsFromAssembly, constructor DI works). Branch:
- Common to both: Name NotNull/NotEmpty/IsUniqueName (unchanged — owner duplicate names must still 400).
- IsOwnerAdmin: SKIP OwnerId rules and SKIP ModuleIds rules (both derived/checked in handler; body ModuleIds=[] and ownerId=zero-Guid are the owner-branch contract).
- SuperAdmin (or non-owner): current rules unchanged.
Alternative REJECTED: frontend sends inherited moduleIds in the body — requires the frontend to know the exact server-side module set and would race with plan edits; server derivation is authoritative (user decision 3).

## D3 — Frontend owner-branch request contract

storeHttpService.createStore payload reused verbatim (no service change). Owner modal submits:
{ ownerId: '00000000-0000-0000-0000-000000000000' (zero-Guid string — binds to Guid.Empty on every .NET version, no converter edge-cases), name, address: '', description: '', approved: true, moduleIds: [] }
Backend maps empty OwnerId → caller's own owner (D1). SuperAdmin flow keeps sending real ownerIds from listOwners (unchanged — edit-store.tsx untouched).

## D4 — UI design (my-stores.tsx + create-store-modal.tsx)

my-stores.tsx:
- Header becomes <div className="flex items-center justify-between"> with existing h1 + new Button variant="fab" data-testid="my-stores-create-button" (PlusIcon + STORES.CREATE_STORE_BUTTON label) — pattern from admin/stores/store-list.tsx:107-113.
- Visibility: `const showCreateStore = Boolean(user?.isOwnerAdmin) && isModuleAvailable(user, EModules.MultiStores)` (authorization-service.ts:49-51 — same gate as Configurations store-switcher). SuperAdmin on this view: hidden (owner affordance).
- State: creating (bool) + reuse modalBusy/modalError. handleCreateSave: createStore(payload from D3) → close modal, showToastSuccess(STORES.CREATE_SUCCESS), await load() (list refetch shows the new card; NO getUserByToken — no session-affecting change; selectedStoreId NOT repointed, user switches via existing store-switcher when wanted).
- Catch → setModalError(httpErrorKey(err, 'STORES.ERROR')) — modal stays open.

create-store-modal.tsx (NEW): byte-pattern of EditStoreModal (components/edit-store-modal.tsx) minus isActive checkbox: overlay role=dialog aria-modal, max-w-md card, single labeled name input (label STORES.NAME, input data-testid="create-store-name-input", id="create-store-name-input"), inline validation STORES.NAME_REQUIRED on empty/whitespace trim, error <p role="alert">, buttons Cancelar (GENERAL.CLOSE) + Guardar (STORES.SAVE, data-testid="create-store-submit", disabled isLoading). data-testid="create-store-modal" on dialog. Reset state on open.

## D5 — i18n (es.ts)
New keys only (verified style during apply): STORES.CREATE_STORE_BUTTON: 'Tienda'; STORES.CREATE_SUCCESS: success toast (match STORES.UPDATE_SUCCESS phrasing). Reuse existing: STORES.NAME, STORES.NAME_REQUIRED, STORES.CREATE_TITLE (modal title 'Crear una tienda'), STORES.SAVE, STORES.SAVING, STORES.ERROR, GENERAL.CLOSE.

## D6 — Test architecture

**Backend E2E — NEW Stores/OwnerCreateStoreTests.cs** (local private seed helper inside the file — NO modification to shared StoreSeed/AuthzSeed, per E2E-untouchable rule):
SeedOwnerWithMultiStoresAsync: user+owner+store (StorePlanId default; PaymentStartDate=today ⇒ AlDia), StoreModules {7, 14}, UserRole OwnerAdmin, SelectedStoreId=store. Returns fixture + cleanup (StoreRoleFeature/StoreModule/Store/UserRole/Owner/User sweep, AuthzSeed.CleanupStoreGraphAsync shape).
Matrix:
- OC-01 no token → 401
- OC-02 StoreUser with granted feature 73 (AuthzSeed.SeedStoreUserAsync) → 403, nothing persisted (pins handler gate 2 — the case that passes action gate)
- OC-03 OwnerAdmin with only module 7 (StoreSeed.SeedStoresAdminUserAsync) → 403, nothing persisted, SelectedStoreId unchanged
- OC-04 owner WITH {7,14}, zero-Guid ownerId, valid unique name → 201 + Location; DB asserts: Approved=true, IsActive=true, StorePlanId=3, PaymentStartDate=today, StoreModule ids == {7,14} (inheritance pin), StoreRoleFeature rows exist for new store; SelectedStoreId NOT repointed; cleanup
- OC-05 owner WITH {7,14}, foreign Guid ownerId → 403, nothing persisted
- OC-06 SuperAdmin regression in new-branch world: create for seeded owner with modules {7}, approved=false → 201, Approved=false, modules {7} (body-controlled parity; complements untouchable StoreCreateTests)
- OC-07 owner Vencido: seed store with PaymentStartDate=2 years ago + {7,14} (billing Vencido ⇒ FilterForBilling keeps only PriceIncluded ⇒ 14 filtered) → 403, nothing persisted (billing-parity pin)

**Backend E2E — AUTHORIZED UPDATE Stores/StoreCreateAuthorizationGapTests.cs:**
- Existing test 1 (OwnerAdmin, no module 14): still 403 (now from handler module-check). Update header comment to document new two-gate rule.
- Existing test 2 (StoreUser, 403 not 400): still 403 (now from handler gate 2 — action gate passes with feature 73). Comment update.
- ADD test 3: owner WITH {7,14} + foreign ownerId → 403 + no side effects (uses the same local seed helper shape; the file is authorized for modification).

**Application.Tests — NEW CreateStoreCommandHandlerTests + CreateStoreCommandValidatorOwnerTests** (mocked, free to add): handler — store-user 403, owner happy (moduleIds derived from selected store, approved forced true, ownerId resolved), owner no-14 403, owner foreign 403, owner selectedStoreId empty 403, owner vencido-filter 403, superadmin parity (body approved false, body moduleIds pass through). Validator — owner skips OwnerId/ModuleIds rules (empty lists bind), superadmin rules intact, Name rules still apply to owner.

**Playwright — NEW e2e/owner-create-store.spec.ts** (persona owner-admin; register seeds ALL modules incl 14 ⇒ button visible by default):
- PC-1: /management/my-stores → create button visible.
- PC-2 happy: click → modal → unique name → submit → new card with that name appears (grid refetch); API readback: GET /v1/stores/my-stores contains new store; module id set of new store == module id set of the reference store (inheritance pin through the real API).
- PC-3 hidden: degradeStoreToFreePlan(page, selectedStoreId) (support/store-fixture.ts:128 — free modules only ⇒ 14 removed) → reload my-stores → button ABSENT. Feature 73 survives (module 7 is free ⇒ page still renders — precondition assertStoresFeature first).
- PC-4 error: create name X, then attempt X again → modal stays open with error visible (duplicate 400).
Cleanup: created stores share the persona's owner ⇒ existing e2e-% global teardown sweep (same guarantee owner-stores.spec.ts:58-60 documents).

**Vitest — NEW __tests__/my-stores-create-button.test.tsx** (extends my-stores.test.tsx mock pattern — separate file, no edits to existing test): button hidden (storeModuleIds []), visible ([14] + isOwnerAdmin), hidden for isSuperAdmin, modal open/close, empty-name validation (no service call), submit payload exact-match (zero-Guid, approved true, moduleIds []), success → toast + getMyStores refetch + modal closed, failure → error + modal open, button hidden while loading? (no — keep button stable).

## D7 — Files inventory (final)

Production backend (3): StoresController.cs (attribute only), CreateStore/CreateStoreCommand.cs (handler branch + DI), CreateStore/CreateStoreCommandValidator.cs (branch + DI).
Production frontend (3): management/stores/routes/my-stores.tsx (header/button/modal wiring), management/stores/components/create-store-modal.tsx (NEW), shared/lib/i18n/es.ts (+2 keys).
Tests (7): E2E backend NEW OwnerCreateStoreTests.cs; E2E backend UPDATED StoreCreateAuthorizationGapTests.cs (authorized); Application.Tests NEW handler tests + NEW validator tests; Playwright NEW owner-create-store.spec.ts; vitest NEW my-stores-create-button.test.tsx.

## D8 — Risks & mitigations (from exploration, resolved)
- R2/R3 (validator/handler coupling): ship together, OC matrix covers the seam.
- R5 (Playwright persona has 14 by default): PC-3 uses degradeStoreToFreePlan — verified free ids include 7 (feature 73 survives).
- R7 (SuperAdmin visits my-stores): button gated on isOwnerAdmin — hidden.
- R8 (trial clock): new store PaymentStartDate=today via CreateStoreService (shared path, unchanged) — documented consequence, accepted.
- Zero-Guid binding: full string '00000000-0000-0000-0000-000000000000' avoids any System.Text.Json converter ambiguity.