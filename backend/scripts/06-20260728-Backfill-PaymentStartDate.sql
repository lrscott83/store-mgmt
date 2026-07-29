START TRANSACTION;

UPDATE "Store" SET "PaymentStartDate" = NULL WHERE "PaymentStartDate" = '-infinity'::date;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260728194358_Backfill-PaymentStartDate-Null', '8.0.3');

COMMIT;