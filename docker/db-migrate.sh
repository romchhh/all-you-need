#!/bin/sh
# Standalone DB bootstrap (same steps as Docker entrypoints). Prefer: docker compose up.
set -eu

DB_URL="${DATABASE_URL:-}"
SQLITE_PATH="/app/database/ayn_marketplace.db"

is_postgres() {
  case "$DB_URL" in
    postgres://*|postgresql://*) return 0 ;;
    *) return 1 ;;
  esac
}

wait_for_postgres() {
  host="${POSTGRES_HOST:-postgres}"
  port="${POSTGRES_PORT:-5432}"
  user="${POSTGRES_USER:-ayn}"
  db="${POSTGRES_DB:-ayn_marketplace}"
  echo "[db-migrate] waiting for PostgreSQL at ${host}:${port}..."
  i=0
  while [ "$i" -lt 60 ]; do
    if pg_isready -h "$host" -p "$port" -U "$user" -d "$db" >/dev/null 2>&1; then
      echo "[db-migrate] PostgreSQL is ready"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  echo "[db-migrate] PostgreSQL not ready after 120s" >&2
  return 1
}

run_prisma_migrate() {
  echo "[db-migrate] prisma migrate deploy (schema + bot/parser tables)..."
  cd /app/app
  npx prisma migrate deploy --schema=/app/app/prisma/schema.prisma
}

run_sqlite_migration() {
  if [ ! -f "$SQLITE_PATH" ]; then
    echo "[db-migrate] no SQLite file, skip data migration"
    return 0
  fi
  if [ -f /app/database/.postgres_migrated ]; then
    echo "[db-migrate] already migrated (.postgres_migrated exists)"
    return 0
  fi
  echo "[db-migrate] copying SQLite data to PostgreSQL..."
  python3 /app/scripts/migrate_sqlite_to_postgres.py
}

if is_postgres; then
  wait_for_postgres
  run_prisma_migrate
  run_sqlite_migration
else
  echo "[db-migrate] SQLite mode, skip PostgreSQL migration"
fi
