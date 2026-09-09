#!/bin/sh
# Docker app+bot → PostgreSQL на хості (після migrate_sqlite_to_postgres.py на VPS).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

. "$ROOT/docker/prepare-env.sh"

echo "[docker/up-host-db] app + bot (host PostgreSQL)..."
exec docker compose -f docker-compose.yml -f docker-compose.host-db.yml up -d --build "$@"
