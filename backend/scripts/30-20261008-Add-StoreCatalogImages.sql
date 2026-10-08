-- =====================================================
-- 30: Imagenes del SHOWCASE del catalogo publico (F3 carrusel + imagenes del dia)
--     Tabla "StoreCatalogImage": N filas por tienda, dos CONJUNTOS independientes (carrusel de la
--     cabecera y bloque de imagenes del dia, enum "StoreCatalogImageKind" persistido como integer),
--     orden dentro de cada conjunto via "OrderIndex".
--     (a) PK "Id" + FK Restrict a "Store" ("StoreId"): borrar una tienda NO debe decidir en cascada
--         que pasa con los archivos de su catalogo; los archivos se limpian desde el comando que los
--         subio (mismo criterio que DeliveryDriver y StoreCatalogSettings, script 29)
--     (b) indice por "StoreId": TODAS las lecturas filtran por tienda, en sesion y en publico
--     (c) indice UNICO por ("StoreId","Key"): la clave ya trae un guid, asi que dos filas con la
--         misma clave solo pueden significar que la misma imagen se registro dos veces — y "quitar"
--         borraria por una fila y dejaria la otra apuntando a un archivo que ya no esta. Lo convierte
--         en error de base en vez de dato raro
--     (d) indice por "TenantId": soporte del filtro global IsSuperAdmin || "TenantId" == TenantId de
--         ApplicationDbContext, del que dependen las lecturas EN SESION
--     (e) SIN columna de fecha: en v1 "del dia" es un bloque de destacadas que el dueno cambia a mano
--         (decision C4); anadirla despues es una migracion (decision de la entidad)
-- Migracion EF: 20261008021950_Add-StoreCatalogImages
-- Fecha: 2026-10-08
--
-- GENERADO con: dotnet ef migrations script 20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields
--   (migracion unica: -From es la ANTERIOR y -To se omite, per la regla del repo)
--
-- Paridad: el cuerpo del script es EXACTAMENTE el que emitio EF, en el mismo orden, y el DDL no se
--         toco a mano. El unico contenido agregado es el envoltura de idempotencia que ya usan los
--         scripts 08, 12, 14, 18, 25, 26, 27, 28 y 29 mas el bloque de verificacion y el ROLLBACK
--         comentado. NO hay INSERT de datos: esta migracion es 100% esquema, asi que no hay
--         constantes SQL compartidas (el criterio de PlanModuleConvergence / ElaborationModuleBackfill /
--         WarehousesPlanCleanup aplica a migraciones de DATOS PUROS, no a un CREATE TABLE que ya sale
--         del modelo).
--         Requiere: scripts previos aplicados (hasta 20261007021020_Add-StoreCatalogSettings-Drivers-
--         OrderFields) y la tabla "Store" existente (obvia de la 20240826132843_InitialCreate).
--
-- IDEMPOTENTE (desviaciones del texto de EF, todas documentadas, ninguna cambia la semantica):
--   * CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, igual que los scripts 08, 12, 14, 18,
--     25, 26, 27, 28 y 29, para que re-correr el script tras un fallo parcial no reviente con
--     "relation already exists" (tabla o indices) ni con duplicate_table.
--   * La FK va DENTRO del CREATE TABLE, como la emitio EF. Por eso NO hace falta el envoltorio
--     DO $$ ... IF NOT EXISTS (pg_constraint) del script 29: ahi la FK era un ALTER TABLE aparte
--     sobre "Order" y re-correrlo daba duplicate_object; aqui la restriccion viaja con la tabla, y el
--     IF NOT EXISTS del CREATE TABLE ya la cubre.
--   * ON CONFLICT ("MigrationId") DO NOTHING en __EFMigrationsHistory: EF emite un INSERT pelado y
--     correrlo dos veces revienta por PRIMARY KEY.
-- =====================================================

START TRANSACTION;

CREATE TABLE IF NOT EXISTS "StoreCatalogImage" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "Kind" integer NOT NULL,
    "Key" character varying(512) NOT NULL,
    "OrderIndex" integer NOT NULL DEFAULT 0,
    "Caption" character varying(200),
    "IsActive" boolean NOT NULL,
    "TenantId" uuid NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_StoreCatalogImage" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_StoreCatalogImage_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "IX_StoreCatalogImage_StoreId" ON "StoreCatalogImage" ("StoreId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_StoreCatalogImage_StoreId_Key" ON "StoreCatalogImage" ("StoreId", "Key");

CREATE INDEX IF NOT EXISTS "IX_StoreCatalogImage_TenantId" ON "StoreCatalogImage" ("TenantId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008021950_Add-StoreCatalogImages', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar ----------------------------------------------------------
-- 1) Migracion registrada (debe listar 1 fila):
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008021950_Add-StoreCatalogImages';

-- 2) La tabla nueva (debe listar 1):
SELECT table_name FROM information_schema.tables
WHERE table_name = 'StoreCatalogImage';

-- 3) Las 12 columnas del modelo (debe listar 12):
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'StoreCatalogImage'
ORDER BY column_name;

-- 4) Los 3 indices del modelo (debe listar 3):
SELECT indexname FROM pg_indexes
WHERE tablename = 'StoreCatalogImage'
  AND indexname IN ('IX_StoreCatalogImage_StoreId',
                    'IX_StoreCatalogImage_StoreId_Key',
                    'IX_StoreCatalogImage_TenantId')
ORDER BY indexname;

-- 5) El indice UNICO de ("StoreId","Key") (debe listar la definicion con UNIQUE):
SELECT indexdef FROM pg_indexes WHERE indexname = 'IX_StoreCatalogImage_StoreId_Key';

-- 6) "OrderIndex" NO es unico: el reordenado reescribe los indices de todo el conjunto, y un indice
--    unico obligaria a una actualizacion en dos pasos con intermedios invalidos. Solo puede quedar la
--    PK y el UNICO de ("StoreId","Key"), asi que este control debe listar 0 filas:
SELECT indexname FROM pg_indexes
WHERE tablename = 'StoreCatalogImage' AND indexdef LIKE 'CREATE UNIQUE%'
  AND indexname NOT IN ('IX_StoreCatalogImage_StoreId_Key', 'PK_StoreCatalogImage');

-- 7) Las 2 constraints: PK + FK Restrict (confdeltype 'r' = Restrict, debe listar 2):
SELECT conname, contype, confdeltype FROM pg_constraint
WHERE conrelid = '"StoreCatalogImage"'::regclass
ORDER BY conname;

-- 8) La FK apunta a "Store" ("Id") y es Restrict (debe listar 1 fila con StoreId | Id | r):
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'FK_StoreCatalogImage_Store_StoreId';

-- 9) El filtro global por tenant NO vive en la base (es del modelo, no un RLS de Postgres). Esta
--    consulta es el control de que el indice de "TenantId" esta ahi para soportarlo:
SELECT indexdef FROM pg_indexes WHERE indexname = 'IX_StoreCatalogImage_TenantId';

-- =====================================================
-- ROLLBACK (inverso de la migracion, ejecutar a mano solo si hace falta).
-- Mismo orden que el Down() de la migracion: una sola sentencia. La FK y los tres indices son de la
-- propia tabla, asi que DROP TABLE se los lleva; NO se borra nada de "Store" ni de "Feature" porque
-- la migracion no los toca.
--
-- BEGIN;
-- DROP TABLE IF EXISTS "StoreCatalogImage";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261008021950_Add-StoreCatalogImages';
-- COMMIT;
-- =====================================================
