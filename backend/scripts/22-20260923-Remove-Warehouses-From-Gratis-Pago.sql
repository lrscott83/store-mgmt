-- =====================================================
-- 22: Remove Warehouses (module 13 / features 36, 37) from stores whose plan is NOT
--     Superior (3) or VIP (4) — i.e. Gratis (1) and Pago (2).
--     Change remove-almacenes-from-gratis-pago (2026-09-23): Warehouses is reserved
--     for Superior (3) and VIP (4) only (the Gratis/Pago plan catalog never listed it;
--     the per-store rows leaked from the 2026-09-05 backfill
--     (20260905224007_Add-Warehouses-Module) that ran before StorePlan existed).
--
-- EF migration: 20260923215148_RemoveWarehousesFromGratisPago
-- Date: 2026-09-23
-- Parity: the per-store DELETE statements are the SAME text as
--         Infrastructure.Migrations.WarehousesPlanCleanup.CleanupSql.
-- Order matters (FK): StoreRoleFeature (features 36, 37) BEFORE StoreModule (module 13).
-- Idempotent: DELETE is naturally idempotent.
-- =====================================================

BEGIN;

-- --- Per-store cleanup: every non-Superior/VIP store loses module 13 and features 36/37 ---
DELETE FROM "StoreRoleFeature" srf
WHERE srf."FeatureId" IN (36, 37)
  AND srf."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" NOT IN (3, 4));

DELETE FROM "StoreModule" sm
WHERE sm."ModuleId" = 13
  AND sm."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" NOT IN (3, 4));

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260923215148_RemoveWarehousesFromGratisPago', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT COUNT(*) AS non_superior_vip_stores_with_warehouses_module
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."ModuleId" = 13 AND s."StorePlanId" NOT IN (3, 4);

SELECT COUNT(*) AS non_superior_vip_stores_with_warehouses_features
FROM "StoreRoleFeature" srf
JOIN "Store" s ON s."Id" = srf."StoreId"
WHERE srf."FeatureId" IN (36, 37) AND s."StorePlanId" NOT IN (3, 4);

SELECT sm."ModuleId", COUNT(*) AS superior_vip_stores_untouched
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."ModuleId" = 13 AND s."StorePlanId" IN (3, 4)
GROUP BY sm."ModuleId";

-- =====================================================
-- ROLLBACK: per-store removal is NOT reversible (the migration never records which
-- non-Superior/VIP stores held module 13). WarehousesPlanCleanup.DownSql is a
-- documented no-op for the data side.
-- If you must un-register the migration from EF history (leaving the data
-- cleaned), run ONLY:
--
-- BEGIN;
-- DELETE FROM "__EFMigrationsHistory"
--   WHERE "MigrationId" = '20260923215148_RemoveWarehousesFromGratisPago';
-- COMMIT;
-- =====================================================