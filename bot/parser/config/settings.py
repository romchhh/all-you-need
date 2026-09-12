"""Налаштування парсера: секрети з .env, обсяг/авто — tuning.py."""

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

from parser.config import tuning as _tuning

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
# Звичайний /parse і шедулер: 0 = cursor+overlap (лише нові пости — рекомендовано).
# >0 = завжди останні N (ignore cursor) — багато «дублікат (оголошення)» на кожному циклі.

# ── Обсяг парсера / автопублікація (bot/parser/config/tuning.py) ──
PARSER_INTERVAL_MIN: float = _tuning.PARSER_INTERVAL_MIN
PARSER_ROLLING_LOOKBACK: int = max(0, _tuning.PARSER_ROLLING_LOOKBACK)
PARSER_DEDUP_ENABLED: bool = _tuning.PARSER_DEDUP_ENABLED

PARSER_AUTO_APPROVE_ENABLED: bool = _env_bool(
    "PARSER_AUTO_APPROVE_ENABLED", _tuning.PARSER_AUTO_APPROVE_ENABLED
)
PARSER_AUTO_APPROVE_DAILY_LIMIT: int = max(
    1,
    min(_tuning.PARSER_AUTO_APPROVE_DAILY_LIMIT_MAX, _tuning.PARSER_AUTO_APPROVE_DAILY_LIMIT),
)
PARSER_AUTO_APPROVE_INTERVAL_MIN: float = _tuning.PARSER_AUTO_APPROVE_INTERVAL_MIN
PARSER_AUTO_APPROVE_MAX_PER_CHANNEL: int = max(1, _tuning.PARSER_AUTO_APPROVE_MAX_PER_CHANNEL)
PARSER_AUTO_APPROVE_MAX_PER_CATEGORY: int = max(1, _tuning.PARSER_AUTO_APPROVE_MAX_PER_CATEGORY)
PARSER_AUTO_APPROVE_MAX_AGE_HOURS: int = max(1, _tuning.PARSER_AUTO_APPROVE_MAX_AGE_HOURS)
PARSER_AUTO_APPROVE_BATCH: int = max(
    1,
    min(_tuning.PARSER_AUTO_APPROVE_BATCH_MAX, _tuning.PARSER_AUTO_APPROVE_BATCH),
)
PARSER_AUTO_APPROVE_WAVE_MINUTES: int = max(
    _tuning.PARSER_AUTO_APPROVE_WAVE_MINUTES_MIN,
    min(_tuning.PARSER_AUTO_APPROVE_WAVE_MINUTES_MAX, _tuning.PARSER_AUTO_APPROVE_WAVE_MINUTES),
)
PARSER_AUTO_APPROVE_SERVICES_CHANNEL: bool = _env_bool(
    "PARSER_AUTO_APPROVE_SERVICES_CHANNEL", _tuning.PARSER_AUTO_APPROVE_SERVICES_CHANNEL
)
PARSER_AUTO_APPROVE_MANUAL_DRAIN_ROUNDS: int = max(
    1, _tuning.PARSER_AUTO_APPROVE_MANUAL_DRAIN_ROUNDS
)
PARSER_AUTO_APPROVE_TARGET_RATIO: float = max(
    0.0, min(1.0, float(_tuning.PARSER_AUTO_APPROVE_TARGET_RATIO))
)

PARSER_MP_DEDUP_CLEANUP_ENABLED: bool = _tuning.PARSER_MP_DEDUP_CLEANUP_ENABLED
PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN: float = max(
    15.0, float(_tuning.PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN)
)
PARSER_MP_DEDUP_CLEANUP_LOOKBACK_DAYS: int = max(
    7, int(_tuning.PARSER_MP_DEDUP_CLEANUP_LOOKBACK_DAYS)
)

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
    _env_int("PARSER_PENDING_DEDUP_HOURS", 12),
)

PARSER_FUZZY_DEDUP_ENABLED: bool = _env_bool("PARSER_FUZZY_DEDUP", False)
PARSER_FUZZY_DEDUP_SAME_CHANNEL: bool = _env_bool("PARSER_FUZZY_DEDUP_SAME_CHANNEL", True)
PARSER_FUZZY_DEDUP_THRESHOLD: float = float(os.getenv("PARSER_FUZZY_DEDUP_THRESHOLD", "0.96"))
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

PARSER_SERVICES_AI_INTERVAL_MIN: float = _tuning.PARSER_INTERVAL_MIN

# Максимум фото на одне parsed_items (жорстко не більше 3)
PARSER_MAX_PHOTOS: int = min(3, max(1, _env_int("PARSER_MAX_PHOTOS", 3)))

# Автоочистка parsed_photos (після циклу парсингу + cron/APScheduler)
PARSER_PHOTOS_AUTO_CLEANUP: bool = _env_bool("PARSER_PHOTOS_AUTO_CLEANUP", True)
PARSER_PHOTOS_CLEANUP_DAYS: int = max(1, _env_int("PARSER_PHOTOS_CLEANUP_DAYS", 7))
PARSER_PHOTOS_PUBLIC_ORPHAN_DAYS: int = max(0, _env_int("PARSER_PHOTOS_PUBLIC_ORPHAN_DAYS", 7))
# public/listings/originals — важкий прохід на малому VPS; за замовчуванням вимкнено в авто-режимі
PARSER_PHOTOS_CLEANUP_PUBLIC: bool = _env_bool("PARSER_PHOTOS_CLEANUP_PUBLIC", False)

# Тиша для Telegram-каналів послуг (Europe/Kyiv): з quiet_start до quiet_end не публікуємо
PARSER_CHANNEL_QUIET_START_HOUR: int = max(0, min(23, _env_int("PARSER_CHANNEL_QUIET_START_HOUR", 22)))
PARSER_CHANNEL_QUIET_END_HOUR: int = max(0, min(23, _env_int("PARSER_CHANNEL_QUIET_END_HOUR", 6)))
PARSER_CHANNEL_QUIET_TZ: str = _env_str("PARSER_CHANNEL_QUIET_TZ", "Europe/Kyiv") or "Europe/Kyiv"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
PHOTOS_DIR = REPO_ROOT / "database" / "parsed_photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
