-- 38-20261021-Add-Gestores-Ventas-Module.sql
-- EF migration: 20261021185058_Add-Gestores-Ventas-Module
-- Date: 2026-10-21
-- Creates module 21 "Gestores de ventas" (price 20, 50% discount -> net 10), feature 125,
-- assigns it to Superior (3) and VIP (4), and creates role 5 "Gestor de ventas".
-- NO StoreModule and NO StoreRoleFeature rows: the module is opt-in and no existing store
-- receives it by default.
-- Prerequisites: 20261021180754_Add-OrderItem-Price-Snapshot applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261021180754_Add-OrderItem-Price-Snapshot
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DML body is EF's output (from GestoresVentasModuleSeed.UpSql), unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 125;
--   DELETE FROM "StoreModule" WHERE "ModuleId" = 21;
--   DELETE FROM "StorePlanModule" WHERE "ModuleId" = 21;
--   DELETE FROM "Feature" WHERE "Id" = 125;
--   DELETE FROM "Module" WHERE "Id" = 21;
--   DELETE FROM "Role" WHERE "Id" = 5;
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261021185058_Add-Gestores-Ventas-Module';
-- COMMIT;

START TRANSACTION;

INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (21, TRUE, 0, TRUE, 'Gestores de ventas', 160, 50, 20, FALSE)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (125, TRUE, 'Funcionalidad para gestionar los gestores de ventas y sus comisiones', TRUE, 21, 'Gestores de ventas', 260)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (3, 21), (4, 21)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

INSERT INTO "Role" ("Id", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "UpdatedBy", "UpdatedDate")
VALUES (5, '00000000-0000-0000-0000-000000000000', NOW(), 'Este Role permitirá acceder a sus pedidos, sus comisiones y al catálogo web de las tiendas de su Owner.', TRUE, 'Gestor de ventas', NULL, NULL)
ON CONFLICT ("Id") DO NOTHING;

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
VALUES ('20261021185058_Add-Gestores-Ventas-Module', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261021185058_Add-Gestores-Ventas-Module';

SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 21;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" = 125;

SELECT "Id", "Name" FROM "Role" WHERE "Id" = 5;

SELECT "PlanId", "ModuleId" FROM "StorePlanModule"
WHERE "ModuleId" = 21 ORDER BY "PlanId";

-- Both must be 0: the module is opt-in and no existing store receives it by default.
SELECT COUNT(*) AS store_module_rows FROM "StoreModule" WHERE "ModuleId" = 21;
SELECT COUNT(*) AS store_role_feature_rows FROM "StoreRoleFeature" WHERE "FeatureId" = 125;
