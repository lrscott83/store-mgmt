START TRANSACTION;

INSERT INTO "SystemConfiguration" ("Id", "Name", "Value")
VALUES (3, 'PaymentGraceDays', '5');

SELECT setval(
    pg_get_serial_sequence('"SystemConfiguration"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "SystemConfiguration") + 1,
        nextval(pg_get_serial_sequence('"SystemConfiguration"', 'Id'))),
    false);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260727164714_Add-PaymentGraceDays-SystemConfig', '8.0.3');

COMMIT;

START TRANSACTION;

ALTER TABLE "StorePayment" ADD "ByReSeller" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "StorePayment" ADD "ReSellerAmount" real NOT NULL DEFAULT 0;

ALTER TABLE "StorePayment" ADD "ReSellerDiscountPrice" real NOT NULL DEFAULT 0;

ALTER TABLE "StorePayment" ADD "ReSellerId" uuid;

ALTER TABLE "StorePayment" ADD "ReSellerPercentDiscountPrice" real NOT NULL DEFAULT 0;

ALTER TABLE "Store" ALTER COLUMN "PaymentStartDate" DROP NOT NULL;

CREATE INDEX "IX_StorePayment_ReSellerId" ON "StorePayment" ("ReSellerId");

ALTER TABLE "StorePayment" ADD CONSTRAINT "FK_StorePayment_ReSeller_ReSellerId" FOREIGN KEY ("ReSellerId") REFERENCES "ReSeller" ("Id") ON DELETE RESTRICT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260727165912_StorePayment-ReSeller-Commission-Fields', '8.0.3');

COMMIT;

