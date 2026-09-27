#!/bin/sh
# Обгортка docker compose з правильними -f для VPS (host PostgreSQL).
# Приклад:  ./docker/compose.sh ps
#           ./docker/compose.sh exec bot python3 scripts/test_daily_db_backup.py --send
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

. "$ROOT/docker/prepare-env.sh"

if [ "${USE_DOCKER_POSTGRES:-0}" = "1" ]; then
  exec docker compose -f docker-compose.yml --profile docker-postgres "$@"
fi

exec docker compose -f docker-compose.yml -f docker-compose.host-db.yml "$@"
