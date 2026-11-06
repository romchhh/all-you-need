"""Журнал постів стрічки каналів: без повтору того самого оголошення."""

from __future__ import annotations

import logging
import time

from parser.moderation.channel_feed_select import normalize_title_key
from parser.storage.connection import get_connection

logger = logging.getLogger(__name__)

# Той самий listing у той самий канал не раніше ніж через 21 день.
REPEAT_AFTER_SEC = 21 * 24 * 3600
# Зламане фото не блокує стрічку надовго.
FAIL_COOLDOWN_SEC = 6 * 3600

_ready = False


def ensure_channel_feed_tables() -> None:
    global _ready
    if _ready:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS channel_feed_post (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id INTEGER NOT NULL,
            channel_key TEXT NOT NULL,
            title_key TEXT,
            bucket TEXT,
            city_key TEXT,
            status TEXT NOT NULL DEFAULT 'ok',
            posted_at INTEGER NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_channel_feed_post_lookup
        ON channel_feed_post(channel_key, posted_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_channel_feed_post_listing
        ON channel_feed_post(channel_key, listing_id)
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS channel_feed_state (
            channel_key TEXT PRIMARY KEY,
            last_bucket TEXT,
            last_city TEXT,
            last_listing_id INTEGER
        )
        """
    )
    conn.commit()
    conn.close()
    _ready = True


def _windows() -> tuple[int, int]:
    now = int(time.time())
    return now - REPEAT_AFTER_SEC, now - FAIL_COOLDOWN_SEC


def fetch_feed_rows(channel_key: str) -> list[dict]:
    """Активні оголошення, які цей канал ще не публікував у вікні повтору."""
    ensure_channel_feed_tables()
    ok_since, fail_since = _windows()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT src.id, src.title, src.description, src.price, src.currency, src.isFree,
               src.category, src.subcategory, src.location, src.images, src.condition
        FROM Listing AS src
        WHERE src.status = 'active'
          AND (src.expiresAt IS NULL OR src.expiresAt > datetime('now'))
          AND (src.moderationStatus = 'approved'
               OR src.moderationStatus IS NULL
               OR src.moderationStatus = '')
          AND src.category IN ('services_work', 'realestate', 'hobby_sports')
          AND NOT EXISTS (
                SELECT 1 FROM channel_feed_post AS feed
                WHERE feed.listing_id = src.id
                  AND feed.channel_key = ?
                  AND (
                        (feed.status = 'ok' AND feed.posted_at >= ?)
                        OR (feed.status = 'failed' AND feed.posted_at >= ?)
                  )
          )
        ORDER BY COALESCE(src.publishedAt, src.createdAt) ASC, src.id ASC
        LIMIT 400
        """,
        (channel_key, ok_since, fail_since),
    )
    rows = []
    for row in cursor.fetchall():
        if hasattr(row, "keys"):
            rows.append({key: row[key] for key in row.keys()})
        else:
            rows.append(dict(row))
    conn.close()
    return rows


def recent_title_keys(channel_key: str) -> set[str]:
    """Заголовки, уже опубліковані в цей канал (щоб не дублювати той самий текст)."""
    ensure_channel_feed_tables()
    ok_since, _fail_since = _windows()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT title_key
        FROM channel_feed_post
        WHERE channel_key = ?
          AND status = 'ok'
          AND posted_at >= ?
          AND title_key IS NOT NULL
          AND title_key != ''
        """,
        (channel_key, ok_since),
    )
    keys = set()
    for row in cursor.fetchall():
        value = row["title_key"] if hasattr(row, "keys") else row[0]
        if value:
            keys.add(str(value))
    conn.close()
    return keys


def load_rotation(channel_key: str) -> tuple[str | None, str | None]:
    ensure_channel_feed_tables()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT last_bucket, last_city
        FROM channel_feed_state
        WHERE channel_key = ?
        """,
        (channel_key,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None, None
    if hasattr(row, "keys"):
        return row["last_bucket"], row["last_city"]
    return row[0], row[1]


def remember_channel_publish(
    *,
    listing_id: int,
    channel_key: str,
    title: str,
    bucket: str | None = None,
    city_key: str | None = None,
    status: str = "ok",
) -> None:
    if not listing_id or not channel_key:
        return
    ensure_channel_feed_tables()
    title_key = normalize_title_key(title)
    now = int(time.time())
    ok_since, fail_since = _windows()
    since = ok_since if status == "ok" else fail_since
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT 1 FROM channel_feed_post
            WHERE listing_id = ?
              AND channel_key = ?
              AND status = ?
              AND posted_at >= ?
            LIMIT 1
            """,
            (int(listing_id), channel_key, status, since),
        )
        if cursor.fetchone():
            conn.close()
            return
        cursor.execute(
            """
            INSERT INTO channel_feed_post (
                listing_id, channel_key, title_key, bucket, city_key, status, posted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(listing_id),
                channel_key,
                title_key,
                bucket,
                city_key,
                status,
                now,
            ),
        )
        conn.commit()
    except Exception:
        logger.warning(
            "channel feed: не вдалося записати listing %s → %s",
            listing_id,
            channel_key,
            exc_info=True,
        )
    finally:
        conn.close()


def save_rotation(
    channel_key: str,
    *,
    bucket: str,
    city_key: str,
    listing_id: int,
) -> None:
    ensure_channel_feed_tables()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT channel_key FROM channel_feed_state WHERE channel_key = ?",
            (channel_key,),
        )
        if cursor.fetchone():
            cursor.execute(
                """
                UPDATE channel_feed_state
                SET last_bucket = ?, last_city = ?, last_listing_id = ?
                WHERE channel_key = ?
                """,
                (bucket, city_key, int(listing_id), channel_key),
            )
        else:
            cursor.execute(
                """
                INSERT INTO channel_feed_state (
                    channel_key, last_bucket, last_city, last_listing_id
                ) VALUES (?, ?, ?, ?)
                """,
                (channel_key, bucket, city_key, int(listing_id)),
            )
        conn.commit()
    finally:
        conn.close()
