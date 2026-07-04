"""Позиція останнього переглянутого повідомлення по каналу (інкрементальний парсинг)."""

from __future__ import annotations

import logging

from parser.storage.connection import get_connection

logger = logging.getLogger(__name__)

_cursors_table_ready = False


def ensure_parser_cursors_table() -> None:
    global _cursors_table_ready
    if _cursors_table_ready:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parser_channel_cursors (
            source_channel   TEXT NOT NULL,
            parser_type      TEXT NOT NULL DEFAULT 'default',
            last_message_id  INTEGER NOT NULL DEFAULT 0,
            updated_at       TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (source_channel, parser_type)
        )
    """)
    conn.commit()
    conn.close()
    _cursors_table_ready = True


def get_channel_cursor(source_channel: str, parser_type: str = "default") -> int:
    ensure_parser_cursors_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT last_message_id FROM parser_channel_cursors
        WHERE source_channel = ? AND parser_type = ?
        """,
        (source_channel, parser_type),
    )
    row = cursor.fetchone()
    if row:
        conn.close()
        return int(row[0] or 0)

    cursor.execute(
        """
        SELECT MAX(message_id) FROM parsed_items
        WHERE source_channel = ? AND COALESCE(parser_type, 'default') = ?
        """,
        (source_channel, parser_type),
    )
    boot = cursor.fetchone()
    conn.close()
    boot_id = int(boot[0] or 0) if boot else 0
    if boot_id:
        set_channel_cursor(source_channel, parser_type, boot_id)
        logger.info(
            "parser cursor bootstrap %s (%s) → message_id=%s",
            source_channel,
            parser_type,
            boot_id,
        )
    return boot_id


def set_channel_cursor(source_channel: str, parser_type: str, last_message_id: int) -> None:
    if last_message_id <= 0:
        return
    ensure_parser_cursors_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT last_message_id FROM parser_channel_cursors
        WHERE source_channel = ? AND parser_type = ?
        """,
        (source_channel, parser_type),
    )
    row = cursor.fetchone()
    merged = max(int(row[0] or 0), int(last_message_id)) if row else int(last_message_id)
    cursor.execute(
        """
        INSERT INTO parser_channel_cursors (source_channel, parser_type, last_message_id, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(source_channel, parser_type) DO UPDATE SET
            last_message_id = excluded.last_message_id,
            updated_at = datetime('now')
        """,
        (source_channel, parser_type, merged),
    )
    conn.commit()
    conn.close()
