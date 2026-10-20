#!/bin/sh
set -eu

log() {
    printf '%s %s\n' "$(date -Iseconds)" "$*"
}

fail() {
    log "ERROR $*" >&2
    exit 1
}

[ "$#" -eq 1 ] || fail "usage: restore-staging.sh /backups/<file>.dump"
archive=$1
[ -f "$archive" ] && [ -r "$archive" ] || fail "backup file does not exist or is not readable: $archive"
case "$archive" in *.dump) ;; *) fail "backup file must use the .dump extension" ;; esac

[ -n "${DB_HOST:-}" ] || fail "DB_HOST is required"
[ -n "${DB_PORT:-}" ] || fail "DB_PORT is required"
[ -n "${DB_NAME:-}" ] || fail "DB_NAME is required"
[ -n "${DB_USER:-}" ] || fail "DB_USER is required"
[ -n "${DB_PASSWORD:-}" ] || fail "DB_PASSWORD is required"
[ -z "${DATABASE_URL:-}" ] || fail "This legacy sidecar requires DB_*; use the URL-aware backup/copy tools for DATABASE_URL. Refusing an ambiguous application database."
[ -n "${RESTORE_DB_NAME:-}" ] || fail "RESTORE_DB_NAME is required"
[ "${RESTORE_CONFIRM:-}" = "RESTORE_TEST_DATABASE" ] \
    || fail "set RESTORE_CONFIRM=RESTORE_TEST_DATABASE to authorize the isolated restore"
[ "$RESTORE_DB_NAME" != "$DB_NAME" ] || fail "restore target must differ from the application database"
case "$RESTORE_DB_NAME" in
    *_test|*_restore|*_restore_test) ;;
    *) fail "restore target name must end in _test, _restore, or _restore_test" ;;
esac

export PGPASSWORD=$DB_PASSWORD
pg_restore --list "$archive" >/dev/null || fail "file is not a valid pg_restore archive"
pg_isready --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$RESTORE_DB_NAME" >/dev/null \
    || fail "restore target is not reachable"

psql_base="--host=$DB_HOST --port=$DB_PORT --username=$DB_USER --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1"
relation_count=$(psql $psql_base --dbname="$RESTORE_DB_NAME" --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f');" | tr -d '[:space:]') \
    || fail "could not inspect restore target"
[ "$relation_count" = "0" ] || fail "restore target is not empty ($relation_count public relations found)"

log "INFO restore started; file=$(basename "$archive") target=$RESTORE_DB_NAME"
if ! pg_restore --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --dbname="$RESTORE_DB_NAME" --exit-on-error --no-owner --no-privileges "$archive"; then
    fail "pg_restore failed; preserve the partial target for diagnosis and select a different empty test database before retry"
fi

tables="users projects work_items tasks dependencies schedule_results baselines milestones milestone_alerts"
printf '%s\n' "table,source_count,restored_count"
for table in $tables; do
    exists=$(psql $psql_base --dbname="$RESTORE_DB_NAME" --command="SELECT to_regclass('public.$table') IS NOT NULL;" | tr -d '[:space:]') \
        || fail "could not verify table $table"
    [ "$exists" = "t" ] || continue
    restored=$(psql $psql_base --dbname="$RESTORE_DB_NAME" --command="SELECT count(*) FROM public.$table;" | tr -d '[:space:]') \
        || fail "could not count restored table $table"
    source_exists=$(psql $psql_base --dbname="$DB_NAME" --command="SELECT to_regclass('public.$table') IS NOT NULL;" | tr -d '[:space:]') \
        || fail "could not inspect source table $table"
    if [ "$source_exists" = "t" ]; then
        source=$(psql $psql_base --dbname="$DB_NAME" --command="SELECT count(*) FROM public.$table;" | tr -d '[:space:]') \
            || fail "could not count source table $table"
    else
        source=-1
    fi
    printf '%s,%s,%s\n' "$table" "$source" "$restored"
    if [ "$source" != "-1" ] && [ "$source" != "$restored" ]; then
        log "WARN row count differs for $table; source may have changed after the dump (source=$source restored=$restored)" >&2
    fi
done

orphans=$(psql $psql_base --dbname="$RESTORE_DB_NAME" --command="SELECT (SELECT count(*) FROM work_items w LEFT JOIN projects p ON p.id=w.project_id WHERE p.id IS NULL) + (SELECT count(*) FROM tasks t LEFT JOIN work_items w ON w.id=t.work_item_id WHERE w.id IS NULL) + (SELECT count(*) FROM dependencies d LEFT JOIN tasks p ON p.id=d.predecessor_task_id LEFT JOIN tasks s ON s.id=d.successor_task_id WHERE p.id IS NULL OR s.id IS NULL);" | tr -d '[:space:]') \
    || fail "could not verify restored relationships"
[ "$orphans" = "0" ] || fail "restored database contains $orphans orphaned core relationships"

log "INFO restore completed; target=$RESTORE_DB_NAME relationships=valid status=success"
