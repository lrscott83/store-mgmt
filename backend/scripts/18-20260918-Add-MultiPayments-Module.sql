-- =====================================================
-- 18: Add MultiPayments module (id 16, paid price 10, 50% discount)
--     + feature 44 (MultiPayments) under module 16
--     + StorePlanModule row: VIP (4) only
--     + payment mirror tables: OrderPayment and ChannelExchangeRate
--     + assignment to existing ACTIVE stores on the VIP plan
-- EF migration: 20260918131144_Add-MultiPayments-Module-And-Payment-Mirror
-- Date: 2026-09-18
-- Parity: DDL, catalog INSERTs, StorePlanModule INSERT and per-store
--         INSERT-SELECTs mirror the EF migration exactly. The per-store SQL is
--         the SAME text as Infrastructure.Migrations.MultiPaymentsModuleBackfill
--         constants. Requires scripts 12 (StorePlan) and 14 (StorePlanModule)
--         already applied.
-- Idempotent: IF NOT EXISTS guards and ON CONFLICT DO NOTHING.
-- =====================================================

BEGIN;

-- --- Table: ChannelExchangeRate (append-only per-store rate register) ---
CREATE TABLE IF NOT EXISTS "ChannelExchangeRate" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "Method" integer NOT NULL,
    "Currency" integer NOT NULL,
    "Value" numeric(18,6) NOT NULL,
    "EffectiveFrom" timestamp with time zone NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_ChannelExchangeRate" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ChannelExchangeRate_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

-- --- Table: OrderPayment (one row per payment, 0..N per order) ---
CREATE TABLE IF NOT EXISTS "OrderPayment" (
    "Id" uuid NOT NULL,
    "OrderId" uuid NOT NULL,
    "Method" integer NOT NULL,
    "Currency" integer NOT NULL,
    "Amount" numeric(18,2) NOT NULL,
    "RateApplied" numeric(18,6) NOT NULL,
    "RateMethod" integer,
    "RateCurrency" integer,
    "RateEffectiveFrom" timestamp with time zone,
    "AmountInOrderCurrency" numeric(18,2) NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_OrderPayment" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_OrderPayment_Order_OrderId" FOREIGN KEY ("OrderId") REFERENCES "Order" ("Id") ON DELETE RESTRICT
);

-- --- Indexes (same names/columns as the EF migration) ---
CREATE INDEX IF NOT EXISTS "IX_ChannelExchangeRate_StoreId" ON "ChannelExchangeRate" ("StoreId");
CREATE INDEX IF NOT EXISTS "IX_ChannelExchangeRate_TenantId" ON "ChannelExchangeRate" ("TenantId");
CREATE INDEX IF NOT EXISTS "IX_OrderPayment_OrderId" ON "OrderPayment" ("OrderId");
CREATE INDEX IF NOT EXISTS "IX_OrderPayment_TenantId" ON "OrderPayment" ("TenantId");

-- --- Catalog: Module 16 (Múltiples pagos, paid, effective price 5) ---
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (16, TRUE, 0, TRUE, 'Múltiples pagos', 126, 50, 10, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- --- Catalog: Feature 44 (MultiPayments) under module 16 ---
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (44, TRUE, 'Funcionalidad para pagar una venta con varios pagos y canales', TRUE, 16, 'MultiPayments', 77)
ON CONFLICT ("Id") DO NOTHING;

-- --- Plan assignment: module 16 for VIP (4) only ---
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (4, 16)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: StoreModule rows for existing ACTIVE VIP stores ---
-- (same SQL as MultiPaymentsModuleBackfill.StoreModuleSql)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                           "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                           "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", 16, FALSE, 10, 10, 0, 50, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
WHERE s."IsActive" = TRUE AND s."StorePlanId" = 4
ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;

-- --- Per-store assignment: OwnerAdmin (2) / StoreUser (3) StoreRoleFeature rows for 44 ---
-- (same SQL as MultiPaymentsModuleBackfill.StoreRoleFeatureSql)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT s."Id", r."Id", 44, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "Store" s
JOIN (VALUES (2), (3)) AS r("Id") ON TRUE
WHERE s."IsActive" = TRUE AND s."StorePlanId" = 4
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;

-- --- Sequence fix-ups: explicit PK inserts do not advance serials ---
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

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260918131144_Add-MultiPayments-Module-And-Payment-Mirror', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT "Id", "Name", "Price", "PercentDiscountPrice", "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" = 16;

SELECT "Id", "Name", "ModuleId", "IsActive" FROM "Feature" WHERE "Id" = 44;

SELECT sp."Id" AS plan_id, sp."Name" AS plan_name,
       COUNT(spm."ModuleId") AS module_count
FROM "StorePlan" sp
LEFT JOIN "StorePlanModule" spm ON spm."PlanId" = sp."Id"
WHERE sp."Id" IN (3, 4)
GROUP BY sp."Id", sp."Name"
ORDER BY sp."Id";

SELECT COUNT(*) AS vip_stores_with_module
FROM "StoreModule" WHERE "ModuleId" = 16;

SELECT COUNT(*) AS role_features_granted
FROM "StoreRoleFeature" WHERE "FeatureId" = 44;

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 44;
-- DELETE FROM "StoreModule" WHERE "ModuleId" = 16;
-- DELETE FROM "StorePlanModule" WHERE "ModuleId" = 16;
-- DELETE FROM "Feature" WHERE "Id" = 44;
-- DELETE FROM "Module" WHERE "Id" = 16;
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260918131144_Add-MultiPayments-Module-And-Payment-Mirror';
-- DROP TABLE IF EXISTS "ChannelExchangeRate";
-- DROP TABLE IF EXISTS "OrderPayment";
-- COMMIT;
-- =====================================================
