-- =====================================================
-- 29: Pedidos WhatsApp — PERSISTENCIA (F2, feature pedidos-whatsapp-persistencia)
--     (a) columnas de pedido online en "Order": Code, DeliveryType, Status, PaymentStatus,
--         CustomerName, CustomerPhone, DeliveryAddress, Notes, DriverId
--     (b) indice UNICO PARCIAL ("StoreId","Code") filtrado por "Code" IS NOT NULL, porque Code es
--         null en las ventas del POS (D6/D14) y dos tiendas pueden tener su propio codigo
--     (c) tabla "DeliveryDriver" — repartidores de la tienda (D5), FK Restrict desde Order.DriverId
--         para que borrar un repartidor no tumbe los pedidos que ya entrego
--     (d) tabla "StoreCatalogSettings" — una fila por tienda (StoreId UNICO, D7) con la config de
--         pedidos (F1) y la marca (F8) juntas (D19). SIN columna Currency (A3 eliminada): el precio
--         y la moneda del pedido salen del catalogo
--     (e) feature 123 "Pedidos online" bajo el modulo 18 (Catalogo web) + filas StoreRoleFeature
--         para OwnerAdmin (2) y StoreUser (3) en las tiendas que ya tienen el modulo 18 (D15)
-- Migracion EF: 20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields
-- Fecha: 2026-10-06
--
-- GENERADO con: dotnet ef migrations script 20261003221534_AddNotifications
--   (migracion unica: -From es la ANTERIOR y -To se omite, per la regla del repo)
--
-- Paridad: el cuerpo del script es EXACTAMENTE el que emitio EF. El INSERT de la feature 123 es el
--         InsertData que EF genera desde FeatureEntityTypeConfiguration.HasData — el camino de seeds
--         del repo, NO SQL a mano (arreglo de higiene del 2026-10-06: antes la fila 123 entraba por
--         SQL crudo en la migracion y quedaba fuera del snapshot, divergiendo del seed). El
--         INSERT de StoreRoleFeature y los setval son el mismo texto de las constantes
--         Infrastructure.Migrations.OnlineOrdersRoleFeatureBackfill que ejecuta el Up() de la
--         migracion — el script se GENERA, nunca se escribe a mano.
--         Requiere: scripts previos aplicados (hasta 20261003221534_AddNotifications), y para que
--         la parte de StoreRoleFeature tenga efecto, el modulo 18 + sus StoreModule (scripts 24 y 26).
--
-- NOTA — el setval de "Feature" aparece DOS veces (lineas ~88 y ~95): el primero es la constante
--   SequenceFixupsSql del Up() y el segundo lo emite el proveedor Npgsql al final de la migracion
--   porque ahora la feature 123 es un InsertData real. Son la MISMA sentencia y el resultado es
--   idempotente (GREATEST(MAX+1, nextval) recalcula el mismo valor); se conserva la de la migracion
--   porque AGENTS.md exige que el reset del serial viaje con la migracion.
--
-- IDEMPOTENTE (desviaciones del texto de EF, todas documentadas, ninguna cambia la semantica):
--   * ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, igual que
--     los scripts 08, 12, 14, 18, 25, 26, 27 y 28, para que re-correr el script tras un fallo
--     parcial no reviente con "column already exists" / "relation already exists".
--   * ON CONFLICT ("Id") DO NOTHING en el INSERT de "Feature": EF emite el INSERT pelado, y correrlo
--     dos veces —o aplicarlo sobre una base donde la fila ya existe— revienta por PRIMARY KEY.
--   * La FK de Order.DriverId va dentro de un DO $$ ... IF NOT EXISTS (pg_constraint): EF emite un
--     ADD CONSTRAINT pelado que re-correr daria duplicate_object (el script 12 se dejo asi y por eso
--     no es re-ejecutable de punta a punta).
--   * ON CONFLICT ("MigrationId") DO NOTHING en __EFMigrationsHistory: EF emite un INSERT pelado y
--     correrlo dos veces revienta por PRIMARY KEY.
-- =====================================================

START TRANSACTION;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "Code" character varying(16);

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "CustomerName" text;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "CustomerPhone" text;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "DeliveryAddress" text;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "DeliveryType" integer NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "DriverId" uuid;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "Notes" text;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "PaymentStatus" integer NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "Status" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "DeliveryDriver" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Phone" character varying(32) NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_DeliveryDriver" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_DeliveryDriver_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "StoreCatalogSettings" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "Enabled" boolean NOT NULL,
    "WhatsappNumber" character varying(32),
    "PickupEnabled" boolean NOT NULL,
    "DeliveryEnabled" boolean NOT NULL,
    "DeliveryFee" numeric(18,2) NOT NULL,
    "MinimumOrderAmount" numeric(18,2) NOT NULL,
    "BusinessHours" character varying(512),
    "DeliveryZones" character varying(512),
    "LogoKey" character varying(512),
    "BannerKey" character varying(512),
    "PaletteId" character varying(64) NOT NULL,
    "TenantId" uuid NOT NULL,
    "SyncedAt" timestamp with time zone,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_StoreCatalogSettings" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_StoreCatalogSettings_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

-- InsertData de EF para la feature 123, sembrada por FeatureEntityTypeConfiguration.HasData.
-- ON CONFLICT DO NOTHING lo anade el patch de idempotencia (EF emite el INSERT pelado).
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (123, TRUE, 'Funcionalidad para gestionar los pedidos online de la tienda', TRUE, 18, 'Pedidos online', 251)
ON CONFLICT ("Id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "IX_Order_DriverId" ON "Order" ("DriverId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_Order_StoreId_Code" ON "Order" ("StoreId", "Code") WHERE "Code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IX_DeliveryDriver_StoreId" ON "DeliveryDriver" ("StoreId");

CREATE INDEX IF NOT EXISTS "IX_DeliveryDriver_TenantId" ON "DeliveryDriver" ("TenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_StoreCatalogSettings_StoreId" ON "StoreCatalogSettings" ("StoreId");

CREATE INDEX IF NOT EXISTS "IX_StoreCatalogSettings_TenantId" ON "StoreCatalogSettings" ("TenantId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'FK_Order_DeliveryDriver_DriverId'
          AND conrelid = '"Order"'::regclass)
    THEN
        ALTER TABLE "Order" ADD CONSTRAINT "FK_Order_DeliveryDriver_DriverId" FOREIGN KEY ("DriverId") REFERENCES "DeliveryDriver" ("Id") ON DELETE RESTRICT;
    END IF;
END $$;

INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT sm."StoreId", v."RoleId", 123, s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
JOIN (VALUES (2), (3)) AS v("RoleId") ON TRUE
WHERE s."IsActive" = TRUE AND sm."ModuleId" = 18 AND sm."IsActive" = TRUE
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;

-- setval #1: la constante OnlineOrdersRoleFeatureBackfill.SequenceFixupsSql del Up().
SELECT setval(
    pg_get_serial_sequence('"Feature"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Feature") + 1,
        nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
    false);

-- setval #2: lo emite el proveedor Npgsql al final de la migracion, ahora que la feature 123 es un
-- InsertData real (antes la fila entraba por SQL crudo y Npgsql no emitia nada). Misma sentencia,
-- mismo resultado: GREATEST(MAX+1, nextval) recalcula el mismo valor, asi que repetirla es inofensivo.
SELECT setval(
    pg_get_serial_sequence('"Feature"', 'Id'),
    GREATEST(
        (SELECT MAX("Id") FROM "Feature") + 1,
        nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
    false);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar ----------------------------------------------------------
-- 1) Migracion registrada (debe listar 1 fila):
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields';

-- 2) Las dos tablas nuevas (debe listar 2):
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('DeliveryDriver', 'StoreCatalogSettings')
ORDER BY table_name;

-- 3) Las 9 columnas nuevas de "Order" (debe listar 9):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Order'
  AND column_name IN ('Code','CustomerName','CustomerPhone','DeliveryAddress','DeliveryType',
                      'DriverId','Notes','PaymentStatus','Status')
ORDER BY column_name;

-- 4) Los 6 indices del modelo (debe listar 6):
SELECT indexname FROM pg_indexes
WHERE indexname IN ('IX_Order_StoreId_Code','IX_Order_DriverId',
                    'IX_DeliveryDriver_StoreId','IX_DeliveryDriver_TenantId',
                    'IX_StoreCatalogSettings_StoreId','IX_StoreCatalogSettings_TenantId')
ORDER BY indexname;

-- 5) El indice UNICO de Code es PARCIAL: los pedidos del POS (Code NULL) pueden repetir en la misma
--    tienda, pero dos pedidos online con el mismo codigo NO (debe listar la definicion con el filtro):
SELECT indexdef FROM pg_indexes WHERE indexname = 'IX_Order_StoreId_Code';

-- 6) Feature 123 del catalogo (debe listar 1 fila: la del HasData, sin duplicados aunque el script
--    se haya corrido dos veces — de ahi el ON CONFLICT):
SELECT "Id", "Name", "Description", "ModuleId", "Order", "AvailableToStore", "IsActive"
FROM "Feature" WHERE "Id" = 123;

-- 6b) Paridad seed <-> base: 123 filas con esos MISMOS valores (debe listar 1). Si sale 0, el seed de
--     FeatureEntityTypeConfiguration.HasData no coincide con lo que hay en la base.
SELECT COUNT(*) AS feature_123_matches_seed
FROM "Feature"
WHERE "Id" = 123
  AND "Name" = 'Pedidos online'
  AND "Description" = 'Funcionalidad para gestionar los pedidos online de la tienda'
  AND "ModuleId" = 18 AND "Order" = 251
  AND "AvailableToStore" = TRUE AND "IsActive" = TRUE;

-- 7) Las tres FK Restrict (debe listar 3: Order.DriverId + las dos de las tablas nuevas):
SELECT conname, confdeltype FROM pg_constraint
WHERE conname IN ('FK_Order_DeliveryDriver_DriverId',
                  'FK_DeliveryDriver_Store_StoreId',
                  'FK_StoreCatalogSettings_Store_StoreId')
ORDER BY conname;

-- 8) StoreRoleFeature de la feature 123 (2 por tienda con modulo 18: OwnerAdmin + StoreUser).
--    En una base recien migrada puede ser 0 si ninguna tienda activa tiene aun el modulo 18:
SELECT srf."StoreId", srf."RoleId", srf."FeatureId", srf."IsActive"
FROM "StoreRoleFeature" srf
WHERE srf."FeatureId" = 123
ORDER BY srf."StoreId", srf."RoleId";

-- 9) Cuantas tiendas activas tienen el modulo 18 (= universo real del punto 8):
SELECT COUNT(*) AS active_stores_with_webcatalog_module
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."ModuleId" = 18 AND sm."IsActive" = TRUE AND s."IsActive" = TRUE;

-- 10) El serial de "Feature" quedo por encima del maximo (los INSERT con PK explicito no lo mueven):
SELECT last_value, is_called FROM "Feature_Id_seq";

-- =====================================================
-- ROLLBACK (inverso de la migracion, ejecutar a mano solo si hace falta).
-- Mismo orden que el Down() de la migracion: primero la FK, luego las tablas, luego los indices,
-- luego los datos (StoreRoleFeature ANTES que Feature por el FK Restrict — el DeleteData de EF
-- borra la fila del catalogo y reventaria si quedaran permisos colgando), y al final las columnas.
-- NO borra el modulo 18 ni sus StoreModule: son anteriores a esta migracion.
--
-- BEGIN;
-- ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "FK_Order_DeliveryDriver_DriverId";
-- DROP TABLE IF EXISTS "DeliveryDriver";
-- DROP TABLE IF EXISTS "StoreCatalogSettings";
-- DROP INDEX IF EXISTS "IX_Order_DriverId";
-- DROP INDEX IF EXISTS "IX_Order_StoreId_Code";
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 123;
-- DELETE FROM "Feature" WHERE "Id" = 123;
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "Code";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "CustomerName";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "CustomerPhone";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "DeliveryAddress";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "DeliveryType";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "DriverId";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "Notes";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "PaymentStatus";
-- ALTER TABLE "Order" DROP COLUMN IF EXISTS "Status";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields';
-- COMMIT;
-- =====================================================

