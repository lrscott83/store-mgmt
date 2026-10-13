-- 34-20261013-Store-Payment-Exchange-Rate-Amount-Paid.sql
-- EF migration: 20261013155058_AddStorePaymentExchangeRateAmountPaid
-- Date: 2026-10-13
-- Schema-only: adds two NULLABLE columns to "StorePayment" for the register-payment popup —
-- the CUP-per-USD exchange rate and the total paid. No data backfill.
-- Prerequisites: 20261012143222_Add-StoreCatalogSettings-MobileColumns applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261012143222_Add-StoreCatalogSettings-MobileColumns
-- (single new migration → -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard and the manual ROLLBACK note were added by hand.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   ALTER TABLE "StorePayment" DROP COLUMN "ExchangeRate";
--   ALTER TABLE "StorePayment" DROP COLUMN "AmountPaid";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261013155058_AddStorePaymentExchangeRateAmountPaid';
-- COMMIT;

START TRANSACTION;

ALTER TABLE "StorePayment" ADD "AmountPaid" numeric(18,2);

ALTER TABLE "StorePayment" ADD "ExchangeRate" numeric(18,6);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261013155058_AddStorePaymentExchangeRateAmountPaid', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261013155058_AddStorePaymentExchangeRateAmountPaid';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'StorePayment' AND column_name IN ('ExchangeRate', 'AmountPaid');
