-- =====================================================
-- 26: Tres fases en un solo script (todo idempotente, se puede re-correr):
--     (a) Columnas Currency del 16/09 — migración 20260916213905_AddCurrencyToStoreEntities
--         (Product, Order, OrderItem, InventoryEntry, InventoryEntryCost). Sin esta fase el
--         catálogo web revienta en el VPS con `42703: column p.Currency does not exist`.
--     (b) Precios por método de pago del 17/09 — migración 20260917194809_Add-SalePaymentMethod-Pricing
--         (Order.Percent, Order.Tax, Order.SalePaymentMethod).
--     (c) WebCatalog (módulo 18) también para el plan VIP (4) — migración
--         20260928191227_Add-WebCatalog-Module-Vip. Los planes son AUTOCONTENIDOS (decisión del
--         Owner, 2026-09-28): todo lo que aparece en Superior aparece en VIP. Corrige la D5 del
--         2026-09-27 que lo había dejado solo en Superior. Incluye el backfill a las tiendas VIP
--         activas (StoreModule + StoreRoleFeature OwnerAdmin), mismo SQL del backfill compartido
--         (WebCatalogModuleBackfill, ahora con StorePlanId IN (3,4)).
-- Requires: scripts 12/14 (planes) y 24/25 (catálogo: módulo 18 + feature 122) ya aplicados.
-- =====================================================

BEGIN;

-- =====================================================
-- FASE (a): Currency (migración 20260916213905_AddCurrencyToStoreEntities)
-- =====================================================

ALTER TABLE "Product"           ADD COLUMN IF NOT EXISTS "Currency" integer NOT NULL DEFAULT 0;
ALTER TABLE "Order"             ADD COLUMN IF NOT EXISTS "Currency" integer NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem"         ADD COLUMN IF NOT EXISTS "Currency" integer NOT NULL DEFAULT 0;
ALTER TABLE "InventoryEntry"    ADD COLUMN IF NOT EXISTS "Currency" integer NOT NULL DEFAULT 0;
ALTER TABLE "InventoryEntryCost" ADD COLUMN IF NOT EXISTS "Currency" integer NOT NULL DEFAULT 0;

-- =====================================================
-- FASE (b): Precios por método de pago (migración 20260917194809_Add-SalePaymentMethod-Pricing)
-- =====================================================

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "Percent"           numeric(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "SalePaymentMethod" integer       NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "Tax"               numeric(18,6) NOT NULL DEFAULT 0;

-- =====================================================
-- FASE (c): WebCatalog (módulo 18) también en VIP (4)
--           (migración 20260928191227_Add-WebCatalog-Module-Vip)
-- =====================================================

-- --- Plan assignment: module 18 for VIP (4) ---
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (4, 18)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: StoreModule rows for existing ACTIVE stores on Superior (3) or VIP (4) ---
-- (same SQL as WebCatalogModuleBackfill.StoreModuleSql; Superior stores already have the row,
--  ON CONFLICT DO NOTHING keeps it untouched)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 18, FALSE, 5, 5, 0, 100, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: OwnerAdmin (2) StoreRoleFeature row for feature 122 ---
-- (same SQL as WebCatalogModuleBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (122)) AS f("Id") ON TRUE
WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;

-- =====================================================
-- Register the EF migrations so `dotnet ef database update` stays in sync
-- =====================================================
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260916213905_AddCurrencyToStoreEntities', '8.0.3'),
       ('20260917194809_Add-SalePaymentMethod-Pricing', '8.0.3'),
       ('20260928191227_Add-WebCatalog-Module-Vip', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- =====================================================
-- Verification
-- =====================================================

-- Fase (a): 5 filas (una por tabla)
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name = 'Currency'
  AND table_name IN ('Product', 'Order', 'OrderItem', 'InventoryEntry', 'InventoryEntryCost')
ORDER BY table_name;

-- Fase (b): 3 filas
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Order'
  AND column_name IN ('Percent', 'SalePaymentMethod', 'Tax')
ORDER BY column_name;

-- Fase (c): la fila (4, 18) debe existir
SELECT "PlanId", "ModuleId" FROM "StorePlanModule"
WHERE "PlanId" = 4 AND "ModuleId" = 18;

-- Fase (c): tiendas VIP activas vs tiendas VIP con el módulo 18 (los números deben coincidir)
SELECT
  (SELECT COUNT(*) FROM "Store" WHERE "IsActive" = TRUE AND "StorePlanId" = 4) AS vip_active_stores,
  (SELECT COUNT(*) FROM "StoreModule" sm JOIN "Store" s ON s."Id" = sm."StoreId"
     WHERE s."IsActive" = TRUE AND s."StorePlanId" = 4 AND sm."ModuleId" = 18) AS vip_stores_with_module;

-- Historial: 3 filas
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" IN ('20260916213905_AddCurrencyToStoreEntities',
                        '20260917194809_Add-SalePaymentMethod-Pricing',
                        '20260928191227_Add-WebCatalog-Module-Vip')
ORDER BY "MigrationId";

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- ALTER TABLE "InventoryEntryCost" DROP COLUMN IF EXISTS "Currency";
-- ALTER TABLE "InventoryEntry"     DROP COLUMN IF EXISTS "Currency";
-- ALTER TABLE "OrderItem"          DROP COLUMN IF EXISTS "Currency";
-- ALTER TABLE "Order"              DROP COLUMN IF EXISTS "Currency", "Percent", "Tax", "SalePaymentMethod";
-- ALTER TABLE "Product"            DROP COLUMN IF EXISTS "Currency";
-- DELETE FROM "StoreRoleFeature" srf WHERE srf."FeatureId" = 122
--   AND srf."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" = 4);
-- DELETE FROM "StoreModule" sm WHERE sm."ModuleId" = 18
--   AND sm."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" = 4);
-- DELETE FROM "StorePlanModule" WHERE "PlanId" = 4 AND "ModuleId" = 18;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" IN
--   ('20260916213905_AddCurrencyToStoreEntities',
--    '20260917194809_Add-SalePaymentMethod-Pricing',
--    '20260928191227_Add-WebCatalog-Module-Vip');
-- COMMIT;
-- =====================================================
