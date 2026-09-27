#!/bin/sh
# =====================================================
# prod-to-test / 00-preflight-secrets.sh
#
# Purpose : refuse the migration unless the two settings that make a
#           migrated password keep working are byte-identical on the source
#           and on the target database server.
#
#           Authentication:Pepper          -> Argon2id pepper of User.Password
#           StoreEncryption:MasterSecret  -> AES-256-GCM key of
#                                             User.OfflinePasswordPreHash
#
# Safety  : the secret value is NEVER printed. Only the key name, the word
#           MATCH or MISMATCH, and where to fix it. Nothing in this script
#           writes to a database.
#
# Usage   :
#   00-preflight-secrets.sh <source-spec> <target-spec>
#
#   Each spec says WHERE the effective value lives. Either of these forms:
#
#     file:<path>[,<path2>,...]   one or more JSON config files. When more
#                                 than one is given they are merged in order,
#                                 so the last file that carries a key wins.
#                                 That reproduces the effective value of a
#                                 layered appsettings setup.
#     host:<container>            `docker exec <container> printenv <VAR>`
#                                 for the running application container.
#                                 <VAR> is the double-underscore form the
#                                 .NET configuration system expects
#                                 (Authentication__Pepper,
#                                 StoreEncryption__MasterSecret). Use this
#                                 form to read the value the process actually
#                                 has, which is stronger evidence than a file
#                                 lying around on disk.
#
#     A bare path such as ./appsettings.json is treated as file:<path>.
#
#     There is deliberately no "env:<VAR>" form. The environment variable
#     name for a given setting is fixed and already known, so naming it
#     again in the argument could only invite comparing two different
#     settings. host: already reads the live process environment.
#
#   Examples:
#     ./00-preflight-secrets.sh host:smca_api host:smca_test_api
#     ./00-preflight-secrets.sh file:/srv/prod/appsettings.json \
#                             file:/srv/test/appsettings.json
#     ./00-preflight-secrets.sh host:smca_api \
#                             file:/srv/test/appsettings.json
#     ./00-preflight-secrets.sh file:/srv/prod/appsettings.json,/srv/prod/appsettings.Production.json \
#                             file:/srv/test/appsettings.json,/srv/test/appsettings.Test.json
#
# Exit codes:
#   0  both keys present on both sides and identical  -> continue
#   1  a key differs, a key is missing on either side, or a source spec
#      could not be read                              -> STOP
#   2  the check could not be performed: bad usage (wrong number of
#      arguments, or an argument that looks like an option), or no
#      working JSON reader on this host                -> STOP
#
# 2 is deliberately distinct from 1. 1 means "a difference was found". 2
# means "no verdict was reached". A gate that cannot check must not look
# like a gate that passed.
#
# Requirements: /bin/sh (no bashisms), AND one of `jq` or `python3` for
#   reading JSON. Each is probed before use, so an install shim that cannot
#   actually run does not count. A working reader is MANDATORY: with neither
#   reader available this script prints UNVERIFIABLE and exits 2. It does not
#   fall back to matching the leaf key name in the raw text, because a leaf
#   name match discards the path it sits under and cannot tell one secret
#   from another: it can capture the value of a *different* key that happens
#   to share the leaf name, or stop at the first quote of a value that
#   contains an escaped quote. Either way it would print MATCH for two
#   different secrets, and a green MATCH is worse than no answer at all.
# Two config files with the same pepper and the same master secret are the
# only acceptable state. Anything else produces a migrated user who is
# rejected with Auth.InvalidCredentials, or a POS that silently falls back to
# the unlock gate. Neither failure points at this script, which is exactly
# why the check refuses instead of warning.
# =====================================================

# This script creates no files, so this umask governs nothing it produces.
# It is kept as a default for anything a future edit might add, and it is
# NOT what protects the CSV files: those are written by psql, a different
# process, in the shell that invokes it. `umask 077` belongs in THAT shell
# before the psql call. See prod-to-test/README.md section 5.
umask 077

set -eu

PROG=$(basename "$0")

die_usage() {
    printf '%s: %s\n' "$PROG" "$1" >&2
    printf 'Usage: %s <source-spec> <target-spec>\n' "$PROG" >&2
    exit 2
}

# ---------------------------------------------------------------------
# Tooling probe.
# `command -v` is not enough: a host can have a `python3` on PATH that is a
# stub or an install shim which prints an error and exits non-zero. Probing
# each extractor once, up front, keeps a broken shim from masquerading as a
# working reader and turning a readable config into a false NOT FOUND.
# ---------------------------------------------------------------------
HAVE_JQ=no
if command -v jq >/dev/null 2>&1 && jq -n -e 'true' >/dev/null 2>&1; then
    HAVE_JQ=yes
fi

HAVE_PYTHON3=no
if command -v python3 >/dev/null 2>&1 && python3 -c 'import json' >/dev/null 2>&1; then
    HAVE_PYTHON3=yes
fi

# A working reader is required, not optional. An earlier version of this
# script fell back to a sed match on the leaf key name when neither reader
# worked. That fallback reported MATCH for two different secrets, so it
# removed the reason for a human to look; see the header. The gate refuses
# instead, and exit 2 says "could not check" rather than "found a problem".
if [ "$HAVE_JQ" != yes ] && [ "$HAVE_PYTHON3" != yes ]; then
    printf '%s: UNVERIFIABLE (no JSON reader available).\n' "$PROG" >&2
    printf '%s: neither jq nor a usable python3 was found, so neither setting\n' "$PROG" >&2
    printf '%s: could be read at all. This check will not guess from the raw\n' "$PROG" >&2
    printf '%s: text, because a leaf-key text match cannot tell one secret from\n' "$PROG" >&2
    printf '%s: another and would report a false pass.\n' "$PROG" >&2
    printf '%s: Install jq on this host and run this script again:\n' "$PROG" >&2
    printf '%s:   apt-get install -y jq   (or your distribution'"'"'s equivalent)\n' "$PROG" >&2
    exit 2
fi

# ---------------------------------------------------------------------
# extract_json <dotted.path> <file> [file...]
# Prints the string value at the dotted path, merged across the files in the
# order given (last one wins). Prints nothing when the path is absent, when
# the value is not a string, or when the value is empty.
# ---------------------------------------------------------------------
extract_json() {
    _path=$1
    shift

    for _f in "$@"; do
        if [ ! -r "$_f" ]; then
            printf '%s: cannot read config file: %s\n' "$PROG" "$_f" >&2
            return 2
        fi
    done

    if [ "$HAVE_JQ" = yes ]; then
        # cat first, so a UTF-8 BOM can be removed: jq rejects a BOM, and the
        # python3 branch reads with encoding="utf-8-sig", so both readers must
        # accept the same input. `jq -s` slurps every input into one array, so
        # a concatenated stream is equivalent to a list of file arguments.
        # The BOM is stripped from the start of any line, not only the first,
        # because in a layered config the file that carries the value may not
        # be the first one. A sed that does not understand \xHH simply fails
        # to match, which leaves the input untouched: a degraded strip, not a
        # corrupted read.
        cat "$@" \
            | sed 's/^\xEF\xBB\xBF//' \
            | jq -s -er --arg p "$_path" \
                'reduce .[] as $d ({}; . * $d) | getpath($p | split(".")) | select(type == "string") | select(length > 0)' \
            || return 1
        return 0
    fi

    # Deep merge, to match jq's `*`: for two objects jq merges recursively, so
    # {"a":{"x":1}} * {"a":{"y":2}} is {"a":{"x":1,"y":2}}. A shallow
    # update() would drop "x" and the two readers would disagree about the
    # effective value of a layered appsettings.
    python3 - "$_path" "$@" <<'PY' || return 1
import json
import sys


def deep_merge(base, overlay):
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base


path = sys.argv[1].split(".")
merged = {}
for name in sys.argv[2:]:
    with open(name, "r", encoding="utf-8-sig") as handle:
        deep_merge(merged, json.load(handle))
node = merged
for segment in path:
    if not isinstance(node, dict) or segment not in node:
        sys.exit(1)
    node = node[segment]
if not isinstance(node, str) or node == "":
    sys.exit(1)
sys.stdout.write(node)
PY
        return 0
}

# ---------------------------------------------------------------------
# read_source <spec> <dotted.path> <env.var.name>
# Prints the effective value of one setting, or nothing when it cannot be
# found. Always returns 0 so the caller decides what a missing key means.
# ---------------------------------------------------------------------
read_source() {
    _spec=$1
    _path=$2
    _var=$3

    case $_spec in
        host:*)
            _container=${_spec#host:}
            docker exec "$_container" printenv "$_var" 2>/dev/null || true
            ;;
        file:*)
            _files=${_spec#file:}
            if [ -z "$_files" ]; then
                # Without this, an empty list would reach extract_json with no
                # file argument at all, and jq would read stdin and hang.
                printf '%s: the file: spec is empty; name at least one path.\n' "$PROG" >&2
                return 0
            fi
            # Split on commas ONLY. Globbing is off and IFS is set to the
            # comma, so a path containing a space stays one path instead of
            # being reported as unreadable. This uses "set --", so it must
            # run after $_spec/_path/_var have been read out of "$@".
            # It is safe in practice because read_source is only ever called
            # inside a command substitution, which is a subshell.
            _IFS_SAVE=$IFS
            IFS=,
            set -f
            # shellcheck disable=SC2086
            set -- $_files
            set +f
            IFS=$_IFS_SAVE
            extract_json "$_path" "$@" || true
            ;;
        *)
            # A bare name is accepted when it really is a readable file, so
            # "./appsettings.json" and "appsettings.json" both work.
            if [ -f "$_spec" ] && [ -r "$_spec" ]; then
                extract_json "$_path" "$_spec" || true
            else
                printf '%s: unrecognised source spec: %s\n' "$PROG" "$_spec" >&2
                printf '%s: expected file:<path>, host:<container>, or a readable file path.\n' \
                    "$PROG" >&2
            fi
            ;;
    esac
}

[ $# -eq 2 ] || die_usage "expected exactly 2 arguments, got $#"

SOURCE_SPEC=$1
TARGET_SPEC=$2

case $SOURCE_SPEC in -*) die_usage "source spec must not start with -" ;; esac
case $TARGET_SPEC in -*) die_usage "target spec must not start with -" ;; esac

# key label | dotted path in JSON | environment variable name
SETTINGS='Authentication:Pepper|Authentication.Pepper|Authentication__Pepper
StoreEncryption:MasterSecret|StoreEncryption.MasterSecret|StoreEncryption__MasterSecret'

failures=0
checks=0

printf '%s: comparing the effective value of each setting.\n' "$PROG"
printf '%s: source spec : %s\n' "$PROG" "$SOURCE_SPEC"
printf '%s: target spec : %s\n' "$PROG" "$TARGET_SPEC"
printf '%s: the value itself is never printed.\n\n' "$PROG"

# A here-document, not a pipe, so the loop runs in this shell and the
# counters survive.
while IFS='|' read -r label json_path env_name; do
    [ -n "$label" ] || continue
    checks=$((checks + 1))

    # tr -d '\r' so a config file copied over with CRLF endings still matches.
    source_value=$(read_source "$SOURCE_SPEC" "$json_path" "$env_name" | tr -d '\r') || source_value=''
    target_value=$(read_source "$TARGET_SPEC" "$json_path" "$env_name" | tr -d '\r') || target_value=''

    if [ -z "$source_value" ] && [ -z "$target_value" ]; then
        printf '  %-32s NOT FOUND on either side\n' "$label"
        printf '    Where to fix it: %s must carry the key "%s" (%s).\n' \
            "$SOURCE_SPEC" "$json_path" "$env_name"
        failures=$((failures + 1))
    elif [ -z "$source_value" ]; then
        printf '  %-32s NOT FOUND on the source side\n' "$label"
        printf '    Where to fix it: the running source deployment is missing "%s" (%s).\n' \
            "$json_path" "$env_name"
        failures=$((failures + 1))
    elif [ -z "$target_value" ]; then
        printf '  %-32s NOT FOUND on the target side\n' "$label"
        printf '    Where to fix it: the running target deployment is missing "%s" (%s).\n' \
            "$json_path" "$env_name"
        failures=$((failures + 1))
    elif [ "$source_value" = "$target_value" ]; then
        printf '  %-32s MATCH\n' "$label"
    else
        printf '  %-32s MISMATCH\n' "$label"
        printf '    The two values differ. Where to fix it: set "%s" (%s) to the\n' \
            "$json_path" "$env_name"
        printf '    same value on BOTH deployments, then restart both. Copy the value\n'
        printf '    from the source to the target. Do not invent a new one.\n'
        failures=$((failures + 1))
    fi
done <<EOF
$SETTINGS
EOF

printf '\n'

if [ "$checks" -eq 0 ]; then
    printf '%s: nothing was checked. This is a failure, not a pass.\n' "$PROG" >&2
    exit 2
fi

if [ "$failures" -ne 0 ]; then
    printf '%s: STOP. %s of %s settings are not usable.\n' "$PROG" "$failures" "$checks" >&2
    printf '%s: do NOT run 01-extract.sql yet. A migrated user would either be\n' "$PROG" >&2
    printf '%s: rejected with Auth.InvalidCredentials, or would get an empty wrapped\n' "$PROG" >&2
    printf '%s: DEK and land on the offline unlock gate with no visible cause.\n' "$PROG" >&2
    exit 1
fi

printf '%s: OK. All %s settings match. The migration may proceed.\n' "$PROG" "$checks"
exit 0
