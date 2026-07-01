"""Формування опису оголошення для маркетплейсу."""

from parser.core.telegram_meta import extract_username_from_text, sanitize_public_listing_text
from parser.core.text import detect_lang, enrich_description


def build_marketplace_description(item: dict) -> str:
    base = enrich_description(item["title"], item["description"])
    source_channel = str(item.get("source_channel") or "")
    base = sanitize_public_listing_text(base, source_channel)

    author_username = (item.get("author_username") or "").strip().lstrip("@")
    if not author_username:
        author_username = (
            extract_username_from_text(
                str(item.get("raw_text") or ""),
                source_channel,
            )
            or ""
        ).lstrip("@")

    parts = [base]
    if author_username:
        parts.append(f"👤 Автор: @{author_username}")

    return sanitize_public_listing_text("\n\n".join(p for p in parts if p), source_channel)
