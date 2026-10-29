#!/usr/bin/env bash
# Environment SETUP SCRIPT for Claude Code cloud sessions.
#
# Paste the line below into the environment's "Setup script" field at claude.ai/code
# (Environment settings). It runs once before Claude starts, as root, and its filesystem
# result is cached, so it is the place for slow, rarely-changing installs:
#
#     bash scripts/cloud/setup.sh
#
# Per-session work (starting Postgres, migrating, seeding) is the SessionStart hook in
# .claude/settings.json -> scripts/cloud/session-start.sh, because services are not cached.
set -euo pipefail
cd "$(dirname "$0")/../.."

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
