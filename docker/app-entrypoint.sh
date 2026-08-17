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

if [ -f /app/app/prisma/schema.prisma ]; then
  echo "[app] prisma db push…"
  npx prisma db push --skip-generate --schema=/app/app/prisma/schema.prisma
fi

echo "[app] next start"
exec npm start -- -H 0.0.0.0 -p "${PORT:-3000}"
