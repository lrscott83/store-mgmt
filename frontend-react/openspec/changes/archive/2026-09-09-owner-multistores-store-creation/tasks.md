# Tasks — owner-multistores-store-creation

## Review Workload Forecast
- Estimated changed lines (production + tests): ~1,150–1,400 (tests dominate: ~900–1,100 across 5 new test files + 1 authorized update; production ~250–300).
- 400-line budget risk: **High** (exceeds 400).
- Chained PRs recommended: **No** — user chose local commits on the same branch (2026-09-09 preflight: "nada de PR, commit en la misma rama local"). delivery_strategy recorded as single-branch local commits; size:exception accepted implicitly by that choice.
- Decision needed before apply: **No** (delivery strategy already decided by user).

## Work units (order matters; WU2+WU3 ship together)

### WU1 — Backend: handler + validator + controller gate
Files: CreateStoreCommand.cs (handler branch per D1 + DI), CreateStoreCommandValidator.cs (branch per D2), StoresController.cs (attribute per D1).
- [ ] 1.1 Add action-level attribute [HasPermission(SuperAdmin, StoresAdmin)] to CreateStoreAsync
- [ ] 1.2 Handler: gate 2 (!IsSuperAdmin && !IsOwnerAdmin → 403) BEFORE any repository call
- [ ] 1.3 Handler owner branch: resolve own owner (GetByUserIdIgnoreQueryFiltersAsync); null → 403; foreign/empty-nonzero OwnerId rules per D1; selected-store MultiStores billing-filter check → 403; derive moduleIds from GetStoreModulesByIdAsync; empty → 403; approved=true forced
- [ ] 1.4 Validator: inject IHttpContextService; owner branch skips OwnerId+ModuleIds rules; Name rules unchanged for all
- [ ] 1.5 Build: dotnet build backend/src/SMCA.sln green
Verify: build green + existing Application.Tests untouched-green (validator DI change may affect existing validator unit tests — check and fix within WU scope; Application.Tests is freely editable per repo rules)

### WU2 — Backend E2E: new matrix + authorized update
Files: NEW Stores/OwnerCreateStoreTests.cs (OC-01..OC-07 per D6, local seed helper, no shared-seed edits), UPDATED Stores/StoreCreateAuthorizationGapTests.cs (comments + new foreign-owner test, both existing tests keep passing unchanged).
- [ ] 2.1 Write local SeedOwnerWithMultiStoresAsync + cleanup (AuthzSeed.CleanupStoreGraphAsync pattern)
- [ ] 2.2 OC-01..OC-07 matrix
- [ ] 2.3 Update StoreCreateAuthorizationGapTests.cs (authorized): header comment refresh + ADD foreign-owner 403 test
- [ ] 2.4 dotnet test backend/src/SMCA.WebApi.E2ETests (full suite — no regression on any existing test)
Verify: full backend E2E suite green (PostgreSQL localhost:5432/smca_test required)

### WU3 — Backend unit tests (Application.Tests)
Files: NEW CreateStoreCommandHandlerTests.cs + CreateStoreCommandValidatorOwnerTests.cs (mocked per D6).
- [ ] 3.1 Handler tests: store-user 403; owner happy (derived modules, forced approved, resolved ownerId); owner no-14 403; owner foreign 403; owner empty StoreId 403; owner vencido 403; superadmin parity
- [ ] 3.2 Validator tests: owner skips OwnerId/ModuleIds rules; Name rules still enforced for owner; superadmin rules intact
- [ ] 3.3 dotnet test backend/src/Application.Tests green
Verify: Application.Tests green

### WU4 — Frontend: modal + button + i18n
Files: NEW create-store-modal.tsx, my-stores.tsx (header+button+handler), es.ts (+STORES.CREATE_STORE_BUTTON 'Tienda', +STORES.CREATE_SUCCESS).
- [ ] 4.1 CreateStoreModal component (D4: name-only, data-testids, validation, busy/error props)
- [ ] 4.2 my-stores.tsx: showCreateStore gate (isOwnerAdmin && isModuleAvailable(user, EModules.MultiStores)), flex header, button (PlusIcon, fab variant, data-testid), creating state, handleCreateSave (D3 payload: zero-Guid ownerId, approved:true, moduleIds:[]), success toast + load() refetch, error path
- [ ] 4.3 es.ts keys
- [ ] 4.4 pnpm typecheck + pnpm lint green (frontend-react/)
Verify: typecheck+lint green

### WU5 — Frontend unit tests (vitest)
Files: NEW __tests__/my-stores-create-button.test.tsx (per D6 matrix).
- [ ] 5.1 Visibility matrix tests (hidden [], visible [14], hidden superadmin)
- [ ] 5.2 Modal flow tests (open, empty-name no-call, payload exact, success toast+refetch+close, error stays open)
- [ ] 5.3 pnpm test green
Verify: vitest green

### WU6 — Playwright spec
Files: NEW e2e/owner-create-store.spec.ts (PC-1..PC-4 per D6).
- [ ] 6.1 PC-1 button visible; PC-2 happy path with API module-inheritance readback; PC-3 degradeStoreToFreePlan → hidden (assertStoresFeature precondition first); PC-4 duplicate-name error
- [ ] 6.2 Run spec against real backend: npx playwright test e2e/owner-create-store.spec.ts
Verify: new spec green; existing specs untouched (git status clean on e2e/ except the new file)

### WU7 — Full no-regression + commit
- [ ] 7.1 dotnet test backend/src/SMCA.sln (full suite green)
- [ ] 7.2 pnpm lint + typecheck + test + build (frontend-react/)
- [ ] 7.3 git status review — confirm ONLY: 3 backend prod files, 1 frontend route, 1 new component, es.ts, 5 new test files, 1 authorized updated test file, openspec/ artifacts
- [ ] 7.4 Work-unit commits (same branch, no PR — user instruction): WU1+WU3 "feat: owner store creation gate in CreateStore (backend)", WU2 "test: owner store creation E2E matrix", WU4+WU5 "feat: my-stores create button + modal (frontend)", WU6 "test: owner create store playwright spec", WU7 docs/artifacts if any

## Strict TDD: OFF (sdd/store-mgmt/testing-capabilities — explicit override; comprehensive suite exists)
## Preflight cache: auto · both (engram+openspec) · local commits same branch · 400-line budget acknowledged (tests-heavy change, user informed via this forecast)