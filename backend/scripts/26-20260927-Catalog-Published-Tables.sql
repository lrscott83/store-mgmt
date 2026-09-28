-- =====================================================
-- 26: WebCatalog (módulo 18) — tablas del catálogo publicado
--     CatalogCategory / CatalogProduct / CatalogProductImage
-- EF migration: 20260927193020_Catalog-Published-Tables
-- Date: 2026-09-27
-- Parity: mirror exacto del Up() de la migración EF (DDL puro). Los índices únicos
--         (StoreId, SourceCategoryId) y (StoreId, SourceProductId) son la relación 1:1 con el
--         origen y la garantía de idempotencia de la sincronización: re-sincronizar actualiza
--         la fila, nunca crea otra.
-- Requires scripts 24 (módulo WebCatalog) y 25 (campos del catálogo) already applied.
-- =====================================================

BEGIN;

-- --- CatalogCategory: copia publicada de ProductCategory ---
CREATE TABLE IF NOT EXISTS "CatalogCategory" (
    "Id" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "SourceCategoryId" uuid NOT NULL,
    "Name" text NOT NULL,
    "Slug" character varying(63) NOT NULL,
    "Order" integer NOT NULL,
    "SyncedAt" timestamp with time zone NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone NULL,
    "UpdatedBy" uuid NULL,
    CONSTRAINT "PK_CatalogCategory" PRIMARY KEY ("Id")
);

-- --- CatalogProduct: copia publicada de Product ---
CREATE TABLE IF NOT EXISTS "CatalogProduct" (
    "Id" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "SourceProductId" uuid NOT NULL,
    "CatalogCategoryId" uuid NOT NULL,
    "Name" text NOT NULL,
    "Description" character varying(4000) NOT NULL DEFAULT '',
    "Price" numeric(18,6) NOT NULL,
    "Currency" integer NOT NULL,
    "PercentDiscountPrice" integer NOT NULL DEFAULT 0,
    "DiscountPrice" integer NOT NULL DEFAULT 0,
    "IsNew" boolean NOT NULL DEFAULT FALSE,
    "Image" character varying(512) NULL,
    "Order" integer NOT NULL,
    "SyncedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone NULL,
    "UpdatedBy" uuid NULL,
    CONSTRAINT "PK_CatalogProduct" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CatalogProduct_CatalogCategory_CatalogCategoryId" FOREIGN KEY ("CatalogCategoryId")
        REFERENCES "CatalogCategory" ("Id") ON DELETE RESTRICT
);

-- --- CatalogProductImage: galería publicada ---
CREATE TABLE IF NOT EXISTS "CatalogProductImage" (
    "Id" uuid NOT NULL,
    "CatalogProductId" uuid NOT NULL,
    "Path" character varying(512) NOT NULL,
    "Order" integer NOT NULL DEFAULT 0,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone NULL,
    "UpdatedBy" uuid NULL,
    CONSTRAINT "PK_CatalogProductImage" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CatalogProductImage_CatalogProduct_CatalogProductId" FOREIGN KEY ("CatalogProductId")
        REFERENCES "CatalogProduct" ("Id") ON DELETE CASCADE
);

-- --- Indexes ---
CREATE INDEX IF NOT EXISTS "IX_CatalogCategory_StoreId" ON "CatalogCategory" ("StoreId");
CREATE INDEX IF NOT EXISTS "IX_CatalogCategory_TenantId" ON "CatalogCategory" ("TenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogCategory_StoreId_Slug"
    ON "CatalogCategory" ("StoreId", "Slug");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogCategory_StoreId_SourceCategoryId"
    ON "CatalogCategory" ("StoreId", "SourceCategoryId");

CREATE INDEX IF NOT EXISTS "IX_CatalogProduct_StoreId" ON "CatalogProduct" ("StoreId");
CREATE INDEX IF NOT EXISTS "IX_CatalogProduct_TenantId" ON "CatalogProduct" ("TenantId");
CREATE INDEX IF NOT EXISTS "IX_CatalogProduct_CatalogCategoryId" ON "CatalogProduct" ("CatalogCategoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogProduct_StoreId_SourceProductId"
    ON "CatalogProduct" ("StoreId", "SourceProductId");

CREATE INDEX IF NOT EXISTS "IX_CatalogProductImage_CatalogProductId" ON "CatalogProductImage" ("CatalogProductId");
CREATE INDEX IF NOT EXISTS "IX_CatalogProductImage_TenantId" ON "CatalogProductImage" ("TenantId");

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260927193020_Catalog-Published-Tables', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('CatalogCategory', 'CatalogProduct', 'CatalogProductImage')
ORDER BY table_name;

SELECT tablename, indexname FROM pg_indexes
WHERE tablename IN ('CatalogCategory', 'CatalogProduct', 'CatalogProductImage')
ORDER BY tablename, indexname;

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DROP TABLE IF EXISTS "CatalogProductImage";
-- DROP TABLE IF EXISTS "CatalogProduct";
-- DROP TABLE IF EXISTS "CatalogCategory";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927193020_Catalog-Published-Tables';
-- COMMIT;
-- =====================================================
