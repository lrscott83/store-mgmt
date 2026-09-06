# Tasks: Warehouses Module (backend catalog + migration + VPS script + E2E)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1200-1500 (≈500 generated: Designer + snapshot; ≈700-900 E2E tests; ≈350 migration+script; ≈100 enums/configs) |
| 400-line budget risk | High (also above the session's 800-line budget) |
| Chained PRs recommended | No — user-mandated delivery: no PRs, direct commits on the same branch (2026-09-05) |
| Suggested split | Not applicable (no PRs); work units = reviewable commits |
| Delivery strategy | User override: same-branch commits, no PRs |
| Chain strategy | size:exception (single branch, maintainer accepted) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size:exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Commit | Focused test command | Runtime harness | Rollback boundary |
|------|------|--------|----------------------|-----------------|-------------------|
| 1 | Catalog + migration | feat(warehouses): module 13 catalog + assignment migration | `dotnet build backend/src/SMCA.sln` | `dotnet test backend/src/SMCA.WebApi.E2ETests` (existing suite proves migration applies) | enums+configs+migration files revert cleanly |
| 2 | VPS script | chore(warehouses): script 11 VPS mirror | `dotnet build backend/src/SMCA.sln` | N/A (SQL reviewed by parity test WM-TE2) | scripts/11 + README line |
| 3 | E2E coverage | test(warehouses): E2E catalog/assignment/runtime/billing | `dotnet test backend/src/SMCA.WebApi.E2ETests --filter Warehouses` | full suite | 4 new files only |

## Phase 1: Catalog Foundation (enums + HasData)

- [x] 1.1 `backend/src/Domain/Common/Enums/ModuleType.cs`: add `[Description("Almacenes")] Warehouses = 13` after Credits
- [x] 1.2 `backend/src/Domain/Common/Enums/FeatureType.cs`: add `[Description("Movimientos de almacén")] WarehouseStockMovements = 37` after Warehouses (36)
- [x] 1.3 `backend/src/Domain/Common/Enums/StoreRoleFeatures.cs`: repoint `WarehousesAdmin` `[HasModule(ModuleType.Inventory)]` → `[HasModule(ModuleType.Warehouses)]`; add `WarehouseStockMovementsAdmin` with `[HasRoles(RoleType.OwnerAdmin)] [HasFeature(FeatureType.WarehouseStockMovements)] [HasModule(ModuleType.Warehouses)]`
- [x] 1.4 `backend/src/Infrastructure/Persistence/EntityConfigurations/ModuleEntityTypeConfiguration.cs`: HasData Module 13 (order 110, priceIncluded:false, price:2, discount:0, percent:100, available:true, active:true)
- [x] 1.5 `backend/src/Infrastructure/Persistence/EntityConfigurations/FeatureEntityTypeConfiguration.cs`: HasData feature 36 (module 13, order 72, Spanish desc from ActivateFeaturesCommand.cs:96) + feature 37 (module 13, order 73)
- [x] 1.6 `dotnet build backend/src/SMCA.sln` green

## Phase 2: Migration + Backfill SQL

- [x] 2.1 Create `backend/src/Infrastructure/Migrations/WarehousesModuleBackfill.cs`: static SQL consts — StoreModuleSql (INSERT-SELECT module 13 for active stores, ON CONFLICT DO NOTHING), StoreRoleFeatureSql (RoleId=2, features 36/37), DownSql (SRF delete → StoreModule delete); CreatedBy = `38b96d85-bf75-41ca-bfd7-796e7fe0ebc8`
- [x] 2.2 Generate: `dotnet ef migrations add Add-Warehouses-Module --project src/Infrastructure --startup-project src/SMCA.WebApi` (from `backend/`); verify generated Up = InsertData module 13 + features 36/37 only
- [x] 2.3 Hand-extend migration Up: append `migrationBuilder.Sql(WarehousesModuleBackfill.StoreModuleSql)` + `.StoreRoleFeatureSql`; extend Down: `DownSql` + generated DeleteData (FK order: SRF before StoreModule)
- [x] 2.4 Verify snapshot + Designer updated; `dotnet build` green
- [x] 2.5 Apply on `smca_test` via `dotnet test backend/src/SMCA.WebApi.E2ETests` (existing suite; FeatureSeed semantics shift verified safe) — existing tests still green

## Phase 3: VPS Script

- [x] 3.1 Create `backend/scripts/11-<YYYYMMDD>-Add-Warehouses-Module.sql`: START TRANSACTION; catalog INSERTs (module 13, features 36/37 — same values as migration InsertData); `migrationBuilder.Sql` parity blocks (same SQL as WarehousesModuleBackfill); setval Feature/Module sequences; `__EFMigrationsHistory` row (id + version from generated Designer); verification SELECTs; COMMIT; rollback notes
- [x] 3.2 Update `backend/scripts/README.md`: script 11 entry (purpose, parity with migration id, VPS run order)

## Phase 4: E2E Tests (NEW files only — zero modifications to existing)

- [x] 4.1 `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesCatalogTests.cs`: WM-TE1 — module 13 shape exact (WMC-1a/1b), features 36/37 under 13 (WMC-2a), activate idempotent count==1 (WMC-2b)
- [x] 4.2 `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesAssignmentTests.cs`: WM-TE2 — seed active store+owner (AuthzSeed), execute WarehousesModuleBackfill SQL verbatim, assert StoreModule/SRF row shapes vs CreateStoreService (WMA-1a, 2a), inactive store skipped (WMA-1b), second execution no-op (WMA-1c)
- [x] 4.3 `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesRuntimePathsTests.cs`: WM-TE3 — Register assigns module 13 + SRFs (WMA-3a); ToggleStorePlan Paid→Free deactivates module 13 + SRFs (WMA-3c)
- [x] 4.4 `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesBillingTests.cs`: WM-TE4 — Free store keeps module visible, PlanType "Free" (billing summary), getMe exposes 36/37 + module 13 to OwnerAdmin (WMC-4a)
- [x] 4.5 `dotnet test backend/src/SMCA.WebApi.E2ETests --filter Warehouses` green; then full E2E suite + `Application.Tests` green

## Phase 5: Verification Close-out

- [x] 5.1 Full `dotnet test backend/src/SMCA.sln` green (no existing test modified — `git status` proves only new files under Warehouses/)
- [x] 5.2 Cross-check script 11 vs migration parity line-by-line (task 3.1 review); record evidence in apply-progress
