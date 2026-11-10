"""Дублювання оголошень маркетплейсу (користувач) у Telegram-канали."""

from __future__ import annotations

import html
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

from aiogram import Bot
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup

from parser.category_keywords import get_category_label
from parser.moderation.formatting import build_channel_hashtags, listing_miniapp_url
from parser.moderation.services_publish import (
    TRADE_SERVICES_CHANNEL_GERMANY_ID,
    TRADE_SERVICES_CHANNEL_HAMBURG_ID,
    is_hamburg_location,
    marketplace_listing_to_channel_item,
    publish_services_listing_to_channel,
    resolve_services_trade_channel_ids,
    services_channel_quiet_hours_active,
)
from parser.storage.connection import BASE_DIR, get_connection
from utils.bot_category_map import channel_publish_mode

logger = logging.getLogger(__name__)


def _row_to_dict(row) -> dict:
    if row is None:
        return {}
    if isinstance(row, dict):
        return dict(row)
    try:
        return {k: row[k] for k in row.keys()}
    except Exception:
        return {}


def fetch_marketplace_listing_for_channel(listing_id: int) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            l.id, l.title, l.description, l.price, l.currency, l.isFree,
            l.category, l.subcategory, l.condition, l.location, l.images,
            l.userId,
            u.username AS seller_username,
            u.firstName AS seller_first_name,
            u.lastName AS seller_last_name,
            CAST(u.telegramId AS TEXT) AS seller_telegram_id
        FROM Listing l
        LEFT JOIN User u ON u.id = l.userId
        WHERE l.id = ?
        LIMIT 1
        """,
        (listing_id,),
    )
    row = cursor.fetchone()
    conn.close()
    data = _row_to_dict(row)
    return data or None


def _listing_images(raw) -> list[str]:
    if raw is None:
        return []
    data = raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("[") or text.startswith("{"):
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                return [text]
        else:
            return [text]
    if isinstance(data, str):
        return [data] if data.strip() else []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value or "").strip().lower() in {"1", "true", "t", "yes"}


def _trade_channel_id_for_location(location: str) -> Optional[int]:
    if is_hamburg_location(location or ""):
        raw = os.getenv("TRADE_CHANNEL_ID")
    else:
        raw = os.getenv("TRADE_GERMANY_CHANNEL_ID") or os.getenv("TRADE_CHANNEL_ID")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _resolve_local_photo(path: str) -> Optional[str]:
    s = (path or "").strip()
    if not s:
        return None
    local = Path(s)
    if local.is_file():
        return str(local)
    if s.startswith("/"):
        candidate = BASE_DIR / "app" / "public" / s.lstrip("/")
        if candidate.is_file():
            return str(candidate)
    return None


async def _publish_trade_channel(bot: Bot, listing: dict) -> Optional[int]:
    """Нерухомість / робота / подія → TRADE_CHANNEL_*."""
    location = str(listing.get("location") or "")
    chat_id = _trade_channel_id_for_location(location)
    if not chat_id:
        logger.warning(
            "Listing %s: TRADE_CHANNEL_ID не задано — пропуск дублювання в канал",
            listing.get("id"),
        )
        return None

    title = str(listing.get("title") or "").strip()
    description = str(listing.get("description") or "").strip()
    category = str(listing.get("category") or "")
    subcategory = listing.get("subcategory")
    price = listing.get("price") or ""
    currency = listing.get("currency") or "EUR"
    is_free = _as_bool(listing.get("isFree") or listing.get("isfree"))

    if is_free:
        price_text = "Безкоштовно"
    else:
        price_text = f"{html.escape(str(price))} {html.escape(str(currency))}".strip()

    category_text = html.escape(get_category_label(category, subcategory))
    hashtags = build_channel_hashtags(category, subcategory if isinstance(subcategory, str) else None, location)
    listing_id = int(listing.get("id") or 0)
    open_url = listing_miniapp_url(listing_id) if listing_id else None

    caption = (
        f"<b>{html.escape(title)}</b>\n\n"
        f"{html.escape(description)}\n\n"
        f"Ціна: {price_text}\n"
        f"Категорія: {category_text}\n"
        f"Локація: {html.escape(location)}\n\n"
        f"{hashtags}"
    )
    if len(caption) > 1024:
        caption = caption[:1020] + "…"

    keyboard = None
    if open_url:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="Дивитись оголошення", url=open_url)]]
        )

    images = _listing_images(listing.get("images"))
    photo_path = None
    photo_url = None
    for img in images:
        if img.startswith("http://") or img.startswith("https://"):
            photo_url = img
            break
        local = _resolve_local_photo(img)
        if local:
            photo_path = local
            break

    try:
        if photo_path:
            msg = await bot.send_photo(
                chat_id=chat_id,
                photo=FSInputFile(photo_path),
                caption=caption,
                parse_mode="HTML",
                reply_markup=keyboard,
            )
        elif photo_url:
            msg = await bot.send_photo(
                chat_id=chat_id,
                photo=photo_url,
                caption=caption,
                parse_mode="HTML",
                reply_markup=keyboard,
            )
        else:
            from parser.moderation.marketplace_cover import render_marketplace_cover

            cover = render_marketplace_cover(
                listing_id=listing_id,
                title=title,
                description=description,
                category=category,
                subcategory=subcategory if isinstance(subcategory, str) else None,
            )
            if cover:
                msg = await bot.send_photo(
                    chat_id=chat_id,
                    photo=FSInputFile(cover),
                    caption=caption,
                    parse_mode="HTML",
                    reply_markup=keyboard,
                )
            else:
                msg = await bot.send_message(
                    chat_id=chat_id,
                    text=caption,
                    parse_mode="HTML",
                    reply_markup=keyboard,
                    disable_web_page_preview=True,
                )
        return int(msg.message_id) if msg else None
    except Exception:
        logger.exception("Listing %s: помилка публікації в TRADE канал %s", listing_id, chat_id)
        return None


async def publish_marketplace_listing_to_channels(
    bot: Bot,
    listing_id: int,
    listing_row: dict | None = None,
) -> dict[str, Any]:
    """
    Після апруву оголошення користувача на маркетплейсі — дубль у канал.
    Повертає {mode, chat_ids, message_id}.
    """
    listing = listing_row or fetch_marketplace_listing_for_channel(listing_id)
    if not listing:
        logger.warning("Listing %s не знайдено для дублювання в канал", listing_id)
        return {"mode": None, "chat_ids": [], "message_id": None}

    mode = channel_publish_mode(listing.get("category"), listing.get("subcategory"))
    if not mode:
        logger.info(
            "Listing %s: категорія %r/%r не дублюється в канал",
            listing_id,
            listing.get("category"),
            listing.get("subcategory"),
        )
        return {"mode": None, "chat_ids": [], "message_id": None}

    if mode == "services":
        if services_channel_quiet_hours_active():
            logger.info(
                "Listing %s: тихі години — канал послуг пропущено (залишиться стрічка)",
                listing_id,
            )
            return {"mode": "services", "chat_ids": [], "message_id": None, "quiet": True}

        item = marketplace_listing_to_channel_item(
            listing,
            is_free=_as_bool(listing.get("isFree") or listing.get("isfree")),
        )
        description = str(listing.get("description") or "")
        images = _listing_images(listing.get("images"))
        force_ids = resolve_services_trade_channel_ids(item)
        result = await publish_services_listing_to_channel(
            bot,
            item,
            listing_id,
            description,
            images,
            marketplace_listing_id=listing_id,
            force_channel_ids=force_ids,
            skip_feed_quality=True,
        )
        return {
            "mode": "services",
            "chat_ids": list(result.chat_ids),
            "message_id": None,
            "post_url": result.post_url,
        }

    # trade: realestate / job / event
    message_id = await _publish_trade_channel(bot, listing)
    chat_id = _trade_channel_id_for_location(str(listing.get("location") or ""))
    return {
        "mode": "trade",
        "chat_ids": [chat_id] if chat_id and message_id else [],
        "message_id": message_id,
    }
