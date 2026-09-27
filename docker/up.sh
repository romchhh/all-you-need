#!/bin/sh
# Підготовка env + збірка + запуск.
# За замовчуванням — PostgreSQL на хості (VPS). Для Postgres у Docker: USE_DOCKER_POSTGRES=1
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

. "$ROOT/docker/prepare-env.sh"

COMPOSE=(docker compose -f docker-compose.yml)

if [ "${USE_DOCKER_POSTGRES:-0}" = "1" ]; then
  echo "[docker/up] mode: PostgreSQL у контейнері (профіль docker-postgres)"
  COMPOSE+=(--profile docker-postgres)
else
  echo "[docker/up] mode: PostgreSQL на хості (127.0.0.1:5432) — docker-compose.host-db.yml"
  COMPOSE+=(-f docker-compose.host-db.yml)
fi

echo "[docker/up] building and starting stack..."
exec "${COMPOSE[@]}" up -d --build "$@"
