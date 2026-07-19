"""Налаштування парсера з .env."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ENV_LOADED = False
_BOT_ROOT = Path(__file__).resolve().parent.parent.parent


def load_dotenv_once() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    load_dotenv(_BOT_ROOT / ".env")
    _ENV_LOADED = True


def _env_int(key: str, default: int = 0) -> int:
    raw = (os.getenv(key) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_str(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def _env_bool(key: str, default: bool = True) -> bool:
    raw = (os.getenv(key) or "").strip().lower()
    if not raw:
        return default
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    return default


load_dotenv_once()

WEBAPP_URL: str = os.getenv("WEBAPP_URL", "https://allyouneed.de")
BOT_USERNAME: str = (os.getenv("BOT_USERNAME") or "").lstrip("@")

FETCH_LIMIT: int = max(1, _env_int("PARSER_FETCH_LIMIT", 100))
PARSER_SERVICES_FETCH_LIMIT: int = max(
    1,
    _env_int("PARSER_SERVICES_FETCH_LIMIT", _env_int("PARSER_FETCH_LIMIT", 100)),
)
PARSER_SERVICES_IGNORE_CURSOR: bool = _env_bool("PARSER_SERVICES_IGNORE_CURSOR", False)
# Скільки останніх message_id перечитати поверх cursor (пропущені через збій / гонки).
PARSER_CURSOR_OVERLAP: int = max(0, _env_int("PARSER_CURSOR_OVERLAP", 25))

PARSER_DEDUP_ENABLED: bool = _env_bool("PARSER_DEDUP_ENABLED", True)
PARSER_SERVICES_DEDUP_ENABLED: bool = _env_bool("PARSER_SERVICES_DEDUP_ENABLED", True)
PARSER_DEDUP_DAYS: int = max(1, _env_int("PARSER_DEDUP_DAYS", 14))
# Вікно dedup_key (title+desc+price) для services_channel approved без MP
PARSER_TEXT_DEDUP_DAYS: int = max(
    1,
    _env_int("PARSER_TEXT_DEDUP_DAYS", min(2, PARSER_DEDUP_DAYS)),
)
# Pending у модерації блокує повтор лише N годин (repost з новим message_id проходить швидше)
PARSER_PENDING_DEDUP_HOURS: int = max(
    1,
    _env_int("PARSER_PENDING_DEDUP_HOURS", 36),
)

PARSER_FUZZY_DEDUP_ENABLED: bool = _env_bool("PARSER_FUZZY_DEDUP", True)
PARSER_FUZZY_DEDUP_SAME_CHANNEL: bool = _env_bool("PARSER_FUZZY_DEDUP_SAME_CHANNEL", True)
PARSER_FUZZY_DEDUP_THRESHOLD: float = float(os.getenv("PARSER_FUZZY_DEDUP_THRESHOLD", "0.94"))
PARSER_EMBEDDING_MODEL: str = (_env_str("PARSER_EMBEDDING_MODEL") or "text-embedding-3-small")

# ── Групи модерації парсера (3 потоки) ─────────
# 1) Послуги → канал Hamburg + маркетплейс
PARSER_MOD_SERVICES_HAMBURG_ID: int = _env_int(
    "PARSER_MOD_SERVICES_HAMBURG_ID",
    -1003796207726,
)
# 2) Послуги → канал Germany + маркетплейс
PARSER_MOD_SERVICES_GERMANY_ID: int = _env_int(
    "PARSER_MOD_SERVICES_GERMANY_ID",
    -1003714727651,
)
# 3) Товари → лише маркетплейс
PARSER_MOD_GOODS_ID: int = _env_int(
    "PARSER_MOD_GOODS_ID",
    -1003901841142,
)

# Legacy aliases (старі імпорти / .env ключі)
SERVICES_MODERATION_CHANNEL_ID: int = PARSER_MOD_SERVICES_GERMANY_ID
SERVICES_AI_MODERATION_CHANNEL_ID: int = PARSER_MOD_SERVICES_HAMBURG_ID
PARSER_GROUP_ID_DEFAULT: int = PARSER_MOD_GOODS_ID

PARSER_INTERVAL_MIN: float = float(os.getenv("PARSER_INTERVAL_MIN", "30"))
PARSER_SERVICES_AI_INTERVAL_MIN: float = float(
    os.getenv("PARSER_SERVICES_AI_INTERVAL_MIN", os.getenv("PARSER_INTERVAL_MIN", "30"))
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
PHOTOS_DIR = REPO_ROOT / "database" / "parsed_photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
