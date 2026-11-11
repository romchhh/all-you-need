"""Синхронізація TelegramListing → Listing для коректних deep-link у каналі."""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from typing import Any, Optional

from aiogram import Bot

from parser.storage.connection import BASE_DIR, get_connection
from parser.storage.marketplace import create_marketplace_listing
from utils.telegram_listing_price import marketplace_price_and_free

logger = logging.getLogger(__name__)


def _ensure_marketplace_listing_id_column() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(TelegramListing)")
    columns = {row[1] for row in cursor.fetchall()}
    if "marketplaceListingId" not in columns:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN marketplaceListingId INTEGER")
        conn.commit()
    conn.close()


def get_telegram_marketplace_listing_id(telegram_listing_id: int) -> Optional[int]:
    _ensure_marketplace_listing_id_column()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT marketplaceListingId FROM TelegramListing WHERE id = ?",
        (telegram_listing_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    value = row[0] if not isinstance(row, dict) else row.get("marketplaceListingId")
    try:
        mid = int(value) if value is not None else 0
    except (TypeError, ValueError):
        return None
    return mid if mid > 0 else None


def set_telegram_marketplace_listing_id(telegram_listing_id: int, marketplace_listing_id: int) -> None:
    _ensure_marketplace_listing_id_column()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE TelegramListing
        SET marketplaceListingId = ?, updatedAt = datetime('now')
        WHERE id = ?
        """,
        (marketplace_listing_id, telegram_listing_id),
    )
    conn.commit()
    conn.close()


def _marketplace_listing_exists(listing_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM Listing WHERE id = ?", (listing_id,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)


def _media_file_id(item: Any) -> tuple[str, str]:
    if isinstance(item, dict):
        return (
            str(item.get("file_id") or "").strip(),
            str(item.get("type") or "photo").lower(),
        )
    return (str(item or "").strip(), "photo")


async def _download_telegram_images(bot: Bot, images: list[Any]) -> list[str]:
    dest_dir = BASE_DIR / "app" / "public" / "listings" / "originals"
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: list[str] = []
    token = uuid.uuid4().hex[:12]
    logger.info("Download photos → %s (exists=%s)", dest_dir, dest_dir.is_dir())

    for i, item in enumerate(images[:10]):
        file_id, mtype = _media_file_id(item)
        if not file_id or mtype == "video":
            continue
        # уже веб-шлях / URL — не качаємо з Telegram
        if file_id.startswith("http://") or file_id.startswith("https://"):
            out.append(file_id)
            continue
        if file_id.startswith("/listings/"):
            out.append(file_id)
            continue
        try:
            tg_file = await bot.get_file(file_id)
            if not tg_file or not tg_file.file_path:
                logger.warning("get_file порожній для file_id=%s…", file_id[:24])
                continue
            ext = (Path(tg_file.file_path).suffix or ".jpg").lower()
            if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                ext = ".jpg"
            name = f"tgbot_{token}_{i}{ext}"
            dest = dest_dir / name
            # aiogram: destination як Path надійніший за str у деяких версіях
            await bot.download_file(tg_file.file_path, destination=dest)
            if dest.is_file() and dest.stat().st_size > 0:
                out.append(f"/listings/originals/{name}")
            else:
                logger.warning("Файл після download порожній: %s", dest)
        except Exception as e:
            logger.warning(
                "Не вдалося завантажити фото TelegramListing file_id=%s…: %s",
                file_id[:24],
                e,
            )

    # Без фото — порожній список; веб малює ListingAutoCover (без tgground).
    return out


async def ensure_marketplace_listing_from_telegram(
    bot: Bot,
    telegram_listing: dict,
) -> Optional[int]:
    """
    Повертає id Listing для deep-link startapp=listing_<id>.
    TelegramListing.id ≠ Listing.id — без синхронізації кнопка відкриває чуже оголошення.
    """
    tl_id = int(telegram_listing.get("id") or 0)
    if tl_id <= 0:
        return None

    existing = get_telegram_marketplace_listing_id(tl_id)
    if existing and _marketplace_listing_exists(existing):
        # Оновлюємо статус на active при повторній публікації
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE Listing
                SET status = 'active',
                    moderationStatus = 'approved',
                    publishedAt = COALESCE(publishedAt, datetime('now')),
                    expiresAt = datetime('now', '+30 days'),
                    updatedAt = datetime('now')
                WHERE id = ?
                """,
                (existing,),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning("Не вдалося оновити Listing %s: %s", existing, e)
        return existing

    user_id = telegram_listing.get("userId")
    if not user_id:
        logger.error("TelegramListing %s без userId — неможливо створити Listing", tl_id)
        return None

    from utils.listing_images import parse_listing_images

    images = parse_listing_images(telegram_listing.get("images"))
    logger.info(
        "TelegramListing %s: images_raw_count=%s before download",
        tl_id,
        len(images),
    )
    images_web = await _download_telegram_images(bot, images)
    logger.info(
        "TelegramListing %s: downloaded %s/%s photos → %s",
        tl_id,
        len(images_web),
        len(images),
        images_web,
    )
    price_str, is_free = marketplace_price_and_free(telegram_listing)

    from utils.bot_category_map import map_bot_category_to_marketplace

    category_slug, subcategory_slug = map_bot_category_to_marketplace(
        telegram_listing.get("category"),
        telegram_listing.get("subcategory"),
    )

    try:
        marketplace_id = create_marketplace_listing(
            user_id=int(user_id),
            title=str(telegram_listing.get("title") or "Оголошення"),
            description=str(telegram_listing.get("description") or ""),
            price=price_str,
            currency=telegram_listing.get("currency") or "EUR",
            is_free=is_free,
            category=category_slug,
            subcategory=subcategory_slug,
            condition=telegram_listing.get("condition") or "used",
            location=str(telegram_listing.get("location") or "Germany"),
            images=images_web,
        )
    except Exception as e:
        logger.error(
            "Не вдалося створити Listing для TelegramListing %s: %s",
            tl_id,
            e,
            exc_info=True,
        )
        return None

    set_telegram_marketplace_listing_id(tl_id, marketplace_id)
    logger.info(
        "TelegramListing %s → Listing %s (для кнопки «Посмотреть объявление»)",
        tl_id,
        marketplace_id,
    )
    return marketplace_id
