-- =====================================================
-- 09: Actualizar precios de módulos de pago
-- Migración EF: 20260831155034_UpdateModulePricesV2
-- =====================================================

BEGIN;

-- Reportes (5): pasa al plan de pago base
UPDATE "Module"
SET "Price" = 0, "PriceIncluded" = true, "PercentDiscountPrice" = 0
WHERE "Id" = 5;

-- Estadísticas (6): 1 USD
UPDATE "Module"
SET "Price" = 1, "PriceIncluded" = false, "PercentDiscountPrice" = 0
WHERE "Id" = 6;

-- Gastos (8): 1 USD
UPDATE "Module"
SET "Price" = 1, "PriceIncluded" = false, "PercentDiscountPrice" = 0
WHERE "Id" = 8;

-- Facturación (9): 1 USD
UPDATE "Module"
SET "Price" = 1, "PriceIncluded" = false, "PercentDiscountPrice" = 0
WHERE "Id" = 9;

-- Historiales (10): 1 USD
UPDATE "Module"
SET "Price" = 1, "PriceIncluded" = false, "PercentDiscountPrice" = 0
WHERE "Id" = 10;

-- Créditos (11): 1 USD
UPDATE "Module"
SET "Price" = 1, "PriceIncluded" = false, "PercentDiscountPrice" = 0
WHERE "Id" = 11;

-- Registrar migración
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260831155034_UpdateModulePricesV2', '9.0.0')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar
SELECT "Id", "Name", "Price", "PriceIncluded", "PercentDiscountPrice"
FROM "Module"
WHERE "Id" IN (5,6,8,9,10,11) ORDER BY "Id";
