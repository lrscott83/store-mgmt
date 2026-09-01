# Wrote scripts\delete-user-by-id.sql
-- ============================================================
-- DELETE USER AND ALL RELATED DATA
-- Target UUID: 25fb8f7a-8535-4e71-a2cd-71010bb96f85
--
-- IMPORTANT: All FK constraints use DeleteBehavior.Restrict.
-- This script follows the exact deletion order from
-- DeleteOwnerCommand to avoid constraint violations.
--
-- Run from VPS with:
--   podman exec -i smca_postgres_db psql -U postgres -d smca -f /dev/stdin < scripts/delete-user-by-id.sql
--
-- Or pipe directly:
--   cat scripts/delete-user-by-id.sql | podman exec -i smca_postgres_db psql -U postgres -d smca
-- ============================================================

\echo '============================================'
\echo ' STEP 0: Verify user exists and show data'
\echo '============================================'

-- Show the user we're about to delete
SELECT u."Id", u."Login", u."FullName", u."Email", u."IsActive", u."TenantId"
FROM "User" u
WHERE u."Id" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';

-- Show related data counts (dry run)
\echo ''
\echo '--- Related data counts ---'

SELECT 'ReSellerOwner' AS table_name, COUNT(*) AS row_count
FROM "ReSellerOwner" ro
JOIN "Owner" o ON ro."OwnerId" = o."Id"
WHERE o."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'UserRole', COUNT(*)
FROM "UserRole" ur WHERE ur."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'StoreUsage', COUNT(*)
FROM "StoreUsage" su WHERE su."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'RefreshTokens', COUNT(*)
FROM "RefreshTokens" rt WHERE rt."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'StoreUser', COUNT(*)
FROM "StoreUser" sud
JOIN "Owner" o ON sud."StoreId" IN (SELECT "Id" FROM "Store" WHERE "OwnerId" = o."Id")
WHERE o."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'Store', COUNT(*)
FROM "Store" s
JOIN "Owner" o ON s."OwnerId" = o."Id"
WHERE o."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'Owner', COUNT(*)
FROM "Owner" o WHERE o."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL
SELECT 'ReSeller', COUNT(*)
FROM "ReSeller" rs WHERE rs."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';

\echo ''
\echo '============================================'
\echo ' BEGIN TRANSACTION'
\echo '============================================'

BEGIN;

-- ============================================================
-- STEP 1: ReSellerOwner (must go first — FK to Owner)
-- ============================================================
\echo 'STEP 1: Deleting ReSellerOwner...'
DELETE FROM "ReSellerOwner" ro
USING "Owner" o
WHERE ro."OwnerId" = o."Id"
  AND o."UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- STEP 2: UserRole (FK to User)
-- ============================================================
\echo 'STEP 2: Deleting UserRole...'
DELETE FROM "UserRole"
WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- STEP 3: StoreUsage (FK to User)
-- ============================================================
\echo 'STEP 3: Deleting StoreUsage (user-level)...'
DELETE FROM "StoreUsage"
WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- STEP 4: Per-store children (Stores owned by this user's Owner)
-- ============================================================
\echo 'STEP 4: Deleting per-store children...'

-- 4a. StoreUser
DELETE FROM "StoreUser" sud
USING "Store" s
WHERE sud."StoreId" = s."Id"
  AND s."OwnerId" IN (SELECT "Id" FROM "Owner" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85');
\echo '  4a. StoreUser done.'

-- 4b. StoreModule
DELETE FROM "StoreModule" sm
USING "Store" s
WHERE sm."StoreId" = s."Id"
  AND s."OwnerId" IN (SELECT "Id" FROM "Owner" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85');
\echo '  4b. StoreModule done.'

-- 4c. StoreRoleFeature
DELETE FROM "StoreRoleFeature" srf
USING "Store" s
WHERE srf."StoreId" = s."Id"
  AND s."OwnerId" IN (SELECT "Id" FROM "Owner" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85');
\echo '  4c. StoreRoleFeature done.'

-- 4d. Store.StoreUsages (usage records per store, not the user-level ones)
DELETE FROM "StoreUsage" su
USING "Store" s
WHERE su."StoreId" = s."Id"
  AND s."OwnerId" IN (SELECT "Id" FROM "Owner" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85');
\echo '  4d. Store.StoreUsages done.'

-- 4e. Store itself
DELETE FROM "Store" s
WHERE s."OwnerId" IN (SELECT "Id" FROM "Owner" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85');
\echo '  4e. Store done.'

-- ============================================================
-- STEP 5: Owner
-- ============================================================
\echo 'STEP 5: Deleting Owner...'
DELETE FROM "Owner"
WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- STEP 6: ReSeller (FK to User, 1:1)
-- ============================================================
\echo 'STEP 6: Deleting ReSeller...'
DELETE FROM "ReSeller"
WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- STEP 7: RefreshTokens (no FK enforced, but has UserId column)
-- ============================================================
\echo 'STEP 7: Deleting RefreshTokens...'
DELETE FROM "RefreshTokens"
WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- STEP 8: User (the root entity)
-- ============================================================
\echo 'STEP 8: Deleting User...'
DELETE FROM "User"
WHERE "Id" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';
\echo '  Done.'

-- ============================================================
-- COMMIT
-- ============================================================
\echo ''
\echo '============================================'
\echo ' COMMITTING TRANSACTION'
\echo '============================================'
COMMIT;

-- ============================================================
-- VERIFICATION: Confirm everything is gone
-- ============================================================
\echo ''
\echo '============================================'
\echo ' POST-COMMIT VERIFICATION'
\echo '============================================'

SELECT 'User' AS table_name, COUNT(*) AS remaining
FROM "User" WHERE "Id" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL SELECT 'UserRole', COUNT(*)
FROM "UserRole" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL SELECT 'StoreUsage', COUNT(*)
FROM "StoreUsage" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL SELECT 'RefreshTokens', COUNT(*)
FROM "RefreshTokens" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL SELECT 'ReSeller', COUNT(*)
FROM "ReSeller" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85'
UNION ALL SELECT 'Owner', COUNT(*)
FROM "Owner" WHERE "UserId" = '25fb8f7a-8535-4e71-a2cd-71010bb96f85';

\echo ''
\echo '============================================'
\echo ' DONE. All remaining counts should be 0.'
\echo '============================================'
