"""
Модуль для роботи з таблицею parsed_items у SQLite (та переносу в основну БД маркетплейсу).
"""

import sqlite3
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def ensure_parsed_items_table():
    """Створює таблицю parsed_items якщо її немає."""
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
            status          TEXT DEFAULT 'pending',
            admin_message_id INTEGER,
            marketplace_listing_id INTEGER,
            created_at      TEXT DEFAULT (datetime('now')),
            moderated_at    TEXT,
            moderated_by    INTEGER,
            UNIQUE(source_channel, message_id)
        )
    """)
    conn.commit()
    conn.close()


def parsed_item_exists(source_channel: str, message_id: int) -> bool:
    """Перевіряє чи вже є таке повідомлення у parsed_items."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM parsed_items WHERE source_channel = ? AND message_id = ?",
        (source_channel, message_id),
    )
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


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
) -> int:
    """Вставляє нове оголошення в parsed_items. Повертає id запису."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR IGNORE INTO parsed_items (
            source_channel, source_city, message_id, media_group_id,
            author_username, author_id,
            title, description, price, currency, is_free,
            category, subcategory, condition, location,
            images_json, raw_text, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (
        source_channel, source_city, message_id, media_group_id,
        author_username, author_id,
        title, description, price, currency, int(is_free),
        category, subcategory, condition, location,
        json.dumps(images, ensure_ascii=False), raw_text,
    ))
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    return item_id


def get_parsed_item_by_admin_msg(admin_message_id: int) -> Optional[dict]:
    """Отримує запис parsed_items за ID повідомлення адміна в групі."""
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
    """Отримує запис parsed_items за id."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parsed_items WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_parsed_item_status(item_id: int, status: str, moderated_by: Optional[int] = None):
    """Оновлює статус parsed_item (approved / rejected)."""
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ?",
        (status, datetime.now(timezone.utc).isoformat(), moderated_by, item_id),
    )
    conn.commit()
    conn.close()


def set_admin_message_id(item_id: int, admin_message_id: int):
    """Зберігає ID повідомлення адміна (після надсилання в групу)."""
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET admin_message_id = ? WHERE id = ?",
        (admin_message_id, item_id),
    )
    conn.commit()
    conn.close()


def set_marketplace_listing_id(item_id: int, listing_id: int):
    """Зберігає ID оголошення в маркетплейсі після перенесення."""
    conn = get_connection()
    conn.execute(
        "UPDATE parsed_items SET marketplace_listing_id = ?, status = 'approved' WHERE id = ?",
        (listing_id, item_id),
    )
    conn.commit()
    conn.close()


# ──────────────────────────────────────────────
# Маркетплейс: отримання / створення User та Listing
# ──────────────────────────────────────────────

def copy_parser_images_to_public(rel_paths: list[str], prefix: str = "parser") -> list[str]:
    """
    Копіює локальні файли з database/parsed_photos/ у app/public/listings/originals/.
    Повертає шляхи у форматі маркетплейсу: /listings/originals/...
    Вже веб-доступні шляхи та http — лишає без змін.
    """
    if not rel_paths:
        return []
    dest_dir = BASE_DIR / "app" / "public" / "listings" / "originals"
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: list[str] = []
    token = uuid.uuid4().hex[:12]
    for i, rel in enumerate(rel_paths):
        if not rel:
            continue
        r = rel.replace("\\", "/").strip()
        if r.startswith("http://") or r.startswith("https://"):
            out.append(r)
            continue
        if r.startswith("/listings/"):
            out.append(r)
            continue
        rel_norm = r.lstrip("/")
        if rel_norm.startswith("listings/"):
            out.append("/" + rel_norm)
            continue
        src = BASE_DIR / rel_norm
        if not src.is_file():
            logger.warning("Фото парсера не знайдено: %s", src)
            continue
        ext = src.suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            ext = ".jpg"
        name = f"{prefix}_{token}_{i}{ext}"
        dest = dest_dir / name
        try:
            shutil.copy2(src, dest)
            out.append(f"/listings/originals/{name}")
        except OSError as e:
            logger.error("Не вдалося скопіювати фото %s → %s: %s", src, dest, e)
    return out


def get_or_create_bot_user(telegram_id: int, username: Optional[str] = None) -> int:
    """
    Повертає User.id для системного бота/парсера.
    Якщо такого користувача немає — створює його.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_id,))
    row = cursor.fetchone()
    if row:
        conn.close()
        return row["id"]

    cursor.execute("""
        INSERT INTO User (telegramId, username, firstName, isActive, agreementAccepted, createdAt, updatedAt)
        VALUES (?, ?, 'Parser Bot', 1, 1, datetime('now'), datetime('now'))
    """, (telegram_id, username or "parser_bot"))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id


def create_marketplace_listing(
    user_id: int,
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
) -> int:
    """
    Створює запис у таблиці Listing (маркетплейс).
    Повертає id нового оголошення.
    """
    conn = get_connection()
    cursor = conn.cursor()

    price_str = price if price else ("0" if not is_free else "0")
    images_json = json.dumps(images, ensure_ascii=False)
    now = datetime.now(timezone.utc).isoformat()
    expires_at_sql = "datetime('now', '+30 days')"

    cursor.execute(f"""
        INSERT INTO Listing (
            userId, title, description, price, currency, isFree,
            category, subcategory, condition, location,
            status, moderationStatus,
            images, optimizedImages,
            createdAt, updatedAt, publishedAt, expiresAt
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            'active', 'approved',
            ?, NULL,
            datetime('now'), datetime('now'), datetime('now'), {expires_at_sql}
        )
    """, (
        user_id, title, description, price_str, currency, int(is_free),
        category, subcategory, condition or "used", location,
        images_json,
    ))
    conn.commit()
    listing_id = cursor.lastrowid
    conn.close()
    return listing_id
