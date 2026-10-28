-- 40-20261021-Add-OrderSalesManager-Attribution.sql
-- EF migration: 20261021231114_Add-OrderSalesManager-Attribution
-- Date: 2026-10-21
-- Creates OrderSalesManager: one row per order attributing it to one sales manager.
-- "OrderId" is unique; no data backfill and no new columns on "Order".
-- Prerequisites: 20261021203736_Add-Sales-Commissions-Tables applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261021203736_Add-Sales-Commissions-Tables
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   DROP TABLE "OrderSalesManager";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261021231114_Add-OrderSalesManager-Attribution';
-- COMMIT;
-- NOTE: dropping the table discards every order→gestor attribution.

START TRANSACTION;

CREATE TABLE "OrderSalesManager" (
    "Id" uuid NOT NULL,
    "OrderId" uuid NOT NULL,
    "SalesManagerId" uuid NOT NULL,
    "OwnerId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_OrderSalesManager" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_OrderSalesManager_Order_OrderId" FOREIGN KEY ("OrderId") REFERENCES "Order" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesManager_Owner_OwnerId" FOREIGN KEY ("OwnerId") REFERENCES "Owner" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesManager_SalesManager_SalesManagerId" FOREIGN KEY ("SalesManagerId") REFERENCES "SalesManager" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderSalesManager_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "IX_OrderSalesManager_OrderId" ON "OrderSalesManager" ("OrderId");

CREATE INDEX "IX_OrderSalesManager_OwnerId" ON "OrderSalesManager" ("OwnerId");

CREATE INDEX "IX_OrderSalesManager_SalesManagerId" ON "OrderSalesManager" ("SalesManagerId");

CREATE INDEX "IX_OrderSalesManager_StoreId" ON "OrderSalesManager" ("StoreId");

CREATE INDEX "IX_OrderSalesManager_TenantId" ON "OrderSalesManager" ("TenantId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261021231114_Add-OrderSalesManager-Attribution', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261021231114_Add-OrderSalesManager-Attribution';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'OrderSalesManager';

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'OrderSalesManager'
  AND indexname = 'IX_OrderSalesManager_OrderId';

