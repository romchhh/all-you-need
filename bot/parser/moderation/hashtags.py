"""Хештеги для публікації оголошень у Telegram-каналах."""

from __future__ import annotations

import re

from parser.category_keywords import get_category_label, get_subcategory_label
from parser.moderation.services_channel_routing import is_germany_wide_location

_HASHTAG_SEP_RE = re.compile(r"[\s›/\\\-]+")
_NON_HASHTAG_RE = re.compile(r"[^\w]", flags=re.UNICODE)


def _sanitize_hashtag_token(text: str) -> str:
    """Telegram hashtag: літери, цифри, підкреслення."""
    text = (text or "").strip()
    if not text:
        return ""
    text = (
        text.replace("ü", "u")
        .replace("ö", "o")
        .replace("ä", "a")
        .replace("ß", "ss")
        .replace("'", "")
        .replace("'", "")
        .replace("'", "")
    )
    text = _HASHTAG_SEP_RE.sub("_", text)
    text = _NON_HASHTAG_RE.sub("", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def _location_hashtag_token(location: str) -> str:
    loc = (location or "").strip()
    if not loc:
        return ""
    if is_germany_wide_location(loc):
        return "Germany"
    return _sanitize_hashtag_token(loc)


def build_channel_hashtags(
    category: str,
    subcategory: str | None,
    location: str,
) -> str:
    """
    #Послуги #Краса #Germany — без › та сирих id підкатегорій.
    """
    tokens: list[str] = []

    cat_label = get_category_label(category, None)
    cat_token = _sanitize_hashtag_token(cat_label)
    if cat_token:
        tokens.append(cat_token)

    if subcategory:
        sub_label = get_subcategory_label(category, subcategory)
        sub_raw = sub_label.split()[0] if " " in sub_label else sub_label
        sub_token = _sanitize_hashtag_token(sub_raw)
        if sub_token and sub_token.lower() != (cat_token or "").lower():
            tokens.append(sub_token)

    loc_token = _location_hashtag_token(location)
    if loc_token and loc_token.lower() not in {t.lower() for t in tokens}:
        tokens.append(loc_token)

    seen: set[str] = set()
    out: list[str] = []
    for token in tokens:
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(f"#{token}")
    return " ".join(out)
