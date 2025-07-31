START TRANSACTION;

CREATE TABLE "Order" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "OrderType" integer NOT NULL,
    "Description" text NOT NULL,
    "Total" numeric(18,6) NOT NULL,
    "ItemsCount" integer NOT NULL,
    "Date" timestamp with time zone NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_Order" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Order_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "ProductCategory" (
    "Id" uuid NOT NULL,
    "Name" text NOT NULL,
    "Order" integer NOT NULL,
    "TenantId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_ProductCategory" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ProductCategory_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "StoreUsage" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Day" timestamp with time zone NOT NULL,
    "IpAddress" text NOT NULL,
    "GfDevice" text NOT NULL,
    "GfDeviceId" text NOT NULL,
    "GfSessionId" text NOT NULL,
    CONSTRAINT "PK_StoreUsage" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_StoreUsage_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_StoreUsage_User_UserId" FOREIGN KEY ("UserId") REFERENCES "User" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "Product" (
    "Id" uuid NOT NULL,
    "Name" text NOT NULL,
    "CategoryId" uuid NOT NULL,
    "Price" numeric(18,6) NOT NULL,
    "Order" integer NOT NULL,
    "AvailableToSale" boolean NOT NULL,
    "DiscountFromInventory" boolean NOT NULL,
    "BusinessId" text NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_Product" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Product_ProductCategory_CategoryId" FOREIGN KEY ("CategoryId") REFERENCES "ProductCategory" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "InventoryEntry" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "ProductId" uuid NOT NULL,
    "Quantity" integer NOT NULL,
    "Available" integer NOT NULL,
    "CostPrice" numeric(18,6) NOT NULL,
    "Date" timestamp with time zone NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_InventoryEntry" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_InventoryEntry_Product_ProductId" FOREIGN KEY ("ProductId") REFERENCES "Product" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_InventoryEntry_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "OrderItem" (
    "Id" uuid NOT NULL,
    "ProductId" uuid NOT NULL,
    "OrderId" uuid NOT NULL,
    "Name" text NOT NULL,
    "Quantity" integer NOT NULL,
    "Price" numeric(18,6) NOT NULL,
    "OrderIndex" integer NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_OrderItem" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_OrderItem_Order_OrderId" FOREIGN KEY ("OrderId") REFERENCES "Order" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_OrderItem_Product_ProductId" FOREIGN KEY ("ProductId") REFERENCES "Product" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "InventoryEntryCost" (
    "Id" uuid NOT NULL,
    "InventoryEntryId" uuid NOT NULL,
    "CostPrice" numeric(18,6) NOT NULL,
    "Quantity" integer NOT NULL,
    "OrderItemId" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_InventoryEntryCost" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_InventoryEntryCost_InventoryEntry_InventoryEntryId" FOREIGN KEY ("InventoryEntryId") REFERENCES "InventoryEntry" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_InventoryEntryCost_OrderItem_OrderItemId" FOREIGN KEY ("OrderItemId") REFERENCES "OrderItem" ("Id") ON DELETE RESTRICT
);

UPDATE "Feature" SET "IsActive" = TRUE
WHERE "Id" = 50;

UPDATE "Feature" SET "IsActive" = TRUE
WHERE "Id" = 60;

INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (14, FALSE, 'Funcionalidad para gestionar las funcionalidades', TRUE, 1, 'Funcionalidades', 40);
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (15, FALSE, 'Funcionalidad para gestionar todas las tiendas', TRUE, 1, 'Tiendas', 1);

UPDATE "Module" SET "IsActive" = TRUE, "Price" = 1000
WHERE "Id" = 6;

UPDATE "Role" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "Id" = 1;

UPDATE "Role" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "Id" = 2;

UPDATE "Role" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "Id" = 3;

UPDATE "Role" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "Id" = 4;

UPDATE "SystemConfiguration" SET "Value" = '20'
WHERE "Id" = 2;

UPDATE "Tenant" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "Id" = 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8';

UPDATE "User" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8';

UPDATE "UserRole" SET "CreatedDate" = TIMESTAMPTZ '2025-04-13T18:50:15.487441-04:00'
WHERE "RoleId" = 1 AND "UserId" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8';

CREATE INDEX "IX_InventoryEntry_ProductId" ON "InventoryEntry" ("ProductId");

CREATE INDEX "IX_InventoryEntry_StoreId" ON "InventoryEntry" ("StoreId");

CREATE INDEX "IX_InventoryEntry_TenantId" ON "InventoryEntry" ("TenantId");

CREATE INDEX "IX_InventoryEntryCost_InventoryEntryId" ON "InventoryEntryCost" ("InventoryEntryId");

CREATE INDEX "IX_InventoryEntryCost_OrderItemId" ON "InventoryEntryCost" ("OrderItemId");

CREATE INDEX "IX_InventoryEntryCost_TenantId" ON "InventoryEntryCost" ("TenantId");

CREATE INDEX "IX_Order_StoreId" ON "Order" ("StoreId");

CREATE INDEX "IX_Order_TenantId" ON "Order" ("TenantId");

CREATE INDEX "IX_OrderItem_OrderId" ON "OrderItem" ("OrderId");

CREATE INDEX "IX_OrderItem_ProductId" ON "OrderItem" ("ProductId");

CREATE INDEX "IX_OrderItem_TenantId" ON "OrderItem" ("TenantId");

CREATE INDEX "IX_Product_CategoryId" ON "Product" ("CategoryId");

CREATE INDEX "IX_Product_TenantId" ON "Product" ("TenantId");

CREATE INDEX "IX_ProductCategory_StoreId" ON "ProductCategory" ("StoreId");

CREATE INDEX "IX_ProductCategory_TenantId" ON "ProductCategory" ("TenantId");

CREATE INDEX "IX_StoreUsage_StoreId" ON "StoreUsage" ("StoreId");

CREATE INDEX "IX_StoreUsage_UserId_StoreId" ON "StoreUsage" ("UserId", "StoreId");

SELECT setval(
    pg_get_serial_sequence('"Feature"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Feature") + 1,
        nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
    false);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20250730201548_Add-StoreUsage-Table', '8.0.3');

COMMIT;

