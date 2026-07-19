"""Локація оголошення: локальний канал → місто каналу; Germany → з тексту/AI."""

from __future__ import annotations

import re

from utils.location_normalization import CITY_SYNONYMS, normalize_city_name

# Канал з city=Germany / NRW — загальний: місто шукаємо в тексті.
_WIDE_SOURCE_CITIES = frozenset({
    "germany",
    "deutschland",
    "німеччина",
    "немеччина",
    "германия",
    "nrw",
    "нрв",
})

# Лише ці міста можна ставити в location (жодних «сіл» від AI).
_KNOWN_CITIES: tuple[str, ...] = (
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
    "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden",
    "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
    "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden",
    "Aachen", "Mönchengladbach", "Gelsenkirchen", "Braunschweig", "Kiel",
    "Freiburg im Breisgau", "Lübeck", "Erfurt", "Rostock", "Mainz", "Kassel",
    "Potsdam", "Heidelberg", "Darmstadt", "Regensburg", "Würzburg", "Ulm",
    "Dülmen",
)

_KNOWN_CITY_LOWER = {c.lower(): c for c in _KNOWN_CITIES}


def _ascii_fold(text: str) -> str:
    return (
        text.replace("ü", "u")
        .replace("ö", "o")
        .replace("ä", "a")
        .replace("ß", "ss")
        .replace("Ü", "U")
        .replace("Ö", "O")
        .replace("Ä", "A")
    )


def is_germany_wide_source_city(city: str) -> bool:
    """True для загальних джерел (Ukraine in Germany тощо), False для Hamburg/Berlin."""
    raw = (city or "").strip()
    if not raw:
        return True
    norm = (normalize_city_name(raw) or raw).strip().lower()
    return norm in _WIDE_SOURCE_CITIES


def is_local_source_city(city: str) -> bool:
    return not is_germany_wide_source_city(city)


def canonicalize_known_city(name: str | None) -> str | None:
    """
    Повертає канонічне місто зі whitelist або None.
    Невідомі села / AI-галюцинації → None.
    """
    raw = (name or "").strip()
    if not raw:
        return None
    key = raw.lower()
    if key in CITY_SYNONYMS:
        canon = CITY_SYNONYMS[key]
        if canon.lower() in _WIDE_SOURCE_CITIES:
            return None
        return _KNOWN_CITY_LOWER.get(canon.lower(), canon if canon in _KNOWN_CITIES else None)

    if key in _KNOWN_CITY_LOWER:
        return _KNOWN_CITY_LOWER[key]

    folded = _ascii_fold(key)
    for city in _KNOWN_CITIES:
        if _ascii_fold(city.lower()) == folded:
            return city
    return None


def channel_city_from_source(
    source_channel: str | None = None,
    fallback: str | None = None,
) -> str:
    """Місто каналу з реєстру CHANNELS (джерело істини)."""
    channel = (source_channel or "").strip()
    if channel:
        try:
            from parser.config.channels import CHANNELS, normalize_channel_key

            nk = normalize_channel_key(channel)
            for key, city in CHANNELS.items():
                if normalize_channel_key(key) == nk:
                    return normalize_city_name(city) or city
        except Exception:
            pass
    fb = (fallback or "").strip()
    if fb:
        return normalize_city_name(fb) or fb
    return "Germany"


def detect_cities_in_text(text: str) -> list[str]:
    """Канонічні міста з тексту (укр/рос/нім + відмінки: в Гамбурге)."""
    if not text:
        return []
    lower = text.lower()
    lower_ascii = _ascii_fold(lower)
    found: list[str] = []

    for syn, canon in CITY_SYNONYMS.items():
        if len(syn) < 3:
            continue
        if canon.lower() in _WIDE_SOURCE_CITIES:
            continue
        pattern = rf"(?<!\w){re.escape(syn)}\w{{0,4}}(?!\w)"
        pattern_ascii = rf"(?<!\w){re.escape(_ascii_fold(syn))}\w{{0,4}}(?!\w)"
        if re.search(pattern, lower) or re.search(pattern_ascii, lower_ascii):
            name = canonicalize_known_city(canon)
            if name and name not in found:
                found.append(name)

    for city in _KNOWN_CITIES:
        c_lower = city.lower()
        c_ascii = _ascii_fold(c_lower)
        pattern = rf"(?<!\w){re.escape(c_lower)}\w{{0,4}}(?!\w)"
        pattern_ascii = rf"(?<!\w){re.escape(c_ascii)}\w{{0,4}}(?!\w)"
        if re.search(pattern, lower) or re.search(pattern_ascii, lower_ascii):
            if city not in found:
                found.append(city)

    return found


def resolve_parsed_location(
    *,
    channel_city: str | None = None,
    source_channel: str | None = None,
    suggested: str | None = None,
    text: str = "",
) -> str:
    """
    Локальний канал (Hamburg, Berlin, …) → завжди місто каналу.
    Загальний (Germany / NRW) → лише відоме місто з AI/тексту, інакше Germany.
    """
    channel = channel_city_from_source(source_channel, channel_city)

    if is_local_source_city(channel):
        return channel

    known = canonicalize_known_city(suggested)
    if known:
        return known

    cities = detect_cities_in_text(text or "")
    if cities:
        return cities[0]

    return "Germany"
