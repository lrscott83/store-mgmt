#!/usr/bin/env bash
#
# deploy-test.sh — automated test-environment deploy on the VPS (podman).
#
# Default behaviour (no flags): production is NEVER touched and the test
# database is NEVER rebuilt from production.
#   1. Fetches the test sources (branch $BRANCH) into ./test-store-mgmt.
#   2. Brings up the test Postgres and keeps the existing smca_test database.
#   3. Backs up the TEST database (pg_dump) into ./backups BEFORE any script runs.
#   4. Applies the pending SQL scripts from backend/scripts to smca_test.
#      On failure → RESTORES smca_test from the backup taken in step 3.
#   5. Builds the test backend image (tags :previous and :<sha>).
#   6. Deploys the isolated test stack.
#   7. Smoke-tests the stack; on failure it ROLLS BACK: restores the test DB and
#      re-tags :previous as :latest, then redeploys.
#   8. Tags the deployed git revision and writes deploy-state.txt.
#
# Optional flag --from-prod restores the PRODUCTION database into smca_test
# first (production is only READ via pg_dump); that dump becomes the rollback
# source for the test database for the rest of the run.
#
# SAFETY: by default production is NOT accessed at all (no pg_dump, no container
#   check). With --from-prod, production is only READ. Every test action is scoped
#   with `podman-compose -p smca-test -f docker-compose.test.yml`; production
#   containers, images, volumes and network are never touched.
#
# Usage:   ./deploy-test.sh [--from-prod] [--keep-db] [--help]
#   --from-prod  seed smca_test from a fresh production dump (read-only on production)
#   --keep-db    deprecated no-op; keeping the existing test database is now the default
#   --help       show this help
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

FROM_PROD=0
LOG_FILE=""
COMPOSE_FILE=""
BACKUP_FILE=""
SHORT_SHA=""

# --- Helpers ------------------------------------------------------------------
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE:-/dev/null}"; }
die() { log "[FATAL] $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
trap 'log "[FATAL] line $LINENO failed"' ERR

usage() {
  cat <<'EOF'
Usage: ./deploy-test.sh [--from-prod] [--keep-db] [--help]
  --from-prod  seed smca_test from a fresh production dump (read-only on production)
  --keep-db    deprecated no-op; keeping the existing test database is now the default
  --help       show this help
EOF
}

# --- Arguments ----------------------------------------------------------------
while [ "$#" -gt 0 ]; do
  case "$1" in
    --from-prod) FROM_PROD=1 ;;
    --keep-db) log "[WARN] --keep-db is deprecated and now a no-op: keeping the existing test database is the default" ;;
    --help|-h) usage; exit 0 ;;
    *) usage; die "unknown argument: $1" ;;
  esac
  shift
done

# --- STEP 0: pre-flight -------------------------------------------------------
mkdir -p "$BACKUP_DIR" "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-test-$(date +%Y%m%d_%H%M%S).log"

log "=== deploy-test started (branch=$BRANCH, from-prod=$FROM_PROD) ==="
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

FREE_KB="$(df -Pk "$SCRIPT_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 2097152 ]; then
  log "[WARN] less than 2 GB free in $SCRIPT_DIR ($(( FREE_KB / 1024 )) MB)"
fi

# --- STEP 1: fetch the test sources -------------------------------------------
log "STEP 1 — fetching sources of branch '$BRANCH' into $CLONE_DIR"
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

# --- Database helpers ---------------------------------------------------------
# Rotate a backup family (e.g. smca_backup or smca_test_backup), keeping the last
# $KEEP_BACKUPS files. Each family is rotated on its own.
rotate_backups() {
  local prefix="$1"
  log "rotating backups ($prefix*, keep last $KEEP_BACKUPS)"
  ls -1t "$BACKUP_DIR"/${prefix}_*.sql.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old; do
    rm -f "$old"
    log "removed old backup: $old"
  done || true
}

# Rollback: rebuild smca_test from $BACKUP_FILE (test dump by default, production
# dump in --from-prod mode). Both modes use the same restore path.
restore_test_db() {
  [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ] || die "no backup file to restore the test database from"
  log "ROLLBACK(DB) — restoring $TEST_DB_NAME from $BACKUP_FILE"
  podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $TEST_DB_NAME WITH (FORCE);"
  podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $TEST_DB_NAME;"
  gunzip -c "$BACKUP_FILE" | podman exec -i "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -v ON_ERROR_STOP=1 2>&1 | tee -a "$LOG_FILE"
  log "ROLLBACK(DB) — done"
}

rollback_image() {
  if podman image exists "${BACKEND_IMAGE%:*}:previous"; then
    podman tag "${BACKEND_IMAGE%:*}:previous" "$BACKEND_IMAGE"
    log "ROLLBACK(IMAGE) — ${BACKEND_IMAGE%:*}:previous re-tagged as $BACKEND_IMAGE"
  else
    log "[WARN] no ${BACKEND_IMAGE%:*}:previous image to roll back to"
  fi
}

smoke_ok() {
  curl -fsS "http://localhost:$REACT_PORT/api/v1/ping" >/dev/null 2>&1 \
    && curl -fsS "http://localhost:$REACT_PORT/" >/dev/null 2>&1
}

# --- STEP 2: test Postgres ----------------------------------------------------
log "STEP 2 — bringing up the test Postgres ($TEST_PG_CONTAINER)"
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

# --- STEP 3: database (mode dependent) ----------------------------------------
if [ "$FROM_PROD" -eq 1 ]; then
  log "STEP 3 — seeding $TEST_DB_NAME from the PRODUCTION database (read-only)"
  [ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
    || die "production container $PROD_DB_CONTAINER is not running"

  BACKUP_FILE="$BACKUP_DIR/smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
  podman exec "$PROD_DB_CONTAINER" pg_dump -U postgres "$PROD_DB_NAME" | gzip > "$BACKUP_FILE"
  gzip -t "$BACKUP_FILE" || die "backup file is not a valid gzip: $BACKUP_FILE"
  log "production backup ok: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  rotate_backups "smca_backup"

  log "recreating $TEST_DB_NAME from the production dump"
  podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $TEST_DB_NAME WITH (FORCE);"
  podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $TEST_DB_NAME;"
  gunzip -c "$BACKUP_FILE" | podman exec -i "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -v ON_ERROR_STOP=1 2>&1 | tee -a "$LOG_FILE"
  log "production dump restored into $TEST_DB_NAME"
else
  log "STEP 3 — keeping the existing $TEST_DB_NAME (production is NOT touched)"

  DB_EXISTS="$(podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$TEST_DB_NAME';" 2>/dev/null || true)"
  if [ -z "$DB_EXISTS" ]; then
    log "[WARN] $TEST_DB_NAME does not exist; creating an empty database (seed it with --from-prod if you need production data)"
    podman exec "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE $TEST_DB_NAME;"
  fi

  log "backing up the TEST database BEFORE running any script (rollback source)"
  BACKUP_FILE="$BACKUP_DIR/smca_test_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
  podman exec "$TEST_PG_CONTAINER" pg_dump -U "$TEST_DB_USER" "$TEST_DB_NAME" | gzip > "$BACKUP_FILE"
  gzip -t "$BACKUP_FILE" || die "backup file is not a valid gzip: $BACKUP_FILE"
  log "test backup ok: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  rotate_backups "smca_test_backup"
fi

# --- STEP 4: apply pending SQL scripts (rollback on failure) -------------------
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
    if ! podman exec -i "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" \
      -v ON_ERROR_STOP=1 < "$script" 2>&1 | tee -a "$LOG_FILE"; then
      log "[FATAL] script failed: $(basename "$script") — restoring the test database"
      restore_test_db
      die "script failed; the test database was restored from $BACKUP_FILE"
    fi
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
  else
    log "skip (already applied): $(basename "$script")"
  fi
done
log "pending scripts applied: $APPLIED_COUNT"

# --- STEP 5: build the test backend image (rollback on failure) ---------------
log "STEP 5 — building backend test image $BACKEND_IMAGE"
if podman image exists "$BACKEND_IMAGE"; then
  podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:previous"
  log "rollback image updated: ${BACKEND_IMAGE%:*}:previous"
fi
if ! podman build -t "$BACKEND_IMAGE" "$CLONE_DIR/backend/src" 2>&1 | tee -a "$LOG_FILE"; then
  log "[FATAL] backend image build failed — restoring the test database"
  restore_test_db
  die "image build failed; the test database was restored from $BACKUP_FILE"
fi
podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:$SHORT_SHA"
log "image ready: $BACKEND_IMAGE and ${BACKEND_IMAGE%:*}:$SHORT_SHA"

# --- STEP 6: deploy the isolated test stack (rollback on failure) -------------
log "STEP 6 — deploying test stack (project $TEST_PROJECT)"
compose down || log "[WARN] compose down returned non-zero (nothing running?)"
if ! compose up -d --build 2>&1 | tee -a "$LOG_FILE"; then
  log "[FATAL] compose up failed — rolling back (test DB + :previous image)"
  restore_test_db
  rollback_image
  die "deploy failed; rolled back to $BACKUP_FILE and the :previous image"
fi
log "test stack deployed"

# --- STEP 7: smoke test (+ rollback on failure) -------------------------------
# The Angular frontend and its load balancer no longer exist, so there is no
# :8093 entrypoint. The React SPA is self-sufficient: it serves `/` and proxies
# `/api` to the test backend, so both checks go through :$REACT_PORT.
log "STEP 7 — smoke test (timeout ${SMOKE_TIMEOUT_SECONDS}s)"
DEADLINE=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
until smoke_ok; do
  if [ "$SECONDS" -ge "$DEADLINE" ]; then break; fi
  sleep 10
done
if ! smoke_ok; then
  log "[FATAL] smoke test failed — rolling back (test DB + :previous image)"
  restore_test_db
  rollback_image
  compose down || log "[WARN] compose down returned non-zero"
  compose up -d || log "[WARN] compose up returned non-zero"
  die "deploy failed; rolled back to $BACKUP_FILE and the :previous image"
fi
log "smoke test ok: / (SPA) and /api/v1/ping (same-origin proxy) on :$REACT_PORT"

# --- STEP 8: git tag + deploy state -------------------------------------------
TAG_NAME="test-deploy-$(date +%Y%m%d_%H%M%S)"
git -C "$CLONE_DIR" tag -a "$TAG_NAME" -m "Test deploy $TAG_NAME (commit $SHORT_SHA)"
if [ "$PUSH_TAG" = "1" ]; then
  git -C "$CLONE_DIR" push origin "$TAG_NAME"
  log "tag pushed to origin: $TAG_NAME"
fi

if [ "$FROM_PROD" -eq 1 ]; then MODE="from-prod"; else MODE="keep-test-db"; fi
cat > "$SCRIPT_DIR/deploy-state.txt" <<EOF
TAG=$TAG_NAME
COMMIT=$SHORT_SHA
BRANCH=$BRANCH
MODE=$MODE
DATE=$(date '+%Y-%m-%d %H:%M:%S')
BACKUP=$BACKUP_FILE
IMAGE=${BACKEND_IMAGE%:*}:$SHORT_SHA
REACT_URL=http://localhost:$REACT_PORT
EOF
log "deploy state written to $SCRIPT_DIR/deploy-state.txt"
log "tag: $TAG_NAME"

# --- Final safety check -------------------------------------------------------
if [ "$FROM_PROD" -eq 1 ]; then
  [ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
    || log "[WARN] production container $PROD_DB_CONTAINER is not running (it was not touched by this script)"
else
  log "production was never accessed in this run (no --from-prod)"
fi
log "=== deploy-test finished OK ==="
