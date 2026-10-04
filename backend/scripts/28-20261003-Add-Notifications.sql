-- =====================================================
-- 28: Notificaciones al SuperAdmin por registro de propietario
-- Migracion EF: 20261003221534_AddNotifications
--
-- GENERADO con: dotnet ef migrations script 20260930090000_PlanModuleConvergence
--   (migracion unica: -From es la ANTERIOR y -To se omite, per la regla del repo)
--
-- Crea la tabla "Notifications" con sus dos indices. Los tres datos visibles
-- (nombre del propietario, su telefono, nombre de la tienda) se COPIAN a la fila
-- en vez de resolverse por join, para que la notificacion siga contando la
-- verdad sobre el momento del registro aunque el owner o la tienda se renombren.
-- No lleva columna TenantId ni filtro de tenant: el destinatario es el SuperAdmin
-- canonico (DataUtils.SuperAdminUser.Id), una plataforma global, no una tienda.
-- Requires: migraciones previas ya aplicadas (hasta 20260930090000_PlanModuleConvergence).
--
-- IDEMPOTENTE: CREATE ... IF NOT EXISTS (igual que 27-Add-Messaging) para que
-- re-correr el script tras un fallo parcial no reviente con "relation already
-- exists". Es la unica desviacion del texto que emitio EF, y no cambia la
-- semantica del DDL.
-- =====================================================

START TRANSACTION;

CREATE TABLE IF NOT EXISTS "Notifications" (
    "Id" uuid NOT NULL,
    "OwnerName" character varying(200) NOT NULL,
    "OwnerCellPhone" character varying(50) NOT NULL,
    "StoreName" character varying(200) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "ReadAt" timestamp with time zone,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_Notifications" PRIMARY KEY ("Id")
);

CREATE INDEX IF NOT EXISTS "IX_Notifications_CreatedAt" ON "Notifications" ("CreatedAt");

CREATE INDEX IF NOT EXISTS "IX_Notifications_ReadAt" ON "Notifications" ("ReadAt");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261003221534_AddNotifications', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar ----------------------------------------------------------
-- 1) La tabla existe con sus columnas (debe listar las 11):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Notifications'
ORDER BY ordinal_position;

-- 2) Los dos indices del modelo (debe listar 2):
SELECT indexname FROM pg_indexes
WHERE tablename = 'Notifications'
ORDER BY indexname;

-- 3) Migracion registrada (debe listar 1 fila):
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261003221534_AddNotifications';

-- 4) Badge de la campana: cuantas hay sin leer (debe ser 0 recien migrado):
SELECT COUNT(*) AS "UnreadCount" FROM "Notifications" WHERE "ReadAt" IS NULL;

-- ROLLBACK (descomentar para revertir) ---------------------------
-- DROP INDEX IF EXISTS "IX_Notifications_ReadAt";
-- DROP INDEX IF EXISTS "IX_Notifications_CreatedAt";
-- DROP TABLE IF EXISTS "Notifications";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261003221534_AddNotifications';

