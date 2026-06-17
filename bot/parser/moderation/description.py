"""Формування опису оголошення для маркетплейсу."""

from parser.core.text import detect_lang, enrich_description


def build_marketplace_description(item: dict) -> str:
    base = enrich_description(item["title"], item["description"])
    lang = detect_lang(
        f"{item.get('title') or ''}\n{item.get('description') or ''}"
    )

    author_username = item.get("author_username")
    source_channel = item.get("source_channel", "")
    message_id = item.get("message_id")
    msg_link = (
        f"https://t.me/{source_channel}/{message_id}"
        if source_channel and message_id
        else None
    )

    if author_username:
        contact_line = f"👤 Автор: @{author_username}"
    elif msg_link:
        if lang == "uk":
            contact_line = f"🔗 Оригінальне оголошення: {msg_link}"
        else:
            contact_line = f"🔗 Оригинальное объявление: {msg_link}"
    else:
        contact_line = ""

    parts = [base]
    if contact_line:
        parts.append(contact_line)

    return "\n\n".join(parts)
