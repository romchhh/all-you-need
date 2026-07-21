"""
Модуль надсилання оголошень адміну в групу модерації з кнопками Підтвердити / Відхилити.
"""

import html
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

from parser.storage.parsed_items import record_moderation_message
from parser.category_keywords import get_category_label
from parser.config.settings import (
    PARSER_MOD_GOODS_ID,
    PARSER_MOD_SERVICES_GERMANY_ID,
    PARSER_MOD_SERVICES_HAMBURG_ID,
)
from parser.ai.screen import is_ai_screen_enabled
from parser.core.telegram_meta import parsed_item_message_link
from parser.moderation.formatting import resolved_author_username
from parser.moderation.approve_routing import (
    is_services_moderation_chat,
    services_moderation_chat_ids,
)
from utils.location_normalization import normalize_city_name

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent


def get_parser_group_id() -> Optional[int]:
    """Fallback для товарів, якщо notify_chat_id не задано."""
    return PARSER_MOD_GOODS_ID


def _tgground_logo_path() -> Optional[str]:
    candidates = (
        BASE_DIR / "bot" / "Content" / "tgground.jpg",
        BASE_DIR / "Content" / "tgground.jpg",
    )
    for p in candidates:
        if p.is_file():
            return str(p)
    return None


def _is_services_item(item: dict) -> bool:
    if (item.get("parser_type") or "").strip() == "services_channel":
        return True
    if (item.get("category") or "").strip().lower() == "services_work":
        return True
    try:
        notify_chat = int(item.get("notify_chat_id"))
    except (TypeError, ValueError):
        return False
    return notify_chat in services_moderation_chat_ids()


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
    "Munich": "🇩🇪 München",
    "München": "🇩🇪 München",
    "Frankfurt": "🇩🇪 Frankfurt",
    "Frankfurt am Main": "🇩🇪 Frankfurt",
    "Düsseldorf": "🇩🇪 Düsseldorf",
    "Duesseldorf": "🇩🇪 Düsseldorf",
    "Essen": "🇩🇪 Essen",
    "Dülmen": "🇩🇪 Dülmen",
    "Dulmen": "🇩🇪 Dülmen",
    "Stuttgart": "🇩🇪 Stuttgart",
    "Cologne": "🇩🇪 Köln",
    "Köln": "🇩🇪 Köln",
    "Koln": "🇩🇪 Köln",
    "NRW": "🇩🇪 NRW",
    "Germany": "🇩🇪 Germany",
}


def _format_admin_message(item: dict) -> str:
    parser_type = (item.get("parser_type") or "default").strip()
    try:
        notify_chat = int(item.get("notify_chat_id")) if item.get("notify_chat_id") is not None else None
    except (TypeError, ValueError):
        notify_chat = None

    if notify_chat == PARSER_MOD_SERVICES_HAMBURG_ID:
        header = "НОВА ПОСЛУГА (Hamburg)"
        footer = "✅ → канал Hamburg + маркетплейс"
    elif notify_chat == PARSER_MOD_SERVICES_GERMANY_ID:
        header = "НОВА ПОСЛУГА (Germany)"
        footer = "✅ → канал Germany (+ Hamburg якщо dual) + маркетплейс"
    elif parser_type == "services_channel" or _is_services_item(item):
        header = "НОВА ПОСЛУГА"
        footer = "✅ → Telegram-канал послуг + маркетплейс"
    else:
        header = "НОВЕ ОГОЛОШЕННЯ (товари)"
        footer = "✅ → лише маркетплейс"

    category_label = get_category_label(item.get("category", "other"), item.get("subcategory"))
    cat_emoji = CATEGORY_EMOJI.get(item.get("category", "other"), "📦")
    raw_city = (item.get("location") or item.get("source_city") or "").strip()
    city_de = normalize_city_name(raw_city) if raw_city else ""
    city_display = CITY_FLAG.get(city_de, f"🇩🇪 {city_de}" if city_de else "—")

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

    author = resolved_author_username(item)
    author_id = item.get("author_id")
    channel = item.get("source_channel", "")
    msg_link = (
        item.get("msg_link")
        or parsed_item_message_link(item)
        or (f"https://t.me/{channel}" if channel else "")
    )
    msg_link_safe = html.escape(msg_link, quote=True) if msg_link else ""

    if author:
        author_display = f'<a href="https://t.me/{html.escape(author)}">@{html.escape(author)}</a>'
    elif msg_link_safe:
        author_display = f'немає @ — <a href="{msg_link_safe}">оригінальний пост</a>'
    elif author_id:
        author_display = f'<a href="tg://user?id={int(author_id)}">автор</a>'
    else:
        author_display = "невідомий"

    title = html.escape(str(item.get("title") or "—"))
    description = str(item.get("description") or "")
    if len(description) > 800:
        description = description[:800] + "…"
    description = html.escape(description)

    condition = item.get("condition")
    condition_display = {
        "new": "✨ Нове",
        "used": "♻️ Б/у",
        None: "—",
    }.get(condition, condition or "—")

    lines = [
        f"🆕 <b>{header}</b>",
        f"",
        f"📋 <b>{title}</b>",
        f"",
        f"{cat_emoji} Категорія: <b>{html.escape(category_label)}</b>",
        f"📍 Місто: <b>{html.escape(city_display)}</b>",
        f"{price_display}",
        f"📦 Стан: {condition_display}",
        f"",
        f"👤 Автор: {author_display}",
        f"📢 Канал: @{html.escape(str(channel))}",
    ]
    lines.extend(
        [
            f"",
            f"📝 <b>Опис:</b>",
            f"{description}",
            f"",
            f"<i>{footer}</i>",
        ]
    )
    if is_ai_screen_enabled():
        lines.append("<i>🤖 AI попередньо відфільтровано та відформатовано</i>")
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
    Якщо в item задано notify_chat_id (напр. послуги з parser.py) — надсилання туди.
    Повертає message_id надісланого повідомлення або None.
    """
    override = item.get("notify_chat_id")
    if override is not None:
        try:
            group_id = int(override)
        except (TypeError, ValueError):
            group_id = get_parser_group_id()
    else:
        group_id = get_parser_group_id()
    if not group_id:
        logger.warning("notify_chat_id / PARSER_MOD_GOODS_ID не встановлено — пропускаємо надсилання адміну")
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

    # Послуги без фото — лого TradeGround (як у каналах)
    if not abs_images and _is_services_item(item):
        logo = _tgground_logo_path()
        if logo:
            abs_images = [logo]

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

        # Одна картка на оголошення — зберігаємо в основних полях модерації
        mod_target = (item.get("moderation_target") or "").strip().lower()
        if not mod_target:
            mod_target = (
                "services_both"
                if is_services_moderation_chat(group_id)
                else "marketplace"
            )
        record_moderation_message(item_id, msg_id, group_id, target="marketplace")
        logger.info(
            "Надіслано оголошення %s в групу %s (%s), msg_id=%s",
            item_id,
            group_id,
            mod_target,
            msg_id,
        )
        return msg_id

    except Exception as e:
        logger.error(f"Помилка надсилання оголошення {item_id} в групу: {e}", exc_info=True)
        return None


# ──────────────────────────────────────────────
# Сповіщення адмінів про помилки парсера
# ──────────────────────────────────────────────

def _parser_error_notify_enabled() -> bool:
    raw = (os.getenv("PARSER_ERROR_NOTIFY_ADMINS") or "1").strip().lower()
    return raw not in ("0", "false", "no")


def _parser_schedule_report_enabled() -> bool:
    raw = (os.getenv("PARSER_SCHEDULE_REPORT_ADMINS") or "1").strip().lower()
    return raw not in ("0", "false", "no")


async def notify_parser_error_admins(bot: Bot, title: str, details: str) -> None:
    """Надсилає повідомлення про помилку парсера всім адмінам (config.administrators)."""
    if not _parser_error_notify_enabled():
        return

    try:
        from config import administrators
    except Exception as e:
        logger.warning("Не вдалося завантажити administrators: %s", e)
        return

    if not administrators:
        return

    safe_title = html.escape(title)
    safe_details = html.escape(details.strip())
    if len(safe_details) > 3500:
        safe_details = safe_details[:3500] + "…"

    body = f"⚠️ <b>Парсер: {safe_title}</b>\n\n<pre>{safe_details}</pre>"

    for admin_id in administrators:
        try:
            await bot.send_message(admin_id, body, parse_mode="HTML")
        except Exception as e:
            logger.warning("Parser error notify admin %s: %s", admin_id, e)


async def notify_parser_channel_errors(
    bot: Bot,
    errors: list[dict],
) -> None:
    """Зведене сповіщення про помилки парсингу окремих каналів."""
    if not errors or not _parser_error_notify_enabled():
        return

    lines = []
    for err in errors[:25]:
        channel = html.escape(str(err.get("channel", "?")))
        message = html.escape(str(err.get("error", "невідома помилка"))[:300])
        lines.append(f"• <b>{channel}</b>\n  <code>{message}</code>")

    extra = ""
    if len(errors) > 25:
        extra = f"\n\n…та ще {len(errors) - 25} канал(ів)"

    await notify_parser_error_admins(
        bot,
        "помилки каналів",
        "\n\n".join(lines) + extra,
    )


async def notify_parser_scheduled_report(
    bot: Bot,
    stats: dict | None,
    *,
    lookback: int | None = None,
    skip_note: str | None = None,
) -> None:
    """Звіт адмінам після планового циклу парсингу."""
    if not _parser_schedule_report_enabled():
        return

    try:
        from config import administrators
    except Exception as e:
        logger.warning("Не вдалося завантажити administrators: %s", e)
        return

    if not administrators:
        return

    from parser.notify.report import format_parser_stats

    body = format_parser_stats(
        stats,
        scheduled=True,
        lookback=lookback,
        skip_note=skip_note,
    )
    if len(body) > 4000:
        body = body[:4000] + "…"

    for admin_id in administrators:
        try:
            await bot.send_message(admin_id, body, parse_mode="HTML")
        except Exception as e:
            logger.warning("Parser schedule report admin %s: %s", admin_id, e)
