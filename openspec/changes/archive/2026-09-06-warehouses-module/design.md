# Design: Warehouses Module (backend catalog + migration + VPS script + E2E)

## Technical Approach

Extend the catalog (enums + `HasData`) so EF generates a migration inserting Module 13 + Features 36/37; hand-extend that migration with `migrationBuilder.Sql` INSERT-SELECTs assigning module + OwnerAdmin features to every existing ACTIVE store; mirror everything in `backend/scripts/11-*.sql`; prove it with NEW E2E files. Matches proposal Approach 1 and specs WMC-1..4 / WMA-1..5 / WM-TE1..4.

## Architecture Decisions

### Decision: Module id and feature split
**Choice**: `ModuleType.Warehouses = 13` (Elaboration keeps reserved 12); `FeatureType.WarehouseStockMovements = 37`; 36 = warehouse CRUD (keeps current frontend meaning).
**Alternatives considered**: Warehouses=12 (renumbers Elaboration doc); 36=movements (breaks live frontend gate).
**Rationale**: user decisions 2026-09-05; 36's existing frontend meaning is production truth.

### Decision: Catalog seeding via HasData (not runtime command, not raw-SQL-only migration)
**Choice**: seed Module 13 + Features 36/37 in `ModuleEntityTypeConfiguration` / `FeatureEntityTypeConfiguration` `HasData`; EF generates `InsertData` in the migration.
**Alternatives considered**: raw-SQL-only migration (snapshot divergence — next generated migration would emit DeleteData); runtime `ActivateFeaturesCommand` (user required migration).
**Rationale**: repo convention (all 11 modules seeded via HasData); snapshot stays authoritative; fixture applies it on every E2E run.

### Decision: Per-store assignment via hand-extended migrationBuilder.Sql
**Choice**: after the generated `InsertData` block, add `migrationBuilder.Sql` INSERT-SELECTs:
```sql
INSERT INTO "StoreModule" ("StoreId","ModuleId","ModulePriceIncluded","Price","ModulePrice",
  "ModuleDiscountPrice","ModulePercentDiscountPrice","TenantId","IsActive","CreatedDate","CreatedBy")
SELECT s."Id", 13, FALSE, 2, 2, 0, 100, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE
ON CONFLICT ("StoreId","ModuleId") DO NOTHING;

INSERT INTO "StoreRoleFeature" ("StoreId","RoleId","FeatureId","TenantId","IsActive","CreatedDate","CreatedBy")
SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(), '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (36),(37)) AS v("Id") ON TRUE
WHERE s."IsActive" = TRUE
ON CONFLICT ("StoreId","RoleId","FeatureId") DO NOTHING;
```
**Alternatives considered**: pure EF entities in migration (no SQL control over "existing stores only"); runtime backfill command (non-compliant).
**Rationale**: first repo migration doing per-store INSERTs; `ON CONFLICT` gives idempotency; SuperAdmin GUID (`DataUtils.SuperAdminUser.Id`) as `CreatedBy`; audit columns match `AuditableEntity` (InitialCreate.cs:245-259, 82-115). `UpdatedDate/UpdatedBy` left NULL (insert-only).

### Decision: StoreRoleFeatures enum entries stay OwnerAdmin-only
**Choice**: `WarehousesAdmin` repointed `[HasModule(ModuleType.Warehouses)]`; new `WarehouseStockMovementsAdmin` with `[HasRoles(RoleType.OwnerAdmin)] [HasFeature(FeatureType.WarehouseStockMovements)] [HasModule(ModuleType.Warehouses)]`.
**Alternatives considered**: adding StoreUser to roles (frontend e2e test 11 asserts StoreUser is logged out of /inventory/warehouses).
**Rationale**: user said "available to the store owner role"; existing WarehousesAdmin precedent; StoreUser exclusion verified by existing frontend E2E.

### Decision: VPS script 11 mirrors the migration exactly
**Choice**: `backend/scripts/11-<YYYYMMDD>-Add-Warehouses-Module.sql` = transaction + same catalog INSERTs + same INSERT-SELECTs + `setval` fix-ups (Feature/Module sequences) + `__EFMigrationsHistory` row + verification SELECTs.
**Alternatives considered**: relying on `dotnet ef database update` on VPS (production never auto-migrates; README documents manual scripts).
**Rationale**: established script pipeline (01–10); production applies via script, dev/test via EF.

### Decision: E2E proves migration SQL via re-execution, not via fixture timing
**Choice**: WM-TE2 seeds a store + owner, extracts the exact SQL text from the migration class (shared static class holding the SQL constants, pattern `PaymentStartDateBackfill.cs`), executes it via EF raw SQL against the seeded store, asserts exact row shapes.
**Alternatives considered**: relying on the fixture having applied the migration before stores exist (cannot — migration runs before stores are seeded).
**Rationale**: same SQL string powers migration + script + test → single source of truth, proven thrice.

## Data Flow

```
HasData (Module 13, Feature 36/37) ──ef migrations add──▶ generated InsertData migration
                                                                      │
                                              hand-extend: migrationBuilder.Sql ◀── WarehousesModuleBackfill.Sql (static const)
                                                                      │
                          ┌───────────────────────────────────────────┼──────────────────────────────┐
                          ▼                                           ▼                              ▼
              EF migration on smca_test          script 11 on VPS (same SQL)          WM-TE2 re-executes SQL
              (fixture applies per run)          (transaction + setval +             (asserts row shapes +
                          │                        history row)                       idempotency)
                          ▼
        Register / CreateStore / UpdateStore / ToggleStorePlan ──runtime──▶ StoreModule(13) + SRF(2,36/37)
                          │
                          ▼
              getMe → FeatureIds 36/37, StoreModuleIds 13 → sidebar shows "Almacenes"
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Domain/Common/Enums/ModuleType.cs` | Modify | `Warehouses = 13` + `[Description("Almacenes")]` |
| `backend/src/Domain/Common/Enums/FeatureType.cs` | Modify | `WarehouseStockMovements = 37` + description; (36 exists) |
| `backend/src/Domain/Common/Enums/StoreRoleFeatures.cs` | Modify | Repoint `WarehousesAdmin` HasModule → 13; add `WarehouseStockMovementsAdmin` |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/ModuleEntityTypeConfiguration.cs` | Modify | HasData module 13 (order 110, priceIncluded:false, price 2, percent 100, available, active) |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/FeatureEntityTypeConfiguration.cs` | Modify | HasData feature 36 (moved to module 13) + 37 (descriptions in Spanish, orders 72/73) |
| `backend/src/Infrastructure/Migrations/<ts>_Add-Warehouses-Module.cs` (+ .Designer, snapshot) | Create | Generated catalog InsertData + hand Sql per-store block |
| `backend/src/Infrastructure/Migrations/WarehousesModuleBackfill.cs` | Create | Static SQL constants (per-store INSERT-SELECTs) shared by migration, script, tests |
| `backend/scripts/11-<YYYYMMDD>-Add-Warehouses-Module.sql` | Create | VPS mirror (transaction, setval, history row, verification) |
| `backend/scripts/README.md` | Modify | Add script 11 entry |
| `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesCatalogTests.cs` | Create | WM-TE1: catalog shape + activate idempotency |
| `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesAssignmentTests.cs` | Create | WM-TE2: SQL re-execution shapes + idempotency |
| `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesRuntimePathsTests.cs` | Create | WM-TE3: Register/Toggle paths |
| `backend/src/SMCA.WebApi.E2ETests/Warehouses/WarehousesBillingTests.cs` | Create | WM-TE4: Free store keeps module, getMe exposure |
| `openspec/specs/warehouses-module-catalog/spec.md`, `.../warehouses-module-assignment/spec.md` | Create | At archive: main specs |

## Interfaces / Contracts

```csharp
// ModuleType.cs
[Description("Almacenes")] Warehouses = 13,
// FeatureType.cs
[Description("Movimientos de almacén")] WarehouseStockMovements = 37,
// StoreRoleFeatures.cs (Inventory region)
[HasRoles(RoleType.OwnerAdmin)] [HasFeature(FeatureType.Warehouses)]
[HasModule(ModuleType.Warehouses)] WarehousesAdmin,                    // HasModule: Inventory → Warehouses
[HasRoles(RoleType.OwnerAdmin)] [HasFeature(FeatureType.WarehouseStockMovements)]
[HasModule(ModuleType.Warehouses)] WarehouseStockMovementsAdmin,
// WarehousesModuleBackfill.cs
public static class WarehousesModuleBackfill {
    public const string StoreModuleSql = "...";   // INSERT-SELECT module 13 for active stores
    public const string StoreRoleFeatureSql = "..."; // INSERT-SELECT SRF(2, 36/37) for active stores
    public const string DownSql = "...";            // inverse deletes (SRF first, then StoreModule)
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E (WM-TE1) | Catalog rows exact post-migration; activate idempotent | Query Module/Feature via fixture DbContext; call POST /Features/activate; assert count==1 |
| E2E (WM-TE2) | Assignment SQL shapes + idempotency | Seed store+owner (`AuthzSeed`), execute `WarehousesModuleBackfill` SQL verbatim, assert columns vs CreateStoreService shape; run twice |
| E2E (WM-TE3) | Runtime assignment | Register new store → assert StoreModule(13)+SRFs; ToggleStorePlan Paid→Free → module 13 + SRFs deactivated |
| E2E (WM-TE4) | Billing shape | Free store + module 13 → PlanType "Free", getMe exposes 36/37 + module 13 to OwnerAdmin |
| Existing suites | No regression | Full E2E + Application.Tests run (FeatureSeed semantics shift verified safe) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Pure data-catalog/migration change with tests.

## Migration / Rollout

1. Dev: config changes → `dotnet ef migrations add Add-Warehouses-Module --project src/Infrastructure --startup-project src/SMCA.WebApi` → hand-extend Up (call `migrationBuilder.Sql(WarehousesModuleBackfill.StoreModuleSql)` etc.) and Down (reverse order: SRF → StoreModule → catalog DeleteData, matching generated Down).
2. `smca_test` proves apply via fixture on every E2E run.
3. VPS: run script 11 (transaction; aborts on error → no partial state).
4. Rollback: script inverse (documented at bottom of script 11) or `dotnet ef database update <previous>` locally.

## Open Questions

- [ ] `Order` values: module 13 = 110 (after Credits' 100); features 36→72 / 37→73 (matching ActivateFeaturesCommand's order 72 for 36). Confirm during tasks.
- [ ] `__EFMigrationsHistory` product version for script 11: read from the generated `.Designer.cs` (EF 8.x). Confirm at apply time.
