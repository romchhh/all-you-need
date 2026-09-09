#!/bin/sh
# Підготовка env + збірка + запуск. Міграції виконуються автоматично при старті контейнерів.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

. "$ROOT/docker/prepare-env.sh"

echo "[docker/up] building and starting stack..."
exec docker compose up -d --build "$@"
