"""Підготовка Pyrogram .session (SQLite) перед стартом Client."""

from __future__ import annotations

import logging
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from parser.storage.connection import is_sqlite_locked_error

try:
    import fcntl
except ImportError:  # Windows
    fcntl = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

_PREPARE_RETRIES = 12
_DEFAULT_FILE_LOCK_TIMEOUT = 180.0


class PyrogramSessionFileLock:
    """Міжпроцесне блокування .session (bot на хості + Docker, DM + парсер)."""

    def __init__(self, session_path: Path | str):
        stem = Path(session_path)
        if stem.suffix == ".session":
            stem = stem.with_suffix("")
        self.session_file = Path(f"{stem}.session")
        self.lock_path = self.session_file.with_name(self.session_file.name + ".lock")
        self._fp = None

    def acquire(self, timeout: float = _DEFAULT_FILE_LOCK_TIMEOUT) -> None:
        if fcntl is None:
            return
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        self._fp = open(self.lock_path, "a+")
        deadline = time.time() + max(1.0, timeout)
        while True:
            try:
                fcntl.flock(self._fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                return
            except BlockingIOError:
                if time.time() >= deadline:
                    raise sqlite3.OperationalError(
                        f"database is locked ({self.session_file.name})"
                    )
                time.sleep(0.25)

    def release(self) -> None:
        if fcntl is None or self._fp is None:
            return
        try:
            fcntl.flock(self._fp.fileno(), fcntl.LOCK_UN)
        finally:
            self._fp.close()
            self._fp = None


@contextmanager
def hold_pyrogram_session_file(
    session_path: Path | str,
    *,
    timeout: float = _DEFAULT_FILE_LOCK_TIMEOUT,
) -> Iterator[None]:
    lock = PyrogramSessionFileLock(session_path)
    lock.acquire(timeout)
    try:
        yield
    finally:
        lock.release()


def prepare_pyrogram_session(session_path: Path | str) -> None:
    """
    WAL + busy_timeout на файлі сесії Pyrogram.
    Викликати лише всередині hold_pyrogram_session_file / pyrogram_session_guard.
    """
    session_file = Path(f"{session_path}.session")
    if not session_file.is_file():
        return

    last_err: Exception | None = None
    for attempt in range(_PREPARE_RETRIES):
        try:
            conn = sqlite3.connect(
                str(session_file),
                timeout=90.0,
                check_same_thread=False,
                isolation_level=None,
            )
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=90000")
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
        with hold_pyrogram_session_file(session_path, timeout=30.0):
            conn = sqlite3.connect(
                str(session_file),
                timeout=15.0,
                isolation_level=None,
            )
            conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
            conn.close()
    except Exception as e:
        logger.debug("session release checkpoint %s: %s", session_file.name, e)
