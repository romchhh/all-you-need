"""Форматування: URL, опис, хештеги, оновлення повідомлень модерації."""

from __future__ import annotations

import html
import logging
import re
from typing import Optional

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message

from parser.category_keywords import get_category_label, get_subcategory_label
from parser.config.settings import BOT_USERNAME, WEBAPP_URL
from parser.core.telegram_meta import (
    extract_username_from_text,
    message_link,
    normalize_channel_key,
    parsed_item_message_link,
)
from parser.core.text import detect_lang, enrich_description

logger = logging.getLogger(__name__)


def _source_channel_url(item: dict) -> str:
    """Посилання на канал/групу-джерело (без message_id), якщо можливо."""
    source = (item.get("source_channel") or "").strip()
    if not source:
        return ""
    clean = normalize_channel_key(source)
    lower = clean.lower()
    if lower.startswith("t.me/+") or lower.startswith("t.me/joinchat/"):
        return f"https://{clean}"
    if lower.startswith("t.me/"):
        return f"https://{clean.split('/', 1)[0]}/{clean.split('/', 1)[1].split('/')[0]}"
    name = clean.lstrip("@").split("/")[0]
    if not name or name.isdigit() or name.startswith("-"):
        return ""
    return f"https://t.me/{name}"


# ── URLs ──────────────────────────────────────

def listing_url(listing_id: int) -> str:
    base = WEBAPP_URL.rstrip("/")
    return f"{base}/listing/{listing_id}"


def listing_miniapp_url(listing_id: int) -> str:
    if BOT_USERNAME:
        return f"https://t.me/{BOT_USERNAME}?startapp=listing_{listing_id}"
    return listing_url(listing_id)


# ── Group message edit ────────────────────────

def _message_has_caption(message: Message | None) -> bool:
    if message is None:
        return False
    return bool(message.photo or message.video or message.document or message.animation)


async def edit_group_message(
    bot: Bot,
    group_id: int,
    message_id: int,
    status_text: str,
    parse_mode: Optional[str] = None,
    *,
    message: Message | None = None,
):
    """Редагує повідомлення модерації (текст або caption), прибирає кнопки."""
    base_kwargs = {
        "chat_id": group_id,
        "message_id": message_id,
        "reply_markup": None,
    }

    try:
        await bot.edit_message_reply_markup(**base_kwargs)
    except TelegramBadRequest:
        pass
    except Exception as e:
        logger.debug("edit_message_reply_markup: %s", e)

    use_caption = _message_has_caption(message)
    content = status_text[:1024] if use_caption else status_text[:4096]

    edit_kwargs = dict(base_kwargs)
    if parse_mode:
        edit_kwargs["parse_mode"] = parse_mode

    async def _edit_as_caption() -> None:
        await bot.edit_message_caption(caption=content, **edit_kwargs)

    async def _edit_as_text() -> None:
        await bot.edit_message_text(text=content, **edit_kwargs)

    try:
        if use_caption:
            await _edit_as_caption()
        else:
            await _edit_as_text()
    except TelegramBadRequest as e:
        err = str(e).lower()
        if "message is not modified" in err:
            return
        try:
            if use_caption:
                await _edit_as_text()
            else:
                await _edit_as_caption()
        except TelegramBadRequest as e2:
            if "message is not modified" not in str(e2).lower():
                logger.warning("Не вдалося оновити повідомлення групи: %s", e2)
        except Exception as e2:
            logger.warning("Не вдалося оновити повідомлення групи: %s", e2)
    except Exception as e:
        logger.warning("Не вдалося оновити повідомлення групи: %s", e)


# ── Description ───────────────────────────────

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


def resolved_author_username(item: dict) -> str:
    """@username автора з item або з тексту поста."""
    author_username = (item.get("author_username") or "").strip().lstrip("@")
    if not author_username:
        author_username = (
            extract_username_from_text(
                str(item.get("raw_text") or ""),
                str(item.get("source_channel") or ""),
            )
            or ""
        ).lstrip("@")
    return author_username


def format_original_post_link_html(item: dict, lang: str | None = None) -> str:
    """Посилання на оригінал — лише якщо немає @username автора."""
    if resolved_author_username(item):
        return ""
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
    """
    Опис для Listing на маркетплейсі:
    - @username автора, якщо відомий
    - інакше посилання на оригінальний пост / канал-джерело
    """
    base = enrich_description(item["title"], item["description"])
    base = strip_original_post_link_block(base)
    lang = detect_lang(
        f"{item.get('title') or ''}\n{item.get('description') or ''}"
    )

    author_username = resolved_author_username(item)

    extras: list[str] = []
    msg_link = parsed_item_message_link(item)
    if not msg_link:
        # msg_link у item або зібрати з source_channel + message_id
        mid = item.get("message_id")
        source = (item.get("source_channel") or "").strip()
        if source and mid is not None:
            try:
                msg_link = message_link(source, int(mid))
            except (TypeError, ValueError):
                msg_link = None
    if not msg_link:
        msg_link = _source_channel_url(item) or None

    if author_username:
        extras.append(f"👤 Автор: @{author_username}")
    elif msg_link:
        label = (
            "Оригінальне оголошення"
            if lang == "uk"
            else "Оригинальное объявление"
        )
        extras.append(f"🔗 {label}: {msg_link}")

    parts = [base, *extras]
    return "\n\n".join(p for p in parts if p)


# ── Hashtags ─────────────────────────────────

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
    from parser.moderation.services_publish import is_germany_wide_location

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


# ── Telegram HTML caption ─────────────────────

_TELEGRAM_HTML_TAG_RE = re.compile(
    r"<(/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|a|blockquote|span|tg-spoiler)"
    r"(\s[^>]*)?>",
    re.IGNORECASE,
)


def _telegram_html_open_tags(text: str) -> list[str]:
    stack: list[str] = []
    for m in _TELEGRAM_HTML_TAG_RE.finditer(text):
        closing, tag = m.group(1), m.group(2).lower()
        if closing:
            if stack and stack[-1] == tag:
                stack.pop()
        else:
            stack.append(tag)
    return stack


def truncate_plain_text(text: str, max_len: int) -> str:
    if max_len <= 0:
        return ""
    if len(text) <= max_len:
        return text
    if max_len == 1:
        return "…"
    return text[: max_len - 1] + "…"


def truncate_telegram_html(text: str, max_len: int = 1024) -> str:
    """Обрізає HTML-підпис Telegram без «Unclosed start tag»."""
    text = text or ""
    if len(text) <= max_len:
        return text

    ellipsis = "…"
    limit = max_len - len(ellipsis)
    if limit <= 0:
        return ellipsis[:max_len]

    cut = text[:limit]
    cut = re.sub(r"<[^>\n]*$", "", cut)

    if "a" in _telegram_html_open_tags(cut):
        for marker in ("<a ", "<a>"):
            pos = cut.rfind(marker)
            if pos != -1:
                cut = cut[:pos].rstrip()
                break

    for tag in reversed(_telegram_html_open_tags(cut)):
        closing = f"</{tag}>"
        if len(cut) + len(closing) + len(ellipsis) <= max_len:
            cut += closing
        else:
            break

    return cut + ellipsis


def assemble_telegram_caption(
    *,
    title_html: str,
    description_html: str,
    footer_html: str,
    max_len: int = 1024,
) -> str:
    """
    Збирає caption: спочатку фіксований footer, опис обрізається під ліміт.
    description_html — уже безпечний HTML (escape + <a>).
    """
    title_html = title_html or ""
    footer_html = footer_html or ""
    sep = "\n\n"

    if description_html:
        fixed = f"{title_html}{sep}{sep}{footer_html}"
        budget = max_len - len(fixed)
        if budget <= 0:
            description_html = ""
        elif len(description_html) > budget:
            if "<a " in description_html or "<a>" in description_html:
                plain, _, link_part = description_html.partition("\n\n")
                link_reserve = len(sep) + len(link_part) if link_part else 0
                plain_budget = max(0, budget - link_reserve)
                plain = truncate_plain_text(plain, plain_budget)
                if plain and link_part and len(plain) + link_reserve <= budget:
                    description_html = f"{plain}{sep}{link_part}"
                elif plain:
                    description_html = plain
                elif link_part and len(link_part) <= budget:
                    description_html = link_part
                else:
                    description_html = truncate_telegram_html(description_html, budget)
            else:
                description_html = truncate_plain_text(description_html, budget)

    if description_html:
        body = f"{title_html}{sep}{description_html}{sep}{footer_html}"
    else:
        body = f"{title_html}{sep}{footer_html}"

    return truncate_telegram_html(body, max_len)
