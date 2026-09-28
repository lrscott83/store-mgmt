#!/usr/bin/env bash
# ============================================================
# DROP CATALOG PUBLISHED TABLES via Podman
# ------------------------------------------------------------
# Revierte el script 26 (20260927-Catalog-Published-Tables) en
# la BD de test del VPS: suelta CatalogCategory / CatalogProduct
# / CatalogProductImage y desregistra la migración EF.
#
# Motivo (decisión del Owner, 2026-09-28): la publicación del
# catálogo es DIRECTA sobre las tablas normales (Product /
# ProductCategory / ProductImage). Las tablas Catalog* quedaron
# huérfanas: nadie las lee ni las escribe.
#
# Seguro: DROP TABLE IF EXISTS + no toca ninguna tabla normal.
# Usage: ./drop-catalog-published-tables.sh
# ============================================================

set -euo pipefail

CONTAINER="${TEST_PG_CONTAINER:-smca_test_postgres_db}"
DB_USER="${TEST_DB_USER:-postgres}"
DB_NAME="${TEST_DB_NAME:-smca_test}"

PSQL="podman exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"

echo "============================================"
echo " CONTAINER: $CONTAINER"
echo " DATABASE : $DB_NAME"
echo "============================================"

# --- Verify container is running ---
if [ "$(podman inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
    echo "Error: container '$CONTAINER' is not running."
    exit 1
fi

# --- Show current state ---
echo ""
echo "--- Current state ---"
$PSQL -c "
SELECT c.relname AS table_name, COALESCE(n_live_tup, 0) AS approx_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('CatalogCategory','CatalogProduct','CatalogProductImage')
ORDER BY c.relname;"

read -p "Drop these tables and unregister migration 20260927193020_Catalog-Published-Tables? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# --- Drop (idempotent) ---
echo ""
echo "--- Dropping tables ---"
$PSQL <<'SQL'
BEGIN;

DROP TABLE IF EXISTS "CatalogProductImage";
DROP TABLE IF EXISTS "CatalogProduct";
DROP TABLE IF EXISTS "CatalogCategory";

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20260927193020_Catalog-Published-Tables';

COMMIT;
SQL

# --- Verify ---
echo ""
echo "--- Verification (must return no rows) ---"
$PSQL -c "
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('CatalogCategory','CatalogProduct','CatalogProductImage');"

echo ""
echo "Done."
