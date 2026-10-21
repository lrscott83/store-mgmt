-- 39-20261021-Add-Sales-Commissions-Tables.sql
-- EF migration: 20261021203736_Add-Sales-Commissions-Tables
-- Date: 2026-10-21
-- Creates the three module-owned tables of Gestores de ventas:
--   ProductSalesCommission (config per product; type % or fixed; payout currency)
--   SalesManager (Owner-level gestor profile; unique UserId)
--   OrderSalesCommission (one per OrderItem; unique OrderItemId; payment audit)
-- No data backfill. `Product` and `Order` receive no columns.
-- Prerequisites: 20261021185058_Add-Gestores-Ventas-Module applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261021185058_Add-Gestores-Ventas-Module
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   DROP TABLE "OrderSalesCommission";
--   DROP TABLE "ProductSalesCommission";
--   DROP TABLE "SalesManager";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261021203736_Add-Sales-Commissions-Tables';
-- COMMIT;
-- NOTE: dropping the tables discards every commission and configuration already written.

START TRANSACTION;

CREATE TABLE "ProductSalesCommission" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "ProductId" uuid NOT NULL,
    "Type" integer NOT NULL,
    "Value" numeric(18,6) NOT NULL,
    "Currency" integer NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_ProductSalesCommission" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ProductSalesCommission_Product_ProductId" FOREIGN KEY ("ProductId") REFERENCES "Product" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_ProductSalesCommission_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "SalesManager" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "OwnerId" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_SalesManager" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_SalesManager_Owner_OwnerId" FOREIGN KEY ("OwnerId") REFERENCES "Owner" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_SalesManager_User_UserId" FOREIGN KEY ("UserId") REFERENCES "User" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "OrderSalesCommission" (
    "Id" uuid NOT NULL,
    "OrderId" uuid NOT NULL,
    "OrderItemId" uuid NOT NULL,
    "SalesManagerId" uuid NOT NULL,
    "OwnerId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "Type" integer NOT NULL,
    "Value" numeric(18,6) NOT NULL,
    "UnitPrice" numeric(18,2) NOT NULL,
    "Quantity" integer NOT NULL,
    "Amount" numeric(18,2) NOT NULL,
    "Currency" integer NOT NULL,
    "Status" integer NOT NULL,
    "PaidAt" timestamp with time zone,
    "PaidByUserId" uuid,
    "PaymentNote" character varying(500),
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_OrderSalesCommission" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_OrderSalesCommission_OrderItem_OrderItemId" FOREIGN KEY ("OrderItemId") REFERENCES "OrderItem" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesCommission_Order_OrderId" FOREIGN KEY ("OrderId") REFERENCES "Order" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesCommission_Owner_OwnerId" FOREIGN KEY ("OwnerId") REFERENCES "Owner" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesCommission_SalesManager_SalesManagerId" FOREIGN KEY ("SalesManagerId") REFERENCES "SalesManager" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesCommission_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesCommission_User_PaidByUserId" FOREIGN KEY ("PaidByUserId") REFERENCES "User" ("Id") ON DELETE RESTRICT
);

CREATE INDEX "IX_OrderSalesCommission_OrderId" ON "OrderSalesCommission" ("OrderId");

CREATE UNIQUE INDEX "IX_OrderSalesCommission_OrderItemId" ON "OrderSalesCommission" ("OrderItemId");

CREATE INDEX "IX_OrderSalesCommission_OwnerId" ON "OrderSalesCommission" ("OwnerId");

CREATE INDEX "IX_OrderSalesCommission_PaidByUserId" ON "OrderSalesCommission" ("PaidByUserId");

CREATE INDEX "IX_OrderSalesCommission_SalesManagerId" ON "OrderSalesCommission" ("SalesManagerId");

CREATE INDEX "IX_OrderSalesCommission_Status" ON "OrderSalesCommission" ("Status");

CREATE INDEX "IX_OrderSalesCommission_StoreId" ON "OrderSalesCommission" ("StoreId");

CREATE INDEX "IX_OrderSalesCommission_TenantId" ON "OrderSalesCommission" ("TenantId");

CREATE UNIQUE INDEX "IX_ProductSalesCommission_ProductId" ON "ProductSalesCommission" ("ProductId");

CREATE INDEX "IX_ProductSalesCommission_StoreId" ON "ProductSalesCommission" ("StoreId");

CREATE INDEX "IX_ProductSalesCommission_TenantId" ON "ProductSalesCommission" ("TenantId");

CREATE INDEX "IX_SalesManager_OwnerId" ON "SalesManager" ("OwnerId");

CREATE INDEX "IX_SalesManager_TenantId" ON "SalesManager" ("TenantId");

CREATE UNIQUE INDEX "IX_SalesManager_UserId" ON "SalesManager" ("UserId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261021203736_Add-Sales-Commissions-Tables', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261021203736_Add-Sales-Commissions-Tables';

SELECT table_name FROM information_schema.tables
WHERE table_name IN ('ProductSalesCommission', 'SalesManager', 'OrderSalesCommission')
ORDER BY table_name;

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'OrderSalesCommission'
  AND indexname = 'IX_OrderSalesCommission_OrderItemId';

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'ProductSalesCommission'
  AND indexname = 'IX_ProductSalesCommission_ProductId';

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'SalesManager'
  AND indexname = 'IX_SalesManager_UserId';

