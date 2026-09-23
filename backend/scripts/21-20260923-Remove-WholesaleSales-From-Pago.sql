-- =====================================================
-- 21: Remove WholesaleSales (module 12 / feature 39) from the Pago plan (StorePlanId = 2).
--     Change wholesale-superior-vip-only (2026-09-23): WholesaleSales is now reserved
--     for Superior (3) and VIP (4) only.
--
-- EF migration: 20260923155514_RemoveWholesaleSalesFromPagoPlan
-- Date: 2026-09-23
-- Parity: the per-store DELETE statements are the SAME text as
--         Infrastructure.Migrations.WholesaleSalesPagoRemoval.CleanupSql,
--         and the catalog DeleteData mirrors the migration's DeleteData.
-- Order matters (FK): StoreRoleFeature (feature 39) BEFORE StoreModule (module 12).
-- Idempotent: DELETE is naturally idempotent; the catalog DeleteData uses the PK.
-- =====================================================

BEGIN;

-- --- Catalog: remove (Pago, 12) from the plan catalog ---
DELETE FROM "StorePlanModule"
WHERE "PlanId" = 2 AND "ModuleId" = 12;

-- --- Per-store cleanup: every Pago store loses module 12 and feature 39 ---
DELETE FROM "StoreRoleFeature" srf
WHERE srf."FeatureId" = 39
  AND srf."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" = 2);

DELETE FROM "StoreModule" sm
WHERE sm."ModuleId" = 12
  AND sm."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" = 2);

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260923155514_RemoveWholesaleSalesFromPagoPlan', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT COUNT(*) AS pago_stores_with_wholesale_sales_module
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."ModuleId" = 12 AND s."StorePlanId" = 2;

SELECT COUNT(*) AS pago_stores_with_wholesale_sales_feature
FROM "StoreRoleFeature" srf
JOIN "Store" s ON s."Id" = srf."StoreId"
WHERE srf."FeatureId" = 39 AND s."StorePlanId" = 2;

SELECT COUNT(*) AS pago_catalog_still_has_wholesale_sales
FROM "StorePlanModule"
WHERE "PlanId" = 2 AND "ModuleId" = 12;

SELECT sm."ModuleId", COUNT(*) AS superior_vip_stores_untouched
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."ModuleId" = 12 AND s."StorePlanId" IN (3, 4)
GROUP BY sm."ModuleId";

-- =====================================================
-- ROLLBACK: the catalog row can be re-inserted, but per-store removal is NOT
-- reversible (the migration never records which Pago stores held module 12).
-- WholesaleSalesPagoRemoval.DownSql is a documented no-op for the data side.
-- If you must un-register the migration from EF history (leaving the data
-- cleaned), run ONLY:
--
-- BEGIN;
-- DELETE FROM "__EFMigrationsHistory"
--   WHERE "MigrationId" = '20260923155514_RemoveWholesaleSalesFromPagoPlan';
-- COMMIT;
-- =====================================================