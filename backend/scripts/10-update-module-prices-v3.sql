-- =====================================================
-- 10: Actualizar precios de módulos de pago (v3)
-- Migración EF: 20260901163808_UpdateModulePricesV3
-- Date: 2026-09-01
-- Idempotent: safe to run multiple times (ON CONFLICT)
-- =====================================================
-- Cada módulo de pago → Price=2, 50% descuento.
-- Fórmula: price - (price × percent/100) = 2 - 1 = 1 USD real.
-- Módulos gratuitos (PriceIncluded=true) no se tocan.

BEGIN;

-- Catálogo: todos los módulos de pago → Price=2, 50% descuento
UPDATE "Module"
SET "Price" = 2,
    "PercentDiscountPrice" = 50,
    "DiscountPrice" = 0
WHERE "PriceIncluded" = false;

-- Todas las tiendas existentes: sincronizar precios de módulos de pago
UPDATE "StoreModule"
SET "Price" = 2,
    "ModulePrice" = 2,
    "ModulePercentDiscountPrice" = 50,
    "ModuleDiscountPrice" = 0
WHERE "ModulePriceIncluded" = false;

-- Registrar migración en el historial de EF Core
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260901163808_UpdateModulePricesV3', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar catálogo
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded"
FROM "Module"
WHERE "PriceIncluded" = false
ORDER BY "Id";

-- Verificar tiendas (muestra)
SELECT "StoreId", "ModuleId", "Price", "ModulePrice", "ModulePercentDiscountPrice", "ModuleDiscountPrice"
FROM "StoreModule"
WHERE "ModulePriceIncluded" = false
ORDER BY "StoreId", "ModuleId"
LIMIT 20;
