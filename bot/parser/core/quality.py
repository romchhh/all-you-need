"""Перевірки якості та релевантності оголошень."""

from parser.core.patterns import (
    CHAT_OR_META_RE,
    FREE_GIVEAWAY_RE,
    LISTING_OFFER_RE,
    NOT_LISTING_RE,
    ONE_EMOJI_RE,
    PRICE_RE,
    SELL_OR_OFFER_RE,
    SERVICE_AD_HINT_RE,
    SPAM_RE,
    TEMPLATE_POST_RE,
    TOO_MANY_EMOJI_RE,
    VACANCY_RE,
    WANTED_ONLY_RE,
)

_JOB_SUBCATEGORIES = frozenset({"vacancies", "part_time", "looking_for_work"})


def is_likely_service_ad(text: str) -> bool:
    return bool(SERVICE_AD_HINT_RE.search(text or ""))


def has_listing_offer_signal(text: str = "") -> bool:
    """Чи є в тексті ознаки реального оголошення (ціна / продаж / послуга / віддам)."""
    t = text or ""
    if PRICE_RE.search(t) or FREE_GIVEAWAY_RE.search(t):
        return True
    if LISTING_OFFER_RE.search(t):
        return True
    if SERVICE_AD_HINT_RE.search(t):
        return True
    return False


def is_wanted_only_post(text: str = "") -> bool:
    """«Куплю / шукаю» без власної пропозиції товару чи послуги."""
    t = text or ""
    if not WANTED_ONLY_RE.search(t):
        return False
    if SELL_OR_OFFER_RE.search(t) or SERVICE_AD_HINT_RE.search(t) or FREE_GIVEAWAY_RE.search(t):
        return False
    return True


def is_quality(text: str, has_photo: bool, relaxed: bool = False) -> tuple[bool, str]:
    t = text.strip()
    if SPAM_RE.search(t) or VACANCY_RE.search(t) or TEMPLATE_POST_RE.search(t):
        return False, "спам"
    if NOT_LISTING_RE.search(t) or (CHAT_OR_META_RE.search(t) and not has_listing_offer_signal(t)):
        return False, "не оголошення"
    if is_wanted_only_post(t):
        return False, "пошук/куплю"
    if relaxed:
        if len(t) < 20:
            return False, "замало тексту"
        if not has_photo and len(t) < 40:
            return False, "замало тексту без фото"
        return True, ""
    if not has_photo:
        if len(t) < 45:
            return False, "немає фото"
    elif len(t) < 15:
        return False, "замало тексту"
    if len(t) < 12:
        return False, "замало тексту"
    return True, ""


def has_too_many_emojis(description: str) -> bool:
    if TOO_MANY_EMOJI_RE.search(description or ""):
        return True
    return len(ONE_EMOJI_RE.findall(description or "")) > 10


def is_likely_not_listing(
    title: str = "",
    description: str = "",
    raw_text: str = "",
) -> bool:
    text = f"{title or ''} {description or ''} {raw_text or ''}"
    if NOT_LISTING_RE.search(text):
        return True
    if TEMPLATE_POST_RE.search(text):
        return True
    if CHAT_OR_META_RE.search(text) and not has_listing_offer_signal(text):
        return True
    if is_wanted_only_post(text):
        return True
    return False


def is_job_or_earn_spam(title: str = "", description: str = "", raw_text: str = "") -> bool:
    """Вакансії / «зароби від $N» / боти вакансій — не оголошення барахолки."""
    text = f"{title or ''} {description or ''} {raw_text or ''}"
    if SPAM_RE.search(text):
        return True
    if VACANCY_RE.search(text):
        return True
    if TEMPLATE_POST_RE.search(text):
        return True
    low = text.lower()
    if "vakansiy" in low or "managervakansiy" in low:
        return True
    return False


def is_job_category(category: str = "", subcategory: str | None = "") -> bool:
    sub = (subcategory or "").strip().lower()
    if sub in _JOB_SUBCATEGORIES:
        return True
    if (category or "").strip().lower() in _JOB_SUBCATEGORIES:
        return True
    return False


def is_junk_for_marketplace(
    title: str = "",
    description: str = "",
    raw_text: str = "",
    category: str = "",
    subcategory: str | None = "",
    *,
    require_offer: bool = False,
) -> tuple[bool, str]:
    """Єдиний детермінований відсів сміття (новини, вакансії, чат, шаблони)."""
    if is_job_category(category, subcategory):
        return True, "вакансія"
    if is_job_or_earn_spam(title, description, raw_text):
        return True, "спам/вакансія"
    if is_likely_not_listing(title, description, raw_text):
        return True, "не оголошення"
    blob = f"{title or ''} {description or ''} {raw_text or ''}"
    if require_offer and not has_listing_offer_signal(blob):
        return True, "немає оферу"
    return False, ""
