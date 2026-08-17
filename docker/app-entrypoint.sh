#!/bin/sh
set -eu

mkdir -p \
  /app/database/parsed_photos \
  /app/app/public/listings/originals \
  /app/app/public/listings/optimized \
  /app/app/public/avatars

# bot/.env має TOKEN; Next.js очікує TELEGRAM_BOT_TOKEN
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TOKEN:-}" ]; then
  export TELEGRAM_BOT_TOKEN="$TOKEN"
fi
if [ -z "${NEXT_PUBLIC_BASE_URL:-}" ] && [ -n "${WEBAPP_URL:-}" ]; then
  export NEXT_PUBLIC_BASE_URL="$WEBAPP_URL"
fi
if [ -z "${NEXT_PUBLIC_WEBAPP_URL:-}" ] && [ -n "${WEBAPP_URL:-}" ]; then
  export NEXT_PUBLIC_WEBAPP_URL="$WEBAPP_URL"
fi
if [ -z "${NEXT_PUBLIC_BOT_USERNAME:-}" ] && [ -n "${BOT_USERNAME:-}" ]; then
  export NEXT_PUBLIC_BOT_USERNAME="$BOT_USERNAME"
fi

# Не робимо prisma db push на прод-SQLite: схема вже є, push падає на drift і валить контейнер.

echo "[app] next start (DATABASE_URL=${DATABASE_URL:-unset})"
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
