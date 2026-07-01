"""Вибір Telegram-каналу для публікації послуг за містом."""

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

from utils.location_normalization import normalize_city_name

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger(__name__)

# Hamburg | TradeGround Services
TRADE_SERVICES_CHANNEL_HAMBURG_ID: int = int(
    os.getenv("TRADE_SERVICES_CHANNEL_HAMBURG_ID", "-1003627644062")
)
# Germany (інші міста)
TRADE_SERVICES_CHANNEL_GERMANY_ID: int = int(
    os.getenv("TRADE_SERVICES_CHANNEL_GERMANY_ID", "-1003857694156")
)

_HAMBURG_RE = re.compile(r"\bhamburg\b|\bгамбург\b", re.IGNORECASE)

_GERMANY_WIDE_LOCATION = frozenset({
    "germany",
    "deutschland",
    "німеччина",
    "немеччина",
    "germania",
    "вся німеччина",
    "вся германия",
    "whole germany",
})

_ONLINE_OR_REMOTE_RE = re.compile(
    r"\bonline\b|\bонлайн\b|\bremote\b|\bвіддален\w*|\bдистанц\w*|"
    r"\bzoom\b|\bskype\b|\bteams\b|"
    r"онлайн[\s-]?(?:услуг|сервис|консультац|урок|школ)|"
    r"online[\s-]?(?:service|consult|lesson|school)",
    re.IGNORECASE,
)

_GERMANY_WIDE_TEXT_RE = re.compile(
    r"по\s+всей\s+германии|по\s+всій\s+німеччині|"
    r"на\s+всю\s+германи\w*|на\s+всю\s+німеччин\w*|"
    r"auf\s+ganz(?:er)?\s+deutschland|"
    r"in\s+ganz\s+deutschland|"
    r"whole\s+germany|entire\s+germany|"
    r"по\s+всей\s+deutschland|"
    r"вся\s+германи\w*|вся\s+німеччин\w*",
    re.IGNORECASE,
)

# Виїзд / забір з адреси — аудиторія не лише одне місто.
_NATIONWIDE_PICKUP_RE = re.compile(
    r"забираем\s+с\s+адрес|заберем\s+с\s+адрес|"
    r"з\s+адрес[иы]|з\s+вашего\s+адрес|"
    r"abholung|pickup|"
    r"выезд\s+по|виїзд\s+по|"
    r"по\s+(?:всей|всій)\s+(?:германии|німеччини|deutschland)|"
    r"туристическ\w+\s+сопровожден|"
    r"сопровождени\w+\s+на\s+весь\s+период|"
    r"reisebegleitung|abholservice",
    re.IGNORECASE,
)

# Тури / поїздки / відпочинок (часто з Hamburg-каналу, але для всієї Німеччини).
_TRAVEL_TOURISM_RE = re.compile(
    r"поездк\w*|поїздк\w*|"
    r"отдых\s+на\s+море|відпочинок\s+на\s+морі|"
    r"туристическ\w*|туристичн\w*|"
    r"(?:^|\s)тур(?:\s|$|ы\b)|"
    r"курорт|"
    r"\brimini\b|итали\w*|італі\w*|"
    r"пляж|"
    r"(?:отель|hotel).{0,40}(?:линия|linie|line)|"
    r"проживани\w*|"
    r"reise|urlaub|ferien|"
    r"с\s+человека|с\s+особи|pro\s+person|"
    r"venezia|venice|венеци|рим|rome|florenz|florence|милан|milan|"
    r"санмарино|san\s*marino",
    re.IGNORECASE,
)

# Міста для визначення локації з тексту оголошення (не з каналу-джерела).
_KNOWN_SERVICE_CITIES: tuple[str, ...] = (
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
    "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden",
    "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
    "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden",
    "Aachen", "Mönchengladbach", "Gelsenkirchen", "Braunschweig", "Kiel",
    "Freiburg im Breisgau", "Lübeck", "Erfurt", "Rostock", "Mainz", "Kassel",
    "Potsdam", "Heidelberg", "Darmstadt", "Regensburg", "Würzburg", "Ulm",
    "Dülmen",
)


def _service_text_blob(item: dict) -> str:
    """Текст оголошення (без source_city і location — їх може підставити парсер каналу)."""
    parts = [
        str(item.get("title") or ""),
        str(item.get("description") or ""),
        str(item.get("raw_text") or ""),
    ]
    return "\n".join(parts)


def _item_text_blob(item: dict) -> str:
    parts = [
        str(item.get("title") or ""),
        str(item.get("description") or ""),
        str(item.get("raw_text") or ""),
        str(item.get("location") or ""),
        str(item.get("source_city") or ""),
    ]
    return "\n".join(parts)


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


def _detect_cities_in_text(text: str) -> list[str]:
    if not text:
        return []
    lower = text.lower()
    lower_ascii = _ascii_fold(lower)
    found: list[str] = []
    for city in _KNOWN_SERVICE_CITIES:
        c_lower = city.lower()
        c_ascii = _ascii_fold(c_lower)
        if re.search(rf"\b{re.escape(c_lower)}\b", lower) or re.search(
            rf"\b{re.escape(c_ascii)}\b", lower_ascii
        ):
            canon = normalize_city_name(city) or city
            if canon not in found:
                found.append(canon)
    return found


def _effective_service_location(item: dict) -> str:
    """
    Місто надання послуги.
    Канал-джерело (source_city) не має перевизначати Wuppertal, Berlin тощо з тексту.
    """
    location = (item.get("location") or "").strip()
    source_city = (item.get("source_city") or "").strip()
    text_cities = _detect_cities_in_text(_service_text_blob(item))

    if len(text_cities) == 1:
        return text_cities[0]

    if len(text_cities) > 1:
        src_key = normalize_city_name(source_city).lower() if source_city else ""
        non_source = [c for c in text_cities if not src_key or c.lower() != src_key]
        if len(non_source) == 1:
            return non_source[0]
        non_hamburg = [c for c in text_cities if c.lower() != "hamburg"]
        if len(non_hamburg) == 1:
            return non_hamburg[0]

    if location and not is_germany_wide_location(location):
        return normalize_city_name(location.split(",")[0].strip()) or location

    if location and is_germany_wide_location(location):
        return normalize_city_name(location.split(",")[0].strip()) or location

    if source_city:
        return normalize_city_name(source_city) or source_city

    return "Germany"


def _normalized_location_tokens(location: str) -> set[str]:
    raw = (location or "").strip().lower()
    if not raw:
        return set()
    tokens = {raw}
    first = raw.split(",")[0].strip().lower()
    tokens.add(first)
    tokens.add(normalize_city_name(first).lower())
    return tokens


def is_germany_wide_location(location: str) -> bool:
    return bool(_normalized_location_tokens(location) & _GERMANY_WIDE_LOCATION)


def is_travel_or_mobile_nationwide_service(item: dict) -> bool:
    """Тури, виїзди, забір з адреси — релевантно всій Німеччині (навіть якщо канал Hamburg)."""
    blob = _item_text_blob(item)
    if _NATIONWIDE_PICKUP_RE.search(blob):
        return True
    if _TRAVEL_TOURISM_RE.search(blob):
        # Туристичний пакет: поїздка + проживання/ціна/супровід
        package_hints = re.search(
            r"проживани|отель|hotel|€|eur|с\s+человека|с\s+особи|"
            r"апартамент|номер|завтрак|сопровожден|море|курорт",
            blob,
            re.IGNORECASE,
        )
        if package_hints:
            return True
    return False


def is_dual_channel_service(item: dict) -> bool:
    """Оголошення для аудиторії всієї Німеччини → Hamburg + Germany."""
    return is_online_or_germany_wide_service(item) or is_travel_or_mobile_nationwide_service(
        item
    )


def is_online_or_germany_wide_service(item: dict) -> bool:
    """Онлайн- послуги або оголошення на всю Німеччину → обидва канали."""
    blob = _item_text_blob(item)
    if _ONLINE_OR_REMOTE_RE.search(blob):
        return True
    if _GERMANY_WIDE_TEXT_RE.search(blob):
        return True

    subcategory = (item.get("subcategory") or "").strip().lower()
    if subcategory in {"it_services", "online_services"}:
        if _ONLINE_OR_REMOTE_RE.search(blob) or is_germany_wide_location(
            str(item.get("location") or "")
        ):
            return True

    for loc in (item.get("location"), _effective_service_location(item)):
        val = (loc or "").strip()
        if val and is_germany_wide_location(val):
            return True

    return False


def _location_candidates(item: dict) -> list[str]:
    """Застаріло для маршруту — лишено для сумісності."""
    eff = _effective_service_location(item)
    out: list[str] = []
    if eff:
        out.append(eff)
    return out


def is_hamburg_location(location: str) -> bool:
    raw = (location or "").strip()
    if not raw:
        return False
    if is_germany_wide_location(raw):
        return False
    if _HAMBURG_RE.search(raw):
        return True
    first_part = raw.split(",")[0].strip()
    return normalize_city_name(first_part).lower() == "hamburg"


def is_hamburg_service_item(item: dict) -> bool:
    return is_hamburg_location(_effective_service_location(item))


def resolve_services_trade_channel_ids(item: dict) -> list[int]:
    """
    Аудиторія вся Німеччина (онлайн, тури, забір з адреси) → обидва канали.
    Локальний Hamburg → лише Hamburg.
    Інше місто (Wuppertal, Berlin, …) → лише Germany.
    """
    eff_loc = _effective_service_location(item)
    logger.debug(
        "services route: eff_loc=%r location=%r source_city=%r",
        eff_loc,
        item.get("location"),
        item.get("source_city"),
    )
    if is_dual_channel_service(item):
        return [TRADE_SERVICES_CHANNEL_HAMBURG_ID, TRADE_SERVICES_CHANNEL_GERMANY_ID]
    if is_hamburg_service_item(item):
        return [TRADE_SERVICES_CHANNEL_HAMBURG_ID]
    return [TRADE_SERVICES_CHANNEL_GERMANY_ID]


def resolve_services_trade_channel_id(item: dict) -> int:
    """Перший канал з маршруту (зворотна сумісність)."""
    return resolve_services_trade_channel_ids(item)[0]


def services_channel_label(chat_id: int) -> str:
    if chat_id == TRADE_SERVICES_CHANNEL_HAMBURG_ID:
        return "TradeGround Hamburg (послуги)"
    if chat_id == TRADE_SERVICES_CHANNEL_GERMANY_ID:
        return "TradeGround Germany (послуги)"
    return f"канал {chat_id}"


def format_services_channels_labels(chat_ids: list[int]) -> str:
    seen: set[int] = set()
    labels: list[str] = []
    for chat_id in chat_ids:
        if chat_id in seen:
            continue
        seen.add(chat_id)
        labels.append(services_channel_label(chat_id))
    return " + ".join(labels)
