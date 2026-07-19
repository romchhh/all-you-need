"""CRUD для таблиці parsed_items."""

import hashlib
import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

from parser.config.settings import (
    PARSER_DEDUP_DAYS,
    PARSER_PENDING_DEDUP_HOURS,
    PARSER_TEXT_DEDUP_DAYS,
)
from parser.storage.connection import get_connection

logger = logging.getLogger(__name__)

_DEDUP_WINDOW = f"-{PARSER_DEDUP_DAYS} days"
_TEXT_DEDUP_WINDOW = f"-{PARSER_TEXT_DEDUP_DAYS} days"
_PENDING_DEDUP_WINDOW = f"-{PARSER_PENDING_DEDUP_HOURS} hours"
_schema_ready = False


def marketplace_listing_is_live(listing_id: int) -> bool:
    """Чи оголошення ще активне на маркетплейсі (не прострочене)."""
    if not listing_id:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 1 FROM Listing
        WHERE id = ?
          AND status = 'active'
          AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
        LIMIT 1
        """,
        (int(listing_id),),
    )
    live = cursor.fetchone() is not None
    conn.close()
    return live


def _is_within_dedup_window(created_at: Optional[str]) -> bool:
    if not created_at:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 WHERE datetime(?) >= datetime('now', ?)",
        (created_at, _DEDUP_WINDOW),
    )
    within = cursor.fetchone() is not None
    conn.close()
    return within


def parsed_item_row_blocks_duplicate(item: dict) -> bool:
    """
    Чи старий запис parsed_items ще блокує повторне додавання.
    Після деактивації на маркетплейсі (30 днів) — ні.
    """
    parser_type = item.get("parser_type") or "default"
    if parser_type == "services_channel":
        mp = (item.get("marketplace_mod_status") or item.get("status") or "pending").lower()
        ch = (item.get("channel_mod_status") or item.get("status") or "pending").lower()
        if mp == "rejected" and ch == "rejected":
            return False
        if mp == "pending" or ch == "pending":
            return True
        if mp == "approved":
            listing_id = item.get("marketplace_listing_id")
            if listing_id and marketplace_listing_is_live(int(listing_id)):
                return True
            if _is_within_dedup_window(item.get("created_at")):
                return True
        if ch == "approved" and _is_within_dedup_window(item.get("created_at")):
            return True
        return False

    status = (item.get("status") or "").strip().lower()
    if status == "rejected":
        return False

    listing_id = item.get("marketplace_listing_id")
    if listing_id:
        return marketplace_listing_is_live(int(listing_id))

    if not _is_within_dedup_window(item.get("created_at")):
        return False

    parser_type = item.get("parser_type") or "default"
    if status == "pending":
        return True
    if status == "approved" and parser_type == "services_channel":
        return True
    return False


def _sql_parsed_item_blocks_duplicates(alias: str = "pi") -> str:
    """SQL-фрагмент: запис ще блокує повтор (clear_repostable, cross-parser)."""
    return f"""(
        {alias}.marketplace_listing_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM Listing l
            WHERE l.id = {alias}.marketplace_listing_id
              AND l.status = 'active'
              AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))
        )
    )
    OR (
        {alias}.marketplace_listing_id IS NULL
        AND {alias}.status = 'pending'
        AND datetime({alias}.created_at) >= datetime('now', ?)
    )
    OR (
        {alias}.marketplace_listing_id IS NULL
        AND {alias}.status = 'approved'
        AND COALESCE({alias}.parser_type, 'default') = 'services_channel'
        AND datetime({alias}.created_at) >= datetime('now', ?)
    )"""


def _sql_semantic_dedup_blocks(alias: str = "pi") -> str:
    """
    М'якший дедуп за dedup_key:
    - активне оголошення на MP — завжди блокує;
    - pending — лише коротке вікно (repost з новим message_id не висить днями);
    - services approved без MP — коротке вікно TEXT_DEDUP.
    """
    return f"""(
        {alias}.marketplace_listing_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM Listing l
            WHERE l.id = {alias}.marketplace_listing_id
              AND l.status = 'active'
              AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))
        )
    )
    OR (
        {alias}.marketplace_listing_id IS NULL
        AND {alias}.status = 'pending'
        AND datetime({alias}.created_at) >= datetime('now', ?)
    )
    OR (
        {alias}.marketplace_listing_id IS NULL
        AND {alias}.status = 'approved'
        AND COALESCE({alias}.parser_type, 'default') = 'services_channel'
        AND datetime({alias}.created_at) >= datetime('now', ?)
    )"""


def clear_repostable_parsed_item(source_channel: str, message_id: int) -> bool:
    """
    Видаляє parsed_items, якщо попереднє оголошення вже не на платформі —
    дозволяє повторно спарсити той самий пост / текст.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM parsed_items WHERE source_channel = ? AND message_id = ?",
        (source_channel, message_id),
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    item = dict(row)
    if parsed_item_row_blocks_duplicate(item):
        conn.close()
        return False
    cursor.execute("DELETE FROM parsed_items WHERE id = ?", (item["id"],))
    conn.commit()
    conn.close()
    logger.info(
        "parsed_items: видалено застарілий id=%s (%s/%s) — дозволено повторний парсинг",
        item["id"],
        source_channel,
        message_id,
    )
    return True


def ensure_parsed_items_table():
    global _schema_ready
    if _schema_ready:
        return
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
    cursor.execute("PRAGMA table_info(parsed_items)")
    col_names4 = {row[1] for row in cursor.fetchall()}
    if "text_embedding" not in col_names4:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN text_embedding TEXT")
    cursor.execute("PRAGMA table_info(parsed_items)")
    col_names5 = {row[1] for row in cursor.fetchall()}
    if "moderation_chat_id" not in col_names5:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN moderation_chat_id INTEGER")
    cursor.execute("PRAGMA table_info(parsed_items)")
    col_names6 = {row[1] for row in cursor.fetchall()}
    if "admin_message_id_channel" not in col_names6:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN admin_message_id_channel INTEGER")
    if "moderation_chat_id_channel" not in col_names6:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN moderation_chat_id_channel INTEGER")
    if "marketplace_mod_status" not in col_names6:
        cursor.execute(
            "ALTER TABLE parsed_items ADD COLUMN marketplace_mod_status TEXT DEFAULT 'pending'"
        )
    if "channel_mod_status" not in col_names6:
        cursor.execute(
            "ALTER TABLE parsed_items ADD COLUMN channel_mod_status TEXT DEFAULT 'pending'"
        )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_items_admin_msg_channel "
        "ON parsed_items(admin_message_id_channel) WHERE admin_message_id_channel IS NOT NULL"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_parsed_items_created_at "
        "ON parsed_items(created_at)"
    )
    _cleanup_pending_service_channel_defaults(cursor)
    conn.commit()
    conn.close()
    _schema_ready = True


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
              AND admin_message_id IS NULL
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
    """Чи інший парсер уже тримає це повідомлення і запис ще блокує повтор."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM parsed_items
        WHERE source_channel = ? AND message_id = ?
        LIMIT 1
        """,
        (source_channel, message_id),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return False
    item = dict(row)
    other_type = item.get("parser_type") or "default"
    if other_type == parser_type:
        return False
    return parsed_item_row_blocks_duplicate(item)


def fingerprint_parsed_text(raw_text: str) -> str:
    """
    Hash для дедупу в межах каналу.
    Не викидаємо цифри/ціни — інакше різні оголошення зливаються в один hash.
    """
    t = (raw_text or "").lower()
    t = re.sub(r"https?://t\.me/\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"https?://(?:www\.)?instagram\.com/\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"https?://\S+", " ", t)
    # Прибираємо лише емодзі, не чіпаючи латиницю/кирилицю/цифри
    t = re.sub(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F600-\U0001F64F"
        r"\U0001F680-\U0001F6FF\U0001F900-\U0001F9FF]+",
        " ",
        t,
    )
    t = re.sub(r"[^\w\s\u0400-\u04FF€$£.,:/+-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) < 24:
        # Короткий текст — не дедупимо агресивно (порожній hash → skip check)
        return ""
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def fingerprint_title_desc(
    title: str,
    description: str,
    *,
    price: str | None = None,
    is_free: bool = False,
) -> str:
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
    if is_free:
        price_part = "free"
    elif price and str(price).strip():
        price_part = re.sub(r"\s+", "", str(price).lower())[:40]
    else:
        price_part = ""
    if len(t) + len(d) < 14:
        return ""
    blob = f"{t}|{d}|p:{price_part}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def parsed_item_is_raw_duplicate(
    content_hash: str,
    dedup_key: Optional[str] = None,
    parser_type: str | None = None,
    source_channel: str | None = None,
) -> bool:
    """Застаріло: raw hash не використовується в check_parser_duplicates."""
    return False


def parsed_item_is_semantic_duplicate(
    dedup_key: Optional[str],
    parser_type: str | None = None,
    source_channel: str | None = None,
) -> bool:
    """Дублікат за title+desc+price — у межах каналу, м'яке вікно для pending."""
    if not dedup_key:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    blocking = _sql_semantic_dedup_blocks("pi")
    clauses = ["pi.dedup_key = ?", blocking]
    params: list = [dedup_key, _PENDING_DEDUP_WINDOW, _TEXT_DEDUP_WINDOW]
    if parser_type:
        clauses.append("COALESCE(pi.parser_type, 'default') = ?")
        params.append(parser_type)
    if source_channel:
        clauses.append("pi.source_channel = ?")
        params.append(source_channel)
    cursor.execute(
        f"""
        SELECT 1 FROM parsed_items pi
        WHERE {" AND ".join(clauses)}
        LIMIT 1
        """,
        params,
    )
    dup = cursor.fetchone() is not None
    conn.close()
    return dup


def get_recent_parsed_embeddings(
    days: int | None = None,
    *,
    source_channel: str | None = None,
) -> list[dict]:
    """Embedding лише для записів, що ще блокують дедуп."""
    window = f"-{days or PARSER_DEDUP_DAYS} days"
    conn = get_connection()
    cursor = conn.cursor()
    blocking = _sql_parsed_item_blocks_duplicates("pi")
    channel_clause = ""
    params: list = [window, window]
    if source_channel:
        channel_clause = " AND pi.source_channel = ?"
        params.append(source_channel)
    cursor.execute(
        f"""
        SELECT pi.id, pi.text_embedding
        FROM parsed_items pi
        WHERE pi.text_embedding IS NOT NULL
          AND TRIM(pi.text_embedding) != ''
          AND {blocking}
          {channel_clause}
        ORDER BY pi.id DESC
        LIMIT 2500
        """,
        params,
    )
    rows = cursor.fetchall()
    conn.close()
    out: list[dict] = []
    for row in rows:
        raw = row[1] if not isinstance(row, dict) else row.get("text_embedding")
        item_id = row[0] if not isinstance(row, dict) else row.get("id")
        if not raw:
            continue
        try:
            vec = json.loads(raw)
            if isinstance(vec, list) and vec:
                out.append({"id": item_id, "embedding": [float(x) for x in vec]})
        except Exception:
            continue
    return out


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
    text_embedding: Optional[str] = None,
) -> int:
    from parser.core.location import channel_city_from_source, resolve_parsed_location

    # source_city — завжди з реєстру каналу; location — за правилами local/Germany
    source_city = channel_city_from_source(source_channel, source_city)
    location = resolve_parsed_location(
        channel_city=source_city,
        source_channel=source_channel,
        suggested=location,
        text=f"{title or ''}\n{description or ''}\n{raw_text or ''}",
    )

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR IGNORE INTO parsed_items (
            source_channel, source_city, message_id, media_group_id,
            author_username, author_id,
            title, description, price, currency, is_free,
            category, subcategory, condition, location,
            images_json, raw_text, content_hash, dedup_key, parser_type, text_embedding, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (
        source_channel, source_city, message_id, media_group_id,
        author_username, author_id,
        title, description, price, currency, int(is_free),
        category, subcategory, condition, location,
        json.dumps(images, ensure_ascii=False), raw_text, content_hash, dedup_key, parser_type,
        text_embedding,
    ))
    conn.commit()
    item_id = cursor.lastrowid
    if not item_id:
        cursor.execute(
            """
            SELECT id FROM parsed_items
            WHERE source_channel = ? AND message_id = ?
            LIMIT 1
            """,
            (source_channel, message_id),
        )
        row = cursor.fetchone()
        item_id = int(row[0]) if row else 0
    conn.close()
    return item_id


def get_parsed_item_by_admin_msg(admin_message_id: int) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM parsed_items
        WHERE admin_message_id = ? OR admin_message_id_channel = ?
        LIMIT 1
        """,
        (admin_message_id, admin_message_id),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_mod_path_status(item: dict, path: str) -> str:
    """path: marketplace | channel"""
    if (item.get("parser_type") or "default") == "services_channel":
        if path == "marketplace":
            return (item.get("marketplace_mod_status") or item.get("status") or "pending").lower()
        return (item.get("channel_mod_status") or item.get("status") or "pending").lower()
    return (item.get("status") or "pending").lower()


def update_mod_path_status(
    item_id: int,
    path: str,
    status: str,
    moderated_by: Optional[int] = None,
) -> None:
    col = "marketplace_mod_status" if path == "marketplace" else "channel_mod_status"
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        f"UPDATE parsed_items SET {col} = ?, moderated_at = ?, moderated_by = ? WHERE id = ?",
        (status, now, moderated_by, item_id),
    )
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT marketplace_mod_status, channel_mod_status, parser_type
        FROM parsed_items WHERE id = ?
        """,
        (item_id,),
    )
    row = cursor.fetchone()
    if row:
        data = dict(row)
        if (data.get("parser_type") or "default") == "services_channel":
            mp = (data.get("marketplace_mod_status") or "pending").lower()
            ch = (data.get("channel_mod_status") or "pending").lower()
            if mp == "rejected" and ch == "rejected":
                overall = "rejected"
            elif mp == "approved" and ch == "approved":
                overall = "approved"
            else:
                overall = "pending"
        else:
            overall = status
        conn.execute("UPDATE parsed_items SET status = ? WHERE id = ?", (overall, item_id))
    conn.commit()
    conn.close()


def resolve_parsed_item_for_moderation(
    item_id: int,
    admin_message_id: int | None = None,
    reply_to_message_id: int | None = None,
) -> Optional[dict]:
    """
    Знаходить parsed_item за id з callback або за message_id повідомлення модерації.
    Другий варіант потрібен, якщо запис у БД пересоздали (інший id), а кнопки лишились старі.
    """
    item = get_parsed_item_by_id(item_id)
    if item:
        return item
    for msg_id in (admin_message_id, reply_to_message_id):
        if msg_id is None:
            continue
        by_msg = get_parsed_item_by_admin_msg(msg_id)
        if by_msg:
            logger.info(
                "parsed_items: fallback admin_message_id=%s → id=%s (callback id=%s)",
                msg_id,
                by_msg.get("id"),
                item_id,
            )
            return by_msg
    return None


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


def set_admin_message_id(
    item_id: int,
    admin_message_id: int,
    moderation_chat_id: int | None = None,
    *,
    target: str = "marketplace",
):
    record_moderation_message(
        item_id,
        admin_message_id,
        moderation_chat_id or 0,
        target=target,
    )


def record_moderation_message(
    item_id: int,
    admin_message_id: int,
    moderation_chat_id: int,
    *,
    target: str = "marketplace",
) -> None:
    """Зберігає message_id модерації: marketplace або channel."""
    conn = get_connection()
    if target == "channel":
        conn.execute(
            """
            UPDATE parsed_items
            SET admin_message_id_channel = ?, moderation_chat_id_channel = ?
            WHERE id = ?
            """,
            (admin_message_id, moderation_chat_id, item_id),
        )
    else:
        conn.execute(
            """
            UPDATE parsed_items
            SET admin_message_id = ?, moderation_chat_id = ?
            WHERE id = ?
            """,
            (admin_message_id, moderation_chat_id, item_id),
        )
    conn.commit()
    conn.close()


def set_marketplace_listing_id(item_id: int, listing_id: int, moderated_by: Optional[int] = None):
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET marketplace_listing_id = ? WHERE id = ?",
        (listing_id, item_id),
    )
    conn.commit()
    conn.close()
    update_mod_path_status(item_id, "marketplace", "approved", moderated_by=moderated_by)
