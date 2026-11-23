#!/bin/zsh
# Applies the commission migrations to the shared platform database (ADR-23): schema `commission`
# (exposed through PostgREST) and `commission_private` (helpers, never exposed).
#
# Usage: scripts/db-migrate.sh [URL_VAR]   (default COMMISSION_DATABASE_URL; run from apps/commission)
#
# Each file runs in its own transaction and is recorded in commission_private.schema_migrations,
# so a rerun applies only what is new. The Supabase CLI's own history table is not used: the
# shared database also holds Lead Magnet's history, and the two must not mix.
# Run it as the database owner (`postgres`): the signup trigger lives on auth.users.
set -euo pipefail
VAR=${1:-COMMISSION_DATABASE_URL}
URL=${(P)VAR:-}
[[ -n $URL ]] || { echo "db-migrate: \$$VAR is not set" >&2; exit 1; }
DIR=${0:A:h}/../supabase/migrations

psql "$URL" -q -v ON_ERROR_STOP=1 <<'SQL'
set client_min_messages = warning;
create schema if not exists commission_private;
create table if not exists commission_private.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
revoke all on commission_private.schema_migrations from anon, authenticated;
SQL

applied=0
for f in $DIR/*.sql; do
  v=${${f:t}%%_*}
  done_already=$(psql "$URL" -Atq -c "select 1 from commission_private.schema_migrations where version = '$v'")
  [[ -n $done_already ]] && continue
  { cat $f; print "\ninsert into commission_private.schema_migrations (version) values ('$v');" } |
    psql "$URL" -q -1 -v ON_ERROR_STOP=1 >/dev/null || { echo "db-migrate: FAILED at ${f:t}" >&2; exit 1; }
  echo "applied ${f:t}"
  applied=$((applied + 1))
done
echo "db-migrate: $applied applied, $(psql "$URL" -Atq -c 'select count(*) from commission_private.schema_migrations') recorded"
