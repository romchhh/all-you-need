"""Перенесення парсованих оголошень у маркетплейс."""

import json
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from parser.storage.connection import BASE_DIR, get_connection

logger = logging.getLogger(__name__)


def copy_parser_images_to_public(rel_paths: list[str], prefix: str = "parser") -> list[str]:
    if not rel_paths:
        return _copy_default_listing_photo(prefix)
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
    if not out:
        return _copy_default_listing_photo(prefix)
    return out


def _default_listing_photo_src() -> Path | None:
    for candidate in (
        BASE_DIR / "bot" / "Content" / "tgground.jpg",
        BASE_DIR / "Content" / "tgground.jpg",
    ):
        if candidate.is_file():
            return candidate
    return None


def _copy_default_listing_photo(prefix: str) -> list[str]:
    src = _default_listing_photo_src()
    if not src:
        logger.warning("Дефолтне фото tgground.jpg не знайдено")
        return []
    dest_dir = BASE_DIR / "app" / "public" / "listings" / "originals"
    dest_dir.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex[:12]
    name = f"{prefix}_{token}_default.jpg"
    dest = dest_dir / name
    try:
        shutil.copy2(src, dest)
        logger.info("Використано дефолтне фото для %s", prefix)
        return [f"/listings/originals/{name}"]
    except OSError as e:
        logger.error("Не вдалося скопіювати дефолтне фото: %s", e)
        return []


def get_or_create_bot_user(
    telegram_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
) -> int:
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
    conn = get_connection()
    cursor = conn.cursor()

    price_str = price if price else ("0" if not is_free else "0")
    images_json = json.dumps(images, ensure_ascii=False)
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
