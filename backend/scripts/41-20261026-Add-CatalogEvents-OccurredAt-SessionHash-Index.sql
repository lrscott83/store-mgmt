-- =============================================================================
-- 41 - Add CatalogEvent index (OccurredAt, SessionHash)
-- =============================================================================
-- EF migration : 20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index
-- Generated    : dotnet ef migrations script 20261021231114_Add-OrderSalesManager-Attribution
--                (single migration: -From the PREVIOUS migration, no -To)
-- Date         : 2026-10-26
-- Parity       : schema-only; the SQL body is the generated one.
-- Prerequisite : 20261021231114_Add-OrderSalesManager-Attribution applied.
-- Idempotency  : the __EFMigrationsHistory insert uses ON CONFLICT DO NOTHING.
-- =============================================================================

START TRANSACTION;

CREATE INDEX "IX_CatalogEvent_OccurredAt_SessionHash" ON "CatalogEvent" ("OccurredAt", "SessionHash");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT "MigrationId", "ProductVersion"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'CatalogEvent'
  AND indexname = 'IX_CatalogEvent_OccurredAt_SessionHash';

-- -----------------------------------------------------------------------------
-- Rollback (manual, only if this script must be undone)
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DROP INDEX IF EXISTS "IX_CatalogEvent_OccurredAt_SessionHash";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index';
-- COMMIT;
