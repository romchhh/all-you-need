"""Збереження channelMessageId: на PG колонка часто INTEGER, а код пише JSON '[1800]'."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional, Sequence

from database_functions.db_connection import get_connection, is_postgres

logger = logging.getLogger(__name__)


def _pg_channel_message_id_type(cursor) -> Optional[str]:
    cursor.execute(
        """
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'TelegramListing'
          AND column_name = 'channelMessageId'
        LIMIT 1
        """
    )
    row = cursor.fetchone()
    if not row:
        return None
    if isinstance(row, dict):
        return str(row.get("data_type") or "")
    return str(row[0] or "")


def ensure_channel_message_id_column(cursor) -> None:
    """Гарантує колонку; на PostgreSQL приводить до TEXT (під JSON масив ids)."""
    cursor.execute("PRAGMA table_info(TelegramListing)")
    columns = {row[1] for row in cursor.fetchall()}
    if "channelMessageId" not in columns:
        col_type = "TEXT" if is_postgres() else "TEXT"
        cursor.execute(
            f'ALTER TABLE TelegramListing ADD COLUMN channelMessageId {col_type}'
        )
        return

    if not is_postgres():
        return

    dtype = (_pg_channel_message_id_type(cursor) or "").lower()
    if dtype in ("integer", "bigint", "smallint", "numeric"):
        logger.warning(
            "TelegramListing.channelMessageId is %s — altering to TEXT for media-group ids",
            dtype,
        )
        cursor.execute(
            """
            ALTER TABLE "TelegramListing"
            ALTER COLUMN "channelMessageId" TYPE TEXT
            USING "channelMessageId"::text
            """
        )


def serialize_channel_message_ids(message_ids: Sequence[Any]) -> str:
    ids: list[int] = []
    for mid in message_ids:
        try:
            ids.append(int(mid))
        except (TypeError, ValueError):
            continue
    if not ids:
        return "[]"
    return json.dumps(ids)


def save_channel_message_ids(listing_id: int, message_ids: Sequence[Any]) -> None:
    payload = serialize_channel_message_ids(message_ids)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        ensure_channel_message_id_column(cursor)
        cursor.execute(
            """
            UPDATE TelegramListing
            SET channelMessageId = ?
            WHERE id = ?
            """,
            (payload, listing_id),
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()
