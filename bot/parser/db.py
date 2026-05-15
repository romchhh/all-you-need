"""
Модуль для роботи з таблицею parsed_items у SQLite (та переносу в основну БД маркетплейсу).
"""

import sqlite3
import json
import logging
import shutil
import uuid
import re
import hashlib
import unicodedata
from pathlib import Path
from typing import Any, Optional
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


def fingerprint_parsed_text(raw_text: str) -> str:
    """
    Нормалізований відбиток сирого тексту для дедуплікації між каналами
    (одне й те саме репостять у кілька груп).
    """
    t = (raw_text or "").lower()
    t = re.sub(r"https?://t\.me/\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"https?://(?:www\.)?instagram\.com/\S+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"https?://\S+", " ", t)
    # Прибираємо емодзі — у різних групах текст часто відрізняється лише емодзі
    t = re.sub(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F600-\U0001F64F"
        r"\U0001F680-\U0001F6FF\U0001F900-\U0001F9FF]+",
        " ",
        t,
    )
    t = re.sub(r"\s+", " ", t).strip()
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def fingerprint_title_desc(title: str, description: str) -> str:
    """
    Відбиток за нормалізованим заголовком + початком опису.
    Ловить дублікати з різним форматуванням/футерами між каналами.
    """
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
    # Занадто короткий зміст — не дедуплікуємо семантично (багато хибних збігів)
    if len(t) + len(d) < 14:
        return ""
    blob = f"{t}|{d}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def parsed_item_is_raw_duplicate(content_hash: str) -> bool:
    """Той самий нормалізований сирий текст — дублікат (будь-який статус у БД)."""
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


def parsed_item_is_semantic_duplicate(dedup_key: Optional[str]) -> bool:
    """
    Той самий зміст оголошення (заголовок+опис) у іншому каналі / з іншим форматуванням.
    Пропускаємо лише якщо вже є pending або approved; відхилене можна надіслати знову.
    """
    if not dedup_key:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 1 FROM parsed_items
        WHERE dedup_key = ? AND status IN ('pending', 'approved')
        LIMIT 1
        """,
        (dedup_key,),
    )
    dup = cursor.fetchone() is not None
    conn.close()
    return dup


def parsed_item_content_hash_exists(content_hash: str) -> bool:
    """Сумісність: те саме, що parsed_item_is_raw_duplicate."""
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
            images_json, raw_text, content_hash, dedup_key, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (
        source_channel, source_city, message_id, media_group_id,
        author_username, author_id,
        title, description, price, currency, int(is_free),
        category, subcategory, condition, location,
        json.dumps(images, ensure_ascii=False), raw_text, content_hash, dedup_key,
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


def get_or_create_bot_user(
    telegram_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
) -> int:
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
        VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))
    """, (telegram_id, username or "parser_bot", first_name or "Parser Bot"))
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


PHOTOS_DIR = BASE_DIR / "database" / "parsed_photos"


def _normalize_parsed_image_path(ref: str) -> Optional[Path]:
    """
    Перетворює значення з images_json у абсолютний шлях у межах database/parsed_photos.
    Повертає None для небезпечних або нелокальних посилань.
    """
    if not ref or not isinstance(ref, str):
        return None
    r = ref.replace("\\", "/").strip()
    if ".." in r or r.startswith("http://") or r.startswith("https://"):
        return None
    r = r.lstrip("/")
    if r.startswith("database/parsed_photos/"):
        p = BASE_DIR / r
    elif r.startswith("parsed_photos/"):
        p = BASE_DIR / "database" / r
    else:
        return None
    try:
        resolved = p.resolve()
        base_resolved = (BASE_DIR / "database" / "parsed_photos").resolve()
        if not str(resolved).startswith(str(base_resolved)):
            return None
    except OSError:
        return None
    return resolved


def cleanup_stale_parsed_photos(
    days: int = 30,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Видаляє файли з папки ``database/parsed_photos`` для оголошень парсера (``parsed_items``), які:
    - старіші за ``days`` календарних днів (поле ``created_at`` у форматі, який розуміє SQLite);
    - **не** перенесені на маркетплейс (``marketplace_listing_id IS NULL``).

    Якщо ім'я файлу з оголошення досі зустрічається в ``Listing.images``, увесь рядок
    ``parsed_items`` пропускається (не видаляємо жодного файлу з цього запису).

    Після успішного видалення **усіх** локальних файлів рядка та відсутності помилок unlink
    оновлює ``images_json`` на ``[]``.

    :param days: мінімальний вік запису в днях (типово 30).
    :param dry_run: лише звіт без видалення та без UPDATE.
    :return: статистика: ``files_deleted``, ``bytes_freed``, ``parsed_items_cleared``,
             ``skipped_rows_in_use``, ``errors``.
    """
    if days < 1 or days > 3650:
        raise ValueError("days must be between 1 and 3650")

    stats: dict[str, Any] = {
        "files_deleted": 0,
        "bytes_freed": 0,
        "parsed_items_cleared": 0,
        "skipped_rows_in_use": 0,
        "errors": [],
    }

    time_mod = f"-{days} days"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, images_json
        FROM parsed_items
        WHERE marketplace_listing_id IS NULL
          AND images_json IS NOT NULL
          AND TRIM(images_json) != ''
          AND TRIM(images_json) != '[]'
          AND datetime(created_at) < datetime('now', ?)
        """,
        (time_mod,),
    )
    rows = cursor.fetchall()
    rows_would_clear = 0

    for row in rows:
        item_id = row["id"]
        try:
            raw = row["images_json"] or "[]"
            refs = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as e:
            stats["errors"].append(f"parsed_items id={item_id}: bad images_json: {e}")
            continue

        if not isinstance(refs, list):
            stats["errors"].append(f"parsed_items id={item_id}: images_json is not a list")
            continue

        basenames: list[str] = []
        for ref in refs:
            if not ref:
                continue
            p = _normalize_parsed_image_path(str(ref))
            if p is not None:
                basenames.append(p.name)

        row_protected = False
        for bn in basenames:
            cursor.execute(
                "SELECT 1 FROM Listing WHERE images LIKE ? LIMIT 1",
                (f"%{bn}%",),
            )
            if cursor.fetchone():
                row_protected = True
                logger.warning(
                    "cleanup_parsed_photos: skip parsed_items id=%s — %s still in Listing.images",
                    item_id,
                    bn,
                )
                break

        if row_protected:
            stats["skipped_rows_in_use"] += 1
            continue

        row_ok = True
        for ref in refs:
            if not ref:
                continue
            path = _normalize_parsed_image_path(str(ref))
            if path is None:
                continue
            if not path.is_file():
                continue
            size = path.stat().st_size
            if dry_run:
                stats["files_deleted"] += 1
                stats["bytes_freed"] += size
                continue
            try:
                path.unlink()
                stats["files_deleted"] += 1
                stats["bytes_freed"] += size
            except OSError as e:
                row_ok = False
                stats["errors"].append(f"unlink {path}: {e}")

        if dry_run and row_ok:
            rows_would_clear += 1
        elif not dry_run and row_ok:
            cursor.execute(
                "UPDATE parsed_items SET images_json = '[]' WHERE id = ?",
                (item_id,),
            )
            stats["parsed_items_cleared"] += 1

    if not dry_run:
        conn.commit()
    conn.close()

    if dry_run:
        stats["parsed_items_cleared"] = rows_would_clear
        stats["note"] = (
            "dry_run: files_deleted/bytes_freed — прогноз; parsed_items_cleared — "
            "скільки рядків отримали б images_json=[]; БД не змінювалась"
        )
    return stats
