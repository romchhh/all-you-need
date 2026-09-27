#!/bin/sh
# Створює .env з прикладів перед docker compose (не перезаписує існуючі файли).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

copy_if_missing() {
  src="$1"
  dst="$2"
  if [ ! -f "$dst" ] && [ -f "$src" ]; then
    cp "$src" "$dst"
    echo "[prepare-env] created $(basename "$dst") from example"
  fi
}

copy_if_missing "$ROOT/.env.example" "$ROOT/.env"
copy_if_missing "$ROOT/bot/.env.example" "$ROOT/bot/.env"
copy_if_missing "$ROOT/app/.env.example" "$ROOT/app/.env"

# Compose підставляє ${WEBAPP_URL} з кореневого .env під час build
if [ ! -f "$ROOT/.env" ] && [ -f "$ROOT/bot/.env" ]; then
  ln -sf bot/.env "$ROOT/.env"
  echo "[prepare-env] linked .env -> bot/.env"
fi

mkdir -p "$ROOT/database/backups" "$ROOT/bot/parser/sessions" "$ROOT/bot/logs"

# Щоб `docker compose exec …` без -f працював на VPS (host PostgreSQL)
ensure_compose_file() {
  env_file="$ROOT/.env"
  if [ ! -f "$env_file" ]; then
    return 0
  fi
  if grep -q '^COMPOSE_FILE=' "$env_file" 2>/dev/null; then
    return 0
  fi
  {
    echo ""
    echo "# Docker Compose (VPS: PostgreSQL на хості). Для PG у Docker: USE_DOCKER_POSTGRES=1 ./docker/up.sh"
    echo "COMPOSE_FILE=docker-compose.yml:docker-compose.host-db.yml"
  } >> "$env_file"
  echo "[prepare-env] appended COMPOSE_FILE to .env (host-db overlay)"
}

ensure_compose_file

echo "[prepare-env] ready (edit bot/.env: TOKEN, WEBAPP_URL, ADMINISTRATORS)"
