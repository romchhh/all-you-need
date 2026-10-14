"""Парсинг оголошень у коментарях до постів каналу (linked discussion)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from parser.core.telegram_meta import message_link
from parser.storage.channel_cursors import (
    get_channel_cursor_state,
    get_resume_reply_id,
    save_channel_cursor_state,
)

logger = logging.getLogger(__name__)

DISCUSSION_PARSER_TYPE = "discussion"
DISCUSSION_REPLY_PAGE = 40
DISCUSSION_REPLY_CEILING = 200
DISCUSSION_PARENT_BUDGET = 40


def discussion_storage_id(reply_id: int) -> int:
    """Від'ємний id, щоб не зіткнутися з message_id поста того ж каналу."""
    return -abs(int(reply_id))


def discussion_history_offset(
    resume_parent: int,
    resume_reply: int,
    stored_parent: int,
) -> int:
    """
    offset_id для історії постів.
    Недочитаний пост треба включити (id < parent+1), вже закритий — пропустити.
    """
    parent = int(resume_parent or 0)
    if int(resume_reply or 0) and parent:
        return parent + 1
    if parent > int(stored_parent or 0):
        return parent
    return 0


def _replies_call(app: Any, chat_target: Any, post_id: int, batch: int, offset: int):
    kwargs = {"limit": batch}
    if offset:
        kwargs["offset_id"] = offset
    try:
        return app.get_discussion_replies(chat_target, post_id, **kwargs)
    except TypeError:
        if offset:
            return None
        return app.get_discussion_replies(chat_target, post_id, limit=batch)


async def _iter_replies(
    app: Any,
    chat_target: Any,
    source_channel: str,
    post_id: int,
    *,
    start_offset: int = 0,
    progress: dict | None = None,
) -> AsyncIterator[tuple[Any, bool]]:
    """yield (reply, finished). finished=False означає, що стелю відповідей вичерпано."""
    yielded = 0
    offset = int(start_offset or 0)
    if progress is not None:
        progress["oldest_reply"] = offset
    while yielded < DISCUSSION_REPLY_CEILING:
        batch = min(DISCUSSION_REPLY_PAGE, DISCUSSION_REPLY_CEILING - yielded)
        try:
            replies = _replies_call(app, chat_target, post_id, batch, offset)
        except Exception as e:
            logger.debug("discussion replies %s post %s: %s", source_channel, post_id, e)
            yield None, True
            return
        if replies is None:
            logger.warning(
                "discussion replies %s post %s: offset не підтримано, пост закриваємо",
                source_channel,
                post_id,
            )
            yield None, True
            return
        got = 0
        try:
            async for reply in replies:
                got += 1
                reply_id = int(getattr(reply, "id", 0) or 0)
                if not reply_id:
                    continue
                offset = reply_id
                if progress is not None:
                    progress["oldest_reply"] = reply_id
                yielded += 1
                text = (
                    getattr(reply, "text", None) or getattr(reply, "caption", None) or ""
                ).strip()
                if len(text) < 12:
                    continue
                link = f"{message_link(source_channel, post_id)}?comment={reply_id}"
                try:
                    reply._parser_storage_id = discussion_storage_id(reply_id)
                    reply._parser_msg_link = link
                except Exception:
                    logger.debug("cannot stamp discussion reply %s", reply_id)
                yield reply, True
        except Exception as e:
            logger.debug("discussion replies %s post %s: %s", source_channel, post_id, e)
            yield None, True
            return
        if got < batch:
            yield None, True
            return
        if yielded >= DISCUSSION_REPLY_CEILING:
            yield None, False
            return
    yield None, True


async def iter_discussion_listing_messages(
    app: Any,
    chat_target: Any,
    *,
    source_channel: str,
    fetch_limit: int,
) -> AsyncIterator[tuple[Any, int]]:
    """
    Для каналів, де оголошення лише в коментарях:
    обходимо пости каналу і yield (reply_message, parent_post_id).
    """
    stored_parent, seen_head, resume_parent = get_channel_cursor_state(
        source_channel, DISCUSSION_PARSER_TYPE
    )
    resume_reply = get_resume_reply_id(source_channel, DISCUSSION_PARSER_TYPE)
    parent_budget = max(8, min(DISCUSSION_PARENT_BUDGET, max(5, fetch_limit // 2)))
    start_offset = discussion_history_offset(resume_parent, resume_reply, stored_parent)
    parents: list[Any] = []
    head_parent = 0
    reached_stored = stored_parent <= 0
    history_ended = False

    async for post in app.get_chat_history(
        chat_target, limit=parent_budget, offset_id=start_offset
    ):
        post_id = int(getattr(post, "id", 0) or 0)
        if not post_id:
            continue
        if start_offset == 0 and head_parent <= 0:
            head_parent = post_id
        if stored_parent and post_id <= stored_parent:
            reached_stored = True
            break
        parents.append(post)
        if len(parents) >= parent_budget:
            break
    else:
        history_ended = True

    unfinished_parent = 0
    oldest_done = 0
    for post in parents:
        post_id = int(getattr(post, "id", 0) or 0)
        if not post_id:
            continue
        post_finished = True
        reply_cursor = resume_reply if post_id == int(resume_parent or 0) and resume_reply else 0
        progress: dict[str, int] = {"oldest_reply": reply_cursor}
        async for reply, flag in _iter_replies(
            app,
            chat_target,
            source_channel,
            post_id,
            start_offset=reply_cursor,
            progress=progress,
        ):
            if reply is None:
                post_finished = flag
                continue
            yield reply, post_id
        if not post_finished:
            unfinished_parent = post_id
            resume_reply = int(progress.get("oldest_reply") or reply_cursor)
            break
        oldest_done = post_id

    if unfinished_parent:
        save_channel_cursor_state(
            source_channel,
            DISCUSSION_PARSER_TYPE,
            stored_parent,
            seen_head=max(int(seen_head or 0), head_parent),
            resume_before_id=unfinished_parent,
            resume_reply_id=int(resume_reply or 0),
        )
        logger.info(
            "  %s: коментарі поста %s не дочитані, продовжимо наступним циклом",
            source_channel,
            unfinished_parent,
        )
        return

    if reached_stored or history_ended:
        commit = head_parent or int(seen_head or 0) or stored_parent
        if start_offset:
            commit = max(stored_parent, int(seen_head or 0))
        if commit:
            save_channel_cursor_state(
                source_channel,
                DISCUSSION_PARSER_TYPE,
                commit,
                seen_head=commit,
                resume_before_id=0,
            )
        return

    if oldest_done:
        save_channel_cursor_state(
            source_channel,
            DISCUSSION_PARSER_TYPE,
            stored_parent,
            seen_head=max(int(seen_head or 0), head_parent),
            resume_before_id=oldest_done,
        )
        logger.info(
            "  %s: пости коментарів не дочитані, продовжимо з %s",
            source_channel,
            oldest_done,
        )
