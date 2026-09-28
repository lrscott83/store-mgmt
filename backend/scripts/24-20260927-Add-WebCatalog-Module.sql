-- =====================================================
-- 24: Add WebCatalog module (id 18, paid price 5, 100% discount)
--     + feature 122 (Catálogo web) under module 18
--     + StorePlanModule row: Superior (3) ONLY (owner decision D5, 2026-09-27 — VIP excluded)
--     + assignment to existing ACTIVE stores on the Superior plan (OwnerAdmin only)
-- EF migration: 20260927175335_Add-WebCatalog-Module
-- Date: 2026-09-27
-- Parity: catalog INSERTs, StorePlanModule INSERTs and per-store INSERT-SELECTs
--         mirror the EF migration exactly. The per-store SQL is the SAME text as
--         Infrastructure.Migrations.WebCatalogModuleBackfill constants.
--         Requires scripts 12 (StorePlan) and 14 (StorePlanModule) already applied.
-- =====================================================

BEGIN;

-- --- Catalog: Module 18 (Catálogo web, paid, effective price 0) ---
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (18, TRUE, 0, TRUE, 'Catálogo web', 140, 100, 5, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- --- Catalog: Feature 122 (Catálogo web) under module 18 ---
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (122, TRUE, 'Funcionalidad para publicar y sincronizar el catálogo web de la tienda', TRUE, 18, 'Catálogo web', 250)
ON CONFLICT ("Id") DO NOTHING;

-- --- Plan assignment: module 18 for Superior (3) ONLY ---
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (3, 18)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: StoreModule rows for existing ACTIVE Superior stores ---
-- (same SQL as WebCatalogModuleBackfill.StoreModuleSql)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 18, FALSE, 5, 5, 0, 100, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE AND s."StorePlanId" = 3
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: OwnerAdmin (2) StoreRoleFeature row for feature 122 ---
-- (same SQL as WebCatalogModuleBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (122)) AS f("Id") ON TRUE
WHERE s."IsActive" = TRUE AND s."StorePlanId" = 3
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
VALUES ('20260927175335_Add-WebCatalog-Module', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 18;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" = 122;

SELECT sp."Id" AS plan_id, sp."Name" AS plan_name,
       COUNT(spm."ModuleId") AS module_count
FROM "StorePlan" sp
LEFT JOIN "StorePlanModule" spm ON spm."PlanId" = sp."Id"
WHERE sp."Id" IN (3, 4)
GROUP BY sp."Id", sp."Name"
ORDER BY sp."Id";

SELECT COUNT(*) AS superior_stores_with_module
FROM "StoreModule" WHERE "ModuleId" = 18;

SELECT COUNT(*) AS role_features_granted
FROM "StoreRoleFeature" WHERE "FeatureId" = 122;

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 122;
-- DELETE FROM "StoreModule" WHERE "ModuleId" = 18;
-- DELETE FROM "StorePlanModule" WHERE "ModuleId" = 18;
-- DELETE FROM "Feature" WHERE "Id" = 122;
-- DELETE FROM "Module" WHERE "Id" = 18;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927175335_Add-WebCatalog-Module';
-- COMMIT;
-- =====================================================
