-- =====================================================
-- 09: Actualizar precios de módulos de pago
-- Fecha: 2026-08-31
-- Descripción:
--   - Reportes (5) pasa al plan de pago base (PriceIncluded=true, Price=0)
--   - Estadísticas(6), Gastos(8), Facturación(9), Historiales(10), Créditos(11)
--     se establecen a 1 USD cada uno
--   - Moneda: USD (pago en MN al cambio oficial)
-- =====================================================

BEGIN;

-- Reportes: pasa al plan de pago base (incluido en el precio del plan)
UPDATE "Module"
SET "Price" = 0,
    "PriceIncluded" = true,
    "PercentDiscountPrice" = 0
WHERE "Id" = 5;

-- Estadísticas: 1 USD
UPDATE "Module"
SET "Price" = 1,
    "PriceIncluded" = false,
    "PercentDiscountPrice" = 0
WHERE "Id" = 6;

-- Gastos: 1 USD
UPDATE "Module"
SET "Price" = 1,
    "PriceIncluded" = false,
    "PercentDiscountPrice" = 0
WHERE "Id" = 8;

-- Facturación: 1 USD
UPDATE "Module"
SET "Price" = 1,
    "PriceIncluded" = false,
    "PercentDiscountPrice" = 0
WHERE "Id" = 9;

-- Historiales: 1 USD
UPDATE "Module"
SET "Price" = 1,
    "PriceIncluded" = false,
    "PercentDiscountPrice" = 0
WHERE "Id" = 10;

-- Créditos: 1 USD
UPDATE "Module"
SET "Price" = 1,
    "PriceIncluded" = false,
    "PercentDiscountPrice" = 0
WHERE "Id" = 11;

COMMIT;

-- Verificar resultados
SELECT "Id", "Name", "Price", "PriceIncluded", "PercentDiscountPrice"
FROM "Module"
WHERE "Id" IN (5, 6, 8, 9, 10, 11)
ORDER BY "Id";
