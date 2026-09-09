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

echo "[prepare-env] ready (edit bot/.env: TOKEN, WEBAPP_URL, ADMINISTRATORS)"
