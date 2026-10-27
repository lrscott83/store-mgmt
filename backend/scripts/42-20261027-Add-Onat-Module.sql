-- =====================================================
-- 42: Add ONAT module (id 22 catalogued IsActive FALSE, price 0, PriceIncluded)
--     + feature 126 (ONAT) under module 22, OwnerAdmin (2) only
--     + StorePlanModule rows: Superior (3) and VIP (4)
--     + ACTIVE StoreModule / StoreRoleFeature rows for every existing ACTIVE store on Superior/VIP
-- EF migration: 20261027162947_AddOnatModule
-- Date: 2026-10-27
--
-- Module 22 ships DARK: "Module"."IsActive" = FALSE on purpose. The owner flips that single
-- flag later, and because every store on Superior/VIP already has an ACTIVE StoreModule row,
-- the module lights up for them at once. Feature 126 is seeded active.
--
-- Parity: the DML body is EF's output from Infrastructure.Migrations.OnatModuleBackfill.UpSql
-- (catalog + per-store + serial fix-ups), unchanged. Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand.
-- Prerequisites: 20261026150500_Add-Order-PaidAt applied.
-- =====================================================

START TRANSACTION;

INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (22, TRUE, 0, FALSE, 'ONAT', 161, 0, 0, TRUE)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (126, TRUE, 'Funcionalidad para el Vector Fiscal y las configuraciones fiscales del Owner', TRUE, 22, 'ONAT', 261)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (3, 22), (4, 22)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 22, TRUE, 0, 0, 0, 0, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (126)) AS f("Id") ON TRUE
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
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

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261027162947_AddOnatModule', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261027162947_AddOnatModule';

-- Must show IsActive = FALSE (ships dark) and PriceIncluded = TRUE, Price = 0.
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 22;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" = 126;

SELECT "PlanId", "ModuleId" FROM "StorePlanModule"
WHERE "ModuleId" = 22 ORDER BY "PlanId";

-- Must equal the number of ACTIVE stores on Superior/VIP: the rows are created ACTIVE
-- even though module 22 is not, so the catalog flip turns the module on for them.
SELECT COUNT(*) AS store_module_rows
FROM "StoreModule" WHERE "ModuleId" = 22 AND "IsActive" = TRUE;

SELECT COUNT(*) AS owner_admin_role_feature_rows
FROM "StoreRoleFeature" WHERE "FeatureId" = 126 AND "RoleId" = 2 AND "IsActive" = TRUE;

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 126;
-- DELETE FROM "StoreModule" WHERE "ModuleId" = 22;
-- DELETE FROM "StorePlanModule" WHERE "ModuleId" = 22;
-- DELETE FROM "Feature" WHERE "Id" = 126;
-- DELETE FROM "Module" WHERE "Id" = 22;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261027162947_AddOnatModule';
-- COMMIT;
-- =====================================================
