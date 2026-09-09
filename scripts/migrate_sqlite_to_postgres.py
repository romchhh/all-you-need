#!/usr/bin/env python3
"""
Backup SQLite database and migrate all tables to PostgreSQL on first startup.

Usage:
  DATABASE_URL=postgresql://... python scripts/migrate_sqlite_to_postgres.py

Idempotent: skips if marker file exists or PostgreSQL already has User rows.
"""

from __future__ import annotations

import json
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
    return {name: meta["type"] for name, meta in pg_column_meta(cur, table).items()}


def pg_column_meta(cur, table: str) -> dict[str, dict[str, str | bool | None]]:
    resolved = resolve_pg_table(cur, table)
    if not resolved:
        return {}
    cur.execute(
        """
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name = %s OR table_name = %s)
        ORDER BY ordinal_position
        """,
        (resolved, resolved.lower()),
    )
    out: dict[str, dict[str, str | bool | None]] = {}
    for name, data_type, is_nullable, column_default in cur.fetchall():
        out[name] = {
            "type": data_type,
            "nullable": is_nullable == "YES",
            "default": column_default,
        }
    return out


def parse_pg_default(default: str | None):
    if not default:
        return None
    d = default.strip()
    if d.startswith("'") and "::" in d:
        return d.split("'")[1]
    if d.startswith("(") and "':" in d:
        inner = d.split("'")[1] if "'" in d else None
        if inner is not None:
            return inner
    lowered = d.lower()
    if lowered in ("false", "'f'::boolean"):
        return False
    if lowered in ("true", "'t'::boolean"):
        return True
    if lowered.endswith("::integer") or lowered.isdigit():
        try:
            return int(re.sub(r"[^0-9-]", "", d.split("::")[0]) or "0")
        except ValueError:
            pass
    if "now()" in lowered:
        return datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return None


# Fallbacks when SQLite has NULL but PostgreSQL column is NOT NULL
FALLBACK_DEFAULTS: dict[tuple[str, str], object] = {
    ("Listing", "moderationStatus"): "pending",
    ("Listing", "status"): "pending_moderation",
    ("TelegramListing", "moderationStatus"): "pending",
    ("TelegramListing", "status"): "pending_moderation",
    ("Transaction", "status"): "pending",
    ("Payment", "status"): "created",
    ("Payment", "currency"): "EUR",
    ("Transaction", "currency"): "EUR",
}


def infer_moderation_status(listing_status: object) -> str:
    st = str(listing_status or "").strip().lower()
    if st in ("active", "sold", "approved", "expired", "deactivated", "hidden"):
        return "approved"
    return "pending"


def is_integer_type(pg_type: str) -> bool:
    return (pg_type or "").lower() in ("integer", "bigint", "smallint")


def normalize_integer_value(value):
    """SQLite may store JSON arrays like '[149]' in Int columns (channelMessageId)."""
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.startswith("[") or s.startswith("{"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list) and parsed:
                    return int(parsed[0])
                if isinstance(parsed, dict):
                    for key in ("id", "message_id", "messageId"):
                        if key in parsed:
                            return int(parsed[key])
            except (json.JSONDecodeError, ValueError, TypeError):
                pass
        if re.fullmatch(r"-?\d+", s):
            return int(s)
        if "," in s:
            first = s.split(",")[0].strip()
            if re.fullmatch(r"-?\d+", first):
                return int(first)
    return None


def is_timestamp_type(pg_type: str) -> bool:
    t = (pg_type or "").lower()
    return "timestamp" in t or t == "date"


def normalize_datetime_value(value, col_name: str = ""):
    """SQLite may store ms epoch, seconds epoch, or 'YYYY-MM-DD HH:mm:ss' strings."""
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value

    if isinstance(value, (int, float)):
        num = float(value)
    elif isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if re.fullmatch(r"\d+", s):
            num = float(s)
        elif re.match(r"^\d{4}-\d{2}-\d{2}", s):
            if "T" in s:
                return s.replace("T", " ", 1).split("+")[0].split("Z")[0]
            return s
        else:
            return value
    else:
        return value

    # Epoch: ms (>1e11), seconds (>1e9), or invalid garbage
    if num > 1e14:
        num /= 1_000_000
    elif num > 1e11:
        num /= 1000

    if num < 1e9 or num > 4e12:
        return None

    dt = datetime.fromtimestamp(num, tz=timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def coerce_cell(
    value,
    pg_type: str,
    col_name: str = "",
    *,
    table_name: str = "",
    col_meta: dict | None = None,
    row_values: dict | None = None,
):
    meta = col_meta or {}
    nullable = meta.get("nullable", True)
    pg_default = meta.get("default")

    if isinstance(value, str) and not value.strip():
        value = None

    if value is None and not nullable:
        if col_name == "moderationStatus" and row_values and row_values.get("status"):
            value = infer_moderation_status(row_values.get("status"))
        else:
            fb = FALLBACK_DEFAULTS.get((table_name, col_name))
            if fb is not None:
                value = fb
            else:
                parsed = parse_pg_default(str(pg_default) if pg_default else None)
                if parsed is not None:
                    value = parsed
                elif pg_type == "boolean":
                    value = False
                elif pg_type in ("integer", "bigint", "smallint"):
                    value = 0
                elif pg_type in ("double precision", "real", "numeric"):
                    value = 0.0
                elif pg_type == "text" or "character" in (pg_type or ""):
                    value = ""
                elif is_timestamp_type(pg_type) or col_name.endswith("At"):
                    value = datetime.now(timezone.utc).replace(tzinfo=None).strftime(
                        "%Y-%m-%d %H:%M:%S.%f"
                    )[:-3]

    if value is None:
        return None
    if pg_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "t", "yes")
    if is_integer_type(pg_type):
        normalized = normalize_integer_value(value)
        if normalized is not None:
            return normalized
        return None if nullable else 0
    if is_timestamp_type(pg_type) or col_name.endswith("At") or col_name.endswith("_at"):
        normalized = normalize_datetime_value(value, col_name)
        if normalized is not None:
            return normalized
    return value


def sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    cur = conn.execute(f"PRAGMA table_info({sqlite_table_ref(table)})")
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

    existing = pg_row_count(pg_cur, table)
    if existing > 0:
        log(f"  skip {table}: already has {existing} rows in PostgreSQL")
        return 0

    sq_cols = sqlite_columns(sqlite_conn, table)
    pg_cols = set(pg_columns(pg_cur, table))
    col_meta_map = pg_column_meta(pg_cur, table)
    col_types = {k: v["type"] for k, v in col_meta_map.items()}  # type: ignore
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
        raw = {
            c: (row[c] if isinstance(row, sqlite3.Row) else row[i])
            for i, c in enumerate(cols)
        }
        values = tuple(
            coerce_cell(
                raw[c],
                str(col_types.get(c, "")),
                c,
                table_name=table,
                col_meta=col_meta_map.get(c),
                row_values=raw,
            )
            for c in cols
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
                        pg_conn.commit()
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
