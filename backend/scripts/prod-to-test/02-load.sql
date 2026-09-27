-- =====================================================
-- prod-to-test / 02-load.sql
--
-- Purpose : load the identity + permission graph produced by 01-extract.sql
--           into the TARGET database (test).
-- Runs on : the TARGET database (test).
-- Safety  : it ADDS rows. It never removes a row, never truncates a table,
--           and never overwrites an existing row, so the seeded superadmin
--           User, its UserRole row and the Default Tenant are untouched.
-- Tooling : psql >= 10 (it uses the \copy and \if meta-commands).
--
-- HOW TO RUN (from the backend/scripts directory, data/ already populated):
--
--   # identity + permission graph only (the default)
--   psql "$TARGET_DSN" -f prod-to-test/02-load.sql
--
--   # add one optional block
--   psql "$TARGET_DSN" -v load_product_category=1 -f prod-to-test/02-load.sql
--   psql "$TARGET_DSN" -v load_product=1             -f prod-to-test/02-load.sql
--   psql "$TARGET_DSN" -v load_channel_exchange_rate=1 -f prod-to-test/02-load.sql
--
-- The optional blocks are OFF by default. "load_product" needs
-- "load_product_category" (Product carries a required FK to
-- ProductCategory); asking for one without the other stops the load.
--
-- The CSV paths are relative to the current working directory, so psql must
-- be run from backend/scripts.
--
-- ---------------------------------------------------------------------
-- WHY THIS ORDER
-- ---------------------------------------------------------------------
-- This model declares 34 foreign keys and every single one of them is
-- DeleteBehavior.Restrict. There is not one cascade anywhere in the
-- snapshot. Postgres enforces a foreign key on the way IN, so a table must
-- be loaded only after every table it points at already holds the parent
-- row. That forces a topological order, which is the one below.
--
-- The dependency chain, read from
-- backend/src/Infrastructure/Migrations/ApplicationDbContextModelSnapshot.cs:
--
--   1  User             no FK to anything in this set
--   2  Owner            -> User                      (required, unique on UserId)
--   3  ReSeller         -> User                      (required, unique on UserId)
--   4  ReSellerOwner    -> ReSeller, Owner           (both required)
--   5  Store            -> Owner, StorePlan          (StorePlan is catalog, not in this set)
--   6  StoreModule      -> Store, Module             (Module is catalog)
--   7  StoreRoleFeature -> Store, Role, Feature      (Role and Feature are catalog)
--   8  StoreUser        -> Store, User
--   9  UserRole         -> User, Role                (Role is catalog)
--  10  ProductCategory  -> Store                     [optional]
--  11  Product          -> ProductCategory           [optional]
--  12  ChannelExchangeRate -> Store                  [optional]
--
-- Catalog tables (Role, Feature, Module, StorePlan) are NOT in this script.
-- Database.MigrateAsync() builds them identically on the target, with the
-- same seeded identifiers. The guard at the top of this script refuses to
-- run if they are not there.
--
-- NOTE ON THE ORIGINAL DRAFT ORDER
-- The feature document listed the steps leaves-first (UserRole, then User,
-- etc.) and put Product ahead of ProductCategory. Both are impossible
-- against these foreign keys: a child row cannot be loaded before its
-- parent exists. The order above is the derived one, and it is the only one
-- that loads cleanly. See prod-to-test/README.md, section "Correccion del
-- orden de carga".
--
-- ---------------------------------------------------------------------
-- WHY ON CONFLICT DO NOTHING HAS NO CONFLICT TARGET
-- ---------------------------------------------------------------------
-- Every insert below uses the bare form, with no ON CONFLICT (...) target.
-- That is deliberate and it is not laziness. Besides the primary key, the
-- model carries these extra unique indexes:
--
--   User.Login            unique  (global)
--   Owner.UserId          unique
--   ReSeller.UserId       unique
--   ReSellerOwner.OwnerId unique  (the PK is ReSellerId + OwnerId)
--   StoreUser.UserId      unique  (the PK is UserId + StoreId)
--
-- Naming only the primary key as the conflict target would let a collision
-- on one of those single-column indexes abort the load. The bare form skips
-- any conflicting row instead, so a re-run is a no-op and an already
-- present row is never overwritten.
--
-- A skipped parent is not silent corruption: if a User row is skipped
-- because its Login already belongs to a different user on the target,
-- the Owner row that depends on it has no parent and the whole transaction
-- rolls back with a foreign key violation. Nothing is half-written. Fix the
-- Login collision and run the load again.
-- =====================================================

\set ON_ERROR_STOP on
\pset pager off

SET TIME ZONE 'UTC';

-- --- Guard: the target schema and catalog must already be migrated -----
-- This is the Database.MigrateAsync() step from the README. It is done by
-- the maintainer, before this script, and it is what creates the tables and
-- the seeded catalog rows this script depends on.
DO $guard$
IF (SELECT COUNT(*) FROM "Role") = 0
   OR (SELECT COUNT(*) FROM "Feature") = 0
   OR (SELECT COUNT(*) FROM "Module") = 0
   OR (SELECT COUNT(*) FROM "StorePlan") = 0 THEN
    RAISE EXCEPTION
        'Catalog tables Role/Feature/Module/StorePlan are empty on the target. Run Database.MigrateAsync() against the test database before running 02-load.sql.';
END IF;

IF NOT EXISTS (SELECT 1 FROM "User" WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8') THEN
    RAISE EXCEPTION
        'The seeded superadmin User is missing on the target. Run Database.MigrateAsync() against the test database before running 02-load.sql.';
END IF;

IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "Id" = 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8') THEN
    RAISE EXCEPTION
        'The Default Tenant is missing on the target. Run Database.MigrateAsync() against the test database before running 02-load.sql.';
END IF;
$guard$;

-- --- Guard: an optional block that cannot stand on its own -------------
\if :{?load_product}
  \if :{?load_product_category}
  \else
    \echo 'STOP: -v load_product=1 requires -v load_product_category=1 (Product has a required FK to ProductCategory).'
    \quit 1
  \endif
\endif

BEGIN;

-- =====================================================
-- 1 / User
-- =====================================================
CREATE TEMP TABLE stg_user (LIKE "User" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_user ("Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "OfflinePasswordPreHash", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/01-user.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "User" ("Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "OfflinePasswordPreHash", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "OfflinePasswordPreHash", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_user ON CONFLICT DO NOTHING;

-- =====================================================
-- 2 / Owner   (-> User)
-- =====================================================
CREATE TEMP TABLE stg_owner (LIKE "Owner" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_owner ("Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId") FROM 'prod-to-test/data/02-owner.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "Owner" ("Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId")
SELECT "Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId"
FROM stg_owner ON CONFLICT DO NOTHING;

-- =====================================================
-- 3 / ReSeller   (-> User)
-- =====================================================
CREATE TEMP TABLE stg_reseller (LIKE "ReSeller" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_reseller ("Id", "Approved", "CreatedBy", "CreatedDate", "Description", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate", "UserId") FROM 'prod-to-test/data/03-reseller.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "ReSeller" ("Id", "Approved", "CreatedBy", "CreatedDate", "Description", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate", "UserId")
SELECT "Id", "Approved", "CreatedBy", "CreatedDate", "Description", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate", "UserId"
FROM stg_reseller ON CONFLICT DO NOTHING;

-- =====================================================
-- 4 / ReSellerOwner   (-> ReSeller, Owner)
-- Without this table a migrated Gestor sees an empty owner list.
-- =====================================================
CREATE TEMP TABLE stg_reseller_owner (LIKE "ReSellerOwner" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_reseller_owner ("ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/04-reseller-owner.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "ReSellerOwner" ("ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_reseller_owner ON CONFLICT DO NOTHING;

-- =====================================================
-- 5 / Store   (-> Owner, StorePlan[catalog])
-- StorePlanId must exist in the target catalog (1 Gratis, 2 Pago,
-- 3 Superior, 4 VIP). The guard above proves the catalog is populated.
-- =====================================================
CREATE TEMP TABLE stg_store (LIKE "Store" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store ("Id", "Address", "Approved", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/05-store.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "Store" ("Id", "Address", "Approved", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "Address", "Approved", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store ON CONFLICT DO NOTHING;

-- =====================================================
-- 6 / StoreModule   (-> Store, Module[catalog])
-- Carries the price snapshot the store was actually charged, which no
-- reconstruction from the catalog can reproduce.
-- =====================================================
CREATE TEMP TABLE stg_store_module (LIKE "StoreModule" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store_module ("StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive", "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice", "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/06-store-module.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive", "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice", "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive", "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice", "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store_module ON CONFLICT DO NOTHING;

-- =====================================================
-- 7 / StoreRoleFeature   (-> Store, Role[catalog], Feature[catalog])
-- THIS IS WHERE THE PERMISSIONS LIVE. It is not derivable from the catalog:
-- StoreRoleFeatureGenerator drops any feature id with no StoreRoleFeatures
-- enum entry, so a rebuilt database would grant a different set. Copying
-- the produced rows is the only way to get the real grants back.
-- =====================================================
CREATE TEMP TABLE stg_store_role_feature (LIKE "StoreRoleFeature" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store_role_feature ("StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/07-store-role-feature.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store_role_feature ON CONFLICT DO NOTHING;

-- =====================================================
-- 8 / StoreUser   (-> Store, User)
-- Employee membership. One row per user at most: UserId carries its own
-- unique index, which is why the insert above uses the bare ON CONFLICT.
-- =====================================================
CREATE TEMP TABLE stg_store_user (LIKE "StoreUser" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store_user ("UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/08-store-user.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "StoreUser" ("UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store_user ON CONFLICT DO NOTHING;

-- =====================================================
-- 9 / UserRole   (-> User, Role[catalog])
-- =====================================================
CREATE TEMP TABLE stg_user_role (LIKE "UserRole" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_user_role ("UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/09-user-role.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "UserRole" ("UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_user_role ON CONFLICT DO NOTHING;

-- =====================================================
-- 10 / ProductCategory   (-> Store)          [optional, off by default]
-- =====================================================
\if :{?load_product_category}
CREATE TEMP TABLE stg_product_category (LIKE "ProductCategory" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_product_category ("Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/10-product-category.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "ProductCategory" ("Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_product_category ON CONFLICT DO NOTHING;
\endif

-- =====================================================
-- 11 / Product   (-> ProductCategory)       [optional, off by default]
-- Requires step 10. The guard above refuses to run without it.
-- =====================================================
\if :{?load_product}
CREATE TEMP TABLE stg_product (LIKE "Product" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_product ("Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy", "CreatedDate", "Currency", "DiscountFromInventory", "IsActive", "Name", "Order", "Price", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/11-product.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "Product" ("Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy", "CreatedDate", "Currency", "DiscountFromInventory", "IsActive", "Name", "Order", "Price", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy", "CreatedDate", "Currency", "DiscountFromInventory", "IsActive", "Name", "Order", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_product ON CONFLICT DO NOTHING;
\endif

-- =====================================================
-- 12 / ChannelExchangeRate   (-> Store)     [optional, off by default]
-- =====================================================
\if :{?load_channel_exchange_rate}
CREATE TEMP TABLE stg_channel_exchange_rate (LIKE "ChannelExchangeRate" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_channel_exchange_rate ("Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive", "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value") FROM 'prod-to-test/data/12-channel-exchange-rate.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO "ChannelExchangeRate" ("Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive", "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value")
SELECT "Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive", "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value"
FROM stg_channel_exchange_rate ON CONFLICT DO NOTHING;
\endif

-- =====================================================
-- In-transaction verification.
-- It runs BEFORE the COMMIT because every staging table is declared
-- ON COMMIT DROP and would be gone afterwards.
--
-- present_rows must equal staged_rows for every table. A difference means
-- a staged row did not land, which on a re-run is the expected outcome for
-- rows the target already had. Run this script a second time: every
-- difference stays exactly as it is and nothing is written twice.
-- =====================================================
SELECT 'User' AS table_name,
       (SELECT COUNT(*) FROM stg_user)                                              AS staged_rows,
       (SELECT COUNT(*) FROM "User" u WHERE u."Id" IN (SELECT "Id" FROM stg_user))  AS present_rows
UNION ALL SELECT 'Owner',
       (SELECT COUNT(*) FROM stg_owner),
       (SELECT COUNT(*) FROM "Owner" o WHERE o."Id" IN (SELECT "Id" FROM stg_owner))
UNION ALL SELECT 'ReSeller',
       (SELECT COUNT(*) FROM stg_reseller),
       (SELECT COUNT(*) FROM "ReSeller" r WHERE r."Id" IN (SELECT "Id" FROM stg_reseller))
UNION ALL SELECT 'ReSellerOwner',
       (SELECT COUNT(*) FROM stg_reseller_owner),
       (SELECT COUNT(*) FROM "ReSellerOwner" ro WHERE (ro."ReSellerId", ro."OwnerId") IN (SELECT "ReSellerId", "OwnerId" FROM stg_reseller_owner))
UNION ALL SELECT 'Store',
       (SELECT COUNT(*) FROM stg_store),
       (SELECT COUNT(*) FROM "Store" s WHERE s."Id" IN (SELECT "Id" FROM stg_store))
UNION ALL SELECT 'StoreModule',
       (SELECT COUNT(*) FROM stg_store_module),
       (SELECT COUNT(*) FROM "StoreModule" sm WHERE (sm."StoreId", sm."ModuleId") IN (SELECT "StoreId", "ModuleId" FROM stg_store_module))
UNION ALL SELECT 'StoreRoleFeature',
       (SELECT COUNT(*) FROM stg_store_role_feature),
       (SELECT COUNT(*) FROM "StoreRoleFeature" srf WHERE (srf."StoreId", srf."RoleId", srf."FeatureId") IN (SELECT "StoreId", "RoleId", "FeatureId" FROM stg_store_role_feature))
UNION ALL SELECT 'StoreUser',
       (SELECT COUNT(*) FROM stg_store_user),
       (SELECT COUNT(*) FROM "StoreUser" su WHERE (su."UserId", su."StoreId") IN (SELECT "UserId", "StoreId" FROM stg_store_user))
UNION ALL SELECT 'UserRole',
       (SELECT COUNT(*) FROM stg_user_role),
       (SELECT COUNT(*) FROM "UserRole" ur WHERE (ur."UserId", ur."RoleId") IN (SELECT "UserId", "RoleId" FROM stg_user_role))
ORDER BY 1;

-- One COMMIT for the whole load. If any statement above failed, psql has
-- already stopped (ON_ERROR_STOP) and the transaction is rolled back, so
-- the target is left exactly as it was.
COMMIT;
