"""Локація оголошення: локальний канал → місто каналу; Germany → з тексту/AI."""

from __future__ import annotations

import re

from utils.location_normalization import normalize_city_name

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


def detect_cities_in_text(text: str) -> list[str]:
    """Канонічні міста з тексту (укр/рос/нім + відмінки: в Гамбурге)."""
    if not text:
        return []
    lower = text.lower()
    lower_ascii = _ascii_fold(lower)
    found: list[str] = []

    from utils.location_normalization import CITY_SYNONYMS

    for syn, canon in CITY_SYNONYMS.items():
        if len(syn) < 3:
            continue
        if canon.lower() in _WIDE_SOURCE_CITIES:
            continue
        # точний токен або відмінок (гамбург / гамбурге / берлине)
        pattern = rf"(?<!\w){re.escape(syn)}\w{{0,4}}(?!\w)"
        pattern_ascii = rf"(?<!\w){re.escape(_ascii_fold(syn))}\w{{0,4}}(?!\w)"
        if re.search(pattern, lower) or re.search(pattern_ascii, lower_ascii):
            name = normalize_city_name(canon) or canon
            if name not in found and not is_germany_wide_source_city(name):
                found.append(name)

    for city in _KNOWN_CITIES:
        c_lower = city.lower()
        c_ascii = _ascii_fold(c_lower)
        pattern = rf"(?<!\w){re.escape(c_lower)}\w{{0,4}}(?!\w)"
        pattern_ascii = rf"(?<!\w){re.escape(c_ascii)}\w{{0,4}}(?!\w)"
        if re.search(pattern, lower) or re.search(pattern_ascii, lower_ascii):
            name = normalize_city_name(city) or city
            if name not in found:
                found.append(name)

    return found


def resolve_parsed_location(
    *,
    channel_city: str,
    suggested: str | None = None,
    text: str = "",
) -> str:
    """
    Локальний канал (Hamburg, Berlin, …) → завжди місто каналу.
    Загальний (Germany / NRW) → AI/текст → конкретне місто, інакше Germany.
    """
    channel = normalize_city_name(channel_city) or (channel_city or "").strip() or "Germany"

    if is_local_source_city(channel):
        return channel

    if suggested:
        sug = normalize_city_name(str(suggested).strip()) or str(suggested).strip()
        if sug and is_local_source_city(sug):
            return sug

    cities = detect_cities_in_text(text or "")
    if len(cities) == 1:
        return cities[0]
    if len(cities) > 1:
        # кілька міст у тексті — беремо перше конкретне (не channel)
        return cities[0]

    return "Germany"
