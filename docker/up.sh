#!/bin/sh
# Підготовка env + збірка + запуск.
# За замовчуванням — PostgreSQL на хості (VPS). Для Postgres у Docker: USE_DOCKER_POSTGRES=1
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

. "$ROOT/docker/prepare-env.sh"

echo "[docker/up] building and starting stack..."
exec "$ROOT/docker/compose.sh" up -d --build "$@"
