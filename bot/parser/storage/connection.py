"""Підключення до SQLite маркетплейсу (серіалізація + retry для парсера)."""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"

_DB_LOCK = threading.RLock()
_CONNECT_RETRIES = 12
_EXECUTE_RETRIES = 15

# Одне з'єднання на весь цикл /parse — менше «database is locked»
_cycle_conn: sqlite3.Connection | None = None
_cycle_depth = 0


def is_sqlite_locked_error(err: BaseException) -> bool:
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


def _raw_connect() -> sqlite3.Connection:
    last_err: Exception | None = None
    for attempt in range(_CONNECT_RETRIES):
        try:
            conn = sqlite3.connect(
                str(DB_PATH),
                timeout=120.0,
                check_same_thread=False,
                isolation_level=None,
            )
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 120000;")
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
            return conn
        except sqlite3.OperationalError as e:
            last_err = e
            if is_sqlite_locked_error(e) and attempt < _CONNECT_RETRIES - 1:
                wait = min(0.3 * (2**attempt), 5.0)
                logger.warning("SQLite connect retry %s/%s (%.1fs)", attempt + 1, _CONNECT_RETRIES, wait)
                time.sleep(wait)
                continue
            raise
    if last_err:
        raise last_err
    raise sqlite3.OperationalError("database is locked")


def _retry_execute(fn, *, op: str):
    last_err: Exception | None = None
    for attempt in range(_EXECUTE_RETRIES):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            last_err = e
            if is_sqlite_locked_error(e) and attempt < _EXECUTE_RETRIES - 1:
                wait = min(0.25 * (2**attempt), 4.0)
                logger.debug("SQLite %s retry %s/%s (%.1fs)", op, attempt + 1, _EXECUTE_RETRIES, wait)
                time.sleep(wait)
                continue
            raise
    if last_err:
        raise last_err
    raise sqlite3.OperationalError("database is locked")


class ParserConnection:
    """SQLite connection with retry on execute/commit."""

    def __init__(self, conn: sqlite3.Connection, *, managed_close: bool = True):
        self._conn = conn
        self._managed_close = managed_close

    def __getattr__(self, name: str):
        return getattr(self._conn, name)

    def execute(self, *args, **kwargs):
        return _retry_execute(lambda: self._conn.execute(*args, **kwargs), op="execute")

    def executemany(self, *args, **kwargs):
        return _retry_execute(lambda: self._conn.executemany(*args, **kwargs), op="executemany")

    def commit(self) -> None:
        _retry_execute(self._conn.commit, op="commit")

    def close(self) -> None:
        global _cycle_depth
        if not self._managed_close:
            _cycle_depth = max(0, _cycle_depth - 1)
            return
        try:
            self._conn.close()
        finally:
            _DB_LOCK.release()


class ParserCycleConnection(ParserConnection):
    """Під час parser_db_cycle(): close() лише зменшує лічильник."""

    def close(self) -> None:
        global _cycle_depth
        _cycle_depth = max(0, _cycle_depth - 1)


@contextmanager
def parser_db_cycle() -> Iterator[None]:
    """
    Тримає одне з'єднання на весь цикл парсингу (sync + async awaits у тій самій task).
    """
    global _cycle_conn, _cycle_depth
    if _cycle_conn is not None:
        yield
        return

    acquired = _DB_LOCK.acquire(timeout=120.0)
    if not acquired:
        raise sqlite3.OperationalError("parser DB lock timeout (cycle start)")

    try:
        _cycle_conn = _raw_connect()
        _cycle_depth = 0
        logger.debug("parser_db_cycle: opened shared connection")
        yield
    finally:
        if _cycle_conn is not None:
            try:
                _cycle_conn.close()
            except Exception as e:
                logger.warning("parser_db_cycle close: %s", e)
            _cycle_conn = None
        _cycle_depth = 0
        _DB_LOCK.release()
        logger.debug("parser_db_cycle: closed shared connection")


def get_connection() -> sqlite3.Connection:
    if _cycle_conn is not None:
        global _cycle_depth
        _cycle_depth += 1
        return ParserCycleConnection(_cycle_conn, managed_close=False)  # type: ignore[return-value]

    acquired = _DB_LOCK.acquire(timeout=120.0)
    if not acquired:
        raise sqlite3.OperationalError("parser DB lock timeout")

    try:
        conn = _raw_connect()
        return ParserConnection(conn, managed_close=True)  # type: ignore[return-value]
    except Exception:
        _DB_LOCK.release()
        raise


def ensure_parser_storage() -> None:
    """Один раз на цикл парсингу: таблиці + міграції."""
    from parser.storage.channel_cursors import ensure_parser_cursors_table
    from parser.storage.parsed_items import ensure_parsed_items_table
    from parser.storage.parser_accounts_db import (
        ensure_parser_accounts_table,
        migrate_env_accounts_if_empty,
    )

    ensure_parsed_items_table()
    ensure_parser_cursors_table()
    ensure_parser_accounts_table()
    migrate_env_accounts_if_empty()
