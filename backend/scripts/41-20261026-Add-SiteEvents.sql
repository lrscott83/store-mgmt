-- 41-20261026-Add-SiteEvents.sql
-- EF migration: 20261026183144_Add-SiteEvents
-- Date: 2026-10-26
-- Creates SiteEvent: append-only telemetría anónima del sitio público (page views de landing,
-- login, register y legales + entradas al manual HTML/PDF). Sin StoreId ni TenantId: la tabla
-- NO es multi-tenant y no tiene query filter global.
-- No data backfill and no changes to any existing table.
-- Prerequisites: 20261021231114_Add-OrderSalesManager-Attribution applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261021231114_Add-OrderSalesManager-Attribution
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   DROP TABLE "SiteEvent";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261026183144_Add-SiteEvents';
-- COMMIT;
-- NOTE: dropping the table discards every page view and manual entry recorded so far.

START TRANSACTION;

CREATE TABLE "SiteEvent" (
    "Id" uuid NOT NULL,
    "OccurredAt" timestamp with time zone NOT NULL,
    "Kind" integer NOT NULL,
    "Path" character varying(200) NOT NULL,
    "StatusCode" integer,
    "VisitorHash" character varying(64) NOT NULL,
    "SessionHash" character varying(64) NOT NULL,
    "Source" integer NOT NULL,
    "ReferrerHost" character varying(200),
    "UtmSource" character varying(100),
    "UtmMedium" character varying(100),
    "UtmCampaign" character varying(100),
    "DeviceType" integer NOT NULL,
    CONSTRAINT "PK_SiteEvent" PRIMARY KEY ("Id")
);

CREATE INDEX "IX_SiteEvent_Kind_OccurredAt" ON "SiteEvent" ("Kind", "OccurredAt");

CREATE INDEX "IX_SiteEvent_OccurredAt" ON "SiteEvent" ("OccurredAt");

CREATE INDEX "IX_SiteEvent_Path_OccurredAt" ON "SiteEvent" ("Path", "OccurredAt");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261026183144_Add-SiteEvents', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261026183144_Add-SiteEvents';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'SiteEvent';

SELECT indexname FROM pg_indexes
WHERE tablename = 'SiteEvent'
ORDER BY indexname;

