-- 37-20261021-Add-OrderItem-Price-Snapshot.sql
-- EF migration: 20261021180754_Add-OrderItem-Price-Snapshot
-- Date: 2026-10-21
-- Adds the price snapshot to OrderItem: BasePrice, PercentDiscountPrice and DiscountPrice.
-- "Price" keeps its current meaning (the final charged price); the new columns let the final
-- price be recalculated from the line and give the sales-agent commission a frozen base.
-- Nullable on purpose: existing rows keep NULL and are NOT backfilled.
-- Prerequisites: 20261020141816_Add-CatalogEvents applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261020141816_Add-CatalogEvents
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The ALTER body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   ALTER TABLE "OrderItem" DROP COLUMN "BasePrice";
--   ALTER TABLE "OrderItem" DROP COLUMN "DiscountPrice";
--   ALTER TABLE "OrderItem" DROP COLUMN "PercentDiscountPrice";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261021180754_Add-OrderItem-Price-Snapshot';
-- COMMIT;
-- NOTE: rolling back discards every snapshot already written.

START TRANSACTION;

ALTER TABLE "OrderItem" ADD "BasePrice" numeric(18,6);

ALTER TABLE "OrderItem" ADD "DiscountPrice" integer;

ALTER TABLE "OrderItem" ADD "PercentDiscountPrice" integer;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261021180754_Add-OrderItem-Price-Snapshot', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261021180754_Add-OrderItem-Price-Snapshot';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'OrderItem'
  AND column_name IN ('BasePrice', 'PercentDiscountPrice', 'DiscountPrice')
ORDER BY column_name;

-- Every pre-existing row is expected to be NULL: this migration does not backfill.
SELECT COUNT(*) AS order_items_without_snapshot
FROM "OrderItem"
WHERE "BasePrice" IS NULL
  AND "PercentDiscountPrice" IS NULL
  AND "DiscountPrice" IS NULL;
