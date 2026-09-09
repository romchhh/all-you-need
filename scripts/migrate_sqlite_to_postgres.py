#!/usr/bin/env python3
"""
Backup SQLite database and migrate all tables to PostgreSQL on first startup.

Usage:
  DATABASE_URL=postgresql://... python scripts/migrate_sqlite_to_postgres.py

Idempotent: skips if marker file exists or PostgreSQL already has User rows.
"""

from __future__ import annotations

import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

BASE_DIR = Path(__file__).resolve().parent.parent
SQLITE_PATH = BASE_DIR / "database" / "ayn_marketplace.db"
BACKUP_DIR = BASE_DIR / "database" / "backups"
MARKER_PATH = BASE_DIR / "database" / ".postgres_migrated"
EXTRA_SQL = BASE_DIR / "scripts" / "postgres-extra-tables.sql"

# Copy order: parents before children (Prisma FK graph + bot tables)
TABLE_COPY_ORDER = [
    "User",
    "Category",
    "Admin",
    "Link",
    "SystemSettings",
    "AnalyticsEvent",
    "SystemMonitorLog",
    "Listing",
    "TelegramListing",
    "Favorite",
    "CitySubscription",
    "Transaction",
    "Payment",
    "Review",
    "ViewHistory",
    "Referral",
    "ListingPackagePurchase",
    "PromotionPurchase",
    "LinkVisit",
    "UserSession",
    "CityDigestQueue",
    "WeeklyBroadcastState",
    "WeeklyBroadcastLog",
    "payments",
    "users_legacy",
    "parser_accounts",
    "parser_meta",
    "parser_channel_cursors",
    "parsed_items",
    "parsed_skips",
]


def log(msg: str) -> None:
    print(f"[migrate] {msg}", flush=True)


def pg_dsn_for_psycopg2(url: str) -> str:
    """Remove Prisma-only URI params (schema=public etc.) that psycopg2 rejects."""
    parsed = urlparse(url)
    if not parsed.query:
        return url
    skip = frozenset({"schema", "connection_limit", "pool_timeout", "connect_timeout"})
    kept = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in skip]
    return urlunparse(parsed._replace(query=urlencode(kept)))


def get_pg_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url.startswith("postgres"):
        raise SystemExit("DATABASE_URL must be a PostgreSQL connection string")
    return pg_dsn_for_psycopg2(url)


def backup_sqlite() -> Path | None:
    if not SQLITE_PATH.exists():
        log(f"No SQLite file at {SQLITE_PATH}, skipping data copy")
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"ayn_marketplace_{ts}.db"
    shutil.copy2(SQLITE_PATH, dst)
    log(f"SQLite backup: {dst}")
    return dst


def sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    return [r[0] for r in cur.fetchall()]


def pg_table_exists(cur, table: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename = %s OR tablename = %s)
        LIMIT 1
        """,
        (table, table.lower()),
    )
    return cur.fetchone() is not None


def resolve_pg_table(cur, table: str) -> str | None:
    cur.execute(
        """
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename = %s OR tablename = %s)
        LIMIT 1
        """,
        (table, table.lower()),
    )
    row = cur.fetchone()
    return row[0] if row else None


def sqlite_table_ref(table: str) -> str:
    return f'"{table}"' if table and table[0].isupper() else table


def pg_table_ref(table: str) -> str:
    if table and table[0].isupper():
        return f'"{table}"'
    return table.lower()


def pg_row_count(cur, table: str) -> int:
    resolved = resolve_pg_table(cur, table)
    if not resolved:
        return 0
    cur.execute(f"SELECT COUNT(*) FROM {pg_table_ref(resolved)}")
    return int(cur.fetchone()[0])


def pg_columns(cur, table: str) -> list[str]:
    resolved = resolve_pg_table(cur, table)
    if not resolved:
        return []
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name = %s OR table_name = %s)
        ORDER BY ordinal_position
        """,
        (resolved, resolved.lower()),
    )
    return [r[0] for r in cur.fetchall()]


def pg_column_types(cur, table: str) -> dict[str, str]:
    resolved = resolve_pg_table(cur, table)
    if not resolved:
        return {}
    cur.execute(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name = %s OR table_name = %s)
        """,
        (resolved, resolved.lower()),
    )
    return {r[0]: r[1] for r in cur.fetchall()}


def coerce_cell(value, pg_type: str):
    if value is None:
        return None
    if pg_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "t", "yes")
    return value


def sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def reset_sequence(cur, table: str, id_col: str = "id") -> None:
    resolved = resolve_pg_table(cur, table)
    if not resolved:
        return
    qtable = pg_table_ref(resolved)
    cur.execute(
        f"""
        SELECT setval(
            pg_get_serial_sequence('{qtable}', '{id_col}'),
            COALESCE((SELECT MAX("{id_col}") FROM {qtable}), 1),
            true
        )
        """
    )


def copy_table(sqlite_conn: sqlite3.Connection, pg_cur, table: str) -> int:
    resolved = resolve_pg_table(pg_cur, table)
    if not resolved:
        log(f"  skip {table}: not in PostgreSQL schema")
        return 0

    sq_cols = sqlite_columns(sqlite_conn, table)
    pg_cols = set(pg_columns(pg_cur, table))
    col_types = pg_column_types(pg_cur, table)
    cols = [c for c in sq_cols if c in pg_cols]
    if not cols:
        log(f"  skip {table}: no matching columns")
        return 0

    rows = sqlite_conn.execute(
        f"SELECT {', '.join(cols)} FROM {sqlite_table_ref(table)}"
    ).fetchall()
    if not rows:
        return 0

    qtable = pg_table_ref(resolved)
    col_sql = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    insert_sql = f"INSERT INTO {qtable} ({col_sql}) VALUES ({placeholders})"

    copied = 0
    batch: list[tuple] = []
    for row in rows:
        values = tuple(
            coerce_cell(
                row[c] if isinstance(row, sqlite3.Row) else row[i],
                col_types.get(c, ""),
            )
            for i, c in enumerate(cols)
        )
        batch.append(values)
        if len(batch) >= 500:
            pg_cur.executemany(insert_sql, batch)
            copied += len(batch)
            batch = []
    if batch:
        pg_cur.executemany(insert_sql, batch)
        copied += len(batch)

    if "id" in cols and copied:
        try:
            reset_sequence(pg_cur, table, "id")
        except Exception as e:
            log(f"  note: could not reset sequence for {table}: {e}")

    return copied


def apply_extra_sql(pg_conn) -> None:
    if not EXTRA_SQL.exists():
        return
    sql = EXTRA_SQL.read_text(encoding="utf-8")
    with pg_conn.cursor() as cur:
        cur.execute(sql)
    pg_conn.commit()
    log("Applied postgres-extra-tables.sql")


def should_migrate(pg_cur) -> bool:
    if MARKER_PATH.exists():
        log("Marker exists, migration already done")
        return False
    if not SQLITE_PATH.exists():
        log("No SQLite database to migrate from")
        return False
    if pg_row_count(pg_cur, "User") > 0:
        log("PostgreSQL already has User data, skipping copy")
        MARKER_PATH.write_text("skipped: pg already populated\n", encoding="utf-8")
        return False
    return True


def main() -> int:
    import psycopg2

    pg_url = get_pg_url()
    backup_path = backup_sqlite()

    pg_conn = psycopg2.connect(pg_url)
    pg_conn.autocommit = False
    try:
        with pg_conn.cursor() as cur:
            if not should_migrate(cur):
                return 0

        if not SQLITE_PATH.exists():
            MARKER_PATH.write_text("no sqlite source\n", encoding="utf-8")
            return 0

        sqlite_conn = sqlite3.connect(str(SQLITE_PATH))
        sqlite_conn.row_factory = sqlite3.Row
        try:
            available = set(sqlite_tables(sqlite_conn))
            ordered = [t for t in TABLE_COPY_ORDER if t in available]
            ordered += sorted(available - set(ordered))

            total = 0
            with pg_conn.cursor() as cur:
                for table in ordered:
                    if table.startswith("sqlite_"):
                        continue
                    try:
                        n = copy_table(sqlite_conn, cur, table)
                    except Exception as exc:
                        pg_conn.rollback()
                        raise RuntimeError(f"failed copying table {table}: {exc}") from exc
                    if n:
                        log(f"  {table}: {n} rows")
                        total += n
                pg_conn.commit()

            marker = (
                f"migrated_at={datetime.now(timezone.utc).isoformat()}\n"
                f"backup={backup_path}\n"
                f"rows={total}\n"
            )
            MARKER_PATH.write_text(marker, encoding="utf-8")
            log(f"Migration complete ({total} rows)")
        finally:
            sqlite_conn.close()
    finally:
        pg_conn.close()

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log(f"ERROR: {exc}")
        raise
