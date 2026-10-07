#!/usr/bin/env bash
#
# deploy-prod.sh — automated PRODUCTION deploy on the VPS (podman).
#
# What it does:
#   1. Backs up the PRODUCTION database (pg_dump) into ./backups. MANDATORY.
#      It also backs up the CATALOG IMAGES from the storage volume, stamped with
#      the same timestamp: the photos live in a podman volume, not in the dump.
#   2. Fetches the production sources (branch $BRANCH, default main) into ./prod-store-mgmt.
#   3. Builds the production backend image (tags :previous and :<sha>).
#   4. Applies the SQL scripts from backend/scripts that are not yet in the prod DB.
#   5. Deploys the production stack.
#   6. Smoke-tests it; on failure it ROLLS BACK: restores the DB and the catalog
#      images from their backups, re-tags :previous as :latest and redeploys.
#   7. Tags the deployed git revision and writes deploy-state.txt.
#
# SAFETY:
#   - A valid DB backup is taken BEFORE any write. No backup, no deploy.
#   - Rollback restores the database, the backend image AND the catalog images.
#     The images are rewound as well because restore_db() rewinds the rows that
#     reference them; leaving the files on disk would desync the catalog.
#   - The test stack (smca-test) is never touched.
#   - The podman-compose project name is read from the running prod container's
#     labels; it is never invented. Inventing it would make `compose up` create NEW
#     volumes (an empty database) instead of reusing production's.
#
# Usage:   ./deploy-prod.sh [--yes] [--dry-run] [--rollback] [--help]
#   --yes        skip the interactive confirmation
#   --dry-run    backup + fetch + build + validate only; no DB writes, no deploy
#   --rollback   restore the DB + catalog images from the latest backup +
#                :previous image + redeploy
#   --help       show this help
#
# Prerequisites:
#   - bash, podman, podman-compose, git, curl, gzip (flock recommended).
#     The catalog image backup needs `tar` INSIDE the backend container (the
#     aspnet:8.0 image has it); gzip runs on the host.
#   - Upload this script to its own folder on the VPS (e.g. /home/malayo/prod-deploy/)
#     together with the PRODUCTION .env. It creates ./backups, ./logs and ./prod-store-mgmt.
#   - The .env must live at the ROOT OF THE SOURCES CLONE (./prod-store-mgmt/.env).
#     On the first run, if it is missing there and a .env exists next to this script,
#     it is staged into the clone.
#   - chmod +x deploy-prod.sh

set -euo pipefail

# --- Configuration (override via environment) --------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLONE_DIR="$SCRIPT_DIR/prod-store-mgmt"
BACKUP_DIR="$SCRIPT_DIR/backups"
LOG_DIR="$SCRIPT_DIR/logs"
REPO_URL="${REPO_URL:-https://github.com/lrscott83/store-mgmt.git}"
BRANCH="${BRANCH:-main}"
PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-smca_postgres_db}"
PROD_BACKEND_CONTAINER="${PROD_BACKEND_CONTAINER:-smca_backend}"
PROD_DB_NAME="${PROD_DB_NAME:-smca}"
BACKEND_IMAGE="${BACKEND_IMAGE:-localhost/store-mgmt_backend:latest}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-300}"
REACT_PORT="${REACT_PORT:-8085}"
PUSH_TAG="${PUSH_TAG:-0}"

# Catalog images (web catalog photos). They live on the podman volume mounted at
# /app/storage in the backend container, NOT in the database.
STORAGE_MOUNT_DEST="${STORAGE_MOUNT_DEST:-/app/storage}"
# CatalogImageStorageOptions.CatalogImageRoot is "storage/catalog" and a relative
# root is resolved against the container's WORKDIR (/app), so the real directory is
# /app/storage/storage/catalog — NOT the whole mount. Backing up /app/storage would
# also sweep whatever else lands in that volume.
CATALOG_IMAGE_SUBDIR="${CATALOG_IMAGE_SUBDIR:-storage/catalog}"
CATALOG_IMAGE_PATH="$STORAGE_MOUNT_DEST/$CATALOG_IMAGE_SUBDIR"

ASSUME_YES=0
DRY_RUN=0
DO_ROLLBACK=0
LOG_FILE=""
COMPOSE_FILE=""
SHORT_SHA=""
BACKUP_FILE=""
BACKUP_STAMP=""
IMAGES_BACKUP_FILE=""
STORAGE_VOLUME=""
PROD_PROJECT=""
PROD_DB_USER="postgres"

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
Usage: ./deploy-prod.sh [--yes] [--dry-run] [--rollback] [--help]
  --yes        skip the interactive confirmation
  --dry-run    backup + fetch + build + validate only; no DB writes, no deploy
  --rollback   restore the DB + catalog images from the latest backup +
               :previous image + redeploy
  --help       show this help
EOF
}

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  printf '%s\n' "$1"
  printf 'Type "yes" to continue: '
  read -r answer
  [ "$answer" = "yes" ] || die "aborted by user"
}

# --- Arguments ----------------------------------------------------------------
while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --rollback) DO_ROLLBACK=1 ;;
    --help|-h) usage; exit 0 ;;
    *) usage; die "unknown argument: $1" ;;
  esac
  shift
done

# --- STEP 0: pre-flight -------------------------------------------------------
mkdir -p "$BACKUP_DIR" "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-prod-$(date +%Y%m%d_%H%M%S).log"

log "=== deploy-prod started (branch=$BRANCH, dry-run=$DRY_RUN, rollback=$DO_ROLLBACK) ==="
require_cmd podman
require_cmd podman-compose
require_cmd git
require_cmd curl
require_cmd gzip
command -v flock >/dev/null 2>&1 || log "[WARN] flock not found; concurrent runs are not prevented"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$SCRIPT_DIR/.deploy-prod.lock"
  flock -n 9 || die "another deploy-prod run is already in progress"
fi

[ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
  || die "production container $PROD_DB_CONTAINER is not running"

# The compose project name is READ from the running prod container, never guessed.
PROD_PROJECT="$(podman inspect -f '{{index .Config.Labels "io.podman.compose.project"}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)"
[ -n "$PROD_PROJECT" ] || die "could not read io.podman.compose.project from $PROD_DB_CONTAINER — refusing to guess the compose project"
log "production compose project: $PROD_PROJECT"

FREE_KB="$(df -Pk "$SCRIPT_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 2097152 ]; then
  log "[WARN] less than 2 GB free in $SCRIPT_DIR ($(( FREE_KB / 1024 )) MB)"
fi

# --- Rollback helpers ---------------------------------------------------------
restore_db() {
  [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ] || die "no backup file to restore from"
  log "ROLLBACK(DB) — restoring $PROD_DB_NAME from $BACKUP_FILE"
  podman exec "$PROD_DB_CONTAINER" psql -U "$PROD_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $PROD_DB_NAME WITH (FORCE);"
  podman exec "$PROD_DB_CONTAINER" psql -U "$PROD_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $PROD_DB_NAME;"
  gunzip -c "$BACKUP_FILE" | podman exec -i "$PROD_DB_CONTAINER" psql -U "$PROD_DB_USER" -d "$PROD_DB_NAME" -v ON_ERROR_STOP=1 2>&1 | redact | tee -a "$LOG_FILE"
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
# Resolve the REAL source of the catalog volume. The volume is NOT "storage_data":
# podman-compose prefixes every named volume with the compose project name, so on
# disk it is "<project>_storage_data". Hardcoding the short name would point at
# nothing, so the mount is READ from the container at runtime — the same trick
# already used above for io.podman.compose.project.
resolve_storage_volume() {
  # One "destination name" pair per line ({{"\n"}}) so the filter below stays correct
  # when the container has more than one mount.
  STORAGE_VOLUME="$(podman inspect -f '{{range .Mounts}}{{.Destination}} {{.Name}}{{"\n"}}{{end}}' \
    "$PROD_BACKEND_CONTAINER" 2>/dev/null \
    | awk -v dest="$STORAGE_MOUNT_DEST" '$1 == dest { print $2 }' || true)"
  [ -n "$STORAGE_VOLUME" ] || return 1
  log "catalog images volume: $STORAGE_VOLUME (mounted at $STORAGE_MOUNT_DEST in $PROD_BACKEND_CONTAINER)"
}

# Rotate the image family on its own. The DB dumps (smca_backup_*.sql.gz) are
# rotated by the loop in STEP 1 and are never touched here — each family keeps
# its own $KEEP_BACKUPS newest files.
rotate_image_backups() {
  log "rotating image backups (keep last $KEEP_BACKUPS)"
  ls -1t "$BACKUP_DIR"/smca_images_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old; do
    rm -f "$old"
    log "removed old image backup: $old"
  done || true
}

# Back up the catalog images BEFORE any write. $1 is the stamp already used for the
# DB dump, so smca_backup_<ts>.sql.gz and smca_images_backup_<ts>.tar.gz always
# describe the same state of the system and an operator can pair them.
backup_images() {
  local stamp="$1"
  IMAGES_BACKUP_FILE="$BACKUP_DIR/smca_images_backup_${stamp}.tar.gz"

  [ "$(podman inspect -f '{{.State.Running}}' "$PROD_BACKEND_CONTAINER" 2>/dev/null || true)" = "true" ] \
    || die "production backend container $PROD_BACKEND_CONTAINER is not running — cannot back up the catalog images"

  # The directory may not exist yet (no photo uploaded since the volume was created).
  # Creating it keeps tar's path stable instead of failing the deploy over an empty
  # catalog; it is the very directory the API creates on its first image save.
  podman exec "$PROD_BACKEND_CONTAINER" mkdir -p "$CATALOG_IMAGE_PATH" \
    || die "could not create $CATALOG_IMAGE_PATH inside $PROD_BACKEND_CONTAINER"

  log "STEP 1b — backing up catalog images ($CATALOG_IMAGE_PATH) from $PROD_BACKEND_CONTAINER"
  # tar runs inside the container because that is where the volume is mounted, and
  # gzip runs on the host where the script already requires it. Only `tar` is needed
  # in the image, which the aspnet:8.0 base image ships.
  podman exec "$PROD_BACKEND_CONTAINER" tar -cf - -C "$STORAGE_MOUNT_DEST" "$CATALOG_IMAGE_SUBDIR" \
    | gzip > "$IMAGES_BACKUP_FILE" \
    || die "catalog image backup failed — refusing to deploy with no rollback point for the images"

  # Same rule as the DB dump: an archive that was never validated is not a backup.
  gzip -t "$IMAGES_BACKUP_FILE" || die "catalog image backup is not a valid gzip: $IMAGES_BACKUP_FILE"
  log "images backup ok: $IMAGES_BACKUP_FILE ($(du -h "$IMAGES_BACKUP_FILE" | cut -f1))"

  rotate_image_backups
}

# Rollback companion of restore_db. It NEVER dies on purpose: this runs in the
# middle of a rollback, and aborting here would skip the image retag and the
# redeploy, leaving production worse off than a missing catalog restore. Every
# failure is logged loudly and the rollback continues.
restore_images() {
  if [ -z "$IMAGES_BACKUP_FILE" ] || [ ! -f "$IMAGES_BACKUP_FILE" ]; then
    log "[WARN] no catalog image backup for this rollback ($BACKUP_FILE has no paired .tar.gz) — images NOT restored"
    return 0
  fi
  if ! gzip -t "$IMAGES_BACKUP_FILE"; then
    log "[WARN] catalog image archive is corrupt: $IMAGES_BACKUP_FILE — images NOT restored"
    return 0
  fi
  if ! resolve_storage_volume; then
    log "[WARN] could not resolve the $STORAGE_MOUNT_DEST volume of $PROD_BACKEND_CONTAINER — images NOT restored"
    return 0
  fi
  if [ "$(podman inspect -f '{{.State.Running}}' "$PROD_BACKEND_CONTAINER" 2>/dev/null || true)" != "true" ]; then
    log "[WARN] $PROD_BACKEND_CONTAINER is not running — cannot restore the catalog images"
    return 0
  fi

  log "ROLLBACK(IMAGES) — restoring $CATALOG_IMAGE_PATH from $IMAGES_BACKUP_FILE"
  # Clean the destination FIRST, then extract. Extracting over the live directory
  # would leave every file the archive does not contain, which is precisely the
  # inconsistency this restore exists to remove.
  if podman exec "$PROD_BACKEND_CONTAINER" sh -c "rm -rf '$CATALOG_IMAGE_PATH' && mkdir -p '$CATALOG_IMAGE_PATH'"; then
    if gunzip -c "$IMAGES_BACKUP_FILE" \
      | podman exec -i "$PROD_BACKEND_CONTAINER" tar -xf - -C "$STORAGE_MOUNT_DEST"; then
      log "ROLLBACK(IMAGES) — done"
      return 0
    fi
  fi
  log "[WARN] catalog image restore FAILED — $CATALOG_IMAGE_PATH may be inconsistent with $PROD_DB_NAME"
}

# --- STEP 1: backup the production database -----------------------------------
if [ "$DO_ROLLBACK" -eq 1 ]; then
  BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/smca_backup_*.sql.gz 2>/dev/null | head -n1 || true)"
  [ -n "$BACKUP_FILE" ] || die "no backup found in $BACKUP_DIR — nothing to roll back to"
  # Pair the image archive with THIS dump by timestamp instead of picking the newest
  # one: both files are written with the same stamp, so this is the image set that
  # matches the database state being restored. Backups taken before this feature
  # existed have no pair — restore_images warns and the rollback continues.
  BACKUP_STAMP="$(basename "$BACKUP_FILE" .sql.gz)"
  BACKUP_STAMP="${BACKUP_STAMP#smca_backup_}"
  IMAGES_BACKUP_FILE="$BACKUP_DIR/smca_images_backup_${BACKUP_STAMP}.tar.gz"
  log "ROLLBACK mode — latest backup: $BACKUP_FILE (paired images: $IMAGES_BACKUP_FILE)"
else
  log "STEP 1 — backing up production database $PROD_DB_NAME"
  BACKUP_STAMP="$(date +%Y%m%d_%H%M%S)"
  BACKUP_FILE="$BACKUP_DIR/smca_backup_$BACKUP_STAMP.sql.gz"
  podman exec "$PROD_DB_CONTAINER" pg_dump -U "$PROD_DB_USER" "$PROD_DB_NAME" | gzip > "$BACKUP_FILE"
  gzip -t "$BACKUP_FILE" || die "backup file is not a valid gzip: $BACKUP_FILE"
  log "backup ok: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

  # The photos are not in the dump, and a rollback that rewinds the database also
  # rewinds the rows pointing at them. Back them up now, before any write, with the
  # same stamp. No volume, no deploy — same rule as the database dump.
  resolve_storage_volume \
    || die "could not resolve the $STORAGE_MOUNT_DEST volume of $PROD_BACKEND_CONTAINER — refusing to deploy with no rollback point for the catalog images"
  backup_images "$BACKUP_STAMP"

  log "rotating backups (keep last $KEEP_BACKUPS)"
  ls -1t "$BACKUP_DIR"/smca_backup_*.sql.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old; do
    rm -f "$old"
    log "removed old backup: $old"
  done || true
fi

# --- STEP 2: fetch the production sources -------------------------------------
log "STEP 2 — fetching sources of branch '$BRANCH' into $CLONE_DIR"
if [ -d "$CLONE_DIR/.git" ]; then
  git -C "$CLONE_DIR" fetch --prune origin
  git -C "$CLONE_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$CLONE_DIR"
fi

COMPOSE_FILE="$CLONE_DIR/docker-compose.yml"
[ -f "$COMPOSE_FILE" ] || die "docker-compose.yml not found in the clone (commit it to branch '$BRANCH')"

if [ ! -f "$CLONE_DIR/.env" ] && [ -f "$SCRIPT_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env" "$CLONE_DIR/.env"
  log "staged .env into the sources root"
fi
[ -f "$CLONE_DIR/.env" ] || die "missing .env at $CLONE_DIR/.env — upload the PRODUCTION .env next to this script (or place it at the clone root)"

# Load the production environment. CRLFs are stripped so a Windows-created .env works.
set +x
set -a
source <(tr -d '\r' < "$CLONE_DIR/.env")
set +a
set -x

PROD_DB_USER="${POSTGRES_USER:-postgres}"
SHORT_SHA="$(git -C "$CLONE_DIR" rev-parse --short HEAD)"
log "sources ready: commit $SHORT_SHA"

# Every podman-compose call runs from the clone root (so podman-compose reads the
# .env there) and is scoped to the REAL production project read from the labels.
compose() { ( cd "$CLONE_DIR" && podman-compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" "$@" ); }

# --- ROLLBACK mode: restore DB + image, redeploy, exit -------------------------
if [ "$DO_ROLLBACK" -eq 1 ]; then
  confirm "ROLLBACK: restore PRODUCTION database '$PROD_DB_NAME' from $BACKUP_FILE and redeploy the :previous image."
  restore_db
  # The DB rows are going back to $BACKUP_FILE, so the files they point at have to
  # go back with them — otherwise the catalog shows photos that "vanished".
  restore_images
  rollback_image
  log "redeploying the production stack with the rolled-back image"
  compose down || log "[WARN] compose down returned non-zero"
  compose up -d || log "[WARN] compose up returned non-zero"
  log "=== rollback finished ==="
  exit 0
fi

# --- STEP 3: build the production backend image --------------------------------
log "STEP 3 — building production backend image $BACKEND_IMAGE"
if podman image exists "$BACKEND_IMAGE"; then
  podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:previous"
  log "rollback image updated: ${BACKEND_IMAGE%:*}:previous"
fi
podman build -t "$BACKEND_IMAGE" "$CLONE_DIR/backend/src" 2>&1 | redact | tee -a "$LOG_FILE"
podman tag "$BACKEND_IMAGE" "${BACKEND_IMAGE%:*}:$SHORT_SHA"
log "image ready: $BACKEND_IMAGE and ${BACKEND_IMAGE%:*}:$SHORT_SHA"

# --- STEP 4: confirmation ------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY-RUN — stopping before any write to production (backup, sources and image build are done)"
  log "=== deploy-prod dry-run finished OK ==="
  exit 0
fi

confirm "About to DEPLOY PRODUCTION:
  branch       : $BRANCH
  commit       : $SHORT_SHA
  compose proj : $PROD_PROJECT
  database     : $PROD_DB_NAME (backup: $BACKUP_FILE)
  images       : $CATALOG_IMAGE_PATH (backup: $IMAGES_BACKUP_FILE)
  migrations   : will be applied to the PRODUCTION database
  rollback     : automatic on smoke failure (DB + catalog images + :previous image)"

# --- STEP 5: apply pending SQL scripts (POINT OF NO RETURN) ---------------------
log "STEP 5 — checking pending SQL scripts in backend/scripts"
APPLIED_IDS="$(podman exec "$PROD_DB_CONTAINER" psql -U "$PROD_DB_USER" -d "$PROD_DB_NAME" -tA \
  -c 'SELECT "MigrationId" FROM "__EFMigrationsHistory";' 2>/dev/null || true)"
[ -n "$APPLIED_IDS" ] || log "[WARN] __EFMigrationsHistory is empty or missing in $PROD_DB_NAME"

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
    if ! podman exec -i "$PROD_DB_CONTAINER" psql -U "$PROD_DB_USER" -d "$PROD_DB_NAME" \
      -v ON_ERROR_STOP=1 < "$script" 2>&1 | redact | tee -a "$LOG_FILE"; then
      log "[FATAL] migration failed: $(basename "$script") — restoring the database from the backup"
      restore_db
      restore_images
      die "migration failed; the database was restored from $BACKUP_FILE"
    fi
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
  else
    log "skip (already applied): $(basename "$script")"
  fi
done
log "pending scripts applied: $APPLIED_COUNT"

# --- STEP 6: deploy the production stack ---------------------------------------
log "STEP 6 — deploying production stack (project $PROD_PROJECT)"
compose up -d --build 2>&1 | redact | tee -a "$LOG_FILE"
log "production stack deployed"

# --- STEP 7: smoke test (+ automatic rollback) ---------------------------------
log "STEP 7 — smoke test (timeout ${SMOKE_TIMEOUT_SECONDS}s)"
smoke_ok() {
  curl -fsS "http://localhost:$REACT_PORT/api/v1/ping" >/dev/null 2>&1 \
    && curl -fsS "http://localhost:$REACT_PORT/" >/dev/null 2>&1
}
DEADLINE=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
until smoke_ok; do
  if [ "$SECONDS" -ge "$DEADLINE" ]; then break; fi
  sleep 5
done

if ! smoke_ok; then
  log "[FATAL] smoke test failed — automatic ROLLBACK (DB + catalog images + :previous image)"
  restore_db
  restore_images
  rollback_image
  compose down || log "[WARN] compose down returned non-zero"
  compose up -d || log "[WARN] compose up returned non-zero"
  die "deploy failed; rolled back to $BACKUP_FILE and the :previous image"
fi
log "smoke test ok: / (SPA) and /api/v1/ping on :$REACT_PORT"

# --- STEP 8: git tag + deploy state --------------------------------------------
TAG_NAME="prod-deploy-$(date +%Y%m%d_%H%M%S)"
git -C "$CLONE_DIR" tag -a "$TAG_NAME" -m "Prod deploy $TAG_NAME (commit $SHORT_SHA)"
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
IMAGES_BACKUP=$IMAGES_BACKUP_FILE
IMAGE=${BACKEND_IMAGE%:*}:$SHORT_SHA
REACT_URL=http://localhost:$REACT_PORT
EOF
log "deploy state written to $SCRIPT_DIR/deploy-state.txt"
log "tag: $TAG_NAME"

# --- Final safety check --------------------------------------------------------
[ "$(podman inspect -f '{{.State.Running}}' "$PROD_DB_CONTAINER" 2>/dev/null || true)" = "true" ] \
  || log "[WARN] production container $PROD_DB_CONTAINER is not running"
log "=== deploy-prod finished OK ==="
