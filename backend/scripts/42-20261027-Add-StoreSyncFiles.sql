-- 42-20261027-Add-StoreSyncFiles.sql
-- EF migration: 20261027154811_Add-StoreSyncFiles
-- Date: 2026-10-27
-- Creates the POS sync file repository (S1, S3, S4, S13):
--   * StoreSyncFile — one row per encrypted POS backup, ONE store per file. Bytes live on disk
--     (StorageKey = {tenantId}/{storeId}/{fileId}.zip); the row keeps the metadata. StoreName and
--     UploadedByFullName are SNAPSHOTS taken at upload time, not joins.
--   * StoreSyncFileDownload — one row per (file, user) as the informative "downloaded" mark; the
--     UNIQUE index on (StoreSyncFileId, UserId) is what makes it one mark and not a history.
-- No data backfill and no changes to any existing table.
-- Prerequisites: 20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   DROP TABLE "StoreSyncFileDownload";
--   DROP TABLE "StoreSyncFile";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261027154811_Add-StoreSyncFiles';
-- COMMIT;
-- NOTE: dropping the tables discards the metadata. The ZIP files on disk are NOT deleted by the
-- rollback and become orphaned; remove storage/sync/<tenant>/<store>/ manually if needed.

START TRANSACTION;

CREATE TABLE "StoreSyncFile" (
    "Id" uuid NOT NULL,
    "StoreId" uuid NOT NULL,
    "FileName" character varying(260) NOT NULL,
    "ContentType" character varying(128) NOT NULL,
    "SizeBytes" bigint NOT NULL,
    "StorageKey" character varying(512) NOT NULL,
    "UploadedByUserId" uuid NOT NULL,
    "UploadedByFullName" character varying(200) NOT NULL,
    "StoreName" character varying(200) NOT NULL,
    "DownloadCount" integer NOT NULL DEFAULT 0,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_StoreSyncFile" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_StoreSyncFile_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE RESTRICT
);

CREATE TABLE "StoreSyncFileDownload" (
    "Id" uuid NOT NULL,
    "StoreSyncFileId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "DownloadedAt" timestamp with time zone NOT NULL,
    "TenantId" uuid NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedDate" timestamp with time zone NOT NULL,
    "CreatedBy" uuid NOT NULL,
    "UpdatedDate" timestamp with time zone,
    "UpdatedBy" uuid,
    CONSTRAINT "PK_StoreSyncFileDownload" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId" FOREIGN KEY ("StoreSyncFileId") REFERENCES "StoreSyncFile" ("Id") ON DELETE RESTRICT
);

CREATE INDEX "IX_StoreSyncFile_CreatedDate" ON "StoreSyncFile" ("CreatedDate");

CREATE INDEX "IX_StoreSyncFile_StoreId" ON "StoreSyncFile" ("StoreId");

CREATE INDEX "IX_StoreSyncFile_TenantId" ON "StoreSyncFile" ("TenantId");

CREATE UNIQUE INDEX "IX_StoreSyncFileDownload_StoreSyncFileId_UserId" ON "StoreSyncFileDownload" ("StoreSyncFileId", "UserId");

CREATE INDEX "IX_StoreSyncFileDownload_TenantId" ON "StoreSyncFileDownload" ("TenantId");

CREATE INDEX "IX_StoreSyncFileDownload_UserId" ON "StoreSyncFileDownload" ("UserId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261027154811_Add-StoreSyncFiles', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261027154811_Add-StoreSyncFiles';

SELECT table_name FROM information_schema.tables
WHERE table_name IN ('StoreSyncFile', 'StoreSyncFileDownload')
ORDER BY table_name;

SELECT indexname FROM pg_indexes
WHERE tablename IN ('StoreSyncFile', 'StoreSyncFileDownload')
ORDER BY indexname;

