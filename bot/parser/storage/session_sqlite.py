"""Підготовка Pyrogram .session (SQLite) перед стартом Client."""

from __future__ import annotations

import logging
import sqlite3
import time
from pathlib import Path

from parser.storage.connection import is_sqlite_locked_error

logger = logging.getLogger(__name__)

_PREPARE_RETRIES = 10


def prepare_pyrogram_session(session_path: Path | str) -> None:
    """
    WAL + busy_timeout на файлі сесії Pyrogram.
    Зменшує «database is locked» при послідовному відкритті багатьох акаунтів.
    """
    session_file = Path(f"{session_path}.session")
    if not session_file.is_file():
        return

    last_err: Exception | None = None
    for attempt in range(_PREPARE_RETRIES):
        try:
            conn = sqlite3.connect(
                str(session_file),
                timeout=60.0,
                check_same_thread=False,
                isolation_level=None,
            )
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=60000")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
            conn.close()
            return
        except sqlite3.OperationalError as e:
            last_err = e
            if is_sqlite_locked_error(e) and attempt < _PREPARE_RETRIES - 1:
                wait = min(1.0 * (2**attempt), 15.0)
                logger.warning(
                    "Pyrogram session prepare retry %s/%s for %s (%.1fs)",
                    attempt + 1,
                    _PREPARE_RETRIES,
                    session_file.name,
                    wait,
                )
                time.sleep(wait)
                continue
            raise
    if last_err:
        raise last_err


def release_pyrogram_session(session_path: Path | str) -> None:
    """Після disconnect — passive checkpoint, щоб наступний акаунт швидше отримав файл."""
    session_file = Path(f"{session_path}.session")
    if not session_file.is_file():
        return
    try:
        conn = sqlite3.connect(str(session_file), timeout=10.0, isolation_level=None)
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        conn.close()
    except Exception as e:
        logger.debug("session release checkpoint %s: %s", session_file.name, e)
