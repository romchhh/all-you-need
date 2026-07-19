"""Пул Pyrogram-акаунтів з БД (адмін-панель) + round-robin."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

from parser.storage import parser_accounts_db as accounts_db

logger = logging.getLogger(__name__)

_PARSER_DIR = Path(__file__).resolve().parent.parent


def resolve_session_stem(acc: PyrogramAccount) -> Path | None:
    """
    Шлях сесії Pyrogram (без .session), де файл реально існує.
    Підтримує sessions/ та legacy bot/parser/parser_account_N.session.
    """
    candidates: list[Path] = [acc.session_path]
    sn = acc.session_path.name

    m = re.match(r"^parser_account_(\d+)$", sn)
    if m:
        candidates.append(_PARSER_DIR / f"parser_account_{m.group(1)}")

    m_mig = re.match(r"^parser_account_migrated_(\d+)$", sn)
    if m_mig:
        try:
            from parser.config.accounts import load_parser_account_configs

            for cfg in load_parser_account_configs(3):
                if cfg.index == int(m_mig.group(1)):
                    candidates.append(cfg.session_path)
                    break
        except Exception:
            pass

    candidates.append(_PARSER_DIR / sn)

    seen: set[str] = set()
    for stem in candidates:
        key = str(stem)
        if key in seen:
            continue
        seen.add(key)
        if Path(f"{stem}.session").is_file():
            return stem
    return None


def _with_resolved_session(acc: PyrogramAccount) -> PyrogramAccount | None:
    stem = resolve_session_stem(acc)
    if stem is None:
        return None
    if stem == acc.session_path:
        return acc
    return PyrogramAccount(
        id=acc.id,
        label=acc.label,
        api_id=acc.api_id,
        api_hash=acc.api_hash,
        phone=acc.phone,
        session_path=stem,
        priority=acc.priority,
        telegram_id=acc.telegram_id,
        username=acc.username,
    )


def diagnose_parser_accounts() -> dict[str, int]:
    """Чому list_parser_accounts() може бути порожнім (для логів / сповіщень)."""
    accounts_db.ensure_parser_accounts_table()
    now = time.time()
    rows = accounts_db.list_accounts(enabled_only=True)
    out = {
        "enabled": len(rows),
        "active": 0,
        "flooded": 0,
        "pending": 0,
        "disabled": 0,
        "missing_session": 0,
        "incomplete": 0,
    }
    for row in rows:
        status = (row.get("status") or "active").strip().lower()
        if status == "pending":
            out["pending"] += 1
            continue
        if status == "disabled":
            out["disabled"] += 1
            continue
        flood_until = float(row.get("flood_until") or 0)
        if flood_until > now:
            out["flooded"] += 1
            continue
        acc = _row_to_account(row, 0)
        if not acc:
            out["incomplete"] += 1
            continue
        if resolve_session_stem(acc) is None:
            out["missing_session"] += 1
            continue
        out["active"] += 1
    return out


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
        resolved = _with_resolved_session(acc)
        if not resolved:
            logger.warning(
                "Немає файлу сесії для %s (очікувалось %s.session або legacy у bot/parser/) — пропуск",
                acc.label,
                acc.session_path,
            )
            continue
        out.append(resolved)
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
