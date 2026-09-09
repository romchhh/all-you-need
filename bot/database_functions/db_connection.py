"""Unified SQLite / PostgreSQL connection for bot and parser."""

from __future__ import annotations

import os
import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional, Sequence, Union
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"

_psycopg2 = None
_psycopg2_extras = None

_DB_LOCK = threading.RLock()


def _load_psycopg2():
    global _psycopg2, _psycopg2_extras
    if _psycopg2 is None:
        import psycopg2
        import psycopg2.extras

        _psycopg2 = psycopg2
        _psycopg2_extras = psycopg2.extras
    return _psycopg2, _psycopg2_extras


def pg_dsn_for_psycopg2(url: str) -> str:
    """Strip Prisma-only URI params (schema=public) — psycopg2 does not accept them."""
    parsed = urlparse(url)
    if not parsed.query:
        return url
    skip = frozenset({"schema", "connection_limit", "pool_timeout", "connect_timeout"})
    kept = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in skip]
    return urlunparse(parsed._replace(query=urlencode(kept)))


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    return f"file://{DB_PATH}"


def is_postgres() -> bool:
    url = get_database_url()
    return url.startswith("postgres://") or url.startswith("postgresql://")


def is_sqlite_locked_error(err: BaseException) -> bool:
    if is_postgres():
        psycopg2, _ = _load_psycopg2()
        if isinstance(err, psycopg2.OperationalError):
            return True
        return False
    cur: BaseException | None = err
    while cur is not None:
        if isinstance(cur, sqlite3.OperationalError):
            msg = str(cur).lower()
            if "locked" in msg or "busy" in msg:
                return True
        elif "database is locked" in str(cur).lower():
            return True
        cur = cur.__cause__ or cur.__context__  # type: ignore[assignment]
    return False


def _quote_pg_table(table: str) -> str:
    if table and table[0].isupper():
        return f'"{table}"'
    return table


PRISMA_PG_TABLES = (
    "User",
    "Listing",
    "Favorite",
    "ViewHistory",
    "Transaction",
    "Payment",
    "Review",
    "Category",
    "Admin",
    "Link",
    "TelegramListing",
    "CitySubscription",
    "AnalyticsEvent",
    "SystemMonitorLog",
    "SystemSettings",
    "ListingPackagePurchase",
    "PromotionPurchase",
    "Referral",
    "UserSession",
    "CityDigestQueue",
)

PRISMA_PG_COLUMNS = (
    "userId",
    "telegramId",
    "firstName",
    "lastName",
    "createdAt",
    "updatedAt",
    "publishedAt",
    "moderatedAt",
    "moderatedBy",
    "optimizedImages",
    "promotionType",
    "promotionEnds",
    "isFree",
    "previousPrice",
    "priceChangedAt",
    "favoriteBoost",
    "subcategory",
    "moderationStatus",
    "rejectionReason",
    "listingId",
    "viewerTelegramId",
    "viewedAt",
    "targetId",
    "eventName",
    "eventGroup",
    "entityType",
    "entityId",
    "lastActiveAt",
    "sortOrder",
    "parentId",
    "isActive",
    "linkName",
    "linkUrl",
    "linkCount",
    "hasUsedFreeAd",
    "agreementAccepted",
    "listingPackagesBalance",
    "autoRenew",
    "expiresAt",
    "priceDisplay",
    "channelMessageId",
    "marketplaceListingId",
    "reviewsCount",
    "paymentMethod",
    "completedAt",
    "invoiceId",
    "amountEur",
    "pageUrl",
    "webhookData",
    "packageType",
    "listingsCount",
    "paidAt",
    "cityKey",
    "processedAt",
    "referrerTelegramId",
    "referredTelegramId",
    "rewardPaid",
    "rewardPaidAt",
    "sellerTelegramId",
)


def quote_pg_identifiers(sql: str) -> str:
    s = sql
    for table in PRISMA_PG_TABLES:
        s = re.sub(
            rf"\bCREATE TABLE IF NOT EXISTS {table}\b",
            f'CREATE TABLE IF NOT EXISTS "{table}"',
            s,
            flags=re.IGNORECASE,
        )
        s = re.sub(rf"\bFROM {table}\b", f'FROM "{table}"', s, flags=re.IGNORECASE)
        s = re.sub(rf"\bJOIN {table}\b", f'JOIN "{table}"', s, flags=re.IGNORECASE)
        s = re.sub(rf"\bUPDATE {table}\b", f'UPDATE "{table}"', s, flags=re.IGNORECASE)
        s = re.sub(rf"\bINTO {table}\b", f'INTO "{table}"', s, flags=re.IGNORECASE)
        s = re.sub(rf"\bDELETE FROM {table}\b", f'DELETE FROM "{table}"', s, flags=re.IGNORECASE)
        s = re.sub(rf"\bON {table}\(", f'ON "{table}"(', s, flags=re.IGNORECASE)
    for col in PRISMA_PG_COLUMNS:
        s = re.sub(rf"\.{col}\b", f'."{col}"', s)
        s = re.sub(
            rf'(?<![."\\w]){col}(?=\s*(?:=|,|\)|$|\s+IS\b|\s+DESC\b|\s+ASC\b))',
            f'"{col}"',
            s,
        )
    s = re.sub(r'\."isFree"\s*=\s*1\b', '."isFree" = true', s, flags=re.IGNORECASE)
    s = re.sub(r"\bisFree\s*=\s*1\b", '"isFree" = true', s, flags=re.IGNORECASE)
    s = re.sub(r'\."isFree"\s*=\s*0\b', '."isFree" = false', s, flags=re.IGNORECASE)
    s = re.sub(r"\bisFree\s*=\s*0\b", '"isFree" = false', s, flags=re.IGNORECASE)
    s = re.sub(r"\bAS REAL\b", "AS DOUBLE PRECISION", s, flags=re.IGNORECASE)
    return s


def adapt_sql(sql: str) -> str:
    if not is_postgres():
        return sql

    s = sql
    s = s.replace("[Transaction]", '"Transaction"')
    s = re.sub(r"datetime\('now'\)", "NOW()", s, flags=re.IGNORECASE)
    s = re.sub(
        r"datetime\('now',\s*\?\)",
        "NOW() + CAST(? AS INTERVAL)",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"datetime\('now',\s*'-(\d+)\s+days'\)",
        r"NOW() - INTERVAL '\1 days'",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"datetime\('now',\s*'start of day',\s*'localtime'\)",
        "DATE_TRUNC('day', NOW())",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"datetime\(([^,)]+)\)\s*>\s*datetime\('now'\)",
        r"\1 > NOW()",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"datetime\(([^,)]+)\)\s*>\s*NOW\(\)",
        r"\1 > NOW()",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY", s, flags=re.IGNORECASE)
    s = re.sub(r"INSERT OR IGNORE INTO", "INSERT INTO", s, flags=re.IGNORECASE)
    s = re.sub(r"ON CONFLICT\s*\(", "ON CONFLICT (", s, flags=re.IGNORECASE)
    s = re.sub(r"CAST\(([^)]+)\s+AS\s+INTEGER\)", r"(\1)::bigint", s, flags=re.IGNORECASE)
    s = re.sub(
        r"SELECT name FROM sqlite_master WHERE type='table' AND name='([^']+)'",
        r"SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename = '\1'",
        s,
        flags=re.IGNORECASE,
    )
    s = quote_pg_identifiers(s)
    return s


def _convert_placeholders(sql: str, params: Optional[Sequence[Any]]) -> tuple[str, Optional[Sequence[Any]]]:
    adapted = adapt_sql(sql)
    if not is_postgres() or params is None:
        return adapted, params
    if "?" not in adapted:
        return adapted, params
    parts = adapted.split("?")
    new_sql = parts[0]
    for part in parts[1:]:
        new_sql += "%s" + part
    return new_sql, tuple(params)


def fetch_table_columns(cursor, table: str) -> set[str]:
    if is_postgres():
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND (table_name = %s OR table_name = %s)
            """,
            (table, table.lower()),
        )
        rows = cursor.fetchall()
        names: set[str] = set()
        for row in rows:
            if isinstance(row, dict):
                names.add(row["column_name"])
            else:
                names.add(row[0])
        return names

    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def fetch_pragma_table_info(cursor, table: str) -> list[tuple[Any, ...]]:
    """SQLite-compatible PRAGMA table_info rows: (cid, name, type, notnull, dflt, pk)."""
    if is_postgres():
        cursor.execute(
            """
            SELECT ordinal_position - 1 AS cid,
                   column_name AS name,
                   data_type AS type,
                   CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
                   column_default AS dflt_value,
                   0 AS pk
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND (table_name = %s OR table_name = %s)
            ORDER BY ordinal_position
            """,
            (table, table.lower()),
        )
        rows = cursor.fetchall()
        out: list[tuple[Any, ...]] = []
        for row in rows:
            if isinstance(row, dict):
                out.append(
                    (
                        row["cid"],
                        row["name"],
                        row["type"],
                        row["notnull"],
                        row["dflt_value"],
                        row["pk"],
                    )
                )
            else:
                out.append(tuple(row))
        return out

    cursor.execute(f"PRAGMA table_info({table})")
    return [tuple(r) for r in cursor.fetchall()]


def table_exists(cursor, table: str) -> bool:
    if is_postgres():
        cursor.execute(
            """
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public'
              AND (tablename = %s OR tablename = %s)
            LIMIT 1
            """,
            (table, table.lower()),
        )
        return cursor.fetchone() is not None

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cursor.fetchone() is not None


class DbCursor:
    def __init__(self, cursor, conn_wrapper: "DbConnection"):
        self._cursor = cursor
        self._conn = conn_wrapper
        self._lastrowid: Optional[int] = None
        self._columns: list[str] = []

    def __getattr__(self, name: str):
        return getattr(self._cursor, name)

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None):
        adapted_sql, adapted_params = _convert_placeholders(sql, params)
        if is_postgres() and adapted_sql.strip().upper().startswith("PRAGMA TABLE_INFO"):
            m = re.search(r"PRAGMA\s+table_info\(([^)]+)\)", adapted_sql, re.I)
            if m:
                table = m.group(1).strip().strip('"').strip("'")
                rows = fetch_pragma_table_info(self._cursor, table)
                self._rows = rows
                return self
        if is_postgres() and re.match(r"^\s*PRAGMA\b", adapted_sql, re.I):
            return self

        upper = adapted_sql.strip().upper()
        if (
            is_postgres()
            and upper.startswith("INSERT")
            and "RETURNING" not in upper
            and " ON CONFLICT " not in upper
        ):
            insert_cols = re.search(r"INSERT\s+INTO\s+\S+\s*\(([^)]+)\)", adapted_sql, re.I)
            has_id_col = bool(
                insert_cols
                and "id" in [c.strip().strip('"').lower() for c in insert_cols.group(1).split(",")]
            )
            if "INSERT OR IGNORE" in sql.upper():
                adapted_sql += " ON CONFLICT DO NOTHING"
            elif has_id_col:
                adapted_sql += " RETURNING id"

        def _run():
            if adapted_params is None:
                self._cursor.execute(adapted_sql)
            else:
                self._cursor.execute(adapted_sql, adapted_params)
            if is_postgres():
                self._columns = [d[0] for d in (self._cursor.description or [])]
            if is_postgres() and upper.startswith("INSERT") and "RETURNING id" in adapted_sql:
                row = self._cursor.fetchone()
                if row:
                    self._lastrowid = row[0]
            return self._cursor

        if is_postgres():
            _run()
        else:
            _retry_execute(_run, op="cursor.execute")
        return self

    def executemany(self, sql: str, params_seq):
        adapted_sql, _ = _convert_placeholders(sql, None)

        def _run():
            return self._cursor.executemany(adapted_sql, params_seq)

        if is_postgres():
            return _run()
        return _retry_execute(_run, op="cursor.executemany")

    @property
    def lastrowid(self) -> Optional[int]:
        if self._lastrowid is not None:
            return self._lastrowid
        if not is_postgres():
            return self._cursor.lastrowid
        return None

    def _wrap_row(self, row):
        if row is None or not is_postgres() or not self._columns:
            return row
        return HybridRow(self._columns, tuple(row))

    def fetchall(self):
        if hasattr(self, "_rows"):
            return self._rows
        rows = self._cursor.fetchall()
        if is_postgres() and self._columns:
            return [self._wrap_row(r) for r in rows]
        return rows

    def fetchone(self):
        if hasattr(self, "_rows"):
            return self._rows[0] if self._rows else None
        return self._wrap_row(self._cursor.fetchone())


class HybridRow:
    __slots__ = ("_values", "_map")

    def __init__(self, columns: list[str], values: tuple[Any, ...]):
        self._values = values
        self._map = dict(zip(columns, values))

    def __getitem__(self, key: Union[int, str]):
        if isinstance(key, int):
            return self._values[key]
        return self._map[key]

    def get(self, key: str, default=None):
        return self._map.get(key, default)

    def keys(self):
        return self._map.keys()


class DbConnection:
    def __init__(self, conn, *, managed_close: bool = True, is_pg: bool = False):
        self._conn = conn
        self._managed_close = managed_close
        self._is_pg = is_pg
        if not is_pg:
            self.row_factory = sqlite3.Row

    def __getattr__(self, name: str):
        return getattr(self._conn, name)

    def cursor(self):
        raw = self._conn.cursor()
        return DbCursor(raw, self)

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, params_seq):
        cur = self.cursor()
        return cur.executemany(sql, params_seq)

    def commit(self) -> None:
        if is_postgres():
            self._conn.commit()
        else:
            _retry_execute(self._conn.commit, op="commit")

    def close(self) -> None:
        if not self._managed_close:
            return
        try:
            self._conn.close()
        finally:
            if not is_postgres():
                _DB_LOCK.release()


def _retry_execute(fn, *, op: str, retries: int = 20):
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            last_err = e
            if is_sqlite_locked_error(e) and attempt < retries - 1:
                time.sleep(min(0.25 * (2**attempt), 4.0))
                continue
            raise
    if last_err:
        raise last_err
    raise sqlite3.OperationalError("database is locked")


def _connect_sqlite() -> DbConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        str(DB_PATH),
        timeout=120.0,
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 120000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return DbConnection(conn, managed_close=True, is_pg=False)


def _connect_postgres() -> DbConnection:
    psycopg2, _ = _load_psycopg2()
    conn = psycopg2.connect(pg_dsn_for_psycopg2(get_database_url()))
    conn.autocommit = False
    return DbConnection(conn, managed_close=True, is_pg=True)


def get_connection() -> DbConnection:
    if is_postgres():
        return _connect_postgres()

    acquired = _DB_LOCK.acquire(timeout=120.0)
    if not acquired:
        raise sqlite3.OperationalError("DB lock timeout")
    try:
        return _connect_sqlite()
    except Exception:
        _DB_LOCK.release()
        raise


@contextmanager
def db_cycle() -> Iterator[None]:
    """Serialize SQLite writes; no-op for PostgreSQL."""
    if is_postgres():
        yield
        return
    acquired = _DB_LOCK.acquire(timeout=120.0)
    if not acquired:
        raise sqlite3.OperationalError("DB lock timeout")
    try:
        yield
    finally:
        _DB_LOCK.release()
