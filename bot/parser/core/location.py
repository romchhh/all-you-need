"""Локація оголошення: локальний канал → місто каналу; Germany → з тексту/AI."""

from __future__ import annotations

import re
from pathlib import Path

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

def _load_app_german_cities() -> tuple[str, ...]:
    """Канонічні назви з app/constants/german-cities.ts."""
    path = Path(__file__).resolve().parents[3] / "app" / "constants" / "german-cities.ts"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ()
    start = text.find("export const germanCities = [")
    end = text.find("];", start)
    block = text[start:end] if start >= 0 and end > start else ""
    names = [name.strip() for name in re.findall(r"'([^']+)'", block) if name.strip()]
    return tuple(dict.fromkeys(names))


_INDEX_CACHE: dict[str, str] | None = None
_NEEDLES_CACHE: list[tuple[str, str]] | None = None


def _city_index() -> dict[str, str]:
    """lower/ascii → канонічне написання. Синоніми поза топ-списком теж лишаються."""
    global _INDEX_CACHE
    if _INDEX_CACHE is not None:
        return _INDEX_CACHE
    index: dict[str, str] = {}
    for name in _KNOWN_CITIES:
        index[name.lower()] = name
        index[_ascii_fold(name.lower())] = name
    for canon in CITY_SYNONYMS.values():
        if canon.lower() in _WIDE_SOURCE_CITIES:
            continue
        index.setdefault(canon.lower(), canon)
        index.setdefault(_ascii_fold(canon.lower()), canon)
    _INDEX_CACHE = index
    return index


_KNOWN_CITIES: tuple[str, ...] = _load_app_german_cities()


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
    Канонічне місто зі словника синонімів або списку німецьких міст.
    Germany / NRW і невідомі назви → None.
    """
    raw = (name or "").strip()
    if not raw:
        return None
    key = raw.lower()
    if key in _WIDE_SOURCE_CITIES:
        return None
    if key in CITY_SYNONYMS:
        canon = CITY_SYNONYMS[key]
        if canon.lower() in _WIDE_SOURCE_CITIES:
            return None
        return _city_index().get(canon.lower(), canon)

    folded = _ascii_fold(key)
    index = _city_index()
    return index.get(key) or index.get(folded)


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


def _city_needles() -> list[tuple[str, str]]:
    """(фрагмент, канон), довші назви першими — Frankfurt (Oder) раніше за Frankfurt."""
    global _NEEDLES_CACHE
    if _NEEDLES_CACHE is not None:
        return _NEEDLES_CACHE
    pairs: dict[str, str] = {}
    for syn, canon in CITY_SYNONYMS.items():
        if len(syn) < 3 or canon.lower() in _WIDE_SOURCE_CITIES:
            continue
        accepted = canonicalize_known_city(canon)
        if accepted:
            pairs.setdefault(syn.lower(), accepted)
    for city in _KNOWN_CITIES:
        accepted = canonicalize_known_city(city)
        if accepted:
            pairs.setdefault(city.lower(), accepted)
    _NEEDLES_CACHE = sorted(pairs.items(), key=lambda item: len(item[0]), reverse=True)
    return _NEEDLES_CACHE


def _hits_in(text: str, needles: list[tuple[str, str]]) -> list[tuple[int, str]]:
    raw_hits: list[tuple[int, int, str]] = []
    for needle, canon in needles:
        pattern = rf"(?<!\w){re.escape(needle)}\w{{0,4}}(?!\w)"
        for match in re.finditer(pattern, text):
            raw_hits.append((match.start(), match.end(), canon))
    raw_hits.sort(key=lambda hit: (-(hit[1] - hit[0]), hit[0]))
    occupied: list[tuple[int, int]] = []
    kept: list[tuple[int, str]] = []
    for start, end, canon in raw_hits:
        if any(not (end <= left or start >= right) for left, right in occupied):
            continue
        occupied.append((start, end))
        kept.append((start, canon))
    kept.sort()
    return kept


def detect_cities_in_text(text: str) -> list[str]:
    """Канонічні міста з тексту (укр/рос/нім + відмінки: в Гамбурге)."""
    if not text:
        return []
    needles = _city_needles()
    lower = text.lower()
    found: list[str] = []
    for _, canon in _hits_in(lower, needles):
        if canon not in found:
            found.append(canon)
    ascii_needles = [(_ascii_fold(needle), canon) for needle, canon in needles]
    for _, canon in _hits_in(_ascii_fold(lower), ascii_needles):
        if canon not in found:
            found.append(canon)
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
