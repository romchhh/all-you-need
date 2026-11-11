"""Ціна TelegramListing: договірна, канал, маркетплейс."""

from __future__ import annotations

NEGOTIABLE_MARKERS = frozenset(
    {
        "договірна",
        "договорная",
        "negotiable",
        "договорная цена",
        "договірна ціна",
    }
)

_SERVICE_CATEGORY_HINTS = frozenset(
    {
        "послуги",
        "услуги",
        "services",
        "services_work",
        "красота",
        "краса",
    }
)


def _norm_price_text(value: object) -> str:
    s = str(value or "").strip()
    return s.replace("ʼ", "'").replace("`", "'").lower()


def listing_is_negotiable(listing: dict) -> bool:
    if listing.get("isNegotiable") in (True, 1, "1", "true"):
        return True
    for key in ("priceDisplay", "price", "pricedisplay"):
        raw = listing.get(key)
        if raw is None:
            continue
        if _norm_price_text(raw) in NEGOTIABLE_MARKERS:
            return True
    try:
        price_num = float(listing.get("price") or 0)
    except (TypeError, ValueError):
        price_num = 0.0
    if price_num == 0:
        cat = _norm_price_text(listing.get("category"))
        if any(h in cat for h in _SERVICE_CATEGORY_HINTS):
            return True
        pd = str(listing.get("priceDisplay") or "").strip()
        if not pd:
            return True
    return False


def negotiable_display_label(listing: dict, *, lang: str = "uk") -> str:
    if lang.startswith("ru"):
        return "Договорная"
    return "Договірна"


def marketplace_price_and_free(listing: dict) -> tuple[str, bool]:
    """(price string для Listing.price, isFree)."""
    if listing_is_negotiable(listing):
        return negotiable_display_label(listing, lang="ru"), False
    price_display = str(listing.get("priceDisplay") or listing.get("pricedisplay") or "").strip()
    raw_price = listing.get("price")
    try:
        price_num = float(raw_price) if raw_price is not None else 0.0
    except (TypeError, ValueError):
        price_num = 0.0

    if price_display and ("/год" in price_display or "/час" in price_display):
        return price_display, False
    if price_display and price_num == 0 and _norm_price_text(price_display) not in ("0", "0.0"):
        return price_display, False
    if price_num > 0:
        return str(int(price_num) if price_num == int(price_num) else price_num), False
    if price_display and price_display not in ("0", "0.0"):
        return price_display, False
    return "0", True


def channel_price_text(listing: dict, *, lang: str = "ru") -> str:
    currency = str(listing.get("currency") or "EUR").strip()
    price_display = listing.get("priceDisplay") or listing.get("pricedisplay")
    if listing_is_negotiable(listing):
        return negotiable_display_label(listing, lang=lang)
    if price_display:
        pd = str(price_display).strip()
        if _norm_price_text(pd) in NEGOTIABLE_MARKERS:
            return negotiable_display_label(listing, lang=lang)
        if "/год" in pd or "/час" in pd:
            return pd
        if pd in ("0", "0.0"):
            return negotiable_display_label(listing, lang=lang)
        return f"{pd} {currency}".strip()
    try:
        price = float(listing.get("price") or 0)
    except (TypeError, ValueError):
        price = 0.0
    if price == 0:
        return negotiable_display_label(listing, lang=lang)
    return f"{price:g} {currency}".strip()
