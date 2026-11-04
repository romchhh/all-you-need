"""Альбом Telegram: один підпис, кілька кадрів — одне оголошення."""

from __future__ import annotations

from parser.core.text import to_plain_str


def message_has_photo_media(msg) -> bool:
    """Фото в альбомі або image/* document (часто в каналах без .photo)."""
    if getattr(msg, "photo", None):
        return True
    doc = getattr(msg, "document", None)
    if doc and (getattr(doc, "mime_type", None) or "").lower().startswith("image/"):
        return True
    return False


async def expand_incoming_message(msg):
    """
    Повертає text, photos, msg_for_link, canonical_message_id,
    media_group_id, усі id кадрів, готове посилання (або None).
    Канонічний id — кадр з підписом.
    """
    storage_id = getattr(msg, "_parser_storage_id", None)
    link_override = getattr(msg, "_parser_msg_link", None) or None
    group_id = getattr(msg, "media_group_id", None)
    if not group_id:
        text = to_plain_str(getattr(msg, "text", None) or getattr(msg, "caption", None) or "")
        photos = [msg] if message_has_photo_media(msg) else []
        canonical = int(storage_id) if storage_id else int(getattr(msg, "id", 0) or 0)
        own_id = int(getattr(msg, "id", 0) or 0)
        ids = [own_id] if own_id else []
        return text, photos, msg, canonical, None, ids, link_override

    gid = str(group_id)
    try:
        group = await msg.get_media_group()
    except Exception:
        group = [msg]
    if not group:
        group = [msg]
    caption = next((m for m in group if (getattr(m, "text", None) or getattr(m, "caption", None))), group[0])
    text = to_plain_str(getattr(caption, "text", None) or getattr(caption, "caption", None) or "")
    photos = [m for m in group if message_has_photo_media(m)]
    ids = [int(m.id) for m in group if getattr(m, "id", None)]
    canonical = int(getattr(caption, "id", 0) or 0)
    if storage_id:
        canonical = int(storage_id)
    return text, photos, caption, canonical, gid, ids, link_override
