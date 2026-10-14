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
    cursor.execute("PRAGMA table_info(parser_channel_cursors)")
    col_names = {row[1] for row in cursor.fetchall()}
    if "resume_before_id" not in col_names:
        cursor.execute(
            "ALTER TABLE parser_channel_cursors ADD COLUMN resume_before_id INTEGER NOT NULL DEFAULT 0"
        )
    if "seen_head" not in col_names:
        cursor.execute(
            "ALTER TABLE parser_channel_cursors ADD COLUMN seen_head INTEGER NOT NULL DEFAULT 0"
        )
    if "resume_reply_id" not in col_names:
        cursor.execute(
            "ALTER TABLE parser_channel_cursors ADD COLUMN resume_reply_id INTEGER NOT NULL DEFAULT 0"
        )
    conn.commit()
    conn.close()
    _cursors_table_ready = True


def get_channel_cursor_state(
    source_channel: str, parser_type: str = "default"
) -> tuple[int, int, int]:
    """(last_message_id, seen_head, resume_before_id)."""
    ensure_parser_cursors_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT last_message_id, seen_head, resume_before_id
        FROM parser_channel_cursors
        WHERE source_channel = ? AND parser_type = ?
        """,
        (source_channel, parser_type),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return 0, 0, 0
    if isinstance(row, dict):
        return (
            int(row.get("last_message_id") or 0),
            int(row.get("seen_head") or 0),
            int(row.get("resume_before_id") or 0),
        )
    last = int(row[0] or 0)
    seen = int(row[1] or 0) if len(row) > 1 else 0
    resume = int(row[2] or 0) if len(row) > 2 else 0
    return last, seen, resume


def get_resume_reply_id(source_channel: str, parser_type: str = "default") -> int:
    """Зсув у коментарях поста, якщо відповіді не дочитані."""
    ensure_parser_cursors_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT resume_reply_id FROM parser_channel_cursors
        WHERE source_channel = ? AND parser_type = ?
        """,
        (source_channel, parser_type),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return 0
    if isinstance(row, dict):
        return int(row.get("resume_reply_id") or 0)
    return int(row[0] or 0)


def save_channel_cursor_state(
    source_channel: str,
    parser_type: str,
    last_message_id: int,
    *,
    seen_head: int = 0,
    resume_before_id: int = 0,
    resume_reply_id: int = 0,
) -> None:
    """Пише точний стан. last_message_id не зсувається назад."""
    if last_message_id <= 0 and seen_head <= 0 and resume_before_id <= 0:
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
    prev = int(row[0] or 0) if row else 0
    merged_last = max(prev, int(last_message_id))
    cursor.execute(
        """
        INSERT INTO parser_channel_cursors (
            source_channel, parser_type, last_message_id, seen_head,
            resume_before_id, resume_reply_id, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(source_channel, parser_type) DO UPDATE SET
            last_message_id = excluded.last_message_id,
            seen_head = excluded.seen_head,
            resume_before_id = excluded.resume_before_id,
            resume_reply_id = excluded.resume_reply_id,
            updated_at = datetime('now')
        """,
        (
            source_channel,
            parser_type,
            merged_last,
            int(seen_head),
            int(resume_before_id),
            int(resume_reply_id),
        ),
    )
    conn.commit()
    conn.close()


def get_channel_cursor(source_channel: str, parser_type: str = "default") -> int:
    """
    Повертає збережений cursor.
    НЕ bootstrap з MAX(message_id) — це стрибало вперед і пропускало
    непрочитані пости (інкрементальний /parse тоді завжди +0).
    """
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
    conn.close()
    if not row:
        return 0
    return int(row[0] or 0)


def set_channel_cursor(source_channel: str, parser_type: str, last_message_id: int) -> None:
    """Повний commit: cursor = head, незакритої дірки немає."""
    if last_message_id <= 0:
        return
    save_channel_cursor_state(
        source_channel,
        parser_type,
        last_message_id,
        seen_head=last_message_id,
        resume_before_id=0,
    )


def reset_channel_cursor(source_channel: str, parser_type: str = "default") -> None:
    ensure_parser_cursors_table()
    conn = get_connection()
    conn.execute(
        """
        DELETE FROM parser_channel_cursors
        WHERE source_channel = ? AND parser_type = ?
        """,
        (source_channel, parser_type),
    )
    conn.commit()
    conn.close()
