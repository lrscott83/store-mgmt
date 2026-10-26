-- 41-20261026-Add-Order-PaidAt.sql
-- EF migration: 20261026150500_Add-Order-PaidAt
-- Date: 2026-10-26
-- Adds "Order"."PaidAt": the UTC moment an online (web catalog) order became paid, so the
-- payment leaves durable evidence instead of only its weekday-independent status.
-- Nullable, and NO backfill: orders already paid before this script ran keep NULL. The moment
-- was never recorded anywhere, so deriving one would be a false record.
-- Prerequisites: 20261021231114_Add-OrderSalesManager-Attribution applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261021231114_Add-OrderSalesManager-Attribution
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   ALTER TABLE "Order" DROP COLUMN "PaidAt";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261026150500_Add-Order-PaidAt';
-- COMMIT;
-- NOTE: dropping the column discards every recorded paid date.

START TRANSACTION;

ALTER TABLE "Order" ADD "PaidAt" timestamp with time zone;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261026150500_Add-Order-PaidAt', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261026150500_Add-Order-PaidAt';

SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'Order'
  AND column_name = 'PaidAt';
