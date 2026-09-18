-- =====================================================
-- 19: Add Elaboration module (id 17, paid price 3, 100% discount)
--     + features 120 (Recipes) and 121 (Elaborations) under module 17
--     + StorePlanModule rows: Superior (3) and VIP (4)
--     + assignment to existing ACTIVE stores on Superior/VIP plans (OwnerAdmin only)
-- EF migration: 20260918153139_Add-Elaboration-Module
-- Date: 2026-09-18
-- Parity: catalog INSERTs, StorePlanModule INSERTs and per-store INSERT-SELECTs
--         mirror the EF migration exactly. The per-store SQL is the SAME text as
--         Infrastructure.Migrations.ElaborationModuleBackfill constants.
--         Requires scripts 12 (StorePlan) and 14 (StorePlanModule) already applied.
-- =====================================================

BEGIN;

-- --- Catalog: Module 17 (Elaboración, paid, effective price 0) ---
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (17, TRUE, 0, TRUE, 'Elaboración', 130, 100, 3, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- --- Catalog: Features 120 (Recipes) and 121 (Elaborations) under module 17 ---
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (120, TRUE, 'Funcionalidad para gestionar las recetas de elaboración de productos', TRUE, 17, 'Recetas', 240),
       (121, TRUE, 'Funcionalidad para registrar elaboraciones con consumo de insumos y costo real', TRUE, 17, 'Elaboraciones', 241)
ON CONFLICT ("Id") DO NOTHING;

-- --- Plan assignment: module 17 for Superior (3) and VIP (4) ---
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (3, 17), (4, 17)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: StoreModule rows for existing ACTIVE Superior/VIP stores ---
-- (same SQL as ElaborationModuleBackfill.StoreModuleSql)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 17, FALSE, 3, 3, 0, 100, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: OwnerAdmin (2) StoreRoleFeature rows for features 120/121 ---
-- (same SQL as ElaborationModuleBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (120), (121)) AS f("Id") ON TRUE
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;

-- --- Sequence fix-ups: explicit PK inserts do not advance serials ---
SELECT setval(
    pg_get_serial_sequence('"Feature"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Feature") + 1,
        nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
    false);
SELECT setval(
    pg_get_serial_sequence('"Module"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Module") + 1,
        nextval(pg_get_serial_sequence('"Module"', 'Id'))),
    false);

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260918153139_Add-Elaboration-Module', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 17;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" IN (120, 121);

SELECT sp."Id" AS plan_id, sp."Name" AS plan_name,
       COUNT(spm."ModuleId") AS module_count
FROM "StorePlan" sp
LEFT JOIN "StorePlanModule" spm ON spm."PlanId" = sp."Id"
WHERE sp."Id" IN (3, 4)
GROUP BY sp."Id", sp."Name"
ORDER BY sp."Id";

SELECT COUNT(*) AS superior_vip_stores_with_module
FROM "StoreModule" WHERE "ModuleId" = 17;

SELECT COUNT(*) AS role_features_granted
FROM "StoreRoleFeature" WHERE "FeatureId" IN (120, 121);

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" IN (120, 121);
-- DELETE FROM "StoreModule" WHERE "ModuleId" = 17;
-- DELETE FROM "StorePlanModule" WHERE "ModuleId" = 17;
-- DELETE FROM "Feature" WHERE "Id" IN (120, 121);
-- DELETE FROM "Module" WHERE "Id" = 17;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260918153139_Add-Elaboration-Module';
-- COMMIT;
-- =====================================================
