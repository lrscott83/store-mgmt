-- 35-20261019-Add-Store-Location-Fields.sql
-- EF migration: 20261019160559_AddStoreLocationFields
-- Date: 2026-10-19
-- Schema-only: adds six NULLABLE columns to "Store" for the public catalog location data
-- (public-catalog-static-pages T8, S6) — public phone, city/province, coordinates and the
-- canonical opening-hours JSON that feed the generated page's JSON-LD. No data backfill:
-- existing stores keep NULL and the generated page omits whatever is absent.
-- Prerequisites: 20261013155058_AddStorePaymentExchangeRateAmountPaid applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261013155058_AddStorePaymentExchangeRateAmountPaid
-- (single new migration → -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard and the manual ROLLBACK note were added by hand.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   ALTER TABLE "Store" DROP COLUMN "PublicPhone";
--   ALTER TABLE "Store" DROP COLUMN "AddressCity";
--   ALTER TABLE "Store" DROP COLUMN "AddressProvince";
--   ALTER TABLE "Store" DROP COLUMN "Latitude";
--   ALTER TABLE "Store" DROP COLUMN "Longitude";
--   ALTER TABLE "Store" DROP COLUMN "OpeningHoursJson";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261019160559_AddStoreLocationFields';
-- COMMIT;

START TRANSACTION;

ALTER TABLE "Store" ADD "AddressCity" character varying(100);

ALTER TABLE "Store" ADD "AddressProvince" character varying(100);

ALTER TABLE "Store" ADD "Latitude" double precision;

ALTER TABLE "Store" ADD "Longitude" double precision;

ALTER TABLE "Store" ADD "OpeningHoursJson" text;

ALTER TABLE "Store" ADD "PublicPhone" character varying(30);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261019160559_AddStoreLocationFields', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261019160559_AddStoreLocationFields';

SELECT column_name, data_type, is_nullable, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'Store'
  AND column_name IN ('PublicPhone', 'AddressCity', 'AddressProvince', 'Latitude', 'Longitude', 'OpeningHoursJson')
ORDER BY column_name;
