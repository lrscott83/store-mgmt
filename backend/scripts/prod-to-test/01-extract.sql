-- =====================================================
-- prod-to-test / 01-extract.sql
--
-- Purpose : read the identity + permission graph out of a database
--           and write one CSV file per table under prod-to-test/data/.
-- Runs on : the SOURCE database (production).
-- Safety  : strictly read-only. It contains no data-changing statement
--           and no schema statement of any kind. Every statement below is
--           a SELECT or a COPY ... TO.
-- Tooling : psql (it uses the \o and \pset meta-commands).
--
-- HOW TO RUN (from the backend/scripts directory):
--
--   umask 077
--   mkdir -p prod-to-test/data
--   rm -f prod-to-test/data/*.csv
--   psql "$SOURCE_DSN" -f prod-to-test/01-extract.sql \
--        | tee prod-to-test/extract-baseline.txt
--
-- The path "prod-to-test/data" is relative to the current working
-- directory, so psql must be run from backend/scripts. Every output path
-- is spelled out literally in this file on purpose: no psql variable is
-- involved, so nothing can silently resolve to an unexpected place.
--
-- umask 077 IS NOT OPTIONAL, and it has to be in THIS shell, on its own
-- line before the psql call. The CSVs are written by psql, which is a
-- separate process that inherits this shell's umask; a SET inside the SQL
-- would not work, because this script runs inside a READ ONLY transaction
-- and a SET is not allowed there. Under the usual umask 022 the twelve
-- files land as -rw-r--r--, and they carry real Argon2id password hashes,
-- OfflinePasswordPreHash envelopes, names, e-mail addresses and phone
-- numbers. Any unprivileged local account, backup job or scp of that
-- directory can read them for as long as they exist.
--
-- The rm -f is there for a reason too. Nothing deletes the CSVs at the
-- START of an extraction, only at the very end of the procedure, so
-- without it a file left over from a previous run survives a new extract
-- that never rewrote it, and the load then reads a mixture of two runs.
-- Removing them first makes "the file that is on disk" and "the file this
-- run wrote" the same thing.
--
-- Section A prints the baseline counts to stdout. KEEP that output: it is
-- the "before" side of the comparison that 03-verify.sql is read against.
-- Section B writes the row data, one CSV per table.
--
-- Both sections run inside ONE REPEATABLE READ snapshot, so the counts in
-- Section A and the rows in Section B describe the same instant even if
-- production is being written to while you run this.
--
-- THERE IS NO TENANT FILTER IN THIS SCRIPT, AND THERE MUST NOT BE ONE.
-- Every row of every table below is copied, whatever TenantId it carries. A
-- silent filter would hand the maintainer a partial graph with no visible
-- cause, and the rows it dropped would only surface much later as a user who
-- logs in and sees nothing. Instead the full tenant distribution is printed
-- in Section A, so going ahead is a decision the maintainer takes on purpose.
-- 02-load.sql then refuses, loudly and by name, any row that is not on the
-- Default Tenant.
--
-- Column lists are explicit, never SELECT *, so a later schema addition
-- cannot silently shift data into the wrong column.
--
-- Every table name and every column name below was read from
-- backend/src/Infrastructure/Migrations/ApplicationDbContextModelSnapshot.cs
-- (the authoritative EF Core model). If you change a column here you must
-- change the same column in the same position in 02-load.sql.
--
-- The full load order and the reason for it are documented inline in
-- 02-load.sql. The scope of the selection (what moves and what is left
-- out, and why) is documented in prod-to-test/README.md.
-- =====================================================

\set ON_ERROR_STOP on
\pset pager off

-- Canonical text rendering for the timestamp columns, so the CSV is
-- byte-comparable no matter what the server's default time zone is.
SET TIME ZONE 'UTC';

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- =====================================================
-- Section A - baseline counts (goes to stdout)
-- =====================================================
-- Save this. 03-verify.sql prints the same list on the target database;
-- the two must agree per table (or the target must already hold that many
-- rows from its own history, which is also fine for a re-run).

SELECT * FROM (
    SELECT  1 AS ord, 'User'                            AS table_name, COUNT(*) AS row_count FROM "User"
    UNION ALL SELECT  2, 'Owner',                                            COUNT(*) FROM "Owner"
    UNION ALL SELECT  3, 'ReSeller',                                         COUNT(*) FROM "ReSeller"
    UNION ALL SELECT  4, 'ReSellerOwner',                                    COUNT(*) FROM "ReSellerOwner"
    UNION ALL SELECT  5, 'Store',                                            COUNT(*) FROM "Store"
    UNION ALL SELECT  6, 'StoreModule',                                      COUNT(*) FROM "StoreModule"
    UNION ALL SELECT  7, 'StoreRoleFeature',                                 COUNT(*) FROM "StoreRoleFeature"
    UNION ALL SELECT  8, 'StoreUser',                                        COUNT(*) FROM "StoreUser"
    UNION ALL SELECT  9, 'UserRole',                                         COUNT(*) FROM "UserRole"
    UNION ALL SELECT 10, 'ProductCategory',                                  COUNT(*) FROM "ProductCategory"
    UNION ALL SELECT 11, 'Product',                                          COUNT(*) FROM "Product"
    UNION ALL SELECT 12, 'ChannelExchangeRate',                              COUNT(*) FROM "ChannelExchangeRate"
) AS baseline ORDER BY ord;

-- The permission picture, per role. This is the "before" side of the
-- permission check in 03-verify.sql: if these numbers do not reappear
-- there, a migrated user logs in and sees nothing.
SELECT srf."RoleId",
       r."Name"  AS role_name,
       COUNT(*)                AS grant_rows,
       COUNT(DISTINCT srf."StoreId") AS stores
FROM "StoreRoleFeature" srf
LEFT JOIN "Role" r ON r."Id" = srf."RoleId"
GROUP BY srf."RoleId", r."Name"
ORDER BY srf."RoleId";

-- =====================================================
-- Section A2 - the tenant distribution. READ THIS BEFORE THE CSVs.
-- =====================================================
-- Every one of the twelve tables carries a TenantId, and every one of those
-- twelve entity types declares a global query filter of the form
--
--     builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId)
--
-- where _context.TenantId is the tenant claim of the caller's JWT. A row
-- whose TenantId is not the caller's tenant is therefore invisible to every
-- ordinary query: it loads, it commits, it passes every foreign key check,
-- and the migrated user can never see it.
--
-- The model has NO foreign key from TenantId to Tenant. There is no
-- HasOne(...Tenants.Tenant) relationship and no migration ever declares
-- principalTable: "Tenant", so nothing in the database will reject a row
-- that points at a tenant that does not exist. That is exactly why this
-- block is here and why the load refuses instead of trusting the schema.
--
-- One row per (tenant, table). Anything that is not the Default Tenant is
-- sorted to the front and flagged, so it cannot be missed while scrolling.
-- b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8 is DataUtils.DefaultTenant.Id, the
-- same value seeded on the test database.
--
-- IF THIS BLOCK SHOWS A TENANT OTHER THAN THE DEFAULT ONE, STOP HERE. Do not
-- filter it out by hand and do not go on to the load: 02-load.sql will stop
-- and name it. A source database that carries a second tenant means the two
-- databases are not the same system, and that is a question to answer
-- before moving any row.

SELECT t.ord,
       t.table_name,
       COALESCE(t."TenantId"::text, '<NULL>')      AS tenant_id,
       (t."TenantId" IS NOT DISTINCT FROM
            'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8'::uuid) AS is_default_tenant,
       t.rows
FROM (
    SELECT  1 AS ord, 'User'::text AS table_name, "TenantId", count(*) AS rows
      FROM "User" GROUP BY "TenantId"
    UNION ALL
    SELECT  2, 'Owner', "TenantId", count(*) FROM "Owner" GROUP BY "TenantId"
    UNION ALL
    SELECT  3, 'ReSeller', "TenantId", count(*) FROM "ReSeller" GROUP BY "TenantId"
    UNION ALL
    SELECT  4, 'ReSellerOwner', "TenantId", count(*) FROM "ReSellerOwner" GROUP BY "TenantId"
    UNION ALL
    SELECT  5, 'Store', "TenantId", count(*) FROM "Store" GROUP BY "TenantId"
    UNION ALL
    SELECT  6, 'StoreModule', "TenantId", count(*) FROM "StoreModule" GROUP BY "TenantId"
    UNION ALL
    SELECT  7, 'StoreRoleFeature', "TenantId", count(*) FROM "StoreRoleFeature" GROUP BY "TenantId"
    UNION ALL
    SELECT  8, 'StoreUser', "TenantId", count(*) FROM "StoreUser" GROUP BY "TenantId"
    UNION ALL
    SELECT  9, 'UserRole', "TenantId", count(*) FROM "UserRole" GROUP BY "TenantId"
    UNION ALL
    SELECT 10, 'ProductCategory', "TenantId", count(*) FROM "ProductCategory" GROUP BY "TenantId"
    UNION ALL
    SELECT 11, 'Product', "TenantId", count(*) FROM "Product" GROUP BY "TenantId"
    UNION ALL
    SELECT 12, 'ChannelExchangeRate', "TenantId", count(*) FROM "ChannelExchangeRate" GROUP BY "TenantId"
) AS t
-- Non-default tenants first, so a second tenant is the first thing on screen.
ORDER BY (t."TenantId" IS NOT DISTINCT FROM 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8'::uuid),
         t.ord;

-- The same inventory, folded to one line per tenant: the number of tables it
-- touches and the number of rows it holds. "false" anywhere in
-- default_tenant_only means the load will refuse.
\echo '=== A2b. Tenant summary: default_tenant_only must be true on every row ==='
SELECT COALESCE(t."TenantId"::text, '<NULL>') AS tenant_id,
       bool_and(t."TenantId" IS NOT DISTINCT FROM
                'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8'::uuid) AS default_tenant_only,
       count(*)                                            AS tables_touched,
       sum(t.rows)                                         AS total_rows
FROM (
    SELECT "TenantId", count(*) AS rows FROM "User"             GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "Owner"           GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "ReSeller"        GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "ReSellerOwner"   GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "Store"           GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "StoreModule"     GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "StoreRoleFeature" GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "StoreUser"       GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "UserRole"        GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "ProductCategory" GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "Product"         GROUP BY "TenantId"
    UNION ALL SELECT "TenantId", count(*) FROM "ChannelExchangeRate" GROUP BY "TenantId"
) AS t
GROUP BY t."TenantId"
ORDER BY 2 DESC, 3 DESC;

-- =====================================================
-- Section B - row data, one CSV per table (goes to prod-to-test/data/)
-- =====================================================
-- The file numbers match the load order in 02-load.sql. Every statement is
-- COPY ... TO STDOUT, redirected by \o to its own file. ORDER BY the
-- primary key makes each file stable, so two runs of this script on an
-- unchanged database produce identical files.

\o prod-to-test/data/01-user.csv
COPY (SELECT "Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName",
             "IsActive", "Login", "OfflinePasswordPreHash", "Password",
             "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "User" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/02-owner.csv
COPY (SELECT "Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive",
             "TenantId", "UpdatedBy", "UpdatedDate", "UserId"
      FROM "Owner" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/03-reseller.csv
COPY (SELECT "Id", "Approved", "CreatedBy", "CreatedDate", "Description",
             "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId",
             "UpdatedBy", "UpdatedDate", "UserId"
      FROM "ReSeller" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/04-reseller-owner.csv
COPY (SELECT "ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice",
             "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "ReSellerOwner" ORDER BY "ReSellerId", "OwnerId") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/05-store.csv
COPY (SELECT "Id", "Address", "Approved", "CatalogSlug", "CatalogSyncedAt",
             "CreatedBy", "CreatedDate", "Description", "IsActive", "Name",
             "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId",
             "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "Store" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/06-store-module.csv
COPY (SELECT "StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive",
             "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice",
             "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "StoreModule" ORDER BY "StoreId", "ModuleId") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/07-store-role-feature.csv
COPY (SELECT "StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate",
             "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "StoreRoleFeature" ORDER BY "StoreId", "RoleId", "FeatureId") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/08-store-user.csv
COPY (SELECT "UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive",
             "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "StoreUser" ORDER BY "UserId", "StoreId") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/09-user-role.csv
COPY (SELECT "UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive",
             "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "UserRole" ORDER BY "UserId", "RoleId") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/10-product-category.csv
COPY (SELECT "Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order",
             "Slug", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "ProductCategory" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/11-product.csv
COPY (SELECT "Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy",
             "CreatedDate", "Currency", "Description", "DiscountFromInventory",
             "DiscountPrice", "Image", "IsActive", "IsNew", "Name", "Order",
             "PercentDiscountPrice", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "Product" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/12-channel-exchange-rate.csv
COPY (SELECT "Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive",
             "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value"
      FROM "ChannelExchangeRate" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

COMMIT;

-- =====================================================
-- After this script, 12 files must exist under prod-to-test/data/.
-- They contain real production password hashes and personal data. They
-- are git-ignored on purpose. They are created with mode 0600 by the umask
-- 077 the HOW TO RUN above requires. Do not email them, do not commit them,
-- and shred them once the load has been verified AND the rollback window
-- has closed; the documented rollback re-reads these same files to know
-- which rows are the migrated ones.
-- =====================================================
