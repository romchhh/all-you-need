"""Спільний пул Pyrogram-акаунтів: один main на товари + послуги, опційно fallback."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from parser.moderation.config import (
    PARSER_API_HASH,
    PARSER_API_ID,
    PARSER_FALLBACK_API_HASH,
    PARSER_FALLBACK_API_ID,
    PARSER_FALLBACK_ENABLED,
    PARSER_FALLBACK_PHONE,
    PARSER_FALLBACK_SESSION_PATH,
    PARSER_PHONE,
    PARSER_SESSION_PATH,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PyrogramAccount:
    label: str
    api_id: int
    api_hash: str
    phone: str
    session_path: Path
    priority: int

    def is_configured(self) -> bool:
        return bool(self.api_id and self.api_hash and self.phone)

    @property
    def phone_tail(self) -> str:
        digits = "".join(c for c in self.phone if c.isdigit())
        return digits[-4:] if len(digits) >= 4 else "????"

    @property
    def dedupe_key(self) -> tuple[int, str]:
        return (self.api_id, _normalize_phone(self.phone))


def _normalize_phone(phone: str) -> str:
    return "".join(c for c in (phone or "") if c.isdigit())


def _account_from_env(
    *,
    label: str,
    priority: int,
    api_id: int,
    api_hash: str,
    phone: str,
    session_path: Path,
) -> PyrogramAccount | None:
    if not (api_id and api_hash and phone):
        return None
    return PyrogramAccount(
        label=label,
        api_id=int(api_id),
        api_hash=api_hash,
        phone=phone.strip(),
        session_path=session_path,
        priority=priority,
    )


def list_parser_accounts() -> list[PyrogramAccount]:
    """
    За замовчуванням лише main (parser_session) — і /parse товари, і /parse_services послуги.
    Другий акаунт лише якщо PARSER_FALLBACK_ENABLED=1.
    """
    candidates: list[PyrogramAccount] = []
    main = _account_from_env(
        label="main",
        priority=0,
        api_id=PARSER_API_ID,
        api_hash=PARSER_API_HASH,
        phone=PARSER_PHONE,
        session_path=PARSER_SESSION_PATH,
    )
    if main:
        candidates.append(main)

    if PARSER_FALLBACK_ENABLED:
        fallback = _account_from_env(
            label="fallback",
            priority=1,
            api_id=PARSER_FALLBACK_API_ID,
            api_hash=PARSER_FALLBACK_API_HASH,
            phone=PARSER_FALLBACK_PHONE,
            session_path=PARSER_FALLBACK_SESSION_PATH,
        )
        if fallback:
            candidates.append(fallback)

    seen: set[tuple[int, str]] = set()
    out: list[PyrogramAccount] = []
    for acc in sorted(candidates, key=lambda a: a.priority):
        if acc.dedupe_key in seen:
            continue
        if acc.label == "fallback" and _normalize_phone(acc.phone) == _normalize_phone(PARSER_PHONE):
            logger.warning("PARSER_FALLBACK_PHONE збігається з main — пропускаємо fallback")
            continue
        seen.add(acc.dedupe_key)
        out.append(acc)
    return out


def primary_parser_account() -> PyrogramAccount | None:
    accounts = list_parser_accounts()
    return accounts[0] if accounts else None


def fallback_accounts_after(primary: PyrogramAccount) -> list[PyrogramAccount]:
    """Інші акаунти для retry після FloodWait."""
    if not PARSER_FALLBACK_ENABLED:
        return []
    accounts = list_parser_accounts()
    rest = [a for a in accounts if a.dedupe_key != primary.dedupe_key]
    rest.sort(key=lambda a: (0 if a.label == "fallback" else 1, a.priority))
    return rest


def is_flood_limit_error(err: BaseException) -> bool:
    try:
        from pyrogram.errors import FloodWait
    except ImportError:
        FloodWait = None  # type: ignore[misc, assignment]

    if FloodWait is not None and isinstance(err, FloodWait):
        return True
    text = str(err)
    low = text.lower()
    return bool(
        re.search(r"FLOOD_WAIT_(\d+)", text)
        or "floodwait" in low
        or "peer_flood" in low
        or ("flood" in low and "wait" in low)
        or ("flood" in low and "limited" in low)
    )
