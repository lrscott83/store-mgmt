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
--   mkdir -p prod-to-test/data
--   psql "$SOURCE_DSN" -f prod-to-test/01-extract.sql \
--        | tee prod-to-test/extract-baseline.txt
--
-- The path "prod-to-test/data" is relative to the current working
-- directory, so psql must be run from backend/scripts. Every output path
-- is spelled out literally in this file on purpose: no psql variable is
-- involved, so nothing can silently resolve to an unexpected place.
--
-- Section A prints the baseline counts to stdout. KEEP that output: it is
-- the "before" side of the comparison that 03-verify.sql is read against.
-- Section B writes the row data, one CSV per table.
--
-- Both sections run inside ONE REPEATABLE READ snapshot, so the counts in
-- Section A and the rows in Section B describe the same instant even if
-- production is being written to while you run this.
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
COPY (SELECT "Id", "Address", "Approved", "CreatedBy", "CreatedDate", "Description",
             "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate",
             "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate"
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
             "StoreId", "TenantId", "UpdatedBy", "UpdatedDate"
      FROM "ProductCategory" ORDER BY "Id") TO STDOUT WITH (FORMAT csv, HEADER true);
\o

\o prod-to-test/data/11-product.csv
COPY (SELECT "Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy",
             "CreatedDate", "Currency", "DiscountFromInventory", "IsActive", "Name",
             "Order", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
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
-- are git-ignored on purpose. Do not email them, do not commit them, and
-- wipe them once the load has been verified.
-- =====================================================
