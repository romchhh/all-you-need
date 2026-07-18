"""Пул Pyrogram-акаунтів з БД (адмін-панель) + round-robin."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

from parser.storage import parser_accounts_db as accounts_db

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PyrogramAccount:
    id: int
    label: str
    api_id: int
    api_hash: str
    phone: str
    session_path: Path
    priority: int
    telegram_id: int = 0
    username: str = ""

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


def _row_to_account(row: dict, priority: int) -> PyrogramAccount | None:
    api_id = int(row.get("api_id") or 0)
    api_hash = str(row.get("api_hash") or "").strip()
    phone = str(row.get("phone") or "").strip()
    if not (api_id and api_hash and phone):
        return None
    session_name = str(row.get("session_name") or f"parser_account_{row['id']}")
    return PyrogramAccount(
        id=int(row["id"]),
        label=f"account_{row['id']}",
        api_id=api_id,
        api_hash=api_hash,
        phone=phone,
        session_path=accounts_db.session_path_for(session_name),
        priority=priority,
        telegram_id=int(row.get("telegram_id") or 0),
        username=str(row.get("username") or "").lstrip("@"),
    )


def list_parser_accounts(*, include_flooded: bool = False) -> list[PyrogramAccount]:
    """Увімкнені акаунти зі статусом active/pending (або всі без flood)."""
    accounts_db.ensure_parser_accounts_table()
    now = time.time()
    seen: set[tuple[int, str]] = set()
    out: list[PyrogramAccount] = []
    for i, row in enumerate(accounts_db.list_accounts(enabled_only=True)):
        status = (row.get("status") or "active").strip().lower()
        if status in ("pending", "disabled"):
            continue
        flood_until = float(row.get("flood_until") or 0)
        if not include_flooded and flood_until > now:
            continue
        if status == "flood" and flood_until <= now:
            accounts_db.update_account(int(row["id"]), status="active", flood_until=0)

        acc = _row_to_account(row, priority=i)
        if not acc:
            continue
        if acc.dedupe_key in seen:
            logger.warning("Дубль акаунта id=%s — пропуск", acc.id)
            continue
        seen.add(acc.dedupe_key)
        # Сесія має існувати для парсингу
        session_file = Path(f"{acc.session_path}.session")
        if not session_file.is_file() and status != "pending":
            logger.warning(
                "Немає файлу сесії для %s (%s) — пропуск",
                acc.label,
                session_file,
            )
            continue
        out.append(acc)
    return out


def list_accounts_round_robin(*, for_dm: bool = False) -> list[PyrogramAccount]:
    """
    Акаунти в порядку round-robin.
    Parse: зсув стартового акаунта кожен цикл.
    DM: спочатку ті, кого давно не використовували для DM.
    """
    accounts = list_parser_accounts()
    if not accounts:
        return []

    if for_dm:
        rows = {int(r["id"]): r for r in accounts_db.list_accounts(enabled_only=True)}

        def dm_key(a: PyrogramAccount) -> tuple:
            row = rows.get(a.id) or {}
            return (float(row.get("last_dm_at") or 0), a.id)

        return sorted(accounts, key=dm_key)

    offset = accounts_db.next_rr_offset("parse_rr_cursor", len(accounts))
    return accounts[offset:] + accounts[:offset]


def fallback_accounts_after(primary: PyrogramAccount) -> list[PyrogramAccount]:
    accounts = list_parser_accounts(include_flooded=False)
    return [a for a in accounts if a.dedupe_key != primary.dedupe_key]


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


def extract_flood_wait_seconds(err: BaseException) -> int:
    try:
        from pyrogram.errors import FloodWait

        if isinstance(err, FloodWait):
            return int(getattr(err, "value", 0) or 0)
    except ImportError:
        pass
    m = re.search(r"FLOOD_WAIT_(\d+)", str(err))
    if m:
        return int(m.group(1))
    m = re.search(r"wait[^\d]*(\d+)", str(err), re.I)
    if m:
        return int(m.group(1))
    return 0
