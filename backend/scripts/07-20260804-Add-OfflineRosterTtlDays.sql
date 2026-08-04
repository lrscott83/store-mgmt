START TRANSACTION;

INSERT INTO "SystemConfiguration" ("Id", "Name", "Value")
VALUES (5, 'OfflineRosterTtlDays', '35');

SELECT setval(
    pg_get_serial_sequence('"SystemConfiguration"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "SystemConfiguration") + 1,
        nextval(pg_get_serial_sequence('"SystemConfiguration"', 'Id'))),
    false);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260804125006_Add-OfflineRosterTtlDays', '8.0.3');

COMMIT;
