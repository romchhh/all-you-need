"""Підключення до SQLite маркетплейсу (серіалізація + retry для парсера)."""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"

_DB_LOCK = threading.RLock()
_CONNECT_RETRIES = 10


class ParserConnection:
    """Тримає parser DB lock до close()."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def __getattr__(self, name: str):
        return getattr(self._conn, name)

    def close(self) -> None:
        try:
            self._conn.close()
        finally:
            _DB_LOCK.release()


def _configure_connection(conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 60000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA synchronous = NORMAL;")


def get_connection() -> sqlite3.Connection:
    last_err: Exception | None = None
    for attempt in range(_CONNECT_RETRIES):
        acquired = _DB_LOCK.acquire(timeout=30.0)
        if not acquired:
            last_err = sqlite3.OperationalError("parser DB lock timeout")
            time.sleep(min(0.2 * (2**attempt), 3.0))
            continue
        try:
            conn = sqlite3.connect(
                str(DB_PATH),
                timeout=60.0,
                check_same_thread=False,
            )
            _configure_connection(conn)
            return ParserConnection(conn)  # type: ignore[return-value]
        except sqlite3.OperationalError as e:
            _DB_LOCK.release()
            last_err = e
            if "locked" in str(e).lower() and attempt < _CONNECT_RETRIES - 1:
                time.sleep(min(0.2 * (2**attempt), 3.0))
                continue
            raise
        except Exception:
            _DB_LOCK.release()
            raise
    if last_err:
        raise last_err
    raise sqlite3.OperationalError("database is locked")


def ensure_parser_storage() -> None:
    """Один раз на цикл парсингу: таблиці + міграції."""
    from parser.storage.channel_cursors import ensure_parser_cursors_table
    from parser.storage.parsed_items import ensure_parsed_items_table

    ensure_parsed_items_table()
    ensure_parser_cursors_table()
