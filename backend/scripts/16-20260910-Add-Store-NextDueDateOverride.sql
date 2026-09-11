-- =====================================================
-- 16: Add-Store-NextDueDateOverride
-- EF migration: 20260910183406_Add-Store-NextDueDateOverride
-- Date: 2026-09-10
-- Parity: ALTER TABLE mirrors the EF migration exactly
--         (DateOnly -> date, nullable, no default value).
-- Idempotent: safe to run multiple times.
-- =====================================================

BEGIN;

-- --- Add column Store.NextDueDateOverride (si no existe) ---
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Store' AND column_name = 'NextDueDateOverride'
    ) THEN
        ALTER TABLE "Store" ADD "NextDueDateOverride" date NULL;
    END IF;
END $$;

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260910183406_Add-Store-NextDueDateOverride', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Store' AND column_name = 'NextDueDateOverride';

SELECT "MigrationId", "ProductVersion"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20260910183406_Add-Store-NextDueDateOverride';

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- ALTER TABLE "Store" DROP COLUMN "NextDueDateOverride";
-- DELETE FROM "__EFMigrationsHistory"
--   WHERE "MigrationId" = '20260910183406_Add-Store-NextDueDateOverride';
-- COMMIT;
-- =====================================================