-- =====================================================
-- 11: Add Warehouses module (id 13, paid price 2, 100% discount)
--     + features 36 (warehouse CRUD) / 37 (stock movements)
--     + assignment to every existing ACTIVE store (OwnerAdmin role)
-- EF migration: 20260905224007_Add-Warehouses-Module
-- Date: 2026-09-05
-- Parity: catalog INSERTs and per-store INSERT-SELECTs mirror the EF
--         migration exactly. The per-store SQL is the SAME text as
--         Infrastructure.Migrations.WarehousesModuleBackfill constants.
-- =====================================================

BEGIN;

-- --- Catalog: Module 13 (Almacenes, paid, effective price 0) ---
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (13, TRUE, 0, TRUE, 'Almacenes', 110, 100, 2, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- --- Catalog: Features 36 (CRUD) and 37 (movements) under module 13 ---
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (36, TRUE, 'Funcionalidad para gestionar los almacenes', TRUE, 13, 'Almacenes', 72)
ON CONFLICT ("Id") DO NOTHING;
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (37, TRUE, 'Funcionalidad para gestionar los movimientos de los almacenes', TRUE, 13, 'Movimientos de almacén', 73)
ON CONFLICT ("Id") DO NOTHING;

-- --- Per-store assignment: StoreModule rows for every existing ACTIVE store ---
-- (same SQL as WarehousesModuleBackfill.StoreModuleSql)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 13, FALSE, 2, 2, 0, 100, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: OwnerAdmin (RoleId=2) StoreRoleFeature rows for 36/37 ---
-- (same SQL as WarehousesModuleBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 2, v."Id", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (36), (37)) AS v("Id") ON TRUE
WHERE s."IsActive" = TRUE
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
VALUES ('20260905224007_Add-Warehouses-Module', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 13;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" IN (36, 37);

SELECT COUNT(*) AS active_stores,
       COUNT(sm."StoreId") AS stores_with_module
FROM "Store" s
LEFT JOIN "StoreModule" sm ON sm."StoreId" = s."Id" AND sm."ModuleId" = 13
WHERE s."IsActive" = TRUE;

SELECT COUNT(*) AS owner_warehouse_features
FROM "StoreRoleFeature" srf
WHERE srf."RoleId" = 2 AND srf."FeatureId" IN (36, 37);

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" IN (36, 37);
-- DELETE FROM "StoreModule" WHERE "ModuleId" = 13;
-- DELETE FROM "Feature" WHERE "Id" IN (36, 37);
-- DELETE FROM "Module" WHERE "Id" = 13;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260905224007_Add-Warehouses-Module';
-- COMMIT;
-- =====================================================
