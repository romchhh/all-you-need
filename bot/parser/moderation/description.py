"""Формування опису оголошення для маркетплейсу."""

from parser.core.telegram_meta import extract_username_from_text, parsed_item_message_link
from parser.core.text import detect_lang, enrich_description


def build_marketplace_description(item: dict) -> str:
    base = enrich_description(item["title"], item["description"])
    lang = detect_lang(
        f"{item.get('title') or ''}\n{item.get('description') or ''}"
    )

    author_username = (item.get("author_username") or "").strip().lstrip("@")
    if not author_username:
        author_username = (
            extract_username_from_text(
                str(item.get("raw_text") or ""),
                str(item.get("source_channel") or ""),
            )
            or ""
        ).lstrip("@")

    contact_line = ""
    if author_username:
        contact_line = f"👤 Автор: @{author_username}"
    else:
        msg_link = parsed_item_message_link(item)
        if msg_link:
            if lang == "uk":
                contact_line = f"🔗 Оригінальне оголошення: {msg_link}"
            else:
                contact_line = f"🔗 Оригинальное объявление: {msg_link}"

    parts = [base]
    if contact_line:
        parts.append(contact_line)

    return "\n\n".join(parts)
