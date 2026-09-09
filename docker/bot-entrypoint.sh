#!/bin/sh
set -eu

mkdir -p \
  /app/database/parsed_photos \
  /app/app/public/listings/originals \
  /app/app/public/listings/optimized \
  /app/app/public/avatars \
  /app/bot/parser/sessions \
  /app/bot/logs

wait_for_postgres() {
  case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*) ;;
    *) return 0 ;;
  esac
  host="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
u = urlparse(os.environ.get("DATABASE_URL", ""))
print(u.hostname or "postgres")
PY
)"
  port="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
u = urlparse(os.environ.get("DATABASE_URL", ""))
print(u.port or 5432)
PY
)"
  echo "[bot] waiting for PostgreSQL at ${host}:${port}..."
  python3 - <<PY
import os, socket, time
host = "${host}"
port = int("${port}")
deadline = time.time() + 120
while time.time() < deadline:
    try:
        s = socket.create_connection((host, port), timeout=2)
        s.close()
        raise SystemExit(0)
    except OSError:
        time.sleep(2)
raise SystemExit(1)
PY
}

run_sqlite_migration() {
  case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*)
      if [ ! -f /app/database/ayn_marketplace.db ]; then
        echo "[bot] no SQLite file — skip data migration"
        return 0
      fi
      if [ -f /app/database/.postgres_migrated ]; then
        echo "[bot] data already migrated (.postgres_migrated)"
        return 0
      fi
      echo "[bot] backing up SQLite and copying data to PostgreSQL..."
      python3 /app/scripts/migrate_sqlite_to_postgres.py
      ;;
    *)
      echo "[bot] non-PostgreSQL DATABASE_URL — skip data migration"
      ;;
  esac
}

wait_for_postgres
run_sqlite_migration

echo "[bot] start"
exec python main.py
