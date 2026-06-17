"""Посилання на оголошення в міні-додатку."""

from parser.moderation.config import BOT_USERNAME, WEBAPP_URL


def listing_url(listing_id: int) -> str:
    base = WEBAPP_URL.rstrip("/")
    return f"{base}/listing/{listing_id}"


def listing_miniapp_url(listing_id: int) -> str:
    if BOT_USERNAME:
        return f"https://t.me/{BOT_USERNAME}?startapp=listing_{listing_id}"
    return listing_url(listing_id)
