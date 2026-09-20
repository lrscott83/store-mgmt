#!/usr/bin/env bash
#
# deploy-test.sh — automated test-environment deploy on the VPS (podman).
#
# What it does:
#   1. Backs up the PRODUCTION database (read-only: pg_dump) into ./backups.
#   2. Fetches the test sources (branch $BRANCH) into ./test-store-mgmt.
#   3. Brings up the test Postgres and rebuilds smca_test from that dump.
#   4. Applies the SQL scripts from backend/scripts that are not yet in smca_test.
#   5. Builds the test backend image and deploys the isolated test stack.
#   6. Smoke-tests the test stack and tags the deployed git revision.
#
# SAFETY: production is only READ (pg_dump). Every test action is scoped with
#   `podman-compose -p smca-test -f docker-compose.test.yml`; production
#   containers, images, volumes and network are never touched.
#
# Usage:   ./deploy-test.sh [--keep-db] [--help]
#   --keep-db   keep the existing smca_test database (skip drop/create/restore)
#   --help      show this help
#
# Prerequisites:
#   - bash, podman, podman-compose, git, curl, gzip (flock recommended).
#   - Upload this script to its own folder on the VPS (e.g. /home/malayo/test-deploy/)
#     together with the .env. It creates ./backups, ./logs and ./test-store-mgmt.
#   - The .env file must live at the ROOT OF THE SOURCES CLONE
#     (./test-store-mgmt/.env). On the very first run, if it is missing there and
#     a .env exists next to this script, it is staged into the clone.
#   - chmod +x deploy-test.sh

set -euo pipefail

# --- Configuration (override via environment) --------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLONE_DIR="$SCRIPT_DIR/test-store-mgmt"
BACKUP_DIR="$SCRIPT_DIR/backups"
LOG_DIR="$SCRIPT_DIR/logs"
REPO_URL="${REPO_URL:-https://github.com/lrscott83/store-mgmt.git}"
BRANCH="${BRANCH:-test}"
PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-smca_postgres_db}"
PROD_DB_NAME="${PROD_DB_NAME:-smca}"
TEST_PROJECT="${TEST_PROJECT:-smca-test}"
TEST_PG_CONTAINER="${TEST_PG_CONTAINER:-smca_test_postgres_db}"
TEST_DB_NAME="${TEST_DB_NAME:-smca_test}"
BACKEND_IMAGE="${BACKEND_IMAGE:-localhost/store-mgmt_backend_test:latest}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-600}"
REACT_PORT="${REACT_PORT:-8095}"
PUSH_TAG="${PUSH_TAG:-0}"

KEEP_DB=0
LOG_FILE=""
COMPOSE_FILE=""
SHORT_SHA=""

# --- Helpers ------------------------------------------------------------------
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE:-/dev/null}"; }
die() { log "[FATAL] $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
trap 'log "[FATAL] line $LINENO failed"' ERR

usage() {
  cat <<'EOF'
Usage: ./deploy-test.sh [--keep-db] [--help]
  --keep-db   keep the existing smca_test database (skip drop/create/restore)
  --help      show this help
EOF
}

# --- Arguments ----------------------------------------------------------------
while [ "$#" -gt 0 ]; do
  case "$1" in
    --keep-db) KEEP_DB=1 ;;
    --help|-h) usage; exit 0 ;;
    *) usage; die "unknown argument: $1" ;;
  esac
  shift
done

# --- STEP 0: pre-flight -------------------------------------------------------
mkdir -p "$BACKUP_DIR" "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-test-$(date +%Y%m%d_%H%M%S).log"

log "=== deploy-test started (branch=$BRANCH, keep-db=$KEEP_DB) ==="
require_cmd podman
require_cmd podman-compose
require_cmd git
require_cmd curl
require_cmd gzip
command -v flock >/dev/null 2>&1 || log "[WARN] flock not found; concurrent runs are not prevented"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$SCRIPT_DIR/.deploy-test.lock"
  flock -n 9 || die "another deploy-test run is already in progress"
fi

[ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
  || die "production container $PROD_DB_CONTAINER is not running"

FREE_KB="$(df -Pk "$SCRIPT_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 2097152 ]; then
  log "[WARN] less than 2 GB free in $SCRIPT_DIR ($(( FREE_KB / 1024 )) MB)"
fi

# --- STEP 1: backup the production database (read-only) -----------------------
log "STEP 1 — backing up production database $PROD_DB_NAME"
BACKUP_FILE="$BACKUP_DIR/smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
podman exec "$PROD_DB_CONTAINER" pg_dump -U postgres "$PROD_DB_NAME" | gzip > "$BACKUP_FILE"
gzip -t "$BACKUP_FILE" || die "backup file is not a valid gzip: $BACKUP_FILE"
log "backup ok: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

log "rotating backups (keep last $KEEP_BACKUPS)"
ls -1t "$BACKUP_DIR"/smca_backup_*.sql.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old; do
  rm -f "$old"
  log "removed old backup: $old"
done || true

# --- STEP 2: fetch the test sources -------------------------------------------
log "STEP 2 — fetching sources of branch '$BRANCH' into $CLONE_DIR"
if [ -d "$CLONE_DIR/.git" ]; then
  git -C "$CLONE_DIR" fetch --prune origin
  git -C "$CLONE_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$CLONE_DIR"
fi

COMPOSE_FILE="$CLONE_DIR/docker-compose.test.yml"
if [ ! -f "$COMPOSE_FILE" ] && [ -f "$SCRIPT_DIR/docker-compose.test.yml" ]; then
  COMPOSE_FILE="$SCRIPT_DIR/docker-compose.test.yml"
fi
[ -f "$COMPOSE_FILE" ] || die "docker-compose.test.yml not found in the clone or next to this script (commit it to branch '$BRANCH')"

if [ ! -f "$CLONE_DIR/.env" ] && [ -f "$SCRIPT_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env" "$CLONE_DIR/.env"
  log "staged .env into the sources root"
fi
[ -f "$CLONE_DIR/.env" ] || die "missing .env at $CLONE_DIR/.env — rename your .env-test to .env and upload it (secrets replicated from the production .env)"

# Load the test environment. CRLFs are stripped so a Windows-created .env works.
set -a
source <(tr -d '\r' < "$CLONE_DIR/.env")
set +a

TEST_DB_USER="${POSTGRES_USER:-postgres}"
SHORT_SHA="$(git -C "$CLONE_DIR" rev-parse --short HEAD)"
log "sources ready: commit $SHORT_SHA"

# Every podman-compose call runs from the clone root (so podman-compose reads
# the .env there, same mechanism as production) and is scoped to the test project.
compose() { ( cd "$CLONE_DIR" && podman-compose -p "$TEST_PROJECT" -f "$COMPOSE_FILE" "$@" ); }

# --- STEP 3: test database ----------------------------------------------------
log "STEP 3 — test database"
log "stopping any running test stack (scoped: project $TEST_PROJECT)"
compose down || log "[WARN] compose down returned non-zero (nothing running?)"

log "starting test Postgres ($TEST_PG_CONTAINER)"
compose up -d postgres

READY=0
for _ in $(seq 1 60); do
  if podman exec "$TEST_PG_CONTAINER" pg_isready -U "$TEST_DB_USER" -d postgres >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
[ "$READY" -eq 1 ] || die "test Postgres did not become ready in time"

if [ "$KEEP_DB" -eq 1 ]; then
  log "keeping existing database (--keep-db): $TEST_DB_NAME"
else
  log "recreating $TEST_DB_NAME from $BACKUP_FILE"
  podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $TEST_DB_NAME WITH (FORCE);"
  podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $TEST_DB_NAME;"
  gunzip -c "$BACKUP_FILE" | podman exec -i "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -v ON_ERROR_STOP=1 2>&1 | tee -a "$LOG_FILE"
  log "restore finished"
fi

# --- STEP 4: apply pending SQL scripts ----------------------------------------
log "STEP 4 — checking pending SQL scripts in backend/scripts"
APPLIED_IDS="$(podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -tA \
  -c 'SELECT "MigrationId" FROM "__EFMigrationsHistory";' 2>/dev/null || true)"
[ -n "$APPLIED_IDS" ] || log "[WARN] __EFMigrationsHistory is empty or missing in $TEST_DB_NAME"

APPLIED_COUNT=0
for script in "$CLONE_DIR"/backend/scripts/*.sql; do
  [ -e "$script" ] || continue
  ids="$(grep -v '^[[:space:]]*--' "$script" | grep -oE "'[0-9]{14}_[A-Za-z0-9_.-]+'" | tr -d "'" | sort -u || true)"
  if [ -z "$ids" ]; then
    log "[WARN] no MigrationId found; skipping: $(basename "$script")"
    continue
  fi
  missing=0
  for id in $ids; do
    grep -qxF "$id" <<<"$APPLIED_IDS" || missing=1
  done
  if [ "$missing" -eq 1 ]; then
    log "applying: $(basename "$script")"
    podman exec -i "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" \
      -v ON_ERROR_STOP=1 < "$script" 2>&1 | tee -a "$LOG_FILE"
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
  else
    log "skip (already applied): $(basename "$script")"
  fi
done
log "pending scripts applied: $APPLIED_COUNT"

# --- STEP 5: build the test backend image -------------------------------------
log "STEP 5 — building backend test image $BACKEND_IMAGE"
if podman image exists "$BACKEND_IMAGE"; then
  podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:previous"
  log "rollback image updated: ${BACKEND_IMAGE%:*}:previous"
fi
podman build -t "$BACKEND_IMAGE" "$CLONE_DIR/backend/src" 2>&1 | tee -a "$LOG_FILE"
podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:$SHORT_SHA"
log "image ready: $BACKEND_IMAGE and ${BACKEND_IMAGE%:*}:$SHORT_SHA"

# --- STEP 6: deploy the isolated test stack -----------------------------------
log "STEP 6 — deploying test stack (project $TEST_PROJECT)"
compose down || log "[WARN] compose down returned non-zero (nothing running?)"
compose up -d --build 2>&1 | tee -a "$LOG_FILE"
log "test stack deployed"

# --- STEP 7: smoke test -------------------------------------------------------
# The Angular frontend and its load balancer no longer exist, so there is no
# :8093 entrypoint. The React SPA is self-sufficient: it serves `/` and proxies
# `/api` to the test backend, so both checks go through :$REACT_PORT.
log "STEP 7 — smoke test (timeout ${SMOKE_TIMEOUT_SECONDS}s)"
DEADLINE=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
until curl -fsS "http://localhost:$REACT_PORT/api/v1/ping" >/dev/null 2>&1 \
   && curl -fsS "http://localhost:$REACT_PORT/" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    die "smoke test timed out — check: podman logs smca_test_backend smca_test_web_pos"
  fi
  sleep 10
done
log "smoke test ok: / (SPA) and /api/v1/ping (same-origin proxy) on :$REACT_PORT"

# --- STEP 8: git tag + deploy state -------------------------------------------
TAG_NAME="test-deploy-$(date +%Y%m%d_%H%M%S)"
git -C "$CLONE_DIR" tag -a "$TAG_NAME" -m "Test deploy $TAG_NAME (commit $SHORT_SHA)"
if [ "$PUSH_TAG" = "1" ]; then
  git -C "$CLONE_DIR" push origin "$TAG_NAME"
  log "tag pushed to origin: $TAG_NAME"
fi

cat > "$SCRIPT_DIR/deploy-state.txt" <<EOF
TAG=$TAG_NAME
COMMIT=$SHORT_SHA
BRANCH=$BRANCH
DATE=$(date '+%Y-%m-%d %H:%M:%S')
BACKUP=$BACKUP_FILE
IMAGE=${BACKEND_IMAGE%:*}:$SHORT_SHA
REACT_URL=http://localhost:$REACT_PORT
EOF
log "deploy state written to $SCRIPT_DIR/deploy-state.txt"
log "tag: $TAG_NAME"

# --- Final safety check -------------------------------------------------------
[ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
  || log "[WARN] production container $PROD_DB_CONTAINER is not running (it was not touched by this script)"
log "=== deploy-test finished OK ==="
