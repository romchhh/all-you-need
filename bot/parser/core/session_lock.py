"""
Глобальні asyncio-локи для Pyrogram-сесій.

Один .session — це SQLite; паралельний доступ (парсер + DM + другий процес)
дає database is locked.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

GLOBAL_PARSER_RUN_LOCK = asyncio.Lock()

_SESSION_LOCKS: dict[str, asyncio.Lock] = {}
_FILE_LOCK_HOLDER: dict[str, object] = {}


def lock_for_session(session_path: Path | str) -> asyncio.Lock:
    name = Path(session_path).name
    if name.endswith(".session"):
        name = name[: -len(".session")]
    lock = _SESSION_LOCKS.get(name)
    if lock is None:
        lock = asyncio.Lock()
        _SESSION_LOCKS[name] = lock
    return lock


async def wait_for_parser_idle(
    *,
    max_wait_sec: float = 300.0,
    poll_sec: float = 5.0,
) -> bool:
    """True — парсер не тримає GLOBAL_PARSER_RUN_LOCK."""
    if not GLOBAL_PARSER_RUN_LOCK.locked():
        return True
    attempts = max(1, int(max_wait_sec / poll_sec))
    for _ in range(attempts):
        await asyncio.sleep(poll_sec)
        if not GLOBAL_PARSER_RUN_LOCK.locked():
            return True
    return not GLOBAL_PARSER_RUN_LOCK.locked()


@asynccontextmanager
async def pyrogram_session_guard(session_path: Path | str, timeout: float = 600):
    """
    Ексклюзивний доступ до Pyrogram-сесії (asyncio + flock на .session.lock).
    """
    lock = lock_for_session(session_path)
    file_timeout = min(float(timeout), 180.0)
    try:
        await asyncio.wait_for(lock.acquire(), timeout=timeout)
    except asyncio.TimeoutError:
        raise RuntimeError(
            f"Pyrogram session {Path(session_path).name} зайнята довше {timeout}s"
        ) from None

    loop = asyncio.get_running_loop()

    def _acquire_file_lock() -> str:
        from parser.storage.session_sqlite import PyrogramSessionFileLock

        lock = PyrogramSessionFileLock(session_path)
        lock.acquire(timeout=file_timeout)
        key = str(Path(session_path).resolve())
        _FILE_LOCK_HOLDER[key] = lock
        return key

    def _release_file_lock(key: str) -> None:
        lock = _FILE_LOCK_HOLDER.pop(key, None)
        if lock is not None:
            lock.release()

    file_key = await loop.run_in_executor(None, _acquire_file_lock)
    try:
        yield
    finally:
        await loop.run_in_executor(None, _release_file_lock, file_key)
        lock.release()
