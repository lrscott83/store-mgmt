# Tasks: H-15 — Server-side DG-7 plan lock in UpdateStoreCommandHandler

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350–420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single commit-only branch (no PR) |
| Delivery strategy | Session override: commit-only branch, no PR |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

> Design's ~300 estimate confirmed against detailed count (~390 incl. both new test files) — Medium. No chain needed: delivery is commit-only on a new branch, no PR review gate. Threat matrix: all rows N/A (no routing/shell/VCS/executable boundary) — omitted.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Lock guard + resx keys + unit tests | Commit 1 | `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~UpdateStoreCommandHandlerLockTests"` | N/A — mocked unit layer, no runtime boundary | Revert guard block + resx keys + delete unit test file |
| 2 | 4 lock E2E tests | Commit 2 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StorePlanLockTests"` | Real PostgreSQL smca_test via WebAppFixture | Delete StorePlanLockTests.cs |
| 3 | store-fixture direct-DB seeding | Commit 3 | `pnpm test:e2e` (focused: store-plan-activation.spec.ts) | Real backend + pg Client vs smca_test (E2E_DB_URL ?? DEFAULT_DB_URL) | Revert store-fixture.ts to PUT seeding (must ship with Unit-1 revert) |

## Phase 1: RED Unit Tests (lock logic)

- [x] 1.1 Create `backend/src/Application.Tests/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommandHandlerLockTests.cs` — RED: OwnerAdmin (IsSuperAdmin=false, IsSuperAdminOrOwnerAdmin=true), store modules [7 free, 6 paid], PUT [7] → `ValidationException` with `Errors` containing `Code == "PlanLocked"` (Moq IHttpContextService, IGetStoreByIdService, IStringLocalizer<I18n>["PlanLocked"]); run filter → fails.
- [x] 1.2 Same file, no-false-rejection pins: same set [7,6] → no throw; free store [7] + paid request → no throw; IsSuperAdmin=true + changed set → no throw; stub downstream repos (`_storeRepository.Where`→empty, module/StoreModule/StoreRoleFeature/feature repos, generator, `SaveChangesAsync`→1); assert `SaveChangesAsync` called (these pass on baseline).

## Phase 2: Guard + i18n Keys (GREEN)

- [x] 2.1 Add `<data name="PlanLocked" xml:space="preserve">` (ES text) to `backend/src/Resources/Localization/I18n.resx`.
- [x] 2.2 Add `PlanLocked` (EN text) to `backend/src/Resources/Localization/I18n.en.resx`; indexer access only — no `I18n.Designer.cs` regen.
- [x] 2.3 Insert lock guard in `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` after null-store guard (:77), before duplicate-name check (:78): `!IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded)` + distinct-sorted `request.ModuleIds` vs active ids `SequenceEqual` → `ValidationException { Errors = new List<Error> { new Error("PlanLocked", _localizer["PlanLocked"]) } }`; zero extra queries.
- [x] 2.4 Run 1.1/1.2 filter → all GREEN.

## Phase 3: E2E (ADD-only) — RED → GREEN

- [x] 3.1 Create `backend/src/SMCA.WebApi.E2ETests/Stores/StorePlanLockTests.cs`: `OwnerAdmin_changes_modules_on_paid_store_returns_400_PlanLocked` — `BillingSeed.SeedPaidStoreAsync` [7,6], OwnerAdmin PUT [7] → 400 + `Errors.Contain(e => e.Code == "PlanLocked")`.
- [x] 3.2 Same file: `OwnerAdmin_rename_only_on_paid_store_returns_200` — same seed, PUT [7,6] + new name → 200.
- [x] 3.3 Same file: `OwnerAdmin_activates_free_store_returns_200` — `SeedFreeStoreAsync` [7], PUT [7,6] → 200.
- [x] 3.4 Same file: `SuperAdmin_changes_modules_on_paid_store_returns_200` — `DbTestHelpers.SeedSuperAdminAsync` + `SeedPaidStoreAsync`, PUT [7] → 200.
- [x] 3.5 Run StorePlanLockTests filter → GREEN (RED vs baseline, GREEN after 2.3); cleanups per BillingSeed.CleanupAsync convention. Note: OwnerAdmin actor seeded via `AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)` because BillingSeed users have `SelectedStoreId = Guid.Empty`, which the StoresController `[HasPermission]` filter rejects (403) — matches the StoreCreationTrialTests:286-325 pin pattern.

## Phase 4: Seeding Fixture (authorized Option B)

- [x] 4.1 In `frontend-react/e2e/support/store-fixture.ts` `degradeStoreToFreePlan` (:119-183): replace PUT with pg `Client` (`E2E_DB_URL` ?? `DEFAULT_DB_URL`, per global-teardown.ts:27); BEGIN → `DELETE StoreRoleFeature`, `DELETE StoreModule` WHERE StoreId=$1 → INSERT free-only modules FROM `Module` (design SQL, `$2::int[]`, migration columns) → COMMIT; keep re-GET pinning (module ids + paymentStartDate non-null); Store row untouched. Note: `pg`/`@types/pg` were declared in package.json+lockfile but never installed — ran `pnpm install --prefer-offline`.
- [x] 4.2 Update file header comment (:5-18) — H-15 lock is now server-side; PUT-seeding rationale obsolete. Verified: `playwright test --list` loads all 55 tests; `store-plan-activation.spec.ts` 2/2 passed against `http-e2e` backend (one earlier failure was a pre-existing navigation-timing flake in `session.ts` `mintOwnerAdmin` — occurs before the fixture, unrelated to this change).

## Phase 5: Verification & Commits

- [x] 5.1 Full backend suite: `dotnet test backend/src/SMCA.sln` — Domain 22/22, Application 341/341 (incl. 4 new lock unit tests), SMCA.WebApi.E2ETests 354/354. Pin tests StoreCreationTrialTests/StoreAuthorizationTests green within the 354.
- [x] 5.2 Frontend: `store-plan-activation.spec.ts` 2/2 passed against `http-e2e` backend (S2-01/S2-02 green with direct-DB seeding).
- [x] 5.3 Commits (conventional, no AI attribution): WU1 `feat(store): enforce DG-7 plan lock for paid stores` (Phase 1+2); WU2 `test(e2e): cover plan lock on PUT /stores/{id}` (Phase 3); WU3 `test(e2e): seed free plan via direct DB` (Phase 4). Angular legacy 4xx already documented in delta spec — no code.
