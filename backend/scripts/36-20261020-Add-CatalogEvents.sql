-- =============================================================================
-- 36 - Add CatalogEvent (telemetría anónima del catálogo público)
-- =============================================================================
-- EF migration : 20261020141816_Add-CatalogEvents
-- Generated    : dotnet ef migrations script 20261019160559_AddStoreLocationFields
--                (single migration: -From the PREVIOUS migration, no -To)
-- Date         : 2026-10-20
-- Parity       : schema-only; the SQL body is the generated one.
-- Prerequisite : 20261019160559_AddStoreLocationFields applied.
-- Idempotency  : the __EFMigrationsHistory insert uses ON CONFLICT DO NOTHING.
-- =============================================================================

START TRANSACTION;

CREATE TABLE "CatalogEvent" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "OccurredAt" timestamp with time zone NOT NULL,
    "Type" integer NOT NULL,
    "VisitorHash" character varying(64) NOT NULL,
    "SessionHash" character varying(64) NOT NULL,
    "Path" character varying(200) NOT NULL,
    "ProductId" uuid,
    "Source" integer NOT NULL,
    "ReferrerHost" character varying(200),
    "UtmSource" character varying(100),
    "UtmMedium" character varying(100),
    "UtmCampaign" character varying(100),
    "DeviceType" integer NOT NULL,
    CONSTRAINT "PK_CatalogEvent" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CatalogEvent_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_CatalogEvent_StoreId_OccurredAt" ON "CatalogEvent" ("StoreId", "OccurredAt");

CREATE INDEX "IX_CatalogEvent_StoreId_ProductId_OccurredAt" ON "CatalogEvent" ("StoreId", "ProductId", "OccurredAt");

CREATE INDEX "IX_CatalogEvent_StoreId_SessionHash" ON "CatalogEvent" ("StoreId", "SessionHash");

CREATE INDEX "IX_CatalogEvent_StoreId_Type_OccurredAt" ON "CatalogEvent" ("StoreId", "Type", "OccurredAt");

CREATE INDEX "IX_CatalogEvent_TenantId" ON "CatalogEvent" ("TenantId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261020141816_Add-CatalogEvents', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT "MigrationId", "ProductVersion"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261020141816_Add-CatalogEvents';

SELECT COUNT(*) AS "CatalogEventTableCount"
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'CatalogEvent';

-- -----------------------------------------------------------------------------
-- Rollback (manual, only if this script must be undone)
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DROP TABLE IF EXISTS "CatalogEvent";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020141816_Add-CatalogEvents';
-- COMMIT;
