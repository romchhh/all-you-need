"""Інкрементальне читання історії каналу — лише нові повідомлення після last cursor."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from parser.config.settings import FETCH_LIMIT, PARSER_CURSOR_OVERLAP
from parser.core.pyrogram_photo_patch import apply_pyrogram_photo_size_patch
from parser.storage.channel_cursors import get_channel_cursor, set_channel_cursor

logger = logging.getLogger(__name__)


async def iter_new_channel_messages(
    app: Any,
    chat_target: Any,
    *,
    source_channel: str,
    parser_type: str = "default",
    fetch_limit: int | None = None,
    ignore_cursor: bool = False,
) -> AsyncIterator[Any]:
    """
    Повертає повідомлення для парсингу.

    fetch_limit — скільки останніх постів максимум читати з каналу.
    ignore_cursor=1 — завжди останні fetch_limit постів (без «cursor»), для catch-up.
    Інакше — новіші за cursor, плюс overlap (перечитати останні N на випадок збоїв).
    """
    apply_pyrogram_photo_size_patch()
    if chat_target is None:
        raise RuntimeError(
            f"{source_channel}: chat_target=None "
            f"(invite не зарезолвився в numeric id)"
        )
    limit = max(1, int(fetch_limit or FETCH_LIMIT))
    stored_cursor = 0
    if not ignore_cursor:
        stored_cursor = await asyncio.to_thread(
            get_channel_cursor, source_channel, parser_type
        )

    # Overlap: перечитуємо трохи «старих» — дублікати message_id відсіє dedup.
    overlap = max(0, int(PARSER_CURSOR_OVERLAP))
    if ignore_cursor or stored_cursor <= 0:
        last_cursor = 0
    else:
        last_cursor = max(0, stored_cursor - overlap)

    head_id: int | None = None
    new_count = 0
    finished_ok = False

    if ignore_cursor:
        logger.info(
            "  %s: останні %s постів (cursor вимкнено, parser_type=%s)",
            source_channel,
            limit,
            parser_type,
        )
    elif stored_cursor:
        logger.info(
            "  %s: інкрементальний (cursor=%s, overlap=%s → з %s, max=%s)",
            source_channel,
            stored_cursor,
            overlap,
            last_cursor,
            limit,
        )
    else:
        logger.info(
            "  %s: перший прохід (max=%s повідомлень)",
            source_channel,
            limit,
        )

    try:
        async for msg in app.get_chat_history(chat_target, limit=limit):
            msg_id = int(getattr(msg, "id", 0) or 0)
            if not msg_id:
                continue
            if head_id is None:
                head_id = msg_id
            if last_cursor and msg_id <= last_cursor:
                break
            new_count += 1
            yield msg
        finished_ok = True
    finally:
        # Cursor оновлюємо лише після успішного проходу історії.
        # Інакше збій на фото стрибав cursor уперед і /parse більше нічого не бачив.
        if finished_ok and head_id is not None:
            await asyncio.to_thread(
                set_channel_cursor, source_channel, parser_type, head_id
            )

    if ignore_cursor or stored_cursor:
        logger.info("  %s: повідомлень для перевірки: %s", source_channel, new_count)
    elif new_count == 0:
        logger.info("  %s: канал порожній або недоступний", source_channel)
