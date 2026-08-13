# Tasks: H-10 — Enforce SuperAdmin-only store creation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60 (1 controller + ~7 handler + ~50 tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit-only change on feature branch (no PR) |
| Delivery strategy | ask-on-risk → resolved: commit-only, authorization granted 2026-08-12 |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Commit | Focused test command | Runtime harness | Rollback boundary |
|------|------|--------|----------------------|-----------------|-------------------|
| 1 | Rewrite gap tests to 403 semantics (RED) | `test(store)` | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreCreateAuthorizationGap"` | E2E suite itself: WebAppFixture + real PostgreSQL `smca_test` (migrations auto-applied) | revert `StoreCreateAuthorizationGapTests.cs` |
| 2 | POST action SuperAdmin attribute | `feat(store)` | same filter → green | same | revert `StoresController.cs` line 83 addition |
| 3 | Handler guard 403 + drop re-point | `feat(store)` | same filter → green | same | revert `CreateStoreCommand.cs:50-61` |
| 4 | Stores + S1-01 regression | none (verify only) | Stores filter + Billing/Auth registration filters | same | n/a — verification only, no code change |

## Phase 1: RED — Rewrite gap E2E tests for 403 semantics

- [x] 1.1 `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` test 1 (:30-61): assert `HttpStatusCode.Forbidden`; drop 201/Location/`created` asserts; assert no `Store` row for `name` and no `StoreModule` for it (`IgnoreQueryFilters`); assert `user.SelectedStoreId == sa.StoreId` (unchanged); cleanup only `CleanupStoresAdminAsync(_f, sa)` (nothing persisted → drop `CleanupStoreAsync`)
- [x] 1.2 Test 2 (:63-85): assert 403 (not 400); drop `ApiResponse` body reads (`ForbidResult` = empty body); keep no-`Store`-row assert (`s.Name == name`); keep `CleanupStoreGraphAsync`
- [x] 1.3 Update header comment (:12-19): document corrected rule (R2.10/R2.11 403 semantics, R2.12 regression guard)
- Evidence: filter run shows both tests failing (201/400 observed vs 403 expected) — RED confirmed

## Phase 2: GREEN — Action-level SuperAdmin gate

- [x] 2.1 `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` `CreateStoreAsync` (:83-85): add `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (mirror siblings :113/:129/:144/:159); add `[ProducesResponseType(StatusCodes.Status403Forbidden)]`
- Evidence: gap filter green; `StoreCreateTests` SuperAdmin 201-persistence green (R2.12); `Create_without_token_returns_401` green

## Phase 3: GREEN — Handler hardening, dead code removed

- [x] 3.1 `backend/src/Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs` (:50-51): `IsSuperAdminOrOwnerAdmin` → `IsSuperAdmin`; `HttpStatusCode.BadRequest` → `HttpStatusCode.Forbidden` (R2.14, defense for direct MediatR callers)
- [x] 3.2 `CreateStoreCommand.cs` (:57-61): delete OwnerAdmin `SelectedStoreId` re-point branch (`IsOwnerAdmin` + `UpdateAsync`)
- Evidence: gap filter green; `dotnet build backend/src/SMCA.sln` clean

## Phase 4: Regression — Stores area + S1-01

- [x] 4.1 Stores area: `dotnet test ... --filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Stores"` — SuperAdmin 201 persistence, 401, sibling 403s (`StoreAuthorizationTests`), validation 400s all green
- [x] 4.2 S1-01: `StoreCreationTrialTests` (Billing) + `AuthRegisterDataAssertionsTests` (Auth) green — `RegisterCommand.cs:82` → `ICreateStoreService` bypass untouched (verified: separate call site from `CreateStoreCommand.cs:54`)
- [x] 4.3 Commit per work-unit-commits (conventional commits, no AI attribution, tests with code); commit-only on the feature branch — NO PR creation

## Notes

- Threat matrix: all rows N/A (design) — no RED threat tasks.
- Out of scope (do NOT touch): `StoresController.cs:88-90` 200-wrapped failure; `RegisterCommand.cs`; `CreateStoreService.cs`; frontend; migration/audit of prior OwnerAdmin stores.
- Constraint: modifying existing E2E tests (`StoreCreateAuthorizationGapTests.cs`) is user-authorized 2026-08-12 (Approach D).
