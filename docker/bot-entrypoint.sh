#!/bin/sh
set -eu

mkdir -p \
  /app/database/parsed_photos \
  /app/app/public/listings/originals \
  /app/app/public/listings/optimized \
  /app/app/public/avatars \
  /app/bot/parser/sessions \
  /app/bot/logs

echo "[bot] start"
exec python main.py
