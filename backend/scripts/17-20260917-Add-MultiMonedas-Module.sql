-- =====================================================
-- 17: Add MultiMonedas module (id 15, paid price 3, 100% discount)
--     + feature 43 (MultiMonedas) under module 15
--     + StorePlanModule rows: Superior (3) and VIP (4)
--     + assignment to existing ACTIVE stores on Superior/VIP plans
-- EF migration: 20260917143901_Add-MultiMonedas-Module
-- Date: 2026-09-17
-- Parity: catalog INSERTs, StorePlanModule INSERTs and per-store INSERT-SELECTs
--         mirror the EF migration exactly. The per-store SQL is the SAME text as
--         Infrastructure.Migrations.MultiMonedasModuleBackfill constants.
--         Requires scripts 12 (StorePlan) and 14 (StorePlanModule) already applied.
-- =====================================================

BEGIN;

-- --- Catalog: Module 15 (Múltiples monedas, paid, effective price 0) ---
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (15, TRUE, 0, TRUE, 'Múltiples monedas', 125, 100, 3, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- --- Catalog: Feature 43 (MultiMonedas) under module 15 ---
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (43, TRUE, 'Funcionalidad para gestionar los precios en múltiples monedas', TRUE, 15, 'MultiMonedas', 76)
ON CONFLICT ("Id") DO NOTHING;

-- --- Plan assignment: module 15 for Superior (3) and VIP (4) ---
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (3, 15), (4, 15)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: StoreModule rows for existing ACTIVE Superior/VIP stores ---
-- (same SQL as MultiMonedasModuleBackfill.StoreModuleSql)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 15, FALSE, 3, 3, 0, 100, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: OwnerAdmin (2) / StoreUser (3) StoreRoleFeature rows for 43 ---
-- (same SQL as MultiMonedasModuleBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", r."Id", 43, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (2), (3)) AS r("Id") ON TRUE
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
VALUES ('20260917143901_Add-MultiMonedas-Module', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 15;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" = 43;

SELECT sp."Id" AS plan_id, sp."Name" AS plan_name,
       COUNT(spm."ModuleId") AS module_count
FROM "StorePlan" sp
LEFT JOIN "StorePlanModule" spm ON spm."PlanId" = sp."Id"
WHERE sp."Id" IN (3, 4)
GROUP BY sp."Id", sp."Name"
ORDER BY sp."Id";

SELECT COUNT(*) AS superior_vip_stores_with_module
FROM "StoreModule" WHERE "ModuleId" = 15;

SELECT COUNT(*) AS role_features_granted
FROM "StoreRoleFeature" WHERE "FeatureId" = 43;

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 43;
-- DELETE FROM "StoreModule" WHERE "ModuleId" = 15;
-- DELETE FROM "StorePlanModule" WHERE "ModuleId" = 15;
-- DELETE FROM "Feature" WHERE "Id" = 43;
-- DELETE FROM "Module" WHERE "Id" = 15;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260917143901_Add-MultiMonedas-Module';
-- COMMIT;
-- =====================================================
