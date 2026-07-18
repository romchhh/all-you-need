"""
Глобальні asyncio-локи для Pyrogram-сесій.

Один .session — це SQLite; паралельний доступ дає database is locked.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

GLOBAL_PARSER_RUN_LOCK = asyncio.Lock()

_SESSION_LOCKS: dict[str, asyncio.Lock] = {
    "parser_account_1": asyncio.Lock(),
    "parser_account_2": asyncio.Lock(),
    "parser_account_3": asyncio.Lock(),
    "parser_session": asyncio.Lock(),
    "parser_services_session": asyncio.Lock(),
    "parser_fallback_session": asyncio.Lock(),
}


def lock_for_session(session_path: Path | str) -> asyncio.Lock:
    name = Path(session_path).name
    if name.endswith(".session"):
        name = name[: -len(".session")]
    lock = _SESSION_LOCKS.get(name)
    if lock is None:
        lock = asyncio.Lock()
        _SESSION_LOCKS[name] = lock
    return lock


@asynccontextmanager
async def pyrogram_session_guard(session_path: Path | str, timeout: float = 600):
    """
    Ексклюзивний доступ до Pyrogram-сесії в межах одного event loop.
    """
    lock = lock_for_session(session_path)
    try:
        await asyncio.wait_for(lock.acquire(), timeout=timeout)
    except asyncio.TimeoutError:
        raise RuntimeError(
            f"Pyrogram session {Path(session_path).name} зайнята довше {timeout}s"
        ) from None
    try:
        yield
    finally:
        lock.release()
