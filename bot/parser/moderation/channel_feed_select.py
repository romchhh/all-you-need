"""Вибір оголошення для стрічки каналів послуг: лише послуги, місто, чергування підкатегорій."""

from __future__ import annotations

import re
from typing import NamedTuple

from parser.core.quality import has_too_many_emojis, is_wanted_only_post
from parser.moderation.services_publish import (
    _ONLINE_OR_REMOTE_RE,
    _detect_cities_in_text,
    is_germany_wide_location,
    is_hamburg_location,
)
from utils.location_normalization import normalize_city_name

# У каналах лише підкатегорії послуг (не вакансії / «шукаю роботу»).
SERVICE_SUBCATEGORIES = frozenset(
    {
        "services",
        "repair_installation",
        "cleaning",
        "transportation",
        "beauty_health",
        "beauty_services",
        "it_design_websites",
        "it_services",
        "photo_video",
        "education_tutors",
        "translations",
        "auto_services",
        "consultations",
        "online_services",
        "other_services",
    }
)

JOB_SUBCATEGORIES = frozenset(
    {"vacancies", "part_time", "looking_for_work", "other_work"}
)

# Локальна послуга в цих підкатегоріях без конкретного міста = онлайн.
_ONLINE_SUBCATEGORIES = frozenset(
    {
        "it_design_websites",
        "it_services",
        "translations",
        "consultations",
        "education_tutors",
        "online_services",
    }
)

_EVENT_RE = re.compile(
    r"(?:"
    r"\bмероприятие\b|\bмероприятия\b|\bподія\b|\bподії\b|\bзахід\b|\bзаходи\b|"
    r"\bафіша\b|\bафиша\b|\bфестиваль\b|\bконцерт\b|"
    r"\bвечірка\b|\bвечеринка\b|\bстендап\b|стенд-ап|"
    r"\bмайстер-клас\b|\bмастер-класс\b|\bворкшоп\b|\bworkshop\b|"
    r"\bквитки\b|\bбилеты\b|"
    r"\bmeetup\b|\bівент\b|\bивент\b"
    r")",
    re.IGNORECASE,
)

_REALESTATE_OFFER_RE = re.compile(
    r"(?:"
    r"\bздам\b|\bсдам\b|\bзніму\b|\bсниму\b|\bоренд[ау]\b|\bаренд[ау]\b|"
    r"\bпродам\s+квартир|\bпродам\s+будинок|"
    r"\bvermiete\b|\bzu\s+vermieten\b|\bmietwohnung\b|\bwg-zimmer\b|"
    r"\bжиль[её]\b|\bжитло\b|\bwohnung\b|"
    r"мини\s*джоб|міні\s*джоб|minijob"
    r")",
    re.IGNORECASE,
)

# Промо чужої групи / «приєднуйтесь» — не послуга для публікації в канал.
_CHANNEL_COMMUNITY_PROMO_RE = re.compile(
    r"(?:"
    r"присоединяйтесь?\s+к\s+(?:нашему\s+)?сообществ|"
    r"приєднуйтесь?\s+до\s+(?:нашо[єї]\s+)?спільнот|"
    r"join\s+(?:our\s+)?community|"
    r"найд[её]те\s+проверенн\w*\s+мастер|"
    r"знайдете\s+перевірен\w*\s+майстр|"
    r"проверенн\w*\s+мастер(?:ов)?\s+и\s+салон|"
    r"перевірен\w*\s+майстр(?:ів)?\s+і\s+салон|"
    r"бьюти[- ]?услуг[аи].*(?:акци|скидк|сообществ)|"
    r"beauty\s+nrw|"
    r"акци[яи],?\s*скидк\w*.*(?:сообществ|присоединя)|"
    r"скидк\w*.*интересн\w*\s+предложени"
    r")",
    re.IGNORECASE,
)

# Питання в чат / схема «жильё за миниджоб» — не офер послуги.
_CHANNEL_CHAT_QUESTION_RE = re.compile(
    r"(?:"
    r"а\s+как\s+тогда|а\s+як\s+тоді|"
    r"как\s+организовать|як\s+організувати|"
    r"или\s+как\s+сделать|чи\s+як\s+зробити|"
    r"спасибо\s+большое\s+за\s+помощь|дякую\s+велике\s+за\s+допомог|"
    r"нужно\s+заранее\s+какое[- ]?то\s+приглашен|"
    r"потрібно\s+заздалегідь\s+якесь\s+запрошен|"
    r"жиль[её]\s+за\s+(?:мини|міні)|житло\s+за\s+(?:мини|міні|minijob)|"
    r"дает\s+жиль[её]|дає\s+житло"
    r")",
    re.IGNORECASE,
)

_BOILERPLATE_RE = re.compile(
    r"(?:^|\n)\s*👤\s*Автор:.*|"
    r"(?:^|\n)\s*🔗\s*(?:Оригінальне|Оригинальное|Original).*",
    re.IGNORECASE,
)

# «Легкий заробіток / пиши в бота», не звичайна вакансія бариста.
_EARN_BOT_RE = re.compile(
    r"легк\w+\s+заработ|легк\w+\s+заробіт|"
    r"есть\s+вариант\s+заработать|є\s+варіант\s+заробити|"
    r"заработать\s+от|заробити\s+від|заработок\s+от|заробіток\s+від|"
    r"доход\s+от\s+\d+|прибуток\s+від\s+\d+|"
    r"пиши(?:те)?\s+в\s+бота|обращайтесь\s+в\s+бота|звертайтесь\s+(?:в|до)\s+бота|"
    r"вакансий[_\s-]?бот|managervakansiy|"
    r"сигарет|стики.*glo|"
    r"от\s+\d+\s*[\$€]\s*в\s*(?:сутки|день)|"
    r"від\s+\d+\s*[\$€]\s*(?:на\s+)?(?:добу|день)",
    re.IGNORECASE,
)

_URL_RE = re.compile(r"https?://\S+|t\.me/\S+", re.IGNORECASE)
_LETTER_RE = re.compile(r"[A-Za-zА-Яа-яІіЇїЄєҐґ]")


class FeedCandidate(NamedTuple):
    id: int
    bucket: str  # ключ підкатегорії для чергування
    city_key: str
    title_key: str


def plain_text(value: str) -> str:
    text = _BOILERPLATE_RE.sub(" ", value or "")
    text = _URL_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_title_key(title: str) -> str:
    text = plain_text(title).lower()
    text = re.sub(r"[^\w\s]+", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:180]


def is_feed_quality(title: str, description: str, *, bucket: str | None = None) -> bool:
    """Достатньо тексту, не «куплю», не заробіток-бот, не пошук житла/роботи."""
    del bucket  # лишилось для сумісності з тестами
    plain_title = plain_text(title)
    plain_desc = plain_text(description)
    if len(plain_title) < 6 or len(plain_desc) < 40:
        return False
    blob = f"{plain_title}\n{plain_desc}"
    if len(_LETTER_RE.findall(blob)) < 25:
        return False
    if _EARN_BOT_RE.search(blob):
        return False
    if _CHANNEL_COMMUNITY_PROMO_RE.search(blob):
        return False
    if _CHANNEL_CHAT_QUESTION_RE.search(blob):
        return False
    if is_wanted_only_post(blob):
        return False
    if has_too_many_emojis(plain_desc):
        return False
    from parser.core.quality import is_likely_not_listing

    if is_likely_not_listing(plain_title, plain_desc):
        return False
    return True


def is_marketplace_channel_service(
    category: str,
    subcategory: str | None,
    title: str,
    description: str,
) -> bool:
    """Чи це саме послуга для публічного каналу (не товар, не вакансія, не оренда)."""
    cat = (category or "").strip().lower()
    if cat != "services_work":
        return False
    sub = (subcategory or "").strip().lower()
    if sub in JOB_SUBCATEGORIES:
        return False
    blob = f"{title or ''}\n{description or ''}"
    if _EVENT_RE.search(blob):
        return False
    if _REALESTATE_OFFER_RE.search(blob):
        return False
    if _CHANNEL_COMMUNITY_PROMO_RE.search(blob):
        return False
    if _CHANNEL_CHAT_QUESTION_RE.search(blob):
        return False
    from parser.core.quality import is_likely_not_listing

    if is_likely_not_listing(title, description):
        return False
    from parser.marketplace_categories import should_treat_as_service

    if not should_treat_as_service(blob, category=cat):
        return False
    if sub and sub not in SERVICE_SUBCATEGORIES and sub not in JOB_SUBCATEGORIES:
        return False
    return True


def channel_feed_topic(
    category: str,
    subcategory: str | None,
    title: str,
    description: str,
) -> str | None:
    """
    Ключ підкатегорії для чергування в каналі або None, якщо в канал не йде.
    """
    if not is_marketplace_channel_service(category, subcategory, title, description):
        return None
    if not is_feed_quality(title, description):
        return None
    sub = (subcategory or "").strip().lower()
    if not sub or sub not in SERVICE_SUBCATEGORIES:
        return "other_services"
    return sub


def classify_bucket(
    category: str,
    subcategory: str | None,
    title: str,
    description: str,
) -> str | None:
    """Сумісність: bucket = підкатегорія послуги."""
    return channel_feed_topic(category, subcategory, title, description)


def is_online_service(
    title: str,
    description: str,
    location: str,
    subcategory: str | None,
) -> bool:
    blob = f"{title or ''}\n{description or ''}"
    if _ONLINE_OR_REMOTE_RE.search(blob):
        return True
    sub = (subcategory or "").strip().lower()
    if sub not in _ONLINE_SUBCATEGORIES:
        return False
    if is_hamburg_location(location or ""):
        return False
    cities = _detect_cities_in_text(f"{location or ''}\n{blob}")
    if any(city.lower() != "hamburg" for city in cities):
        return False
    if is_germany_wide_location(location or "") or not (location or "").strip():
        return True
    folded = (location or "").strip().lower()
    return folded in {"online", "онлайн", "remote", "віддалено", "удаленно"}


def eligible_for_hamburg(
    *,
    title: str,
    description: str,
    location: str,
    subcategory: str | None,
) -> bool:
    if is_hamburg_location(location or ""):
        return True
    return is_online_service(title, description, location, subcategory)


def city_key_for(location: str, *, online: bool) -> str:
    if is_hamburg_location(location or ""):
        return "hamburg"
    if online:
        cities = _detect_cities_in_text(location or "")
        if not any(city.lower() != "hamburg" for city in cities):
            return "online"
    first = (location or "").split(",")[0].strip()
    name = normalize_city_name(first) or first or "unknown"
    return name.strip().lower() or "unknown"


def pick_next(
    candidates: list[FeedCandidate],
    *,
    last_bucket: str | None,
    last_city: str | None,
    blocked_ids: set[int],
    blocked_titles: set[str],
) -> FeedCandidate | None:
    """
    Наступне оголошення іншої підкатегорії послуг, ніж попереднє.
    У цій підкатегорії — інше місто, якщо є з чого вибирати.
    """
    fresh = [
        item
        for item in candidates
        if item.id not in blocked_ids
        and item.title_key
        and item.title_key not in blocked_titles
    ]
    if not fresh:
        return None

    topics = sorted({item.bucket for item in fresh})
    start = topics.index(last_bucket) if last_bucket in topics else -1
    for step in range(1, len(topics) + 1):
        topic = topics[(start + step) % len(topics)]
        pool = [item for item in fresh if item.bucket == topic]
        if not pool:
            continue
        if last_city:
            rotated = [item for item in pool if item.city_key != last_city]
            if rotated:
                pool = rotated
        pool.sort(key=lambda item: item.id)
        return pool[0]
    return None
