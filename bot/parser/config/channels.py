"""Конфігурація Telegram-каналів для парсера (похідна від config/groups.py)."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

from parser.config.groups import GROUPS, ParserGroup, enabled_groups

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger(__name__)


def normalize_channel_key(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    s = re.sub(r"^https?://(?:www\.)?t\.me/", "t.me/", s, flags=re.IGNORECASE).rstrip("/")
    if s.startswith("@"):
        s = s[1:]
    if s.lower().startswith("t.me/"):
        return s
    return s.lower()


def dedupe_channels(channels: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    seen_original: dict[str, str] = {}
    for k, city in channels.items():
        nk = normalize_channel_key(k)
        if not nk:
            continue
        if nk in out and seen_original.get(nk) != k:
            logger.warning(
                "Duplicate parser channel key: %r and %r → using %r",
                seen_original.get(nk),
                k,
                city,
            )
        out[nk] = city
        seen_original[nk] = k
    return out


def _channels_from_env() -> dict[str, str]:
    raw = (os.getenv("PARSER_EXTRA_CHANNELS") or "").strip()
    if not raw:
        return {}
    extra: dict[str, str] = {}
    for part in raw.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        u, city = part.rsplit(":", 1)
        u = normalize_channel_key(u.strip())
        city = city.strip()
        if u and city:
            extra[u] = city
    return extra


_BASE_CHANNELS: dict[str, str] = {g.key: g.city for g in enabled_groups()}

BEAUTY_SERVICE_CHANNELS: frozenset[str] = frozenset(
    normalize_channel_key(g.key)
    for g in enabled_groups()
    if g.kind == "services" and g.default_subcategory == "beauty_services"
)

SERVICE_ONLY_CHANNELS: frozenset[str] = frozenset(
    normalize_channel_key(g.key)
    for g in enabled_groups()
    if g.kind == "services" and g.default_subcategory != "beauty_services"
)

SERVICE_CHANNELS: frozenset[str] = BEAUTY_SERVICE_CHANNELS | SERVICE_ONLY_CHANNELS

CHANNELS_STRIP_TRAILING_LINK: dict[str, re.Pattern] = {
    normalize_channel_key(g.key): re.compile(
        rf"(?:\n\s*|\s+)"
        rf"(?:"
        rf"https?://(?:www\.)?t\.me/{re.escape(g.key)}"
        rf"|(?:www\.)?t\.me/{re.escape(g.key)}"
        rf"|@{re.escape(g.key)}"
        rf")\s*$",
        re.IGNORECASE,
    )
    for g in enabled_groups()
    if g.strip_trailing_link and not g.key.startswith("http")
}

CHANNELS: dict[str, str] = dedupe_channels({**_BASE_CHANNELS, **_channels_from_env()})


def service_channels_map() -> dict[str, str]:
    """Канали послуг з загального CHANNELS (оригінальний ключ → місто)."""
    out: dict[str, str] = {}
    for key, city in CHANNELS.items():
        if normalize_channel_key(key) in SERVICE_CHANNELS:
            out[key] = city
    missing = SERVICE_CHANNELS - {normalize_channel_key(k) for k in out}
    for svc in sorted(missing):
        logger.warning("SERVICE_CHANNELS: %r не знайдено в CHANNELS — додайте в config/groups.py", svc)
    return out


def group_kind_for_channel(channel_key: str) -> str:
    """Повертає 'goods' | 'services' для ключа каналу."""
    nk = normalize_channel_key(channel_key)
    if nk in SERVICE_CHANNELS:
        return "services"
    return "goods"


def find_group(channel_key: str) -> ParserGroup | None:
    nk = normalize_channel_key(channel_key)
    for g in GROUPS:
        if normalize_channel_key(g.key) == nk:
            return g
    return None


PARSER_TYPE_SERVICES_CHANNEL = "services_channel"


def _services_ai_extra_from_env() -> dict[str, str]:
    raw = (os.getenv("PARSER_SERVICES_AI_CHANNELS") or "").strip()
    if not raw:
        return {}
    extra: dict[str, str] = {}
    for part in raw.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        u, city = part.rsplit(":", 1)
        u = normalize_channel_key(u.strip())
        city = city.strip()
        if u and city:
            extra[u] = city
    return extra


SERVICES_AI_CHANNELS: dict[str, str] = dedupe_channels(
    {**service_channels_map(), **_services_ai_extra_from_env()}
)


def services_ai_parser_enabled() -> bool:
    raw = (os.getenv("PARSER_SERVICES_AI_ENABLED") or "1").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    return bool(SERVICES_AI_CHANNELS)
