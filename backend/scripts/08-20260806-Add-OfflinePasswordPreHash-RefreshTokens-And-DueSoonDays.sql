-- ============================================================
-- 08: Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays
-- Migration: 20260806024450
-- Date: 2026-08-06
-- Idempotent: safe to run multiple times
-- ============================================================

-- 1) Agregar columna OfflinePasswordPreHash a la tabla User (si no existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'OfflinePasswordPreHash'
    ) THEN
        ALTER TABLE "User" ADD "OfflinePasswordPreHash" character varying(256) NULL;
    END IF;
END $$;

-- 2) Crear tabla RefreshTokens (si no existe)
CREATE TABLE IF NOT EXISTS "RefreshTokens" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Token" character varying(500) NOT NULL,
    "TokenHash" character varying(500) NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "RevokedAt" timestamp with time zone NULL,
    "ReplacedByToken" character varying(500) NULL,
    CONSTRAINT "PK_RefreshTokens" PRIMARY KEY ("Id")
);

-- 3) Insertar configuración DueSoonDays (si no existe)
INSERT INTO "SystemConfiguration" ("Id", "Name", "Value")
VALUES (4, 'DueSoonDays', '5')
ON CONFLICT ("Id") DO NOTHING;

-- 4) Inicializar OfflinePasswordPreHash del SuperAdmin seed a NULL
UPDATE "User"
SET "OfflinePasswordPreHash" = NULL
WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8';

-- 5) Crear índices (si no existen)
CREATE UNIQUE INDEX IF NOT EXISTS "IX_RefreshTokens_TokenHash" ON "RefreshTokens" ("TokenHash");
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_UserId" ON "RefreshTokens" ("UserId");

-- 6) Registrar la migración en el historial de EF Core
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260806024450_Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays', '9.0.0')
ON CONFLICT ("MigrationId") DO NOTHING;
