#!/usr/bin/env zsh
# Per-schema backup of the shared platform database (ADR-23 guardrail; app PRD NFR-005 stopgap
# until the hosting plan's daily backups are on). Writes a custom-format pg_dump to
# .local/backups/<schema>-<YYYYMMDD-HHMM>.dump (gitignored, mode 600) and checks it can be read back.
#
#   scripts/db-backup.sh <schema> [URL_VAR]      e.g. scripts/db-backup.sh cms CMS_DATABASE_URL
#
# URL_VAR names an environment variable holding the connection URL (default DATABASE_URI). The URL is
# never printed. Use a session connection (Supabase: pooler port 5432), not the transaction pooler.
# Restore into a scratch database:  pg_restore --no-owner -d <scratch-url> <file>
set -euo pipefail
schema=${1:?usage: scripts/db-backup.sh <schema> [URL_VAR]}
var=${2:-DATABASE_URI}
url=${(P)var:-}
[[ -n $url ]] || { print -u2 "db-backup: \$$var is not set"; exit 1 }
[[ $schema =~ '^[a-z_][a-z0-9_]*$' ]] || { print -u2 "db-backup: bad schema name"; exit 1 }

root=${0:A:h:h}
dir=$root/.local/backups
mkdir -p $dir
umask 077
file=$dir/$schema-$(TZ=Asia/Manila date +%Y%m%d-%H%M).dump
pg_dump --format=custom --no-owner --schema=$schema --file=$file "$url"
chmod 600 $file
# Readable and not empty: the archive lists at least one table.
tables=$(pg_restore --list $file | grep -c " TABLE $schema " || true)
(( tables > 0 )) || { print -u2 "db-backup: $file holds no tables of $schema"; exit 1 }
print "db-backup: $file ($(du -h $file | cut -f1), $tables tables)"
