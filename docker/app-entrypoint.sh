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
      SCHEMA=/app/app/prisma/schema.prisma
      echo "[app] prisma migrate deploy..."
      if npx prisma migrate deploy --schema="$SCHEMA"; then
        echo "[app] migrations applied"
        return 0
      fi
      # Схема вже є (db push / migrate_sqlite_to_postgres) — позначити міграції як applied
      echo "[app] migrate failed (tables likely exist) — prisma migrate resolve --applied..."
      for m in 20250909190000_init_postgresql 20250909190001_bot_parser_tables; do
        npx prisma migrate resolve --applied "$m" --schema="$SCHEMA" 2>/dev/null || true
      done
      if npx prisma migrate deploy --schema="$SCHEMA"; then
        echo "[app] migrations applied after resolve"
        return 0
      fi
      echo "[app] WARNING: migrate deploy still failed; checking User table..."
      node -e "
        const { PrismaClient } = require('@prisma/client');
        const p = new PrismaClient();
        p.\$queryRawUnsafe('SELECT 1 FROM \"User\" LIMIT 1')
          .then(() => { console.log('[app] User table OK — continue'); process.exit(0); })
          .catch((e) => { console.error('[app] DB not ready:', e.message); process.exit(1); })
          .finally(() => p.\$disconnect());
      "
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
