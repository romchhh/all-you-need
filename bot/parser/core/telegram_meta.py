"""Метадані Telegram-повідомлень."""

import re
from typing import Optional

from parser.config.channels import normalize_channel_key


def message_link(channel: str, message_id: int) -> str:
    clean = normalize_channel_key(channel)
    if clean.lower().startswith("t.me/"):
        clean = clean.split("/", 1)[1]
    clean = clean.lstrip("@").split("/")[0]
    return f"https://t.me/{clean}/{message_id}"


def parsed_item_message_link(item: dict) -> Optional[str]:
    """Посилання на оригінальний пост у групі/каналі (parsed_items)."""
    source_channel = (item.get("source_channel") or "").strip()
    message_id = item.get("message_id")
    if source_channel and message_id is not None:
        try:
            return message_link(source_channel, int(message_id))
        except (TypeError, ValueError):
            pass
    link = (item.get("msg_link") or "").strip()
    return link or None


def get_sender_username(msg) -> Optional[str]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None and getattr(sender, "username", None):
            return sender.username
    if getattr(msg, "from_user", None) and getattr(msg.from_user, "username", None):
        return msg.from_user.username
    return None


# Канали/боти — не плутати з автором оголошення при парсингу @ з тексту
_IGNORE_MENTION_USERNAMES: frozenset[str] = frozenset({
    "gamburg_baraxlanet",
    "gamburg_baraholka",
    "secondhand_hh",
    "hamburggggggg",
    "hamburgbeauty",
    "baraholkaberlin",
    "tradeground",
    "tradeground_seller",
    "tradeground_seller2",
})


def extract_username_from_text(text: str, channel: str = "") -> Optional[str]:
    """Витягує @username автора з тексту поста (барахолки часто без from_user)."""
    if not text:
        return None

    channel_key = normalize_channel_key(channel)
    if channel_key.lower().startswith("t.me/"):
        channel_slug = channel_key.rsplit("/", 1)[-1].lower()
    else:
        channel_slug = channel_key.lstrip("@").split("/")[0].lower()

    ignore = _IGNORE_MENTION_USERNAMES | {channel_slug}

    for match in re.finditer(r"@([a-zA-Z][a-zA-Z0-9_]{3,31})\b", text):
        username = match.group(1)
        if username.lower() in ignore:
            continue
        return username

    return None


def resolve_author_username(msg, text: str, channel: str = "") -> Optional[str]:
    """Telegram meta → @ з тексту поста."""
    return get_sender_username(msg) or extract_username_from_text(text, channel)


def get_sender_id(msg) -> Optional[int]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None:
            return getattr(sender, "id", None)
    if getattr(msg, "from_user", None):
        return getattr(msg.from_user, "id", None)
    return None
