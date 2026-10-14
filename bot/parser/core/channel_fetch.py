"""Інкрементальне читання історії каналу — лише нові повідомлення після last cursor."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from parser.config.settings import FETCH_LIMIT, PARSER_CURSOR_OVERLAP
from parser.core.pyrogram_photo_patch import apply_pyrogram_photo_size_patch
from parser.storage.channel_cursors import (
    get_channel_cursor_state,
    save_channel_cursor_state,
)

logger = logging.getLogger(__name__)

# Скільки повідомлень максимум дочитувати за один цикл, якщо між cursor і head дірка.
CATCHUP_CEILING = 1000
_PAGE = 100


def resolve_cursor_commit(
    *,
    stored_cursor: int,
    seen_head: int,
    head_id: int | None,
    oldest_id: int | None,
    reached_stop: bool,
    history_ended: bool,
    commit_head: bool,
) -> tuple[int, int, int]:
    """
    Повертає (last_message_id, seen_head, resume_before_id).

    last_message_id стає head лише коли старий cursor реально досягнуто
    або історія закінчилась. Інакше resume_before_id — звідки продовжити.
    """
    head = int(head_id or 0)
    oldest = int(oldest_id or 0)
    seen = max(int(seen_head or 0), head)
    stored = int(stored_cursor or 0)

    if commit_head or reached_stop or history_ended:
        committed = max(stored, seen, head)
        if committed <= 0:
            return stored, seen, 0
        return committed, committed, 0

    if oldest <= 0:
        return stored, seen, 0
    return stored, seen, oldest


async def _drain(
    app: Any,
    chat_target: Any,
    offset_id: int,
    walk_budget: int,
    stop_at: int,
    meta: dict,
    total_budget: int,
) -> AsyncIterator[Any]:
    offset = int(offset_id or 0)
    walked = 0
    walk_budget = max(0, int(walk_budget))
    while walked < walk_budget and meta["count"] < total_budget:
        batch = min(_PAGE, walk_budget - walked, total_budget - meta["count"])
        if batch <= 0:
            return
        got = 0
        async for msg in app.get_chat_history(chat_target, limit=batch, offset_id=offset):
            got += 1
            msg_id = int(getattr(msg, "id", 0) or 0)
            if not msg_id:
                continue
            if offset == 0 and meta["head"] is None:
                meta["head"] = msg_id
            if stop_at and msg_id <= stop_at:
                meta["reached"] = True
                return
            meta["count"] += 1
            walked += 1
            meta["oldest"] = msg_id
            offset = msg_id
            yield msg
            if walked >= walk_budget or meta["count"] >= total_budget:
                return
        if got < batch:
            meta["ended"] = True
            return


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

    fetch_limit — скільки останніх постів читати на першому проході.
    ignore_cursor=1 — завжди останні fetch_limit постів.
    Інакше — новіші за cursor. Якщо нових більше за сторінку, гортаємо історію
    далі (до CATCHUP_CEILING) і не стрибаємо cursor на head, поки старий cursor
    не досягнуто.
    """
    apply_pyrogram_photo_patch()
    if chat_target is None:
        raise RuntimeError(
            f"{source_channel}: chat_target=None "
            f"(invite не зарезолвився в numeric id)"
        )
    limit = max(1, int(fetch_limit or FETCH_LIMIT))
    stored_cursor, seen_head, resume_before = (0, 0, 0)
    if not ignore_cursor:
        stored_cursor, seen_head, resume_before = await asyncio.to_thread(
            get_channel_cursor_state, source_channel, parser_type
        )
        if seen_head <= 0:
            seen_head = stored_cursor

    overlap = max(0, int(PARSER_CURSOR_OVERLAP))
    commit_head = ignore_cursor or stored_cursor <= 0
    if commit_head:
        stop_id = 0
        budget = limit
        start_offset = 0
    else:
        stop_id = max(0, stored_cursor - overlap)
        budget = CATCHUP_CEILING
        start_offset = resume_before if resume_before > stop_id else 0

    if ignore_cursor:
        logger.info(
            "  %s: останні %s постів (cursor вимкнено, parser_type=%s)",
            source_channel,
            limit,
            parser_type,
        )
    elif stored_cursor:
        logger.info(
            "  %s: інкрементальний (cursor=%s, overlap=%s → до %s, resume=%s, max=%s)",
            source_channel,
            stored_cursor,
            overlap,
            stop_id,
            start_offset,
            budget,
        )
    else:
        logger.info("  %s: перший прохід (max=%s повідомлень)", source_channel, limit)

    meta: dict[str, Any] = {
        "head": None,
        "oldest": None,
        "reached": False,
        "ended": False,
        "count": 0,
    }
    finished_ok = False

    try:
        async for msg in _drain(
            app,
            chat_target,
            start_offset,
            budget,
            stop_id,
            meta,
            budget,
        ):
            yield msg
        finished_ok = True
    finally:
        if finished_ok and not ignore_cursor:
            # Продовження з offset не бачить новий head: комітимо лише seen_head.
            head_for_commit = int(meta["head"] or 0)
            if start_offset:
                head_for_commit = int(seen_head or 0)
            last_id, new_seen, new_resume = resolve_cursor_commit(
                stored_cursor=stored_cursor,
                seen_head=max(int(seen_head), head_for_commit),
                head_id=head_for_commit,
                oldest_id=meta["oldest"],
                reached_stop=bool(meta["reached"]),
                history_ended=bool(meta["ended"]),
                commit_head=commit_head,
            )
            if last_id or new_resume or new_seen:
                await asyncio.to_thread(
                    save_channel_cursor_state,
                    source_channel,
                    parser_type,
                    last_id,
                    seen_head=new_seen,
                    resume_before_id=new_resume,
                )
            if new_resume and not meta["reached"]:
                logger.info(
                    "  %s: дірка не закрита, продовжимо з id %s (перевірено %s)",
                    source_channel,
                    new_resume,
                    meta["count"],
                )
        elif finished_ok and ignore_cursor and meta["head"]:
            await asyncio.to_thread(
                save_channel_cursor_state,
                source_channel,
                parser_type,
                int(meta["head"]),
                seen_head=int(meta["head"]),
                resume_before_id=0,
            )

    if ignore_cursor or stored_cursor:
        logger.info("  %s: повідомлень для перевірки: %s", source_channel, meta["count"])
    elif meta["count"] == 0:
        logger.info("  %s: канал порожній або недоступний", source_channel)
