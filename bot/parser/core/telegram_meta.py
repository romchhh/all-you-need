"""Метадані Telegram-повідомлень."""

from typing import Optional

from parser.config.channels import normalize_channel_key


def message_link(channel: str, message_id: int) -> str:
    clean = normalize_channel_key(channel)
    if clean.lower().startswith("t.me/"):
        clean = clean.split("/", 1)[1]
    clean = clean.lstrip("@").split("/")[0]
    return f"https://t.me/{clean}/{message_id}"


def get_sender_username(msg) -> Optional[str]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None and getattr(sender, "username", None):
            return sender.username
    if getattr(msg, "from_user", None) and getattr(msg.from_user, "username", None):
        return msg.from_user.username
    return None


def get_sender_id(msg) -> Optional[int]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None:
            return getattr(sender, "id", None)
    if getattr(msg, "from_user", None):
        return getattr(msg.from_user, "id", None)
    return None
