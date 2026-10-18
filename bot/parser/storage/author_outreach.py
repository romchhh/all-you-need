"""Облік DM авторам + блок повторів протягом місяця."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from parser.storage.connection import get_connection
from parser.storage.listing_dedup import resolve_stable_dedup_key

logger = logging.getLogger(__name__)

_OUTREACH_DAYS = 30


def ensure_author_outreach_table() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS parser_author_outreach (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_channel TEXT NOT NULL,
            message_id INTEGER NOT NULL,
            dedup_key TEXT,
            author_id INTEGER,
            author_username TEXT,
            parsed_item_id INTEGER,
            listing_id INTEGER,
            notify_kind TEXT NOT NULL DEFAULT 'goods',
            notified_at TEXT NOT NULL,
            UNIQUE(source_channel, message_id)
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_outreach_author ON parser_author_outreach(author_id, notified_at)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_outreach_dedup ON parser_author_outreach(dedup_key, notified_at)"
    )
    conn.commit()
    conn.close()


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = str(raw).strip()
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _within_days(raw: str | None, days: int) -> bool:
    dt = _parse_ts(raw)
    if dt is None:
        return False
    return dt >= datetime.now(timezone.utc) - timedelta(days=days)


def _norm_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())[:220]


def _norm_price(price: str | None, is_free: bool) -> str:
    if is_free:
        return "free"
    return re.sub(r"\s+", "", str(price or "").lower())[:40]


def _author_id(item: dict) -> int | None:
    raw = item.get("author_id")
    if raw in (None, "", 0, "0"):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def source_message_locked(source_channel: str, message_id: int) -> bool:
    """Той самий пост уже опублікований / повідомлення надіслано за останні 30 днів."""
    ensure_author_outreach_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT o.notified_at, pi.marketplace_listing_id, pi.status
        FROM parsed_items pi
        LEFT JOIN parser_author_outreach o
          ON o.source_channel = pi.source_channel AND o.message_id = pi.message_id
        WHERE pi.source_channel = ? AND pi.message_id = ?
        ORDER BY pi.id DESC
        LIMIT 1
        """,
        (source_channel, message_id),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return False
    data = dict(row)
    if data.get("marketplace_listing_id") and _within_days(data.get("notified_at"), _OUTREACH_DAYS):
        return True
    if _within_days(data.get("notified_at"), _OUTREACH_DAYS):
        return True
    status = (data.get("status") or "").lower()
    if data.get("marketplace_listing_id") and status == "approved":
        return True
    return False


def _already_notified_author_title_price(cursor: Any, item: dict) -> bool:
    author = _author_id(item)
    if not author:
        return False
    title = _norm_title(str(item.get("title") or ""))
    if len(title) < 4:
        return False
    price_part = _norm_price(
        None if item.get("price") is None else str(item.get("price") or ""),
        bool(item.get("is_free")),
    )
    if not price_part:
        return False
    since = (datetime.now(timezone.utc) - timedelta(days=_OUTREACH_DAYS)).isoformat()
    cursor.execute(
        """
        SELECT 1
        FROM parser_author_outreach o
        JOIN parsed_items pi ON pi.id = o.parsed_item_id
        WHERE o.author_id = ?
          AND o.notified_at >= ?
          AND lower(pi.title) = ?
          AND (
                lower(replace(COALESCE(pi.price, ''), ' ', '')) = ?
                OR (? = 'free' AND (pi.is_free = 1 OR lower(COALESCE(pi.price, '')) IN ('free', '0')))
              )
        LIMIT 1
        """,
        (author, since, title, price_part, price_part),
    )
    return cursor.fetchone() is not None


def should_skip_author_dm(item: dict, *, listing_id: int) -> str | None:
    """Причина пропуску DM або None якщо можна слати."""
    ensure_author_outreach_table()
    source_channel = (item.get("source_channel") or "").strip()
    try:
        message_id = int(item.get("message_id") or 0)
    except (TypeError, ValueError):
        message_id = 0
    dedup_key = resolve_stable_dedup_key(item)

    conn = get_connection()
    cursor = conn.cursor()
    if source_channel and message_id:
        cursor.execute(
            """
            SELECT notified_at FROM parser_author_outreach
            WHERE source_channel = ? AND message_id = ?
            """,
            (source_channel, message_id),
        )
        row = cursor.fetchone()
        if row and _within_days(dict(row).get("notified_at"), _OUTREACH_DAYS):
            conn.close()
            return "already_notified_message"

    if listing_id > 0:
        cursor.execute(
            """
            SELECT notified_at FROM parser_author_outreach
            WHERE listing_id = ? AND notified_at >= ?
            ORDER BY notified_at DESC LIMIT 1
            """,
            (
                listing_id,
                (datetime.now(timezone.utc) - timedelta(days=_OUTREACH_DAYS)).isoformat(),
            ),
        )
        row = cursor.fetchone()
        if row:
            conn.close()
            return "already_notified_listing"

    if dedup_key:
        cursor.execute(
            """
            SELECT notified_at FROM parser_author_outreach
            WHERE dedup_key = ? AND notified_at >= ?
            ORDER BY notified_at DESC LIMIT 1
            """,
            (
                dedup_key,
                (datetime.now(timezone.utc) - timedelta(days=_OUTREACH_DAYS)).isoformat(),
            ),
        )
        row = cursor.fetchone()
        if row:
            conn.close()
            return "already_notified_dedup"

    if _already_notified_author_title_price(cursor, item):
        conn.close()
        return "already_notified_author_title_price"

    conn.close()
    return None


def record_author_outreach(
    item: dict,
    *,
    listing_id: int,
    notify_kind: str = "goods",
) -> None:
    ensure_author_outreach_table()
    now = datetime.now(timezone.utc).isoformat()
    dedup_key = resolve_stable_dedup_key(item) or None
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO parser_author_outreach (
                source_channel, message_id, dedup_key, author_id, author_username,
                parsed_item_id, listing_id, notify_kind, notified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_channel, message_id) DO UPDATE SET
                listing_id = excluded.listing_id,
                dedup_key = COALESCE(excluded.dedup_key, parser_author_outreach.dedup_key),
                notify_kind = excluded.notify_kind,
                notified_at = excluded.notified_at
            """,
            (
                (item.get("source_channel") or "").strip(),
                int(item.get("message_id") or 0),
                dedup_key,
                _author_id(item),
                (item.get("author_username") or "") or None,
                item.get("id"),
                listing_id,
                notify_kind,
                now,
            ),
        )
        conn.commit()
    except Exception as e:
        logger.warning("record_author_outreach failed: %s", e)
    finally:
        conn.close()


def dedup_key_recently_published(dedup_key: str) -> bool:
    if not dedup_key:
        return False
    ensure_author_outreach_table()
    conn = get_connection()
    cursor = conn.cursor()
    since = (datetime.now(timezone.utc) - timedelta(days=_OUTREACH_DAYS)).isoformat()
    cursor.execute(
        """
        SELECT 1 FROM parser_author_outreach
        WHERE dedup_key = ? AND notified_at >= ?
        LIMIT 1
        """,
        (dedup_key, since),
    )
    ok = cursor.fetchone() is not None
    conn.close()
    return ok
