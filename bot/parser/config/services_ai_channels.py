"""Джерела та модерація для парсера послуг (лише Telegram-канал, без маркетплейсу)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from parser.config.channels import dedupe_channels, normalize_channel_key, service_channels_map

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger(__name__)

# Група/канал модерації для цього парсера.
SERVICES_AI_MODERATION_CHANNEL_ID: int = int(
    os.getenv("PARSER_SERVICES_AI_MODERATION_CHANNEL_ID", "-1003901841142")
)

PARSER_TYPE_SERVICES_CHANNEL = "services_channel"


def _extra_channels_from_env() -> dict[str, str]:
    """Опційні додаткові джерела (рідко потрібно — за замовч. ті самі, що SERVICE_CHANNELS)."""
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


# Ті самі канали послуг, що й для маркетплейсу (beauty_berlin_ua, BeautyNRW, …).
SERVICES_AI_CHANNELS: dict[str, str] = dedupe_channels(
    {**service_channels_map(), **_extra_channels_from_env()}
)


def services_ai_parser_enabled() -> bool:
    raw = (os.getenv("PARSER_SERVICES_AI_ENABLED") or "1").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if not SERVICES_AI_CHANNELS:
        return False
    return True
