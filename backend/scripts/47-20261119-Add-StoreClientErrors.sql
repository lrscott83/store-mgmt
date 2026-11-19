-- 47-20261119-Add-StoreClientErrors.sql
-- EF migration: 20261119193711_Add-StoreClientErrors
-- Date: 2026-11-19
-- Creates the persistence table for POS client error logs (pos-client-error-logs, S4 + S5):
--   * StoreClientError — one row per published client error, with the client's own `OccurredAt`
--     and the server `ReceivedAt`, both `timestamp with time zone` (UTC).
--   * StoreId is NULLABLE: errors raised before a session exists (failed login, device key) have
--     no store and are still published (S4). The view shows "—" for owner and store name.
--   * The FK to "Store" is ON DELETE CASCADE so the E2E `ResetDataAsync` keeps deleting stores
--     without having to know about this table (S5).
--   * Count defaults to 1 — a row never represents zero occurrences.
-- No data backfill and no changes to any existing table.
-- Prerequisites: 20261105230228_Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261105230228_Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   DROP TABLE "StoreClientError";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261119193711_Add-StoreClientErrors';
-- COMMIT;

START TRANSACTION;

CREATE TABLE "StoreClientError" (
    "Id" uuid NOT NULL,
    "StoreId" uuid,
    "Message" character varying(500) NOT NULL,
    "Route" character varying(300),
    "Location" character varying(500),
    "Count" integer NOT NULL DEFAULT 1,
    "Context" character varying(1000),
    "AppVersion" character varying(50),
    "Device" character varying(200),
    "OccurredAt" timestamp with time zone NOT NULL,
    "ReceivedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_StoreClientError" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_StoreClientError_Store_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Store" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_StoreClientError_OccurredAt" ON "StoreClientError" ("OccurredAt");

CREATE INDEX "IX_StoreClientError_StoreId_OccurredAt" ON "StoreClientError" ("StoreId", "OccurredAt");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261119193711_Add-StoreClientErrors', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261119193711_Add-StoreClientErrors';

SELECT column_name, data_type, is_nullable, character_maximum_length, column_default
FROM information_schema.columns
WHERE table_name = 'StoreClientError'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = '"StoreClientError"'::regclass
ORDER BY conname;

SELECT indexname FROM pg_indexes
WHERE tablename = 'StoreClientError'
ORDER BY indexname;

