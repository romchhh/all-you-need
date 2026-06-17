"""Конфігурація Telegram-каналів для парсера."""

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger(__name__)

# username / invite link → місто
_BASE_CHANNELS: dict[str, str] = {
    # Berlin
    "baraholkaberlin": "Berlin",
    "kaufberli": "Berlin",
    "beauty_berlin_ua": "Berlin",
    "Berlin_UA2025": "Berlin",
    # Leipzig
    "Leipzig_Flohmarkt": "Leipzig",
    # Hamburg
    "secondhand_hh": "Hamburg",
    "HamburgBeauty": "Hamburg",
    "gamburg_baraxlanet": "Hamburg",
    "Hamburggggggg": "Hamburg",
    # Frankfurt
    "ukraincifrankfurt": "Frankfurt",
    "FrankfurtamMaincity": "Frankfurt",
    # Munich / Bayern
    "Flohmark11": "München",
    # Düsseldorf, Essen, NRW
    "komissionkaDusseldorf": "Düsseldorf",
    "komissionkaEssen": "Essen",
    "BeautyNRW": "NRW",
    "BeautyDusseldorf": "Düsseldorf",
    # Stuttgart
    "BaraholkaStuttgart": "Stuttgart",
    "UaStuttgart": "Stuttgart",
    # Cologne
    "keln3": "Köln",
    # Misc / multi-city UA communities
    "ukraineingermany": "Germany",
    "https://t.me/+u9VcbxuhKik1M2My": "Dülmen",
    "https://t.me/+Yeu9vchwu6llZmYy": "NRW",
}

BEAUTY_SERVICE_CHANNELS: frozenset[str] = frozenset({
    "beauty_berlin_ua",
    "beautynrw",
    "beautydusseldorf",
    "hamburgbeauty",
})

SERVICE_ONLY_CHANNELS: frozenset[str] = frozenset({
    "hamburggggggg",
})

SERVICE_CHANNELS: frozenset[str] = BEAUTY_SERVICE_CHANNELS | SERVICE_ONLY_CHANNELS

CHANNELS_STRIP_TRAILING_LINK: dict[str, re.Pattern] = {
    "secondhand_hh": re.compile(
        r"(?:\n\s*|\s+)"
        r"(?:"
        r"https?://(?:www\.)?t\.me/secondhand_hh"
        r"|(?:www\.)?t\.me/secondhand_hh"
        r"|@secondhand_hh"
        r")\s*$",
        re.IGNORECASE,
    ),
}


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


CHANNELS: dict[str, str] = dedupe_channels({**_BASE_CHANNELS, **_channels_from_env()})
