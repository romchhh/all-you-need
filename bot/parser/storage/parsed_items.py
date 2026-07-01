"""CRUD для таблиці parsed_items."""

import hashlib
import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

from parser.storage.connection import get_connection

logger = logging.getLogger(__name__)


def ensure_parsed_items_table():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parsed_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            source_channel  TEXT NOT NULL,
            source_city     TEXT NOT NULL,
            message_id      INTEGER NOT NULL,
            media_group_id  TEXT,
            author_username TEXT,
            author_id       INTEGER,
            title           TEXT NOT NULL,
            description     TEXT NOT NULL,
            price           TEXT,
            currency        TEXT,
            is_free         INTEGER DEFAULT 0,
            category        TEXT NOT NULL,
            subcategory     TEXT,
            condition       TEXT,
            location        TEXT NOT NULL,
            images_json     TEXT,
            raw_text        TEXT,
            content_hash    TEXT,
            status          TEXT DEFAULT 'pending',
            admin_message_id INTEGER,
            marketplace_listing_id INTEGER,
            created_at      TEXT DEFAULT (datetime('now')),
            moderated_at    TEXT,
            moderated_by    INTEGER,
            UNIQUE(source_channel, message_id)
        )
    """)
    cursor.execute("PRAGMA table_info(parsed_items)")
    col_names = {row[1] for row in cursor.fetchall()}
    if "content_hash" not in col_names:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN content_hash TEXT")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_items_content_hash "
        "ON parsed_items(content_hash) WHERE content_hash IS NOT NULL"
    )
    cursor.execute("PRAGMA table_info(parsed_items)")
    col_names2 = {row[1] for row in cursor.fetchall()}
    if "dedup_key" not in col_names2:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN dedup_key TEXT")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_items_dedup_key "
        "ON parsed_items(dedup_key) WHERE dedup_key IS NOT NULL"
    )
    cursor.execute("PRAGMA table_info(parsed_items)")
    col_names3 = {row[1] for row in cursor.fetchall()}
    if "parser_type" not in col_names3:
        cursor.execute(
            "ALTER TABLE parsed_items ADD COLUMN parser_type TEXT DEFAULT 'default'"
        )
    _cleanup_pending_service_channel_defaults(cursor)
    conn.commit()
    conn.close()


def _cleanup_pending_service_channel_defaults(cursor) -> None:
    """Звільняє pending-записи послугових каналів від основного парсера для AI→канал."""
    try:
        from parser.config.channels import CHANNELS, SERVICE_CHANNELS, normalize_channel_key

        norm_services = {normalize_channel_key(s) for s in SERVICE_CHANNELS}
        service_sources = [
            k for k in CHANNELS if normalize_channel_key(k) in norm_services
        ]
        if not service_sources:
            return
        placeholders = ",".join("?" * len(service_sources))
        cursor.execute(
            f"""
            DELETE FROM parsed_items
            WHERE source_channel IN ({placeholders})
              AND status = 'pending'
              AND COALESCE(parser_type, 'default') = 'default'
            """,
            service_sources,
        )
        if cursor.rowcount:
            logger.info(
                "parsed_items: видалено %s pending-записів послугових каналів (основний парсер)",
                cursor.rowcount,
            )
    except Exception as e:
        logger.warning("parsed_items cleanup skipped: %s", e)


def parsed_item_exists(
    source_channel: str,
    message_id: int,
    parser_type: str = "default",
) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 1 FROM parsed_items
        WHERE source_channel = ? AND message_id = ?
          AND COALESCE(parser_type, 'default') = ?
        """,
        (source_channel, message_id, parser_type),
    )
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


def parsed_item_claimed_by_other_parser(
    source_channel: str,
    message_id: int,
    parser_type: str,
) -> bool:
    """Чи є запис з іншого парсера (напр. основний вже забрав повідомлення)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COALESCE(parser_type, 'default') FROM parsed_items
        WHERE source_channel = ? AND message_id = ?
        LIMIT 1
        """,
        (source_channel, message_id),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return False
    return row[0] != parser_type


def fingerprint_parsed_text(raw_text: str) -> str:
    t = (raw_text or "").lower()
    t = re.sub(r"https?://t\.me/\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"https?://(?:www\.)?instagram\.com/\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F600-\U0001F64F"
        r"\U0001F680-\U0001F6FF\U0001F900-\U0001F9FF]+",
        " ",
        t,
    )
    t = re.sub(r"\s+", " ", t).strip()
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def fingerprint_title_desc(title: str, description: str) -> str:
    emoji_re = re.compile(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F600-\U0001F64F"
        r"\U0001F680-\U0001F6FF\U0001F900-\U0001F9FF]+",
        re.UNICODE,
    )

    def norm(s: str) -> str:
        s = (s or "").lower()
        try:
            s = unicodedata.normalize("NFKD", s)
            s = "".join(c for c in s if not unicodedata.combining(c))
        except Exception:
            pass
        s = emoji_re.sub(" ", s)
        s = re.sub(r"https?://\S+", " ", s, flags=re.IGNORECASE)
        s = re.sub(r"@[\w\d_]{2,}", " ", s)
        s = re.sub(r"[^\w\s\u0400-\u04FF]", " ", s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    t = norm(title)[:220]
    d = norm(description)[:700]
    if len(t) + len(d) < 14:
        return ""
    blob = f"{t}|{d}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def parsed_item_is_raw_duplicate(content_hash: str) -> bool:
    if not content_hash:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM parsed_items WHERE content_hash = ? LIMIT 1",
        (content_hash,),
    )
    dup = cursor.fetchone() is not None
    conn.close()
    return dup


def parsed_item_is_semantic_duplicate(
    dedup_key: Optional[str],
    parser_type: str = "default",
) -> bool:
    if not dedup_key:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 1 FROM parsed_items
        WHERE dedup_key = ? AND status IN ('pending', 'approved')
          AND COALESCE(parser_type, 'default') = ?
        LIMIT 1
        """,
        (dedup_key, parser_type),
    )
    dup = cursor.fetchone() is not None
    conn.close()
    return dup


def parsed_item_content_hash_exists(content_hash: str) -> bool:
    return parsed_item_is_raw_duplicate(content_hash)


def insert_parsed_item(
    source_channel: str,
    source_city: str,
    message_id: int,
    media_group_id: Optional[str],
    author_username: Optional[str],
    author_id: Optional[int],
    title: str,
    description: str,
    price: Optional[str],
    currency: Optional[str],
    is_free: bool,
    category: str,
    subcategory: Optional[str],
    condition: Optional[str],
    location: str,
    images: list[str],
    raw_text: str,
    content_hash: Optional[str] = None,
    dedup_key: Optional[str] = None,
    parser_type: str = "default",
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR IGNORE INTO parsed_items (
            source_channel, source_city, message_id, media_group_id,
            author_username, author_id,
            title, description, price, currency, is_free,
            category, subcategory, condition, location,
            images_json, raw_text, content_hash, dedup_key, parser_type, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (
        source_channel, source_city, message_id, media_group_id,
        author_username, author_id,
        title, description, price, currency, int(is_free),
        category, subcategory, condition, location,
        json.dumps(images, ensure_ascii=False), raw_text, content_hash, dedup_key, parser_type,
    ))
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    return item_id


def get_parsed_item_by_admin_msg(admin_message_id: int) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM parsed_items WHERE admin_message_id = ?",
        (admin_message_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_parsed_item_by_id(item_id: int) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parsed_items WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_parsed_item_status(item_id: int, status: str, moderated_by: Optional[int] = None):
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ?",
        (status, datetime.now(timezone.utc).isoformat(), moderated_by, item_id),
    )
    conn.commit()
    conn.close()


def set_admin_message_id(item_id: int, admin_message_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET admin_message_id = ? WHERE id = ?",
        (admin_message_id, item_id),
    )
    conn.commit()
    conn.close()


def set_marketplace_listing_id(item_id: int, listing_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET marketplace_listing_id = ?, status = 'approved' WHERE id = ?",
        (listing_id, item_id),
    )
    conn.commit()
    conn.close()
