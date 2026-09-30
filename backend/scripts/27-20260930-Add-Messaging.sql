-- =====================================================
-- 27: Mensajería SuperAdmin <-> Owner (migración 20260929172332_AddMessaging)
--     Crea las tablas "Conversations" y "Messages" (chat 1:1 por tienda)
--     con sus índices. Script idempotente: se puede re-correr.
-- Requires: migraciones previas ya aplicadas (hasta 20260928191227_Add-WebCatalog-Module-Vip).
-- =====================================================

BEGIN;

-- =====================================================
-- Conversaciones (una por Owner + tienda)
-- =====================================================

CREATE TABLE IF NOT EXISTS "Conversations" (
    "Id" uuid NOT NULL,
    "OwnerId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "LastMessageAt" timestamp with time zone NOT NULL,
    "LastMessageContent" text,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_Conversations" PRIMARY KEY ("Id")
);

-- =====================================================
-- Mensajes
-- =====================================================

CREATE TABLE IF NOT EXISTS "Messages" (
    "Id" uuid NOT NULL,
    "ConversationId" uuid NOT NULL,
    "SenderId" uuid NOT NULL,
    "SenderType" integer NOT NULL,
    "RecipientId" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "Content" character varying(4000) NOT NULL,
    "SentAt" timestamp with time zone NOT NULL,
    "ReadAt" timestamp with time zone,
    "IsDeletedBySender" boolean NOT NULL,
    "IsDeletedByRecipient" boolean NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_Messages" PRIMARY KEY ("Id")
);

CREATE INDEX IF NOT EXISTS "IX_Conversations_OwnerId" ON "Conversations" ("OwnerId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_Conversations_OwnerId_StoreId" ON "Conversations" ("OwnerId", "StoreId");

CREATE INDEX IF NOT EXISTS "IX_Conversations_StoreId" ON "Conversations" ("StoreId");

CREATE INDEX IF NOT EXISTS "IX_Messages_ConversationId" ON "Messages" ("ConversationId");

CREATE INDEX IF NOT EXISTS "IX_Messages_RecipientId" ON "Messages" ("RecipientId");

CREATE INDEX IF NOT EXISTS "IX_Messages_SenderId" ON "Messages" ("SenderId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260929172332_AddMessaging', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;
