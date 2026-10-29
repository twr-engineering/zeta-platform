#!/usr/bin/env bash
# SessionStart hook — brings a Claude Code cloud session (claude.ai/code, Claude Desktop
# cloud) to a working dev state: Postgres up, .env present, deps installed, schema migrated,
# listings seeded from the golden-master fixtures.
#
# Local sessions exit immediately: locally you run your own Postgres (see README).
# Idempotent and safe to re-run on resume. Services are not cached between cloud sessions,
# which is why this is a hook and not only the environment setup script.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

log() { echo "[session-start] $*" >&2; }

# 1. Postgres. The cloud image ships PostgreSQL 16, stopped. Payload is fine on 16.
if ! pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  log "starting postgresql"
  service postgresql start >/dev/null 2>&1 || sudo service postgresql start >/dev/null
  for _ in $(seq 1 20); do pg_isready -q -h 127.0.0.1 -p 5432 && break; sleep 0.5; done
fi
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else sudo -u postgres sh -c "$1"; fi; }
as_pg "psql -tAc \"select 1 from pg_roles where rolname='zeta'\" | grep -q 1 || psql -qc \"create role zeta login createdb password 'zeta'\""
as_pg "psql -tAc \"select 1 from pg_database where datname='zeta_dev'\" | grep -q 1 || createdb -O zeta zeta_dev"

# 2. .env — dev-only values. Real secrets never live here: RESPACIO_API_KEY is a network
#    secret on the cloud environment, attached by the proxy for crm.respacio.com only.
if [ ! -f .env ]; then
  log "writing .env"
  cat > .env <<EOF
DATABASE_URI=postgres://zeta:zeta@127.0.0.1:5432/zeta_dev
PAYLOAD_SECRET=$(openssl rand -hex 32)
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
EOF
fi

# 3. Dependencies (normally already installed by the environment setup script, and cached).
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  log "installing dependencies"
  pnpm install --frozen-lockfile --prefer-offline >/dev/null
fi

# 4. Schema, then seed. Migrations never prompt (dev auto-push is disabled for this reason).
pnpm -s payload migrate >/dev/null 2>&1 || { log "migrate failed — run: pnpm payload migrate"; exit 0; }
count=$(PGPASSWORD=zeta psql -h 127.0.0.1 -U zeta zeta_dev -tAc "select count(*) from listings" 2>/dev/null || echo 0)
if [ "${count:-0}" = "0" ]; then
  log "seeding listings from fixtures"
  pnpm -s sync:crm >/dev/null 2>&1 || log "seed failed — run: pnpm sync:crm"
fi

log "ready: pnpm dev -> http://localhost:3000 (admin at /admin/)"
