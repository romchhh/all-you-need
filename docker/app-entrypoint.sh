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

wait_for_postgres() {
  case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*) ;;
    *) return 0 ;;
  esac
  host="${POSTGRES_HOST:-postgres}"
  port="${POSTGRES_PORT:-5432}"
  echo "[app] waiting for PostgreSQL at ${host}:${port}..."
  node -e "
    const net = require('net');
    const host = process.env.POSTGRES_HOST || 'postgres';
    const port = Number(process.env.POSTGRES_PORT || 5432);
    const deadline = Date.now() + 120000;
    (function tryConnect() {
      if (Date.now() > deadline) process.exit(1);
      const socket = net.createConnection({ host, port }, () => { socket.end(); process.exit(0); });
      socket.on('error', () => setTimeout(tryConnect, 2000));
    })();
  "
}

run_migrations() {
  case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*)
      echo "[app] prisma migrate deploy (schema + bot/parser tables)..."
      npx prisma migrate deploy --schema=/app/app/prisma/schema.prisma
      echo "[app] migrations applied"
      ;;
    *)
      echo "[app] SQLite mode — skip prisma migrate"
      ;;
  esac
}

wait_for_postgres
run_migrations

echo "[app] next start (DATABASE_URL=${DATABASE_URL:-unset})"
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
