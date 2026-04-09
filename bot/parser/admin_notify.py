"""
Модуль надсилання оголошень адміну в групу модерації з кнопками Підтвердити / Відхилити.
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional

from aiogram import Bot
from aiogram.exceptions import TelegramRetryAfter
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    InputMediaPhoto,
    FSInputFile,
)

from parser.db import set_admin_message_id
from parser.category_keywords import get_category_label

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

PARSER_GROUP_ID: Optional[int] = None


def get_parser_group_id() -> Optional[int]:
    global PARSER_GROUP_ID
    if PARSER_GROUP_ID is None:
        raw = os.getenv("PARSER_GROUP_ID")
        if raw:
            PARSER_GROUP_ID = int(raw)
    return PARSER_GROUP_ID


# ──────────────────────────────────────────────
# Форматування тексту повідомлення
# ──────────────────────────────────────────────

CATEGORY_EMOJI = {
    "electronics": "📱",
    "clothing": "👗",
    "furniture": "🛋",
    "appliances": "🏠",
    "kids": "🧸",
    "sports": "⚽",
    "vehicles": "🚗",
    "beauty": "💄",
    "home_garden": "🔧",
    "food": "🍎",
    "services_work": "💼",
    "realestate": "🏡",
    "free_stuff": "🎁",
    "other": "📦",
}

CITY_FLAG = {
    "Berlin": "🇩🇪 Berlin",
    "Leipzig": "🇩🇪 Leipzig",
    "Hamburg": "🇩🇪 Hamburg",
    "Munich": "🇩🇪 Munich",
    "München": "🇩🇪 Munich",
    "Düsseldorf": "🇩🇪 Düsseldorf",
    "Duesseldorf": "🇩🇪 Düsseldorf",
    "Essen": "🇩🇪 Essen",
    "Dülmen": "🇩🇪 Dülmen",
    "Dulmen": "🇩🇪 Dülmen",
    "Stuttgart": "🇩🇪 Stuttgart",
    "Cologne": "🇩🇪 Cologne",
    "Köln": "🇩🇪 Cologne",
    "Koln": "🇩🇪 Cologne",
    "NRW": "🇩🇪 NRW",
    "Germany": "🇩🇪 Germany",
}


def _format_admin_message(item: dict) -> str:
    category_label = get_category_label(item.get("category", "other"), item.get("subcategory"))
    cat_emoji = CATEGORY_EMOJI.get(item.get("category", "other"), "📦")
    city_display = CITY_FLAG.get(item.get("location", ""), item.get("location", "—"))

    price_str = item.get("price")
    currency = item.get("currency") or ""
    is_free = item.get("is_free", False)
    if is_free:
        price_display = "🆓 Безкоштовно"
    elif price_str == "Договірна":
        price_display = "🤝 Договірна"
    elif price_str:
        price_display = f"💰 {price_str} {currency}".strip()
    else:
        price_display = "❓ Не вказана"

    author = item.get("author_username")
    author_display = f"@{author}" if author else "невідомий"

    channel = item.get("source_channel", "")
    msg_link = item.get("msg_link", f"https://t.me/{channel}")

    title = item.get("title", "—")
    description = item.get("description", "")
    if len(description) > 800:
        description = description[:800] + "…"

    condition = item.get("condition")
    condition_display = {
        "new": "✨ Нове",
        "used": "♻️ Б/у",
        None: "—",
    }.get(condition, condition or "—")

    lines = [
        f"🆕 <b>НОВЕ ОГОЛОШЕННЯ З ПАРСЕРА</b>",
        f"",
        f"📋 <b>{title}</b>",
        f"",
        f"{cat_emoji} Категорія: <b>{category_label}</b>",
        f"📍 Місто: <b>{city_display}</b>",
        f"{price_display}",
        f"📦 Стан: {condition_display}",
        f"",
        f"👤 Автор: {author_display}",
        f"📢 Канал: @{channel}",
        f"🔗 <a href='{msg_link}'>Оригінальне повідомлення</a>",
        f"",
        f"📝 <b>Опис:</b>",
        f"{description}",
    ]
    return "\n".join(lines)


def _make_keyboard(item_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="✅ Підтвердити",
                callback_data=f"parser_approve:{item_id}",
            ),
            InlineKeyboardButton(
                text="❌ Відхилити",
                callback_data=f"parser_reject:{item_id}",
            ),
        ],
    ])


# ──────────────────────────────────────────────
# Надсилання в групу
# ──────────────────────────────────────────────

# Затримка між оголошеннями щоб не потрапити в flood control
SEND_DELAY_SEC: float = 3.0
# Максимальна кількість retry при TelegramRetryAfter
MAX_RETRIES: int = 3


async def _send_with_retry(coro_fn, *args, **kwargs):
    """Виконує coroutine-функцію з retry при TelegramRetryAfter."""
    for attempt in range(MAX_RETRIES):
        try:
            return await coro_fn(*args, **kwargs)
        except TelegramRetryAfter as e:
            wait = e.retry_after + 2
            logger.warning(f"Flood control, чекаємо {wait}с (спроба {attempt + 1}/{MAX_RETRIES})")
            await asyncio.sleep(wait)
    return await coro_fn(*args, **kwargs)


async def notify_admin_group(bot: Bot, item: dict) -> Optional[int]:
    """
    Надсилає оголошення в групу модерації парсера.
    Повертає message_id надісланого повідомлення або None.
    """
    group_id = get_parser_group_id()
    if not group_id:
        logger.warning("PARSER_GROUP_ID не встановлено — пропускаємо надсилання адміну")
        return None

    item_id = item["id"]
    text = _format_admin_message(item)
    keyboard = _make_keyboard(item_id)
    images: list[str] = item.get("images") or []

    # Перетворюємо відносні шляхи на абсолютні
    abs_images = []
    for img in images:
        p = BASE_DIR / img
        if p.exists():
            abs_images.append(str(p))

    try:
        if len(abs_images) == 0:
            sent = await _send_with_retry(
                bot.send_message,
                chat_id=group_id,
                text=text,
                parse_mode="HTML",
                reply_markup=keyboard,
                disable_web_page_preview=True,
            )
            msg_id = sent.message_id

        elif len(abs_images) == 1:
            photo = FSInputFile(abs_images[0])
            sent = await _send_with_retry(
                bot.send_photo,
                chat_id=group_id,
                photo=photo,
                caption=text[:1024],
                parse_mode="HTML",
                reply_markup=keyboard,
            )
            msg_id = sent.message_id

        else:
            media_group = []
            for i, path in enumerate(abs_images[:10]):
                media_group.append(
                    InputMediaPhoto(
                        media=FSInputFile(path),
                        caption=text[:1024] if i == 0 else None,
                        parse_mode="HTML" if i == 0 else None,
                    )
                )
            sent_group = await _send_with_retry(
                bot.send_media_group,
                chat_id=group_id,
                media=media_group,
            )
            first_msg_id = sent_group[0].message_id

            await asyncio.sleep(1)

            sent_kb = await _send_with_retry(
                bot.send_message,
                chat_id=group_id,
                text=f"⬆️ Оголошення #{item_id} — оберіть дію:",
                reply_to_message_id=first_msg_id,
                reply_markup=keyboard,
            )
            msg_id = sent_kb.message_id

        # Зберігаємо admin_message_id
        set_admin_message_id(item_id, msg_id)
        logger.info(f"Надіслано оголошення {item_id} в групу, msg_id={msg_id}")
        return msg_id

    except Exception as e:
        logger.error(f"Помилка надсилання оголошення {item_id} в групу: {e}", exc_info=True)
        return None
