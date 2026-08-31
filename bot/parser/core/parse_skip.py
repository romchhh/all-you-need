"""Допоміжник: записати пропуск поста в parsed_skips."""

from __future__ import annotations

from typing import Optional

from parser.storage.parsed_skips import record_parse_skip


def log_parse_skip(
    *,
    source_channel: str,
    skip_reason: str,
    source_city: str = "",
    message_id: Optional[int] = None,
    title: str = "",
    description: str = "",
    category: str = "",
    raw_text: str = "",
    msg_link: str = "",
    parser_type: str = "default",
) -> None:
    record_parse_skip(
        source_channel=source_channel,
        skip_reason=skip_reason,
        source_city=source_city,
        message_id=message_id,
        title=title,
        description=description,
        category=category,
        raw_text=raw_text,
        msg_link=msg_link,
        parser_type=parser_type,
    )
