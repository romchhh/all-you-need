"""Парсинг оголошень у коментарях до постів каналу (linked discussion)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)

DISCUSSION_REPLY_LIMIT = 40


async def iter_discussion_listing_messages(
    app: Any,
    chat_target: Any,
    *,
    source_channel: str,
    fetch_limit: int,
) -> AsyncIterator[tuple[Any, int]]:
    """
    Для каналів, де оголошення лише в коментарях:
    обходимо останні пости каналу і yield (reply_message, parent_post_id).
    """
    posts_seen = 0
    async for post in app.get_chat_history(chat_target, limit=max(5, fetch_limit // 3)):
        posts_seen += 1
        if posts_seen > max(8, fetch_limit // 2):
            break
        post_id = int(getattr(post, "id", 0) or 0)
        if not post_id:
            continue
        try:
            async for reply in app.get_discussion_replies(chat_target, post_id, limit=DISCUSSION_REPLY_LIMIT):
                reply_id = int(getattr(reply, "id", 0) or 0)
                if not reply_id:
                    continue
                text = (getattr(reply, "text", None) or getattr(reply, "caption", None) or "").strip()
                if len(text) < 12:
                    continue
                yield reply, post_id
        except Exception as e:
            logger.debug(
                "discussion replies %s post %s: %s",
                source_channel,
                post_id,
                e,
            )
            continue
