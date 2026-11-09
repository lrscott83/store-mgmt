-- =============================================================================
-- 46 - Normalize OrderType (101 -> 1) and add the OrderItem wholesale snapshot
-- =============================================================================
-- EF migration : 20261105230228_Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot
-- Generated    : dotnet ef migrations script 20261105204049_Add-Wholesale-Pricing-And-Order-Channel
--                (single migration: -From the PREVIOUS migration, no -To)
-- Date         : 2026-11-05
-- Parity       : the SQL body is the generated one, byte for byte; only this header, the
--                ON CONFLICT clause of the history insert, the verification SELECTs and the
--                commented rollback were added by hand.
-- Prerequisite : 20261105204049_Add-Wholesale-Pricing-And-Order-Channel applied.
-- Idempotency  : the history insert uses ON CONFLICT DO NOTHING and the UPDATE is naturally
--                idempotent (a second run matches no 101 row). The five ALTER TABLE ... ADD
--                statements are the generated body and are NOT conditional, so a SECOND run
--                aborts at the first one with `column "WholesalePackSize" of relation
--                "OrderItem" already exists` (SQLSTATE 42701) and the enclosing transaction
--                rolls back: no duplicate column and no history row inserted twice. Same
--                behavior as every generated DDL script in this folder; run it once.
-- Note         : the new columns are nullable or carry a constant default, so these ALTERs are
--                metadata only (PostgreSQL 11+ fast default) and do not rewrite the table.
-- =============================================================================

START TRANSACTION;

ALTER TABLE "OrderItem" ADD "WholesalePackSize" integer NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem" ADD "WholesalePacks" integer NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem" ADD "WholesaleTierMinPacks" integer;

ALTER TABLE "OrderItem" ADD "WholesaleTierUnitPrice" numeric(18,2);

ALTER TABLE "OrderItem" ADD "WholesaleUnitLabel" character varying(32);

UPDATE "Order" SET "OrderType" = 1 WHERE "OrderType" = 101;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261105230228_Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT "MigrationId", "ProductVersion"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261105230228_Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'OrderItem'
  AND column_name IN (
    'WholesalePackSize',
    'WholesalePacks',
    'WholesaleTierMinPacks',
    'WholesaleTierUnitPrice',
    'WholesaleUnitLabel'
  )
ORDER BY column_name;

-- Must return 0: no order keeps the retired channel-as-type value.
SELECT count(*) AS "RetiredOrderTypeRows"
FROM "Order"
WHERE "OrderType" = 101;

-- -----------------------------------------------------------------------------
-- Rollback (manual, only if this script must be undone)
-- -----------------------------------------------------------------------------
-- BEGIN;
-- ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "WholesaleUnitLabel";
-- ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "WholesaleTierUnitPrice";
-- ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "WholesaleTierMinPacks";
-- ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "WholesalePacks";
-- ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "WholesalePackSize";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261105230228_Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot';
-- COMMIT;
-- NOTE: the data step (101 -> 1) is deliberately NOT reverted — 101 was a channel and the channel
--       is Order.IsOfflineOrder now. See Infrastructure.Migrations.OrderTypeChannelNormalization.
