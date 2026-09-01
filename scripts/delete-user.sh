#!/usr/bin/env bash
# ============================================================
# DELETE USER AND ALL RELATED DATA via Podman
# ============================================================

set -euo pipefail

# --- Validate parameter ---
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <user-uuid>"
    echo "Example: $0 25fb8f7a-8535-4e71-a2cd-71010bb96f85"
    exit 1
fi

USER_ID="$1"

# --- Validate UUID format ---
if [[ ! "$USER_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo "Error: '$USER_ID' is not a valid UUID."
    exit 1
fi

CONTAINER="smca_postgres_db"
DB_USER="postgres"
DB_NAME="smca"

PSQL="podman exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"

echo "============================================"
echo " TARGET USER: $USER_ID"
echo "============================================"

# --- Verify user exists ---
echo ""
echo "--- Verifying user exists ---"
$PSQL -c "SELECT \"Id\", \"Login\", \"FullName\", \"Email\", \"IsActive\" FROM \"User\" WHERE \"Id\" = '$USER_ID';"

read -p "Continue with deletion? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "--- Related data counts ---"
$PSQL -c "
SELECT 'UserRole' AS t, COUNT(*) FROM \"UserRole\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'StoreUsage', COUNT(*) FROM \"StoreUsage\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM \"RefreshTokens\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'ReSeller', COUNT(*) FROM \"ReSeller\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'Owner', COUNT(*) FROM \"Owner\" WHERE \"UserId\" = '$USER_ID';
"

# --- Begin transaction and delete ---
echo ""
echo "BEGIN TRANSACTION"
$PSQL -c "BEGIN;"

$PSQL -c "
-- STEP 1: ReSellerOwner
DELETE FROM \"ReSellerOwner\" ro
USING \"Owner\" o
WHERE ro.\"OwnerId\" = o.\"Id\"
  AND o.\"UserId\" = '$USER_ID';

-- STEP 2: UserRole
DELETE FROM \"UserRole\" WHERE \"UserId\" = '$USER_ID';

-- STEP 3: StoreUsage (user-level)
DELETE FROM \"StoreUsage\" WHERE \"UserId\" = '$USER_ID';

-- STEP 4a: StoreUser (stores owned by this user's Owner)
DELETE FROM \"StoreUser\" sud
USING \"Store\" s
WHERE sud.\"StoreId\" = s.\"Id\"
  AND s.\"OwnerId\" IN (SELECT \"Id\" FROM \"Owner\" WHERE \"UserId\" = '$USER_ID');

-- STEP 4b: StoreModule
DELETE FROM \"StoreModule\" sm
USING \"Store\" s
WHERE sm.\"StoreId\" = s.\"Id\"
  AND s.\"OwnerId\" IN (SELECT \"Id\" FROM \"Owner\" WHERE \"UserId\" = '$USER_ID');

-- STEP 4c: StoreRoleFeature
DELETE FROM \"StoreRoleFeature\" srf
USING \"Store\" s
WHERE srf.\"StoreId\" = s.\"Id\"
  AND s.\"OwnerId\" IN (SELECT \"Id\" FROM \"Owner\" WHERE \"UserId\" = '$USER_ID');

-- STEP 4d: Store.StoreUsages
DELETE FROM \"StoreUsage\" su
USING \"Store\" s
WHERE su.\"StoreId\" = s.\"Id\"
  AND s.\"OwnerId\" IN (SELECT \"Id\" FROM \"Owner\" WHERE \"UserId\" = '$USER_ID');

-- STEP 4e: Store
DELETE FROM \"Store\" s
WHERE s.\"OwnerId\" IN (SELECT \"Id\" FROM \"Owner\" WHERE \"UserId\" = '$USER_ID');

-- STEP 5: Owner
DELETE FROM \"Owner\" WHERE \"UserId\" = '$USER_ID';

-- STEP 6: ReSeller
DELETE FROM \"ReSeller\" WHERE \"UserId\" = '$USER_ID';

-- STEP 7: RefreshTokens
DELETE FROM \"RefreshTokens\" WHERE \"UserId\" = '$USER_ID';

-- STEP 8: User
DELETE FROM \"User\" WHERE \"Id\" = '$USER_ID';
"

# --- Commit ---
$PSQL -c "COMMIT;"
echo ""
echo "COMMIT OK"

# --- Verification ---
echo ""
echo "============================================"
echo " VERIFICATION (all counts should be 0)"
echo "============================================"
$PSQL -c "
SELECT 'UserRole' AS t, COUNT(*) FROM \"UserRole\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'StoreUsage', COUNT(*) FROM \"StoreUsage\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM \"RefreshTokens\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'ReSeller', COUNT(*) FROM \"ReSeller\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'Owner', COUNT(*) FROM \"Owner\" WHERE \"UserId\" = '$USER_ID'
UNION ALL SELECT 'User', COUNT(*) FROM \"User\" WHERE \"Id\" = '$USER_ID';
"

echo ""
echo "DONE."
