-- =====================================================
-- 20: Backfill StoreRoleFeature rows for WholesaleSales (39) and
--     MultiStores (38) capabilities on existing ACTIVE stores.
--     Modules 12/14 and features 38/39 already exist in the catalog
--     (script 13). The gap was the StoreRoleFeatures enum: no mapping
--     for feature 38/39, so StoreRoleFeatureGenerator never produced
--     these rows. There is no catalog change here — only per-store rows.
-- EF migration: 20260920120000_Backfill-WholesaleSales-MultiStores-RoleFeatures
-- Date: 2026-09-20
-- Parity: the per-store INSERT-SELECT is the SAME text as
--         Infrastructure.Migrations.WholesaleSalesMultiStoresRoleFeatureBackfill.
--         Roles mirror StoreRoleFeatures.cs: 39 -> OwnerAdmin (2) + StoreUser (3),
--         38 -> OwnerAdmin (2) only. Requires scripts 13 and 14 already applied.
-- =====================================================

BEGIN;

-- --- Per-store assignment: StoreRoleFeature rows for stores holding module 12/14 ---
-- (same SQL as WholesaleSalesMultiStoresRoleFeatureBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT sm."StoreId", v."RoleId", v."FeatureId", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
JOIN (VALUES (12, 2, 39), (12, 3, 39), (14, 2, 38)) AS v("ModuleId", "RoleId", "FeatureId")
    ON v."ModuleId" = sm."ModuleId"
WHERE s."IsActive" = TRUE AND sm."IsActive" = TRUE
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260920120000_Backfill-WholesaleSales-MultiStores-RoleFeatures', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT COUNT(*) AS wholesale_sales_role_features
FROM "StoreRoleFeature" WHERE "FeatureId" = 39;

SELECT COUNT(*) AS multistores_role_features
FROM "StoreRoleFeature" WHERE "FeatureId" = 38;

SELECT srf."FeatureId", srf."RoleId", COUNT(*) AS stores
FROM "StoreRoleFeature" srf
WHERE srf."FeatureId" IN (38, 39)
GROUP BY srf."FeatureId", srf."RoleId"
ORDER BY srf."FeatureId", srf."RoleId";

-- =====================================================
-- ROLLBACK: intentionally NO data rollback.
--
-- This is an ADDITIVE backfill. Deleting StoreRoleFeature rows for features 38/39 would
-- remove legitimate entitlements created after this migration (StoreRoleFeatureGenerator
-- for new stores / newly-assigned modules 12/14) and any row that already existed —
-- real data loss. So the inverse of the INSERT is a no-op. If you must un-register the
-- migration from EF history (leaving the data in place), run ONLY:
--
-- BEGIN;
-- DELETE FROM "__EFMigrationsHistory"
--   WHERE "MigrationId" = '20260920120000_Backfill-WholesaleSales-MultiStores-RoleFeatures';
-- COMMIT;
-- =====================================================
