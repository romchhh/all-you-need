"""Pyrogram-акаунти PARSER_ACCOUNT_1..3 (+ короткий legacy PARSER_API_* для акаунта 1)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from parser.config.settings import _env_int, _env_str, load_dotenv_once

load_dotenv_once()

_PARSER_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class ParserAccountConfig:
    """Один Pyrogram-акаунт з .env (PARSER_ACCOUNT_N_*)."""

    index: int
    api_id: int
    api_hash: str
    phone: str
    telegram_id: int
    username: str
    session_path: Path

    def is_configured(self) -> bool:
        return bool(self.api_id and self.api_hash and self.phone)

    @property
    def label(self) -> str:
        return f"account_{self.index}"


def _session_path_for(index: int) -> Path:
    new_path = _PARSER_DIR / f"parser_account_{index}"
    new_session = new_path.parent / f"{new_path.name}.session"
    if new_session.exists():
        return new_path

    legacy = {
        1: (_PARSER_DIR / "parser_session",),
        2: (_PARSER_DIR / "parser_services_session", _PARSER_DIR / "parser_fallback_session"),
        3: (_PARSER_DIR / "parser_fallback_session",),
    }.get(index, ())
    for old in legacy:
        if (old.parent / f"{old.name}.session").exists():
            return old
    return new_path


def _account_1() -> ParserAccountConfig | None:
    api_id = _env_int("PARSER_ACCOUNT_1_API_ID") or _env_int("PARSER_API_ID")
    api_hash = _env_str("PARSER_ACCOUNT_1_API_HASH") or _env_str("PARSER_API_HASH")
    phone = _env_str("PARSER_ACCOUNT_1_PHONE") or _env_str("PARSER_PHONE")
    if not (api_id and api_hash and phone):
        return None
    telegram_id = _env_int("PARSER_ACCOUNT_1_TELEGRAM_ID") or _env_int("PARSER_BOT_TELEGRAM_ID")
    username = (_env_str("PARSER_ACCOUNT_1_USERNAME") or "parser_bot").lstrip("@")
    return ParserAccountConfig(
        index=1,
        api_id=api_id,
        api_hash=api_hash,
        phone=phone,
        telegram_id=telegram_id,
        username=username,
        session_path=_session_path_for(1),
    )


def load_parser_account_configs(max_accounts: int = 3) -> list[ParserAccountConfig]:
    """Завантажує PARSER_ACCOUNT_1..N (порожні слоти пропускає)."""
    accounts: list[ParserAccountConfig] = []
    for i in range(1, max_accounts + 1):
        if i == 1:
            acc = _account_1()
            if acc:
                accounts.append(acc)
            continue

        api_id = _env_int(f"PARSER_ACCOUNT_{i}_API_ID")
        api_hash = _env_str(f"PARSER_ACCOUNT_{i}_API_HASH")
        phone = _env_str(f"PARSER_ACCOUNT_{i}_PHONE")
        if not (api_id and api_hash and phone):
            continue

        telegram_id = _env_int(f"PARSER_ACCOUNT_{i}_TELEGRAM_ID")
        username = (_env_str(f"PARSER_ACCOUNT_{i}_USERNAME") or "parser_bot").lstrip("@")
        accounts.append(
            ParserAccountConfig(
                index=i,
                api_id=api_id,
                api_hash=api_hash,
                phone=phone,
                telegram_id=telegram_id,
                username=username,
                session_path=_session_path_for(i),
            )
        )
    return accounts


_ACCOUNTS = load_parser_account_configs(3)
_PRIMARY = _ACCOUNTS[0] if _ACCOUNTS else None

PARSER_BOT_TELEGRAM_ID: int = (
    (_PRIMARY.telegram_id if _PRIMARY else 0)
    or _env_int("PARSER_BOT_TELEGRAM_ID")
    or 8590825131
)
PARSER_API_ID: int = _PRIMARY.api_id if _PRIMARY else 0
PARSER_API_HASH: str = _PRIMARY.api_hash if _PRIMARY else ""
PARSER_PHONE: str = _PRIMARY.phone if _PRIMARY else ""
PARSER_SESSION_PATH = _PRIMARY.session_path if _PRIMARY else _PARSER_DIR / "parser_account_1"
