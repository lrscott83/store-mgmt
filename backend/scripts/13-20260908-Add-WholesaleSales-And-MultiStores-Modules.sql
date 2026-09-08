-- =====================================================
-- 13: Add WholesaleSales module (12, paid, effective 0)
--     + MultiStores module (14, paid, effective 2.5)
--     + features 38 (Mis tiendas) / 39 (Ventas Mayoristas)
-- EF migration: 20260908194626_Add-WholesaleSales-And-MultiStores-Modules
-- Date: 2026-09-08
-- Parity: catalog INSERTs mirror the EF migration exactly. No per-store
--         assignment yet (gating iteration is future scope).
-- =====================================================

BEGIN;

-- --- Catalog: Module 12 (Ventas Mayoristas) and 14 (Múltiples tiendas) ---
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (12, TRUE, 0, TRUE, 'Ventas Mayoristas', 115, 100, 2, FALSE),
       (14, TRUE, 0, TRUE, 'Múltiples tiendas', 120, 50, 5, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- --- Catalog: Features 38 (under module 14) and 39 (under module 12) ---
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (38, TRUE, 'Funcionalidad para gestionar las tiendas del propietario', TRUE, 14, 'Mis tiendas', 74)
ON CONFLICT ("Id") DO NOTHING;
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (39, TRUE, 'Funcionalidad para gestionar las ventas mayoristas', TRUE, 12, 'Ventas Mayoristas', 75)
ON CONFLICT ("Id") DO NOTHING;

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
VALUES ('20260908194626_Add-WholesaleSales-And-MultiStores-Modules', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" IN (12, 14);

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" IN (38, 39);

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "Feature" WHERE "Id" IN (38, 39);
-- DELETE FROM "Module" WHERE "Id" IN (12, 14);
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260908194626_Add-WholesaleSales-And-MultiStores-Modules';
-- COMMIT;
-- =====================================================