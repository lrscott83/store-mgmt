-- ============================================================
-- 08: Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays
-- Migration: 20260806024450
-- Date: 2026-08-06
-- ============================================================

-- 1) Agregar columna OfflinePasswordPreHash a la tabla User
ALTER TABLE "User" ADD "OfflinePasswordPreHash" character varying(256) NULL;

-- 2) Crear tabla RefreshTokens
CREATE TABLE "RefreshTokens" (
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

-- 3) Insertar configuración DueSoonDays
INSERT INTO "SystemConfiguration" ("Id", "Name", "Value")
VALUES (4, 'DueSoonDays', '5');

-- 4) Inicializar OfflinePasswordPreHash del SuperAdmin seed a NULL
UPDATE "User"
SET "OfflinePasswordPreHash" = NULL
WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8';

-- 5) Crear índices
CREATE UNIQUE INDEX "IX_RefreshTokens_TokenHash" ON "RefreshTokens" ("TokenHash");
CREATE INDEX "IX_RefreshTokens_UserId" ON "RefreshTokens" ("UserId");
