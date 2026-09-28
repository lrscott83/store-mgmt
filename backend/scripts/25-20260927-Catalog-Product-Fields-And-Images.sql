-- =====================================================
-- 25: WebCatalog (módulo 18) — campos de catálogo en Product/ProductCategory/Store
--     + tabla ProductImage (galería)
-- EF migration: 20260927185726_Catalog-Product-Fields-And-Images
-- Date: 2026-09-27
-- Parity: mirror exacto del Up() de la migración EF (DDL puro, sin datos): mismas columnas,
--         tipos, defaults, y los mismos índices únicos PARCIALES
--         ("CatalogSlug" IS NOT NULL / "Slug" IS NOT NULL) porque las tiendas y categorías
--         que todavía no se publicaron quedan en NULL y no deben chocar entre sí.
--         Los slugs existentes NO se rellenan aquí: los genera el Domain (SlugNormalizer)
--         durante la sincronización, para no duplicar la normalización en SQL.
-- Requires scripts 24 (módulo WebCatalog) already applied.
-- =====================================================

BEGIN;

-- --- Store: slug público + fecha de la última sincronización ---
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "CatalogSlug" character varying(63) NULL;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "CatalogSyncedAt" timestamp with time zone NULL;

-- --- ProductCategory: slug público por tienda ---
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "Slug" character varying(63) NULL;

-- --- Product: campos del catálogo web ---
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "Description" character varying(4000) NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "PercentDiscountPrice" integer NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "DiscountPrice" integer NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "IsNew" boolean NOT NULL DEFAULT FALSE;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "Image" character varying(512) NULL;

-- --- ProductImage: galería (images[] del contrato HTTP) ---
CREATE TABLE IF NOT EXISTS "ProductImage" (
    "Id" uuid NOT NULL,
    "ProductId" uuid NOT NULL,
    "Path" character varying(512) NOT NULL,
    "Order" integer NOT NULL DEFAULT 0,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone NULL,
    "UpdatedBy" uuid NULL,
    CONSTRAINT "PK_ProductImage" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ProductImage_Product_ProductId" FOREIGN KEY ("ProductId")
        REFERENCES "Product" ("Id") ON DELETE CASCADE
);

-- --- Indexes ---
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Store_CatalogSlug"
    ON "Store" ("CatalogSlug") WHERE "CatalogSlug" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "IX_ProductCategory_StoreId_Slug"
    ON "ProductCategory" ("StoreId", "Slug") WHERE "Slug" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IX_ProductImage_ProductId" ON "ProductImage" ("ProductId");
CREATE INDEX IF NOT EXISTS "IX_ProductImage_TenantId" ON "ProductImage" ("TenantId");

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260927185726_Catalog-Product-Fields-And-Images', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('Product', 'ProductCategory', 'Store')
  AND column_name IN ('Description', 'PercentDiscountPrice', 'DiscountPrice', 'IsNew', 'Image',
                      'Slug', 'CatalogSlug', 'CatalogSyncedAt')
ORDER BY table_name, column_name;

SELECT COUNT(*) AS product_image_table_exists
FROM information_schema.tables WHERE table_name = 'ProductImage';

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('Store', 'ProductCategory', 'ProductImage')
ORDER BY tablename, indexname;

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DROP TABLE IF EXISTS "ProductImage";
-- DROP INDEX IF EXISTS "IX_Store_CatalogSlug";
-- DROP INDEX IF EXISTS "IX_ProductCategory_StoreId_Slug";
-- ALTER TABLE "Store" DROP COLUMN IF EXISTS "CatalogSlug";
-- ALTER TABLE "Store" DROP COLUMN IF EXISTS "CatalogSyncedAt";
-- ALTER TABLE "ProductCategory" DROP COLUMN IF EXISTS "Slug";
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "Description";
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "DiscountPrice";
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "Image";
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "IsNew";
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "PercentDiscountPrice";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927185726_Catalog-Product-Fields-And-Images';
-- COMMIT;
-- =====================================================
