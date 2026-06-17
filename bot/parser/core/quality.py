"""Перевірки якості та релевантності оголошень."""

from parser.core.patterns import (
    NOT_LISTING_RE,
    ONE_EMOJI_RE,
    SERVICE_AD_HINT_RE,
    SPAM_RE,
    TOO_MANY_EMOJI_RE,
)


def is_likely_service_ad(text: str) -> bool:
    return bool(SERVICE_AD_HINT_RE.search(text or ""))


def is_quality(text: str, has_photo: bool, relaxed: bool = False) -> tuple[bool, str]:
    t = text.strip()
    if relaxed:
        if len(t) < 25:
            return False, "замало тексту"
        if not has_photo and len(t) < 80:
            return False, "немає фото"
        if SPAM_RE.search(t):
            return False, "спам"
        return True, ""
    if not has_photo:
        return False, "немає фото"
    if len(t) < 20:
        return False, "замало тексту"
    if SPAM_RE.search(t):
        return False, "спам"
    return True, ""


def has_too_many_emojis(description: str) -> bool:
    if TOO_MANY_EMOJI_RE.search(description or ""):
        return True
    return len(ONE_EMOJI_RE.findall(description or "")) > 4


def is_likely_not_listing(title: str, description: str) -> bool:
    text = ((title or "") + " " + (description or "")).lower()
    return bool(NOT_LISTING_RE.search(text))
