START TRANSACTION;

UPDATE "Module" SET "Price" = 0
WHERE "Id" = 2;

UPDATE "Module" SET "Price" = 0, "PriceIncluded" = TRUE
WHERE "Id" = 3;

UPDATE "Module" SET "Price" = 0, "PriceIncluded" = TRUE
WHERE "Id" = 4;

UPDATE "Module" SET "PercentDiscountPrice" = 75, "Price" = 2000
WHERE "Id" = 5;

UPDATE "Module" SET "PercentDiscountPrice" = 75, "Price" = 2000
WHERE "Id" = 6;

UPDATE "Module" SET "Order" = 70, "PercentDiscountPrice" = 75
WHERE "Id" = 8;

UPDATE "Module" SET "Order" = 80, "PercentDiscountPrice" = 75
WHERE "Id" = 9;

UPDATE "Module" SET "Order" = 90, "PercentDiscountPrice" = 75
WHERE "Id" = 10;

UPDATE "Module" SET "Order" = 100, "PercentDiscountPrice" = 75
WHERE "Id" = 11;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260306191127_Update-Module-Prices', '8.0.3');

COMMIT;

START TRANSACTION;

INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (34, TRUE, 'Funcionalidad para revisar las entradas y ventas del día', TRUE, 3, 'Cantidades del día', 81);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (35, TRUE, 'Funcionalidad para revisar las ganancias de las ventas del día', TRUE, 3, 'Ganancias del día', 81);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (103, TRUE, 'Funcionalidad para listar el historial de los créditos', TRUE, 10, 'Historial de créditos', 220);

SELECT setval(
    pg_get_serial_sequence('"Feature"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Feature") + 1,
        nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
    false);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260309182537_Add-Inventory-Today-Quantities-And-Today-SalesProfit-Features', '8.0.3');

COMMIT;

