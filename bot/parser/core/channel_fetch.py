"""Інкрементальне читання історії каналу — лише нові повідомлення після last cursor."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from parser.config.settings import FETCH_LIMIT
from parser.storage.channel_cursors import get_channel_cursor, set_channel_cursor

logger = logging.getLogger(__name__)


async def iter_new_channel_messages(
    app: Any,
    chat_target: Any,
    *,
    source_channel: str,
    parser_type: str = "default",
) -> AsyncIterator[Any]:
    """
    Повертає лише повідомлення новіші за збережений cursor.
    Після проходу оновлює cursor до найновішого message_id у каналі.
    """
    last_cursor = get_channel_cursor(source_channel, parser_type)
    head_id: int | None = None
    new_count = 0

    if last_cursor:
        logger.info(
            "  %s: інкрементальний парсинг (cursor=%s, max=%s)",
            source_channel,
            last_cursor,
            FETCH_LIMIT,
        )
    else:
        logger.info(
            "  %s: перший прохід (max=%s повідомлень)",
            source_channel,
            FETCH_LIMIT,
        )

    async for msg in app.get_chat_history(chat_target, limit=FETCH_LIMIT):
        msg_id = int(getattr(msg, "id", 0) or 0)
        if not msg_id:
            continue
        if head_id is None:
            head_id = msg_id
        if last_cursor and msg_id <= last_cursor:
            break
        new_count += 1
        yield msg

    if head_id is not None:
        set_channel_cursor(source_channel, parser_type, head_id)

    if last_cursor:
        logger.info("  %s: нових повідомлень для перевірки: %s", source_channel, new_count)
    elif new_count == 0:
        logger.info("  %s: канал порожній або недоступний", source_channel)
