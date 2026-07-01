"""Формування опису оголошення для маркетплейсу."""

import html
import re

from parser.core.telegram_meta import extract_username_from_text, parsed_item_message_link
from parser.core.text import detect_lang, enrich_description

_ORIGINAL_POST_LABEL_RE = re.compile(
    r"(?:Оригінальне оголошення|Оригинальное объявление|Original(?:\s+(?:post|listing|ad))?)",
    re.IGNORECASE,
)

_ORIGINAL_POST_BLOCK_RE = re.compile(
    r"(?:^|\n)\s*(?:[•\*\-\u2022]|🔗)?\s*"
    r"(?:Оригінальне оголошення|Оригинальное объявление|Original(?:\s+(?:post|listing|ad))?)"
    r"\s*:?\s*"
    r"(?:\n\s*)?"
    r"(?:https?://(?:t\.me|telegram\.me)/[^\s\n]+(?:\s*\n\s*\d+)?|"
    r"https?://(?:t\.me|telegram\.me)/\S+)",
    re.IGNORECASE,
)

_SPLIT_TME_LINK_RE = re.compile(
    r"(?:^|\n)\s*https?://(?:t\.me|telegram\.me)/[^\s/\n]+/\s*\n\s*\d+\s*",
    re.IGNORECASE,
)


def strip_original_post_link_block(text: str) -> str:
    """Прибирає «Оригинальное объявление» + голий t.me URL з тексту."""
    if not text:
        return ""
    cleaned = _ORIGINAL_POST_BLOCK_RE.sub("", text)
    cleaned = _SPLIT_TME_LINK_RE.sub("\n", cleaned)
    cleaned = re.sub(
        r"(?:^|\n)\s*[•\*\-\u2022]?\s*"
        + _ORIGINAL_POST_LABEL_RE.pattern
        + r"\s*:?\s*$",
        "",
        cleaned,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def format_original_post_link_html(item: dict, lang: str | None = None) -> str:
    """Приховане посилання на оригінал — текст з <a href>, без голого URL."""
    msg_link = parsed_item_message_link(item)
    if not msg_link:
        return ""
    if not lang:
        lang = detect_lang(
            f"{item.get('title') or ''}\n{item.get('description') or ''}"
        )
    label = "Оригінальне \u043eголошення" if lang == "uk" else "Оригинальное объявление"
    safe_url = html.escape(msg_link, quote=True)
    safe_label = html.escape(label)
    return f'🔗 <a href="{safe_url}">{safe_label}</a>'


def build_marketplace_description(item: dict) -> str:
    base = enrich_description(item["title"], item["description"])
    base = strip_original_post_link_block(base)
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

    parts = [base]
    if contact_line:
        parts.append(contact_line)

    return "\n\n".join(parts)
