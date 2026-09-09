-- =====================================================
-- 15: Update Warehouses module (13) price: 2 -> 5, 100% -> 50%
--     + sync existing StoreModule snapshots (pattern UpdateModulePricesV3)
-- EF migration: 20260908195026_Update-Warehouses-Price
-- Date: 2026-09-08
-- Parity: both UPDATEs mirror the EF migration exactly.
--         Effective price after: 5 * (100-50)% = 2.5.
-- =====================================================

BEGIN;

-- --- Catalog: Warehouses (13) -> Price 5, 50% descuento (efectivo 2.5) ---
UPDATE "Module"
SET "Price" = 5,
    "PercentDiscountPrice" = 50,
    "DiscountPrice" = 0
WHERE "Id" = 13;

-- --- Existing stores: sync module-13 price snapshots ---
UPDATE "StoreModule"
SET "Price" = 5,
    "ModulePrice" = 5,
    "ModulePercentDiscountPrice" = 50,
    "ModuleDiscountPrice" = 0
WHERE "ModuleId" = 13 AND "ModulePriceIncluded" = false;

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260908195026_Update-Warehouses-Price', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "DiscountPrice",
       ROUND(("Price" * (100 - "PercentDiscountPrice") / 100)::numeric, 2) AS effective_price
FROM "Module" WHERE "Id" = 13;

SELECT COUNT(*) AS snapshot_rows_updated
FROM "StoreModule" WHERE "ModuleId" = 13 AND "ModulePriceIncluded" = false
    AND "Price" = 5 AND "ModulePrice" = 5
    AND "ModulePercentDiscountPrice" = 50 AND "ModuleDiscountPrice" = 0;

SELECT COUNT(*) AS snapshot_rows_out_of_date
FROM "StoreModule" WHERE "ModuleId" = 13 AND "ModulePriceIncluded" = false
    AND ("Price" <> 5 OR "ModulePrice" <> 5
         OR "ModulePercentDiscountPrice" <> 50 OR "ModuleDiscountPrice" <> 0);

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- UPDATE "Module" SET "Price" = 2, "PercentDiscountPrice" = 100, "DiscountPrice" = 0 WHERE "Id" = 13;
-- UPDATE "StoreModule" SET "Price" = 2, "ModulePrice" = 2, "ModulePercentDiscountPrice" = 100, "ModuleDiscountPrice" = 0 WHERE "ModuleId" = 13 AND "ModulePriceIncluded" = false;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260908195026_Update-Warehouses-Price';
-- COMMIT;
-- =====================================================