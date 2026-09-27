-- =====================================================
-- prod-to-test / 03-verify.sql
--
-- Purpose : prove, on the TARGET database (test), that the identity and
--           permission graph landed complete and consistent.
-- Runs on : the TARGET database (test), right after 02-load.sql.
-- Safety  : strictly read-only. It contains no data-changing statement and
--           no schema statement of any kind.
-- Tooling : psql.
--
-- HOW TO RUN (from the backend/scripts directory):
--
--   psql "$TARGET_DSN" -f prod-to-test/03-verify.sql \
--        | tee prod-to-test/verify-after.txt
--
-- The whole run is one REPEATABLE READ snapshot, so the numbers below
-- describe the same instant. Stop the test application first if you can:
-- a live login rewrites nothing here, but a live store creation would
-- change the counts mid-run.
--
-- HOW TO READ THE RESULT
--   Query 1  Row counts. Compare with the "before" block that
--            01-extract.sql printed on the source database. Every table must
--            now hold AT LEAST what the source held.
--   Query 2  Seeded rows. Must return the three seeded rows, untouched.
--   Query 3  Catalog. A FeatureId above the target's MAX(FeatureId) means
--            the source database runs a migration the target does not.
--   Query 4  Orphans. The ONLY accepted value is total_orphans = 0.
--   Query 5  Permission grants per role. Must match the source block.
--   Query 6  Grants per store. A store with zero OwnerAdmin (RoleId 2)
--            grants is a store whose owner logs in and sees nothing.
--   Query 7  Price snapshots. Confirms StoreModule kept the amount the
--            store was actually charged.
--   Query 8  Tenant integrity. Every count must be 0. TenantId is NOT a
--            foreign key, so nothing else in this file can catch a loaded
--            row that points at a tenant which does not exist.
--   Query 9  Gestor / owner links. The orphan check in Query 4 only sees
--            the links that ARE there; 9a sees the ones that are missing,
--            which is the exact failure a dropped ReSellerOwner row causes.
-- =====================================================

\set ON_ERROR_STOP on
\pset pager off

SET TIME ZONE 'UTC';

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- =====================================================
-- Query 1 - row counts per table
-- =====================================================
\echo '=== 1. Row counts per table (compare against the source baseline) ==='
SELECT * FROM (
    SELECT  1 AS ord, 'User'                AS table_name, COUNT(*) AS row_count FROM "User"
    UNION ALL SELECT  2, 'Owner',                                COUNT(*) FROM "Owner"
    UNION ALL SELECT  3, 'ReSeller',                             COUNT(*) FROM "ReSeller"
    UNION ALL SELECT  4, 'ReSellerOwner',                        COUNT(*) FROM "ReSellerOwner"
    UNION ALL SELECT  5, 'Store',                                COUNT(*) FROM "Store"
    UNION ALL SELECT  6, 'StoreModule',                          COUNT(*) FROM "StoreModule"
    UNION ALL SELECT  7, 'StoreRoleFeature',                     COUNT(*) FROM "StoreRoleFeature"
    UNION ALL SELECT  8, 'StoreUser',                            COUNT(*) FROM "StoreUser"
    UNION ALL SELECT  9, 'UserRole',                             COUNT(*) FROM "UserRole"
    UNION ALL SELECT 10, 'ProductCategory',                      COUNT(*) FROM "ProductCategory"
    UNION ALL SELECT 11, 'Product',                              COUNT(*) FROM "Product"
    UNION ALL SELECT 12, 'ChannelExchangeRate',                  COUNT(*) FROM "ChannelExchangeRate"
) AS counts ORDER BY ord;

-- =====================================================
-- Query 2 - the seeded rows the load must never have touched
-- =====================================================
\echo '=== 2. Seeded rows (must be present and unmodified) ==='
SELECT 'Tenant: Default Tenant' AS seeded_row,
       t."Id"::text             AS id,
       t."Name"                 AS detail
FROM "Tenant" t
WHERE t."Id" = 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8'
UNION ALL
SELECT 'User: superadmin',
       u."Id"::text,
       u."Login"
FROM "User" u
WHERE u."Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
UNION ALL
SELECT 'UserRole: superadmin role 1',
       ur."UserId"::text,
       'RoleId = ' || ur."RoleId"::text
FROM "UserRole" ur
WHERE ur."UserId" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
  AND ur."RoleId" = 1
ORDER BY 1;

-- Three rows are expected. Fewer means the target was not migrated first.
\echo '=== 2b. Seeded row count (expected: 3) ==='
SELECT (SELECT COUNT(*) FROM "Tenant"  WHERE "Id" = 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8')
     + (SELECT COUNT(*) FROM "User"    WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8')
     + (SELECT COUNT(*) FROM "UserRole" WHERE "UserId" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8' AND "RoleId" = 1)
       AS seeded_rows_present;

-- =====================================================
-- Query 3 - catalog, and whether the source is ahead of the target
-- =====================================================
\echo '=== 3. Catalog (Role / Feature / Module / StorePlan) ==='
SELECT 'Role'               AS catalog_table, COUNT(*) AS rows, NULL::integer AS max_id FROM "Role"
UNION ALL SELECT 'Feature',           COUNT(*), MAX("Id") FROM "Feature"
UNION ALL SELECT 'Module',            COUNT(*), MAX("Id") FROM "Module"
UNION ALL SELECT 'StorePlan',         COUNT(*), MAX("Id") FROM "StorePlan"
ORDER BY 1;

\echo '=== 3b. StorePlan identifiers referenced by loaded stores ==='
SELECT s."StorePlanId", p."Name" AS store_plan, COUNT(*) AS stores
FROM "Store" s
LEFT JOIN "StorePlan" p ON p."Id" = s."StorePlanId"
GROUP BY s."StorePlanId", p."Name"
ORDER BY s."StorePlanId";

\echo '=== 3c. Highest FeatureId granted vs highest FeatureId in catalog ==='
\echo '===     (granted > catalog means the target is missing a migration) ==='
SELECT (SELECT COALESCE(MAX("FeatureId"), 0) FROM "StoreRoleFeature") AS max_granted_feature_id,
       (SELECT COALESCE(MAX("Id"), 0)         FROM "Feature")          AS max_catalog_feature_id,
       (SELECT COUNT(*) FROM "StoreRoleFeature" srf
         WHERE NOT EXISTS (SELECT 1 FROM "Feature" f WHERE f."Id" = srf."FeatureId"))
           AS grants_with_unknown_feature;

-- =====================================================
-- Query 4 - orphan check. The only accepted answer is total_orphans = 0.
-- Each row is a row whose mandatory parent is missing.
-- =====================================================
\echo '=== 4. Orphans (total_orphans must be 0) ==='
WITH orphan_checks(check_name, orphan_count) AS (
    SELECT 'Owner without User',                  COUNT(*) FROM "Owner" o
      WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."Id" = o."UserId")
    UNION ALL SELECT 'ReSeller without User',      COUNT(*) FROM "ReSeller" r
      WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."Id" = r."UserId")
    UNION ALL SELECT 'ReSellerOwner without ReSeller', COUNT(*) FROM "ReSellerOwner" ro
      WHERE NOT EXISTS (SELECT 1 FROM "ReSeller" r WHERE r."Id" = ro."ReSellerId")
    UNION ALL SELECT 'ReSellerOwner without Owner',    COUNT(*) FROM "ReSellerOwner" ro
      WHERE NOT EXISTS (SELECT 1 FROM "Owner" o WHERE o."Id" = ro."OwnerId")
    UNION ALL SELECT 'Store without Owner',         COUNT(*) FROM "Store" s
      WHERE NOT EXISTS (SELECT 1 FROM "Owner" o WHERE o."Id" = s."OwnerId")
    UNION ALL SELECT 'Store without StorePlan',     COUNT(*) FROM "Store" s
      WHERE NOT EXISTS (SELECT 1 FROM "StorePlan" p WHERE p."Id" = s."StorePlanId")
    UNION ALL SELECT 'StoreUser without Store',     COUNT(*) FROM "StoreUser" su
      WHERE NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."Id" = su."StoreId")
    UNION ALL SELECT 'StoreUser without User',      COUNT(*) FROM "StoreUser" su
      WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."Id" = su."UserId")
    UNION ALL SELECT 'UserRole without User',       COUNT(*) FROM "UserRole" ur
      WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."Id" = ur."UserId")
    UNION ALL SELECT 'UserRole without Role',       COUNT(*) FROM "UserRole" ur
      WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."Id" = ur."RoleId")
    UNION ALL SELECT 'StoreModule without Store',   COUNT(*) FROM "StoreModule" sm
      WHERE NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."Id" = sm."StoreId")
    UNION ALL SELECT 'StoreModule without Module',  COUNT(*) FROM "StoreModule" sm
      WHERE NOT EXISTS (SELECT 1 FROM "Module" m WHERE m."Id" = sm."ModuleId")
    UNION ALL SELECT 'StoreRoleFeature without Store', COUNT(*) FROM "StoreRoleFeature" srf
      WHERE NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."Id" = srf."StoreId")
    UNION ALL SELECT 'StoreRoleFeature without Role', COUNT(*) FROM "StoreRoleFeature" srf
      WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."Id" = srf."RoleId")
    UNION ALL SELECT 'StoreRoleFeature without Feature', COUNT(*) FROM "StoreRoleFeature" srf
      WHERE NOT EXISTS (SELECT 1 FROM "Feature" f WHERE f."Id" = srf."FeatureId")
    UNION ALL SELECT 'ProductCategory without Store', COUNT(*) FROM "ProductCategory" pc
      WHERE NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."Id" = pc."StoreId")
    UNION ALL SELECT 'Product without ProductCategory', COUNT(*) FROM "Product" p
      WHERE NOT EXISTS (SELECT 1 FROM "ProductCategory" pc WHERE pc."Id" = p."CategoryId")
    UNION ALL SELECT 'ChannelExchangeRate without Store', COUNT(*) FROM "ChannelExchangeRate" cer
      WHERE NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."Id" = cer."StoreId")
)
SELECT * FROM (
    SELECT 1 AS ord, check_name, orphan_count
    FROM orphan_checks
    UNION ALL
    SELECT 0, 'TOTAL ORPHANS (must be 0)', COALESCE(SUM(orphan_count), 0)
    FROM orphan_checks
) AS orphan_report
ORDER BY ord, check_name;

-- =====================================================
-- Query 5 - permission grants per role (the headline number)
-- =====================================================
\echo '=== 5. Permission grants per role (must match the source block) ==='
SELECT srf."RoleId",
       r."Name"                      AS role_name,
       COUNT(*)                      AS grant_rows,
       COUNT(DISTINCT srf."StoreId") AS stores,
       COUNT(DISTINCT srf."FeatureId") AS distinct_features
FROM "StoreRoleFeature" srf
LEFT JOIN "Role" r ON r."Id" = srf."RoleId"
GROUP BY srf."RoleId", r."Name"
ORDER BY srf."RoleId";

-- =====================================================
-- Query 6 - grants per store. OwnerAdmin is RoleId 2.
-- A store with owner_grants = 0 is the exact failure this migration exists
-- to prevent: a user who logs in successfully and sees nothing.
-- =====================================================
\echo '=== 6. Grants per store (owner_grants = 0 is a failure) ==='
SELECT s."Id"                                    AS store_id,
       s."Name"                                  AS store_name,
       COUNT(*) FILTER (WHERE srf."RoleId" = 2) AS owner_grants,
       COUNT(*) FILTER (WHERE srf."RoleId" = 3) AS store_user_grants,
       COUNT(*)                                  AS total_grants
FROM "Store" s
LEFT JOIN "StoreRoleFeature" srf ON srf."StoreId" = s."Id"
GROUP BY s."Id", s."Name"
ORDER BY owner_grants ASC, s."Name";

\echo '=== 6b. Stores with modules but zero OwnerAdmin grants (expected: none) ==='
SELECT s."Id" AS store_id, s."Name" AS store_name, COUNT(DISTINCT sm."ModuleId") AS modules
FROM "Store" s
JOIN "StoreModule" sm ON sm."StoreId" = s."Id"
WHERE NOT EXISTS (
    SELECT 1 FROM "StoreRoleFeature" srf
    WHERE srf."StoreId" = s."Id" AND srf."RoleId" = 2
)
GROUP BY s."Id", s."Name"
ORDER BY s."Name";

-- =====================================================
-- Query 7 - the price snapshot the store was charged
-- =====================================================
\echo '=== 7. StoreModule price snapshot (proof the paid amounts moved) ==='
SELECT sm."StoreId",
       sm."ModuleId",
       m."Name"                 AS module_name,
       sm."Price"               AS snapshot_price,
       m."Price"                AS current_catalog_price,
       sm."ModulePrice",
       sm."ModuleDiscountPrice",
       sm."ModulePercentDiscountPrice",
       sm."ModulePriceIncluded"
FROM "StoreModule" sm
LEFT JOIN "Module" m ON m."Id" = sm."ModuleId"
ORDER BY sm."StoreId", sm."ModuleId";

-- =====================================================
-- Query 8 - tenant integrity of every loaded row
-- =====================================================
-- TenantId is NOT a foreign key in this model. No HasForeignKey in
-- ApplicationDbContextModelSnapshot.cs names Tenant as a principal table, so
-- Postgres never rejects a row for a tenant that does not exist, and the
-- orphan check in Query 4 cannot see it either - that check looks at real
-- parents, and here the missing thing is the tenant the query filter
-- compares against.
--
-- Such a row is invisible in practice: every query runs through
-- HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId)
-- and HttpContextService reads TenantId from a JWT claim, so a row carrying
-- an unknown tenant id is returned to nobody at all. This is why the count
-- of such rows must be exactly 0, and why 02-load.sql refuses to commit one.
--
-- A row that points at a tenant which DOES exist is fine, whatever that
-- tenant is. This check asks only whether the tenant is known.
\echo '=== 8. Tenant integrity (every count must be 0) ==='
WITH tenant_checks(check_name, unknown_tenant_rows) AS (
    SELECT 'User with unknown TenantId',                     COUNT(*) FROM "User" u
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = u."TenantId")
    UNION ALL SELECT 'Owner with unknown TenantId',           COUNT(*) FROM "Owner" o
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = o."TenantId")
    UNION ALL SELECT 'ReSeller with unknown TenantId',        COUNT(*) FROM "ReSeller" r
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = r."TenantId")
    UNION ALL SELECT 'ReSellerOwner with unknown TenantId',   COUNT(*) FROM "ReSellerOwner" ro
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = ro."TenantId")
    UNION ALL SELECT 'Store with unknown TenantId',           COUNT(*) FROM "Store" s
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = s."TenantId")
    UNION ALL SELECT 'StoreModule with unknown TenantId',     COUNT(*) FROM "StoreModule" sm
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = sm."TenantId")
    UNION ALL SELECT 'StoreRoleFeature with unknown TenantId', COUNT(*) FROM "StoreRoleFeature" srf
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = srf."TenantId")
    UNION ALL SELECT 'StoreUser with unknown TenantId',       COUNT(*) FROM "StoreUser" su
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = su."TenantId")
    UNION ALL SELECT 'UserRole with unknown TenantId',        COUNT(*) FROM "UserRole" ur
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = ur."TenantId")
    UNION ALL SELECT 'ProductCategory with unknown TenantId', COUNT(*) FROM "ProductCategory" pc
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = pc."TenantId")
    UNION ALL SELECT 'Product with unknown TenantId',         COUNT(*) FROM "Product" p
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = p."TenantId")
    UNION ALL SELECT 'ChannelExchangeRate with unknown TenantId', COUNT(*) FROM "ChannelExchangeRate" cer
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."Id" = cer."TenantId")
)
SELECT * FROM (
    SELECT 1 AS ord, check_name, unknown_tenant_rows
    FROM tenant_checks
    UNION ALL
    SELECT 0, 'TOTAL ROWS WITH AN UNKNOWN TENANT (must be 0)', COALESCE(SUM(unknown_tenant_rows), 0)
    FROM tenant_checks
) AS tenant_report
ORDER BY ord, check_name;

\echo '=== 8b. Tenant distribution (informational) ==='
-- Which tenant the rows actually belong to. More than one row here after a
-- prod-to-test load means the source was not single-tenant.
SELECT t."Id" AS tenant_id,
       COALESCE(t."Name", '<no Tenant row>') AS tenant_name,
       (SELECT COUNT(*) FROM "User" u WHERE u."TenantId" = t."Id") AS users,
       (SELECT COUNT(*) FROM "Store" s WHERE s."TenantId" = t."Id") AS stores
FROM "Tenant" t
ORDER BY users DESC, t."Id";

-- =====================================================
-- Query 9 - Gestor / owner links
-- =====================================================
-- ReSellerOwner is the link a Gestor uses to see the owners it manages, and
-- it is the one table whose damage is completely invisible to Query 4: the
-- orphan check asks whether a link's parents exist, never whether a link
-- exists at all. ReSellerOwner.OwnerId also carries its own unique index on
-- top of the (ReSellerId, OwnerId) primary key, so 02-load.sql's bare
-- ON CONFLICT DO NOTHING drops a migrated link whenever that owner is already
-- linked to a different Gestor. The Owner survives, the Gestor loses it, and
-- no orphan is created anywhere.
--
-- 9a is therefore a real check. 9b is the same data as a distribution.
-- 9c is informational: an Owner with no Gestor is not automatically wrong
-- (the seeded Default Store owner has none by construction), but a store
-- whose owner is in that list has nobody who can administer it.
\echo '=== 9a. Gestors with zero owner links (expected: no rows) ==='
SELECT r."Id"        AS reseller_id,
       r."UserId"    AS user_id,
       u."Login"     AS gestor_login,
       r."Approved"  AS approved,
       COALESCE(r."Description", '<null>') AS description
FROM "ReSeller" r
LEFT JOIN "User" u ON u."Id" = r."UserId"
WHERE NOT EXISTS (SELECT 1 FROM "ReSellerOwner" ro WHERE ro."ReSellerId" = r."Id")
ORDER BY r."Id";

\echo '=== 9b. Owners visible per Gestor (owners = 0 is a failure) ==='
SELECT r."Id"                                    AS reseller_id,
       COALESCE(u."Login", '<no User row>')      AS gestor_login,
       COUNT(ro."OwnerId")                       AS owners,
       COALESCE(string_agg(o."Description", ' | ' ORDER BY o."Description"), '<none>')
                                                   AS owner_descriptions
FROM "ReSeller" r
LEFT JOIN "User" u ON u."Id" = r."UserId"
LEFT JOIN "ReSellerOwner" ro ON ro."ReSellerId" = r."Id"
LEFT JOIN "Owner" o ON o."Id" = ro."OwnerId"
GROUP BY r."Id", u."Login"
ORDER BY owners ASC, r."Id";

\echo '=== 9c. Owners with no Gestor link (informational) ==='
SELECT o."Id"    AS owner_id,
       o."UserId" AS user_id,
       COALESCE(u."Login", '<no User row>') AS user_login,
       (SELECT COUNT(*) FROM "Store" s WHERE s."OwnerId" = o."Id") AS stores_owned
FROM "Owner" o
LEFT JOIN "User" u ON u."Id" = o."UserId"
WHERE NOT EXISTS (SELECT 1 FROM "ReSellerOwner" ro WHERE ro."OwnerId" = o."Id")
ORDER BY stores_owned DESC, o."Id";

COMMIT;
