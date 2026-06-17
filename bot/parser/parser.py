"""
Публічний API парсера (зворотна сумісність).

Нова структура:
  parser/config/   — канали та налаштування
  parser/core/     — текст, якість, парсинг каналів
  parser/storage/  — БД parsed_items та маркетплейс
  parser/moderation/ — підтвердження / відхилення
"""

from parser.config.channels import (
    BEAUTY_SERVICE_CHANNELS,
    CHANNELS,
    CHANNELS_STRIP_TRAILING_LINK,
    SERVICE_CHANNELS,
    SERVICE_ONLY_CHANNELS,
    dedupe_channels,
    normalize_channel_key,
)
from parser.config.settings import FETCH_LIMIT, PHOTOS_DIR, SERVICES_MODERATION_CHANNEL_ID
from parser.core.photos import download_photos
from parser.core.quality import (
    has_too_many_emojis,
    is_likely_not_listing,
    is_likely_service_ad,
    is_quality,
)
from parser.core.runner import parse_channel, run_all_channels
from parser.core.telegram_meta import get_sender_id, get_sender_username, message_link
from parser.core.text import (
    clean_channel_post_text,
    detect_condition,
    detect_lang,
    enrich_description,
    extract_description,
    extract_title,
    parse_price,
    to_plain_str as _to_plain_str,
)

__all__ = [
    "BEAUTY_SERVICE_CHANNELS",
    "CHANNELS",
    "CHANNELS_STRIP_TRAILING_LINK",
    "FETCH_LIMIT",
    "PHOTOS_DIR",
    "SERVICE_CHANNELS",
    "SERVICE_ONLY_CHANNELS",
    "SERVICES_MODERATION_CHANNEL_ID",
    "clean_channel_post_text",
    "dedupe_channels",
    "detect_condition",
    "detect_lang",
    "download_photos",
    "enrich_description",
    "extract_description",
    "extract_title",
    "get_sender_id",
    "get_sender_username",
    "has_too_many_emojis",
    "is_likely_not_listing",
    "is_likely_service_ad",
    "is_quality",
    "message_link",
    "normalize_channel_key",
    "parse_channel",
    "parse_price",
    "run_all_channels",
]
