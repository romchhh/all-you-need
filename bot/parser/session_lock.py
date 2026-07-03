"""
Глобальні asyncio-локи для Pyrogram-сесій.

Один .session — це SQLite; паралельний доступ (парсер + DM автору при approve)
дає OperationalError: database is locked.
"""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

GLOBAL_PARSER_RUN_LOCK = asyncio.Lock()

PARSER_SESSION_LOCK = asyncio.Lock()
SERVICES_SESSION_LOCK = asyncio.Lock()
FALLBACK_SESSION_LOCK = asyncio.Lock()

_SESSION_LOCKS: dict[str, asyncio.Lock] = {
    "parser_session": PARSER_SESSION_LOCK,
    "parser_services_session": SERVICES_SESSION_LOCK,
    "parser_fallback_session": FALLBACK_SESSION_LOCK,
}


def lock_for_session(session_path: Path | str) -> asyncio.Lock:
    name = Path(session_path).name
    if name.endswith(".session"):
        name = name[: -len(".session")]
    return _SESSION_LOCKS.get(name, PARSER_SESSION_LOCK)


@asynccontextmanager
async def pyrogram_session_guard(session_path: Path | str, timeout: float = 600):
    """
    Ексклюзивний доступ до Pyrogram-сесії в межах одного event loop.
    timeout — макс. очікування (сек); для approve зазвичай достатньо дочекатись циклу парсера.
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
