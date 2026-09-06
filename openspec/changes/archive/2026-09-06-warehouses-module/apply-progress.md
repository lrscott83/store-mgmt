# Apply Progress: warehouses-module

**Status**: COMPLETED — all 20 tasks done, all suites green.
**Executor**: inline orchestrator (sub-agent delegation unavailable this session).
**Date**: 2026-09-06

## Phase 1: Catalog Foundation — DONE

- [x] 1.1 `ModuleType.Warehouses = 13` (`[Description("Almacenes")]`)
- [x] 1.2 `FeatureType.WarehouseStockMovements = 37` (`[Description("Movimientos de almacén")]`)
- [x] 1.3 `StoreRoleFeatures.WarehousesAdmin` repointed `HasModule(Inventory)` → `HasModule(Warehouses)`; new `WarehouseStockMovementsAdmin` (OwnerAdmin only)
- [x] 1.4 Module HasData: id 13, order 110, priceIncluded:false, price 2, discount 0, percent 100, available, active
- [x] 1.5 Feature HasData: 36 (module 13, order 72) + 37 (module 13, order 73), Spanish descriptions
- [x] 1.6 `dotnet build backend/src/SMCA.sln` — 0 errors (172 pre-existing warnings)

## Phase 2: Migration + Backfill — DONE

- [x] 2.1 `WarehousesModuleBackfill.cs` — shared SQL constants (StoreModuleSql, StoreRoleFeatureSql, DownSql); CreatedBy = SuperAdmin GUID
- [x] 2.2 Generated `20260905224007_Add-Warehouses-Module` — InsertData module 13 + features 36/37 only (as predicted)
- [x] 2.3 Hand-extended Up (`migrationBuilder.Sql` backfill calls) + Down (`DownSql` then DeleteData, FK order)
- [x] 2.4 Snapshot diff verified: exactly +32 lines (module 13 + features 36/37), no EF surprises
- [x] 2.5 E2E suite green — BUT with one fix en route: initial backfill SQL had alias bug (`f."Id"` referenced but VALUES aliased `v`) → PostgresException 42P01 on first fixture run (378 failed). Fixed to `v."Id"`; migration re-applied cleanly (`dotnet ef database update`); suite then 392/392.

## Phase 3: VPS Script — DONE

- [x] 3.1 `backend/scripts/11-20260905-Add-Warehouses-Module.sql` — transaction, catalog INSERTs (parity with InsertData), per-store INSERT-SELECTs (same SQL as backfill constants — verified line 42 alias correct from the start), setval Feature/Module, `__EFMigrationsHistory` row ('20260905224007_Add-Warehouses-Module', '8.0.3' per Designer), verification SELECTs, rollback notes
- [x] 3.2 `backend/scripts/README.md` — script table entry added (11 with migration id)

## Phase 4: E2E Tests — DONE (NEW files only)

- [x] 4.1 `WarehousesCatalogTests.cs` (4 tests) — module 13 shape, GetCurrentPrice(2,100,0)=0, features 36/37 under 13, activate idempotent (count==1)
- [x] 4.2 `WarehousesAssignmentTests.cs` (3 tests) — backfill SQL exact runtime shapes (snapshot cols, TenantId, SuperAdmin CreatedBy), inactive store skipped, double execution no-op
- [x] 4.3 `WarehousesRuntimePathsTests.cs` (2 tests) — Register assigns module 13 + OwnerAdmin SRFs; Toggle Paid→Free deactivates module 13 + SRFs
- [x] 4.4 `WarehousesBillingTests.cs` (1 test) — Free store (PaymentStartDate null) keeps PlanType "Free" + getMe exposes 36/37 + module 13
- [x] 4.5 `--filter Warehouses` 10/10 green

### Fixes during test authoring (self-corrections, no existing test touched)
1. Expression trees reject `is 36 or 37` — switched to `int[] WarehouseFeatureIds` + `Contains`.
2. Missing usings (`Microsoft.EntityFrameworkCore`, `FeatureSeed` in `SMCA.WebApi.E2ETests.Features` namespace).
3. Billing test premise corrected twice (both my errors, verified against code):
   - `PlanType` was "Paid" with `AuthzSeed.SeedOwnerAdminAsync` because that seed sets PaymentStartDate=today (trial) — BillingService.cs:58 requires `PaymentStartDate is null` for "Free" → switched to `BillingSeed.SeedFreeStoreAsync`.
   - getMe resolves everything from `user.SelectedStoreId` — `SeedFreeStoreAsync` does not set it → test now sets it (pattern from AuthzSeed / StoreCreationTrialTests.SetSelectedStoreIdAsync, with `AsTracking` + `Update` trap avoided by tracked query + Save).

## Phase 5: Verification — DONE

- [x] 5.1 Full suites: **E2E 402/402** (392 existing untouched + 10 new), **Application.Tests 355/355**, **Domain.UnitTests 22/22**. `git status` proves only new files under `Warehouses/`; existing test/support files unmodified.
- [x] 5.2 Script 11 ↔ migration parity reviewed: catalog values identical to InsertData; per-store SQL identical to backfill constants (which the assignment E2E executes verbatim); setval + history row per script 03 conventions.

## Deviations from plan

- None in scope. Two mechanical fixes (SQL alias bug, test compile errors) — standard apply-time corrections, resolved within the same tasks.

## Known follow-ups (out of scope)

- Frontend: menu group for module 13, collapsible panels, popup create/edit, count/cost header (next change).
- VPS: run script 11 on production (user operational step, after review).
- Commit: work uncommitted (user's uncommitted sales/ files present — do not sweep them into a commit).

## Files touched

Modified (8): ModuleType.cs, FeatureType.cs, StoreRoleFeatures.cs, ModuleEntityTypeConfiguration.cs, FeatureEntityTypeConfiguration.cs, ApplicationDbContextModelSnapshot.cs (generated), backend/scripts/README.md, CLAUDE.md (user-approved mandate update).
New (7): migration 20260905224007_Add-Warehouses-Module.cs (+Designer), WarehousesModuleBackfill.cs, script 11-20260905-Add-Warehouses-Module.sql, 4 E2E files under Warehouses/.
