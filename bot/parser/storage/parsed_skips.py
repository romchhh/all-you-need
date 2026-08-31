"""Збереження пропущених постів парсера (AI/quality) для аналітики в адмінці."""

from __future__ import annotations

import logging
from typing import Optional

from parser.storage.connection import get_connection

logger = logging.getLogger(__name__)

_schema_ready = False

# Шумові причини — не зберігаємо (overlap/cursor повтори)
_NOISE_REASONS = frozenset({
    "дублікат (бд)",
})


def ensure_parsed_skips_table() -> None:
    global _schema_ready
    if _schema_ready:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS parsed_skips (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            source_channel  TEXT NOT NULL,
            source_city     TEXT,
            message_id      INTEGER,
            skip_reason     TEXT NOT NULL,
            title           TEXT,
            description     TEXT,
            category        TEXT,
            raw_text_preview TEXT,
            msg_link        TEXT,
            parser_type     TEXT DEFAULT 'default',
            created_at      TEXT DEFAULT (datetime('now'))
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_skips_created "
        "ON parsed_skips(created_at)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_skips_reason "
        "ON parsed_skips(skip_reason)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_skips_channel_msg "
        "ON parsed_skips(source_channel, message_id)"
    )
    conn.commit()
    conn.close()
    _schema_ready = True


def record_parse_skip(
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
    reason = (skip_reason or "").strip()
    if not reason or reason in _NOISE_REASONS:
        return
    ensure_parsed_skips_table()
    preview = (raw_text or f"{title}\n{description}").strip()[:500]
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO parsed_skips (
                source_channel, source_city, message_id, skip_reason,
                title, description, category, raw_text_preview,
                msg_link, parser_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_channel,
                source_city or "",
                message_id,
                reason,
                (title or "")[:300],
                (description or "")[:800],
                (category or "")[:64],
                preview,
                msg_link or "",
                parser_type or "default",
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        logger.exception(
            "record_parse_skip failed channel=%s msg=%s reason=%s",
            source_channel,
            message_id,
            reason,
        )


def prune_old_skips(days: int = 14) -> int:
    """Видалити старі skip-записи (cron/очистка)."""
    ensure_parsed_skips_table()
    days = max(1, int(days))
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM parsed_skips WHERE datetime(created_at) < datetime('now', ?)",
        (f"-{days} days",),
    )
    n = cursor.rowcount
    conn.commit()
    conn.close()
    return n
