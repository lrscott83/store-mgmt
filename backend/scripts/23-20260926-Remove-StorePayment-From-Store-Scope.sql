-- =====================================================
-- 23: StorePayment (feature 91) leaves the store scope.
--     StorePayment is a SuperAdmin/ReSeller-only capability
--     (StoreRoleFeatures.StorePaymentAdmin): payments are recorded from the
--     admin side, never from inside the store. Feature 91 becomes
--     AvailableToStore = false (seed + migration), and the SuperAdmin/ReSeller
--     StoreRoleFeature rows the generator materialised inside stores are
--     deleted. Decisión del usuario 2026-09-26 (opción B).
--
-- EF migration: 20260926202919_RemoveStorePaymentFromStoreScope
-- Date: 2026-09-26
-- Parity: the per-store DELETE statement is the SAME text as
--         Infrastructure.Migrations.StorePaymentStoreScopeRemoval.CleanupSql,
--         and the AvailableToStore update mirrors the migration's UpdateData.
-- Idempotent: UPDATE and DELETE are naturally idempotent.
-- =====================================================

BEGIN;

-- --- Catalog: feature 91 no longer AvailableToStore ---
UPDATE "Feature"
SET "AvailableToStore" = false
WHERE "Id" = 91;

-- --- Per-store cleanup: no store keeps StorePayment permission rows ---
DELETE FROM "StoreRoleFeature" srf
WHERE srf."FeatureId" = 91;

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260926202919_RemoveStorePaymentFromStoreScope', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT COUNT(*) AS stores_with_storepayment_feature
FROM "StoreRoleFeature"
WHERE "FeatureId" = 91;

SELECT COUNT(*) AS feature_91_still_available_to_store
FROM "Feature"
WHERE "Id" = 91 AND "AvailableToStore" = true;

