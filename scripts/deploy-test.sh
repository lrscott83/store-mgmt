#!/usr/bin/env bash
#
# deploy-test.sh — automated test-environment deploy on the VPS (podman).
#
# Default behaviour (no flags): production is NEVER touched and the test
# database is NEVER rebuilt from production.
#   1. Fetches the test sources (branch $BRANCH) into ./test-store-mgmt.
#   2. Brings up the test Postgres and keeps the existing smca_test database.
#   3. Backs up the TEST database (pg_dump) into ./backups BEFORE any script runs,
#      together with the CATALOG IMAGES from the test storage volume (the photos
#      live on a volume, not in the dump). Both use the same timestamp.
#   4. Applies the pending SQL scripts from backend/scripts to smca_test.
#      On failure → RESTORES smca_test from the backup taken in step 3, and the
#      catalog images with it.
#   5. Builds the test backend image (tags :previous and :<sha>).
#   6. Deploys the isolated test stack.
#   7. Smoke-tests the stack; on failure it ROLLS BACK: restores the test DB and
#      the catalog images, re-tags :previous as :latest, then redeploys.
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
#   - The CATALOG IMAGES are backed up before any write and restored by every
#     rollback path, just like the database: rewinding smca_test without rewinding
#     the photos it references is what desyncs the catalog. On the very first test
#     deploy smca_test_backend does not exist yet, so that run logs a [WARN] and
#     skips the image backup instead of refusing to deploy an environment that has
#     no photos to lose.
#
# Usage:   ./deploy-test.sh [--from-prod] [--keep-db] [--help]
#   --from-prod  seed smca_test from a fresh production dump (read-only on production)
#   --keep-db    deprecated no-op; keeping the existing test database is now the default
#   --help       show this help
#
# Prerequisites:
#   - bash, podman, podman-compose, git, curl, gzip (flock recommended).
#     The catalog image backup needs `tar` INSIDE the backend container (the
#     aspnet:8.0 image has it); gzip runs on the host.
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
TEST_BACKEND_CONTAINER="${TEST_BACKEND_CONTAINER:-smca_test_backend}"
TEST_DB_NAME="${TEST_DB_NAME:-smca_test}"
BACKEND_IMAGE="${BACKEND_IMAGE:-localhost/store-mgmt_backend_test:latest}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-600}"
REACT_PORT="${REACT_PORT:-8095}"
PUSH_TAG="${PUSH_TAG:-0}"

# Catalog images (web catalog photos). They live on the podman volume mounted at
# /app/storage in the test backend container, NOT in smca_test. The test volume is
# its own (storage_test_data) and shares nothing with production.
STORAGE_MOUNT_DEST="${STORAGE_MOUNT_DEST:-/app/storage}"
# CatalogImageStorageOptions.CatalogImageRoot is "storage/catalog" and a relative
# root is resolved against the container's WORKDIR (/app), so the real directory is
# /app/storage/storage/catalog — NOT the whole mount. Backing up /app/storage would
# also sweep whatever else lands in that volume.
CATALOG_IMAGE_SUBDIR="${CATALOG_IMAGE_SUBDIR:-storage/catalog}"
CATALOG_IMAGE_PATH="$STORAGE_MOUNT_DEST/$CATALOG_IMAGE_SUBDIR"

FROM_PROD=0
NO_ROLLBACK=0
LOG_FILE=""
COMPOSE_FILE=""
BACKUP_FILE=""
BACKUP_STAMP=""
IMAGES_BACKUP_FILE=""
STORAGE_VOLUME=""
SHORT_SHA=""

# --- Helpers ------------------------------------------------------------------
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE:-/dev/null}"; }
die() { log "[FATAL] $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
trap 'log "[FATAL] line $LINENO failed"' ERR

# Redact sensitive values from any output before it reaches the log
redact() {
  sed -E \
    -e 's/(Password=)[^;]+/\1***/g' \
    -e 's/(POSTGRES_PASSWORD=)[^ ]+/\1***/g' \
    -e 's/(PGADMIN_DEFAULT_PASSWORD=)[^ ]+/\1***/g' \
    -e 's/(Jwt__SecretKey=)[^ ]+/\1***/g' \
    -e 's/(Jwt__Issuer=)[^ ]+/\1***/g' \
    -e 's/(Jwt__Audience=)[^ ]+/\1***/g' \
    -e 's/(Authentication__Pepper=)[^ ]+/\1***/g' \
    -e 's/(StoreEncryption__MasterSecret=)[^ ]+/\1***/g' \
    -e 's/(ConnectionStrings__Application=)[^ ]+/\1***/g'
}

usage() {
  cat <<'EOF'
Usage: ./deploy-test.sh [--from-prod] [--no-rollback] [--keep-db] [--help]
  --from-prod    seed smca_test from a fresh production dump (read-only on production)
  --no-rollback  skip automatic rollback on smoke failure (for diagnosis)
  --keep-db      deprecated no-op; keeping the existing test database is now the default
  --help         show this help
EOF
}

# --- Arguments ----------------------------------------------------------------
while [ "$#" -gt 0 ]; do
  case "$1" in
    --from-prod) FROM_PROD=1 ;;
    --no-rollback) NO_ROLLBACK=1 ;;
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
set +x
set -a
source <(tr -d '\r' < "$CLONE_DIR/.env")
set +a
set -x

TEST_DB_USER="${POSTGRES_USER:-postgres}"
SHORT_SHA="$(git -C "$CLONE_DIR" rev-parse --short HEAD)"
log "sources ready: commit $SHORT_SHA"

# Every podman-compose call runs from the clone root (so podman-compose reads
# the .env there, same mechanism as production) and is scoped to the test project.
compose() { ( cd "$CLONE_DIR" && podman-compose -p "$TEST_PROJECT" -f "$COMPOSE_FILE" "$@" ); }

# --- Database helpers ---------------------------------------------------------
# Rotate a backup family (e.g. smca_backup or smca_test_backup), keeping the last
# $KEEP_BACKUPS files. Each family is rotated on its own. The extension is a
# parameter because the catalog images are a third family of .tar.gz files and
# this is the one rotation loop in this script.
rotate_backups() {
  local prefix="$1" ext="${2:-sql.gz}"
  log "rotating backups ($prefix*.$ext, keep last $KEEP_BACKUPS)"
  ls -1t "$BACKUP_DIR"/${prefix}_*.${ext} 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old; do
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
  gunzip -c "$BACKUP_FILE" | podman exec -i "$TEST_PG_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -v ON_ERROR_STOP=1 2>&1 | redact | tee -a "$LOG_FILE"
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

# --- Catalog images: backup + rollback -----------------------------------------
# Resolve the REAL source of the catalog volume. The volume is NOT "storage_test_data":
# podman-compose prefixes every named volume with the compose project name, so on disk
# it is "<project>_storage_test_data" (today smca-test_storage_test_data). Hardcoding
# the short name would point at nothing, so the mount is READ from the running test
# backend container at runtime — the same trick deploy-prod.sh already uses for the
# production volume and for io.podman.compose.project.
resolve_storage_volume() {
  # One "destination name" pair per line ({{"\n"}}) so the filter below stays correct
  # when the container has more than one mount.
  STORAGE_VOLUME="$(podman inspect -f '{{range .Mounts}}{{.Destination}} {{.Name}}{{"\n"}}{{end}}' \
    "$TEST_BACKEND_CONTAINER" 2>/dev/null \
    | awk -v dest="$STORAGE_MOUNT_DEST" '$1 == dest { print $2 }' || true)"
  [ -n "$STORAGE_VOLUME" ] || return 1
  log "catalog images volume: $STORAGE_VOLUME (mounted at $STORAGE_MOUNT_DEST in $TEST_BACKEND_CONTAINER)"
}

# Back up the catalog images BEFORE any script touches the test database. $1 is the
# stamp already used for the DB dump (smca_test_backup_<ts>.sql.gz by default,
# smca_backup_<ts>.sql.gz with --from-prod), so both files always describe the same
# state of the system and an operator can pair them.
backup_images() {
  local stamp="$1"
  IMAGES_BACKUP_FILE="$BACKUP_DIR/smca_test_images_backup_${stamp}.tar.gz"

  # A missing/stopped backend container is a WARNING here, not a fatal error: on the
  # very first test deploy smca_test_backend does not exist yet and its volume has no
  # photos to lose, and refusing to deploy the test stack over an empty catalog would be
  # worse than the gap this backup protects. From the second run on the container is up
  # and the backup is taken for real again.
  if [ "$(podman inspect -f '{{.State.Running}}' "$TEST_BACKEND_CONTAINER" 2>/dev/null || true)" != "true" ]; then
    IMAGES_BACKUP_FILE=""
    log "[WARN] $TEST_BACKEND_CONTAINER is not running — catalog images are NOT backed up in this run"
    return 0
  fi

  resolve_storage_volume \
    || die "running $TEST_BACKEND_CONTAINER has no $STORAGE_MOUNT_DEST mount — refusing to deploy with no rollback point for the catalog images"

  # The directory may not exist yet (no photo uploaded since the volume was created).
  # Creating it keeps tar's path stable instead of failing the deploy over an empty
  # catalog; it is the very directory the API creates on its first image save.
  podman exec "$TEST_BACKEND_CONTAINER" mkdir -p "$CATALOG_IMAGE_PATH" \
    || die "could not create $CATALOG_IMAGE_PATH inside $TEST_BACKEND_CONTAINER"

  log "backing up catalog images ($CATALOG_IMAGE_PATH) from $TEST_BACKEND_CONTAINER"
  # tar runs inside the container because that is where the volume is mounted, and gzip
  # runs on the host where the script already requires it. Only `tar` is needed in the
  # image, which the aspnet:8.0 base image ships.
  podman exec "$TEST_BACKEND_CONTAINER" tar -cf - -C "$STORAGE_MOUNT_DEST" "$CATALOG_IMAGE_SUBDIR" \
    | gzip > "$IMAGES_BACKUP_FILE" \
    || die "catalog image backup failed — refusing to continue with no rollback point for the images"

  # Same rule as the DB dump: an archive that was never validated is not a backup.
  gzip -t "$IMAGES_BACKUP_FILE" || die "catalog image backup is not a valid gzip: $IMAGES_BACKUP_FILE"
  log "images backup ok: $IMAGES_BACKUP_FILE ($(du -h "$IMAGES_BACKUP_FILE" | cut -f1))"

  # Third backup family (smca_test_images_backup_*.tar.gz), rotated through the shared
  # helper so KEEP_BACKUPS applies to it exactly as to the two .sql.gz families.
  rotate_backups "smca_test_images_backup" "tar.gz"
}

# Rollback companion of restore_test_db. It NEVER dies on purpose: this runs in the
# middle of a rollback, and aborting here would skip the image retag and the redeploy,
# leaving the test stack worse off than a missing catalog restore. Every failure is
# logged loudly and the rollback continues.
restore_images() {
  if [ -z "$IMAGES_BACKUP_FILE" ] || [ ! -f "$IMAGES_BACKUP_FILE" ]; then
    log "[WARN] no catalog image backup for this rollback ($BACKUP_FILE has no paired .tar.gz) — images NOT restored"
    return 0
  fi
  if ! gzip -t "$IMAGES_BACKUP_FILE"; then
    log "[WARN] catalog image archive is corrupt: $IMAGES_BACKUP_FILE — images NOT restored"
    return 0
  fi

  log "ROLLBACK(IMAGES) — restoring $CATALOG_IMAGE_PATH from $IMAGES_BACKUP_FILE"
  # Clean the destination FIRST, then extract. Extracting over the live directory would
  # leave every file the archive does not contain, which is precisely the inconsistency
  # this restore exists to remove.
  if podman exec "$TEST_BACKEND_CONTAINER" sh -c "rm -rf '$CATALOG_IMAGE_PATH' && mkdir -p '$CATALOG_IMAGE_PATH'" \
    && gunzip -c "$IMAGES_BACKUP_FILE" \
      | podman exec -i "$TEST_BACKEND_CONTAINER" tar -xf - -C "$STORAGE_MOUNT_DEST"; then
    log "ROLLBACK(IMAGES) — done"
    return 0
  fi

  # Fallback for the one rollback path that runs AFTER `compose down` (STEP 6): the
  # backend container is gone, so `podman exec` cannot reach the volume at all. Re-mount
  # it on a throwaway container using the volume name resolved during the backup, or the
  # database would be rewound while the photos stayed ahead.
  if [ -n "$STORAGE_VOLUME" ] && podman image exists "$BACKEND_IMAGE"; then
    log "[WARN] $TEST_BACKEND_CONTAINER is unreachable — restoring through a temporary container on $STORAGE_VOLUME"
    if podman run --rm -v "$STORAGE_VOLUME:$STORAGE_MOUNT_DEST" --entrypoint sh "$BACKEND_IMAGE" \
         -c "rm -rf '$CATALOG_IMAGE_PATH' && mkdir -p '$CATALOG_IMAGE_PATH'" \
       && gunzip -c "$IMAGES_BACKUP_FILE" \
         | podman run --rm -i -v "$STORAGE_VOLUME:$STORAGE_MOUNT_DEST" --entrypoint tar "$BACKEND_IMAGE" \
             -xf - -C "$STORAGE_MOUNT_DEST"; then
      log "ROLLBACK(IMAGES) — done (via the temporary container)"
      return 0
    fi
  fi

  log "[WARN] catalog image restore FAILED — $CATALOG_IMAGE_PATH may be inconsistent with $TEST_DB_NAME; restore it by hand from $IMAGES_BACKUP_FILE"
  return 0
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
# One timestamp for the whole run. The DB dump and the catalog image archive of THIS
# branch get it, so an operator can always pair the two files that describe the same
# pre-deploy state, whichever mode the run used.
BACKUP_STAMP="$(date +%Y%m%d_%H%M%S)"
if [ "$FROM_PROD" -eq 1 ]; then
  log "STEP 3 — seeding $TEST_DB_NAME from the PRODUCTION database (read-only)"
  [ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
    || die "production container $PROD_DB_CONTAINER is not running"

  BACKUP_FILE="$BACKUP_DIR/smca_backup_$BACKUP_STAMP.sql.gz"
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
  BACKUP_FILE="$BACKUP_DIR/smca_test_backup_$BACKUP_STAMP.sql.gz"
  podman exec "$TEST_PG_CONTAINER" pg_dump -U "$TEST_DB_USER" "$TEST_DB_NAME" | gzip > "$BACKUP_FILE"
  gzip -t "$BACKUP_FILE" || die "backup file is not a valid gzip: $BACKUP_FILE"
  log "test backup ok: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  rotate_backups "smca_test_backup"
fi

# The catalog photos live in the test storage volume, not in either dump, and both modes
# below rewind $TEST_DB_NAME on failure — so both need the volume backed up. Taken AFTER
# the dump (same stamp) and BEFORE STEP 4 touches anything. In --from-prod mode the
# database is deliberately overwritten with production data, but the VOLUME is still the
# test one and still the thing this run mutates: rewinding it on rollback returns the
# test environment to the state the operator started from.
backup_images "$BACKUP_STAMP"

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
      -v ON_ERROR_STOP=1 < "$script" 2>&1 | redact | tee -a "$LOG_FILE"; then
      log "[FATAL] script failed: $(basename "$script") — restoring the test database"
      restore_test_db
      restore_images
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
if ! podman build -t "$BACKEND_IMAGE" "$CLONE_DIR/backend/src" 2>&1 | redact | tee -a "$LOG_FILE"; then
  log "[FATAL] backend image build failed — restoring the test database"
  restore_test_db
  restore_images
  die "image build failed; the test database was restored from $BACKUP_FILE"
fi
podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:$SHORT_SHA"
log "image ready: $BACKEND_IMAGE and ${BACKEND_IMAGE%:*}:$SHORT_SHA"

# --- STEP 6: deploy the isolated test stack (rollback on failure) -------------
log "STEP 6 — deploying test stack (project $TEST_PROJECT)"
compose down || log "[WARN] compose down returned non-zero (nothing running?)"
if ! compose up -d --build 2>&1 | redact | tee -a "$LOG_FILE"; then
  log "[FATAL] compose up failed — rolling back (test DB + catalog images + :previous image)"
  restore_test_db
  restore_images
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
  log "[FATAL] smoke test failed"
  log "=== DIAGNOSTIC START ==="
  log "--- container status ---"
  podman ps -a --filter "label=io.podman.compose.project=$TEST_PROJECT" --format '{{.Names}} {{.Status}}' 2>&1 | redact | tee -a "$LOG_FILE" || true
  log "--- backend health ---"
  podman inspect --format='{{.State.Health.Status}}' smca_test_backend 2>&1 | tee -a "$LOG_FILE" || true
  log "--- backend logs (last 30 lines) ---"
  podman logs --tail 30 smca_test_backend 2>&1 | redact | tee -a "$LOG_FILE" || true
  log "--- web-store-pos logs (last 20 lines) ---"
  podman logs --tail 20 smca_test_web_pos 2>&1 | redact | tee -a "$LOG_FILE" || true
  log "--- smoke test manual check ---"
  curl -v "http://localhost:$REACT_PORT/api/v1/ping" 2>&1 | redact | tee -a "$LOG_FILE" || true
  curl -v "http://localhost:$REACT_PORT/" 2>&1 | redact | tee -a "$LOG_FILE" || true
  log "=== DIAGNOSTIC END ==="
  if [ "$NO_ROLLBACK" -eq 1 ]; then
    log "[WARN] --no-rollback set — skipping rollback, leaving stack as-is for diagnosis"
    die "deploy failed (no-rollback mode); check the diagnostic output above"
  fi
  log "rolling back (test DB + catalog images + :previous image)"
  restore_test_db
  restore_images
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
IMAGES_BACKUP=$IMAGES_BACKUP_FILE
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
