-- =============================================================================
-- 45 - Add wholesale pricing (product config + tiers) and order channel
-- =============================================================================
-- EF migration : 20261105204049_Add-Wholesale-Pricing-And-Order-Channel
-- Generated    : dotnet ef migrations script 20261104172512_Add-Order-Search-Indexes
--                (single migration: -From the PREVIOUS migration, no -To)
-- Date         : 2026-11-05
-- Parity       : the SQL body is the generated one, byte for byte; only this header,
--                the ON CONFLICT clause of the history insert, the verification
--                SELECTs and the commented rollback were added by hand.
-- Prerequisite : 20261104172512_Add-Order-Search-Indexes applied.
-- What it does : schema ONLY, no data written.
--                * StoreCatalogSettings."PriceMode" — 1 = Unit (default, the historical
--                  behavior), 2 = Wholesale. Every existing row becomes 1.
--                * Product."WholesaleEnabled"/"WholesalePackSize"/"WholesaleUnitLabel" —
--                  the wholesale configuration that used to live only in the POS device.
--                  Every existing row becomes "no wholesale config" (false / 0 / NULL).
--                * ProductWholesaleTier — the price tiers, N per product, with a UNIQUE
--                  (ProductId, MinPacks) index: two tiers with the same minimum are
--                  ambiguous for the pricing rule.
--                * Order."IsOfflineOrder" — order channel. Every existing row becomes
--                  FALSE, which is correct: the server only stores web-catalog orders.
--                The historical Order.OrderType = 101 -> 1 backfill is NOT here: it ships
--                with the release that stops writing 101 (migration 46).
-- Idempotency  : the __EFMigrationsHistory insert uses ON CONFLICT DO NOTHING. The DDL
--                is the generated body and is NOT conditional, so a SECOND run aborts at
--                the first ALTER with `column "PriceMode" of relation
--                "StoreCatalogSettings" already exists` (SQLSTATE 42701) and the enclosing
--                transaction rolls back: no duplicate column and no history row inserted
--                twice. Same behavior as every generated DDL script in this folder.
-- =============================================================================

-- To undo this script (data loss: drops the tiers and the columns):
-- START TRANSACTION;
-- DROP TABLE "ProductWholesaleTier";
-- ALTER TABLE "StoreCatalogSettings" DROP COLUMN "PriceMode";
-- ALTER TABLE "Product" DROP COLUMN "WholesaleEnabled";
-- ALTER TABLE "Product" DROP COLUMN "WholesalePackSize";
-- ALTER TABLE "Product" DROP COLUMN "WholesaleUnitLabel";
-- ALTER TABLE "Order" DROP COLUMN "IsOfflineOrder";
-- DELETE FROM "__EFMigrationsHistory"
--  WHERE "MigrationId" = '20261105204049_Add-Wholesale-Pricing-And-Order-Channel';
-- COMMIT;

START TRANSACTION;

ALTER TABLE "StoreCatalogSettings" ADD "PriceMode" integer NOT NULL DEFAULT 1;

ALTER TABLE "Product" ADD "WholesaleEnabled" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "Product" ADD "WholesalePackSize" integer NOT NULL DEFAULT 0;

ALTER TABLE "Product" ADD "WholesaleUnitLabel" character varying(32);

ALTER TABLE "Order" ADD "IsOfflineOrder" boolean NOT NULL DEFAULT FALSE;

CREATE TABLE "ProductWholesaleTier" (
    "Id" uuid NOT NULL,
    "ProductId" uuid NOT NULL,
    "MinPacks" integer NOT NULL,
    "PricePerUnit" numeric(18,2) NOT NULL,
    "Currency" integer NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_ProductWholesaleTier" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ProductWholesaleTier_Product_ProductId" FOREIGN KEY ("ProductId") REFERENCES "Product" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_ProductWholesaleTier_ProductId" ON "ProductWholesaleTier" ("ProductId");

CREATE UNIQUE INDEX "IX_ProductWholesaleTier_ProductId_MinPacks" ON "ProductWholesaleTier" ("ProductId", "MinPacks");

CREATE INDEX "IX_ProductWholesaleTier_TenantId" ON "ProductWholesaleTier" ("TenantId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261105204049_Add-Wholesale-Pricing-And-Order-Channel', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- =============================================================================
-- Verification (run after COMMIT)
-- =============================================================================
-- 1) The history row exists exactly once.
SELECT "MigrationId", "ProductVersion"
  FROM "__EFMigrationsHistory"
 WHERE "MigrationId" = '20261105204049_Add-Wholesale-Pricing-And-Order-Channel';

-- 2) The new columns exist with the expected type and nullability.
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE (table_name = 'StoreCatalogSettings' AND column_name = 'PriceMode')
    OR (table_name = 'Product' AND column_name IN
        ('WholesaleEnabled', 'WholesalePackSize', 'WholesaleUnitLabel'))
    OR (table_name = 'Order' AND column_name = 'IsOfflineOrder')
 ORDER BY table_name, column_name;

-- 3) The tier table and its three indexes exist.
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'ProductWholesaleTier'
 ORDER BY indexname;

-- 4) Every pre-existing settings row starts in Unit mode and every pre-existing order
--    counts as online (the defaults applied to the existing rows).
SELECT "PriceMode", COUNT(*) FROM "StoreCatalogSettings" GROUP BY "PriceMode";
SELECT "IsOfflineOrder", COUNT(*) FROM "Order" GROUP BY "IsOfflineOrder";
