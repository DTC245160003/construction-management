#!/bin/sh
set -eu

cron_expression=${BACKUP_CRON:-"0 2 * * *"}
field_count=$(printf '%s\n' "$cron_expression" | awk '{ print NF }')
line_count=$(printf '%s\n' "$cron_expression" | wc -l | tr -d ' ')
if [ "$field_count" -ne 5 ] || [ "$line_count" -ne 1 ] || printf '%s' "$cron_expression" | grep -q '%'; then
    printf '%s ERROR invalid BACKUP_CRON: %s\n' "$(date -Iseconds)" "$cron_expression" >&2
    exit 64
fi

printf '%s /usr/local/bin/backup-staging.sh >>/proc/1/fd/1 2>>/proc/1/fd/2\n' \
    "$cron_expression" > /etc/crontabs/root
printf '%s INFO backup scheduler started; schedule=%s timezone=%s\n' \
    "$(date -Iseconds)" "$cron_expression" "${TZ:-system-default}"
exec crond -f -l 2
