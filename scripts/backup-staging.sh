#!/bin/sh
set -eu
umask 077

log() {
    printf '%s %s\n' "$(date -Iseconds)" "$*"
}

fail() {
    log "ERROR $*" >&2
    exit 1
}

[ -n "${DB_HOST:-}" ] || fail "DB_HOST is required"
[ -n "${DB_PORT:-}" ] || fail "DB_PORT is required"
[ -n "${DB_NAME:-}" ] || fail "DB_NAME is required"
[ -n "${DB_USER:-}" ] || fail "DB_USER is required"
[ -n "${DB_PASSWORD:-}" ] || fail "DB_PASSWORD is required"
[ -z "${DATABASE_URL:-}" ] || fail "This legacy sidecar requires DB_* for both app and backup; use the URL-aware backup:original tool on a PostgreSQL client host for DATABASE_URL. Refusing to back up a different DB_* target."

backup_dir=${BACKUP_DIR:-/backups}
keep=${BACKUP_KEEP:-7}
case "$keep" in
    ''|*[!0-9]*) fail "BACKUP_KEEP must be a positive integer" ;;
esac
[ "$keep" -ge 1 ] || fail "BACKUP_KEEP must be at least 1"

mkdir -p "$backup_dir"
[ -d "$backup_dir" ] && [ -w "$backup_dir" ] || fail "backup directory is not writable: $backup_dir"

timestamp=$(date '+%Y%m%d_%H%M%S')
final_file="$backup_dir/construction_management_${timestamp}.dump"
if [ -e "$final_file" ]; then
    final_file="$backup_dir/construction_management_${timestamp}_$$.dump"
fi
partial_file="${final_file}.partial"
cleanup() { rm -f "$partial_file"; }
trap cleanup EXIT HUP INT TERM

export PGPASSWORD=$DB_PASSWORD
log "INFO backup started; database=$DB_NAME host=$DB_HOST port=$DB_PORT file=$(basename "$final_file")"
pg_isready --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" >/dev/null \
    || fail "PostgreSQL is not ready"

if ! pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --dbname="$DB_NAME" --format=custom --no-owner --no-privileges --file="$partial_file"; then
    fail "pg_dump failed; incomplete archive removed"
fi

[ -s "$partial_file" ] || fail "pg_dump produced an empty archive"
pg_restore --list "$partial_file" >/dev/null || fail "pg_dump archive validation failed"
mv "$partial_file" "$final_file"
trap - EXIT HUP INT TERM

size=$(wc -c < "$final_file" | tr -d ' ')
log "INFO backup completed; file=$(basename "$final_file") bytes=$size status=success"

# Rotation is deliberately after a successful, validated and atomically renamed dump.
set -- "$backup_dir"/construction_management_*.dump
if [ -e "$1" ]; then
    count=$#
    if [ "$count" -gt "$keep" ]; then
        remove_count=$((count - keep))
        ls -1t "$backup_dir"/construction_management_*.dump | tail -n "+$((keep + 1))" |
        while IFS= read -r old_file; do
            [ -n "$old_file" ] || continue
            rm -f -- "$old_file" "${old_file}.counts"
            log "INFO expired backup removed; file=$(basename "$old_file")"
        done
    fi
fi
