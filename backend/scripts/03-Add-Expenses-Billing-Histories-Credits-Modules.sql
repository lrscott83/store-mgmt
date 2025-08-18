START TRANSACTION;

DROP INDEX "IX_StoreUsage_StoreId";

INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (16, FALSE, 'Funcionalidad para mostrar el dashboard', TRUE, 1, 'Dashboard', 2);

INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (8, TRUE, 0, TRUE, 'Gastos', 60, 50, 2000, FALSE);
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (9, TRUE, 0, TRUE, 'Facturación', 60, 50, 2000, FALSE);
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (10, TRUE, 0, TRUE, 'Historiales', 60, 50, 2000, FALSE);
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (11, TRUE, 0, TRUE, 'Créditos', 60, 50, 2000, FALSE);

INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (80, TRUE, 'Funcionalidad para gestionar los gastos del día', TRUE, 8, 'Gastos del día', 180);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (90, TRUE, 'Funcionalidad para generar facturas', TRUE, 9, 'Facturación', 190);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (100, TRUE, 'Funcionalidad para listar el historial de las ventas', TRUE, 10, 'Historial de ventas', 200);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (101, TRUE, 'Funcionalidad para listar el historial de las entradas', TRUE, 10, 'Historial de entradas', 210);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (102, TRUE, 'Funcionalidad para listar el historial de los gastos', TRUE, 10, 'Historial de gastos', 220);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (110, TRUE, 'Funcionalidad para hacer ventas a crédito', TRUE, 11, 'Venta a crédito', 230);

CREATE INDEX "IX_StoreUsage_StoreId_Day" ON "StoreUsage" ("StoreId", "Day");

SELECT setval(
    pg_get_serial_sequence('"Feature"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Feature") + 1,
        nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
    false);
SELECT setval(
    pg_get_serial_sequence('"Module"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Module") + 1,
        nextval(pg_get_serial_sequence('"Module"', 'Id'))),
    false);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20250804193255_Add-Expenses-Billing-Histories-Credits-Modules', '8.0.3');

COMMIT;

