"""Резолв chat_id групи модерації з env (без «тихих» порожніх значень)."""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def parse_telegram_chat_id(raw: object) -> Optional[int]:
    if raw is None:
        return None
    s = str(raw).strip().strip('"').strip("'")
    if not s or s.lower() in ("none", "null", "0"):
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        logger.error("Invalid Telegram chat id: %r", raw)
        return None


def resolve_moderation_group_id() -> Optional[int]:
    """
    Бере перше непорожнє значення.
    Docker інколи підставляє порожній MODERATION_GROUP_ID= з кореневого .env —
    тоді треба явне з bot/.env (TOKEN-бот).
    """
    for key in ("MODERATION_GROUP_ID", "MODERATION_CHAT_ID"):
        cid = parse_telegram_chat_id(os.getenv(key))
        if cid is not None:
            return cid
    return None
