# Proposal: Warehouses Module (paid catalog module, backend + migration + E2E)

## Intent

Stores need warehouse management (warehouse CRUD + stock movements between warehouse and store). The frontend already ships an offline-only warehouses page gated by `FeatureType.Warehouses` (36), but the backend has NO warehouse module: no module catalog row, no seeded feature, no per-store assignment. A store gets the menu item only if a SuperAdmin happens to run the `activate` endpoint first — which is why the module does not show in menus today. This change turns Warehouses into a first-class paid catalog module assigned to every existing active store, delivered via an EF migration plus a mirrored VPS SQL script, with backend E2E coverage.

## Scope

### In Scope
- `ModuleType.Warehouses = 13` catalog module (paid: `Price=2`, `PercentDiscountPrice=100` → effective 0; `AvailableToStore=true`; `PriceIncluded=false`) seeded via `HasData`.
- Two features: `Warehouses = 36` (warehouse CRUD — keeps its current frontend meaning) and `WarehouseStockMovements = 37` (movements: purchase in, transfers, sale out), both seeded via `HasData` under module 13, with `StoreRoleFeatures` enum entries gated to `RoleType.OwnerAdmin` only.
- EF migration: catalog inserts (module 13 + features 36/37) + INSERT-SELECT assignment of module + features to every EXISTING ACTIVE store (OwnerAdmin role), idempotent via `ON CONFLICT DO NOTHING`.
- VPS script `backend/scripts/11-<date>-Add-Warehouses-Module.sql` replicating the migration exactly (script conventions: transaction, setval fix-ups, `__EFMigrationsHistory` row, verification SELECTs).
- NEW backend E2E test files only: catalog shape post-migration, assignment runtime paths (Register/CreateStore/UpdateStore), migration-SQL re-execution against a seeded store, billing interactions.

### Out of Scope
- Backend warehouse domain entities/endpoints/API (no Warehouse CRUD API server-side; warehouses stay offline-first in the frontend) — the 2026-09-04 warehouses frontend plan already covers that.
- Frontend work (menu visibility with module 13, collapsible panels, popup create/edit, stock-count header) — later change.
- `WarehouseOfflineService`/sync changes, elaboration module (keeps reserved id 12), modification of `ActivateFeaturesCommand` (dead branch for 36 becomes harmless).
- Modifying any existing E2E test or support file.

## Capabilities

### New Capabilities
- `warehouses-module-catalog`: Module 13 + features 36/37 catalog seeding (HasData), pricing (2/100%/0), availability flags, and enum wiring (`ModuleType`, `FeatureType`, `StoreRoleFeatures` with OwnerAdmin-only gating).
- `warehouses-module-assignment`: Per-store assignment of the Warehouses module and its features to existing active stores via EF migration SQL (INSERT-SELECT with audit columns, TenantId propagation, idempotency), mirrored 1:1 in VPS script 11.

### Modified Capabilities
- `testing`: NEW backend E2E test files covering catalog post-migration state, runtime assignment paths, migration-SQL re-execution, and billing interaction of module 13 (existing test files untouched).

## Approach

Approach 1 from exploration: extend `HasData` configs (module + features) → generate EF migration (yields `InsertData` for catalog) → hand-extend the migration with `migrationBuilder.Sql` INSERT-SELECTs into `StoreModule`/`StoreRoleFeature` for existing active stores (pattern: `UpdateModulePricesV3` + script 03) → mirror everything in `backend/scripts/11-*.sql`. E2E fixture auto-applies the migration, proving apply-cleanliness on every run.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Domain/Common/Enums/ModuleType.cs` | Modified | Add `Warehouses = 13` |
| `backend/src/Domain/Common/Enums/FeatureType.cs` | Modified | Add `WarehouseStockMovements = 37` (36 exists) |
| `backend/src/Domain/Common/Enums/StoreRoleFeatures.cs` | Modified | `WarehousesAdmin` re-pointed to module 13 + new `WarehouseStockMovementsAdmin` (OwnerAdmin only) |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/ModuleEntityTypeConfiguration.cs` | Modified | HasData: module 13 (price 2, 100% discount) |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/FeatureEntityTypeConfiguration.cs` | Modified | HasData: features 36 (now under module 13) + 37 |
| `backend/src/Infrastructure/Migrations/` + `ApplicationDbContextModelSnapshot.cs` | New | Migration: catalog + per-store assignment SQL |
| `backend/scripts/11-*.sql` + README | New | VPS script mirroring the migration |
| `backend/src/SMCA.WebApi.E2ETests/` | New files | Catalog/assignment/billing E2E tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Feature 36 seeding flips E2E `FeatureSeed` semantics (36 becomes always-present) | Medium | Verified safe: `RestoreAsync` deletes 36 only when snapshot saw it absent; existing tests keep passing; run full suite to confirm |
| First-ever per-store INSERT migration; wrong audit columns/TenantId shape breaks prod | Medium | Copy exact `StoreRoleFeature.Create`/`StoreModule.Create` column shapes; `ON CONFLICT DO NOTHING`; VPS script review; E2E re-execution test |
| Snapshot divergence if migration doesn't match HasData | Low | Generate migration from the config changes (EF keeps snapshot authoritative) |
| Elaboration plan renumber (12 → 13→14) confusion | Low | One-line doc update in elaboration plan is out of scope; note recorded in proposal |
| Billing side effects (Vencido stores lose module) | Low | Confirmed desired by user (consistent with other paid modules) |

## Rollback Plan

Migration `Down` drops catalog rows and (hand-written) removes per-store rows. VPS script wrapped in a transaction with verification SELECTs; on failure, rollback restores pre-state. `git revert` of the commit restores code; `dotnet ef database update <previous>` locally. StoreModule/StoreRoleFeature deletes must respect FK order (StoreRoleFeature before StoreModule).

## Dependencies

- PostgreSQL `smca_test` running locally for E2E (fixture applies migrations).
- Elaboration plan doc keeps id 12; Warehouses takes 13 (user decision 2026-09-05).

## Success Criteria

- [ ] Migration applies cleanly on `smca_test` (fixture proves it on every E2E run) and on prod-shaped data (script 11 review + re-execution test).
- [ ] Every existing active store ends with `StoreModule(ModuleId=13)` + `StoreRoleFeature(RoleId=2, FeatureId 36/37)` rows.
- [ ] Catalog: Module 13 (price 2, PercentDiscountPrice=100, effective 0) + features 36/37 seeded; menu-visible for OwnerAdmin after re-login.
- [ ] New stores get module 13 automatically at registration.
- [ ] All existing backend E2E + unit tests still pass; new E2E tests cover catalog, assignment, billing.
- [ ] Script 11 runs idempotently on a VPS-shaped database (transaction + verification).
