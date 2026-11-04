-- =============================================================================
-- 44 - Add Order search/order indexes (StoreId+Date, trgm on Code/CustomerPhone)
-- =============================================================================
-- EF migration : 20261104172512_Add-Order-Search-Indexes
-- Generated    : dotnet ef migrations script 20261027183707_StoreSyncFileDownload-TenantForeignKey
--                (single migration: -From the PREVIOUS migration, no -To)
-- Date         : 2026-11-04
-- Parity       : the SQL body is the generated one, byte for byte; only this header,
--                the ON CONFLICT clause of the history insert, the verification
--                SELECTs and the commented rollback were added by hand.
-- Prerequisite : 20261027183707_StoreSyncFileDownload-TenantForeignKey applied, and a
--                PostgreSQL server whose contrib package ships pg_trgm (it does on
--                every standard PostgreSQL 13+ distribution).
-- Idempotency  : CREATE EXTENSION uses IF NOT EXISTS and the __EFMigrationsHistory
--                insert uses ON CONFLICT DO NOTHING. The CREATE INDEX statements are the
--                generated body and are NOT conditional, so a SECOND run aborts at the
--                first one with `relation "IX_Order_StoreId_Date" already exists`
--                (SQLSTATE 42P07) — verified — and the enclosing transaction rolls back:
--                no duplicate index is created and no history row is inserted twice.
--                Same behavior as every generated DDL script in this folder; run it once.
-- =============================================================================

START TRANSACTION;

CREATE INDEX "IX_Order_StoreId_Date" ON "Order" ("StoreId", "Date");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "IX_Order_Code_Trgm" ON "Order" USING gin ("Code" gin_trgm_ops);

CREATE INDEX "IX_Order_CustomerPhone_Trgm" ON "Order" USING gin ("CustomerPhone" gin_trgm_ops);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261104172512_Add-Order-Search-Indexes', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT "MigrationId", "ProductVersion"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261104172512_Add-Order-Search-Indexes';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'Order'
  AND indexname IN (
    'IX_Order_StoreId_Date',
    'IX_Order_Code_Trgm',
    'IX_Order_CustomerPhone_Trgm'
  )
ORDER BY indexname;

SELECT extname, extversion
FROM pg_extension
WHERE extname = 'pg_trgm';

-- -----------------------------------------------------------------------------
-- Rollback (manual, only if this script must be undone)
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DROP INDEX IF EXISTS "IX_Order_CustomerPhone_Trgm";
-- DROP INDEX IF EXISTS "IX_Order_Code_Trgm";
-- DROP INDEX IF EXISTS "IX_Order_StoreId_Date";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261104172512_Add-Order-Search-Indexes';
-- COMMIT;
-- NOTE: pg_trgm is deliberately NOT dropped: it is a shared extension and other
--       objects may depend on it.
