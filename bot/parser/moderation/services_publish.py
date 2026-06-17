"""Публікація підтверджених послуг у публічний Telegram-канал."""

import html
import logging
import os
from pathlib import Path
from typing import Optional

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto

from parser.category_keywords import get_category_label
from parser.core.text import detect_lang
from parser.moderation.config import BOT_USERNAME, TRADE_SERVICES_CHANNEL_ID_RAW, WEBAPP_URL
from utils.translations import t

logger = logging.getLogger(__name__)


def _default_channel_photo_path() -> Optional[str]:
    bot_dir = Path(__file__).resolve().parent.parent.parent
    p = bot_dir / "Content" / "tgground.jpg"
    if p.is_file():
        return str(p)
    logger.warning("Дефолтне фото каналу не знайдено: %s", p)
    return None


def _channel_photo_inputs_from_images_web(images_web: list) -> list:
    out: list = []
    base = (WEBAPP_URL or "").rstrip("/")
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    for img in (images_web or [])[:10]:
        if not img or not isinstance(img, str):
            continue
        s = img.strip()
        if s.startswith("http://") or s.startswith("https://"):
            out.append(s)
            continue
        if not s.startswith("/") or not base:
            continue
        rel = s.lstrip("/")
        local = project_root / "app" / "public" / rel
        if local.is_file():
            out.append(FSInputFile(str(local)))
        else:
            out.append(f"{base}{s}")
    return out


def _services_channel_price_text(user_id_for_lang: int, item: dict) -> str:
    negotiable_text = t(user_id_for_lang, "moderation.negotiable")
    is_free = bool(item.get("is_free"))
    price_str = str(item.get("price") or "").strip()
    currency = (item.get("currency") or "EUR").strip()
    price_display = item.get("price_display")
    if isinstance(price_display, str):
        price_display = price_display.strip() or None

    if is_free:
        return t(user_id_for_lang, "common.free")
    if price_display:
        if price_display in (
            negotiable_text,
            "Договірна",
            "Договорная",
            "Negotiable",
            "negotiable",
        ):
            return negotiable_text
        if "/год" in price_display or "/час" in price_display:
            return html.escape(price_display)
        return f"{html.escape(price_display)} {html.escape(currency)}"
    if price_str in ("Договірна", "Договорная", "Negotiable", "negotiable"):
        return negotiable_text
    if price_str:
        return f"{html.escape(price_str)} {html.escape(currency)}"
    return negotiable_text


async def publish_services_listing_to_channel(
    bot: Bot,
    item: dict,
    listing_id: int,
    marketplace_description: str,
    images_web: list,
) -> None:
    if not TRADE_SERVICES_CHANNEL_ID_RAW:
        logger.warning(
            "TRADE_SERVICES_CHANNEL_ID не задано — пропускаємо публікацію в канал послуг (listing %s)",
            listing_id,
        )
        return
    try:
        chat_id = int(TRADE_SERVICES_CHANNEL_ID_RAW)
    except ValueError:
        logger.error("TRADE_SERVICES_CHANNEL_ID некоректний: %r", TRADE_SERVICES_CHANNEL_ID_RAW)
        return

    try:
        user_id_for_lang = int(item.get("author_id") or 0)
    except (TypeError, ValueError):
        user_id_for_lang = 0

    title = (item.get("title") or "").strip()
    title_style = f"<b>{html.escape(title)}</b>"
    description = html.escape((marketplace_description or "").strip())

    category = (item.get("category") or "services_work").strip()
    subcategory = item.get("subcategory")
    category_text = html.escape(get_category_label(category, subcategory))
    hashtag_category = get_category_label(category, subcategory) or "Послуги"

    condition = item.get("condition") or ""
    condition_map = {
        "new": t(user_id_for_lang, "listing.details.condition_new"),
        "used": t(user_id_for_lang, "listing.details.condition_used"),
    }
    condition_text = html.escape(str(condition_map.get(condition, condition or "—")))

    location = (item.get("location") or "").strip()
    location_esc = html.escape(location)

    price_text = _services_channel_price_text(user_id_for_lang, item)

    city_hashtag = location.replace(" ", "").replace("ü", "u").replace("ö", "o").replace("ä", "a").replace("ß", "ss")
    city_hashtag = "".join(c for c in city_hashtag if c.isalnum() or c in ["_", "-"])
    city_hashtag = f"#{city_hashtag}" if city_hashtag else ""

    hashtags = f"#{hashtag_category.replace(' ', '').replace('/', '_')}"
    if city_hashtag:
        hashtags += f" {city_hashtag}"

    seller_label = t(user_id_for_lang, "listing.details.seller_channel")
    author_username = (item.get("author_username") or "").strip().lstrip("@")
    author_id = item.get("author_id")
    source_channel = (item.get("source_channel") or "").strip()
    message_id = item.get("message_id")
    msg_link = (
        f"https://t.me/{source_channel}/{message_id}" if source_channel and message_id else None
    )

    seller_default_name = (
        t(user_id_for_lang, "listing.details.seller_channel")
        .replace("<b>", "")
        .replace("</b>", "")
        .replace(":", "")
        .strip()
    )

    if author_username:
        seller_full_name = f"@{author_username}"
        seller_text = (
            f"{seller_label} "
            f"<a href=\"https://t.me/{html.escape(author_username, quote=True)}\">"
            f"{html.escape(seller_full_name)}</a>"
        )
    else:
        try:
            aid = int(author_id) if author_id is not None else 0
        except (TypeError, ValueError):
            aid = 0
        if aid:
            seller_full_name = t(user_id_for_lang, "common.user")
            seller_link = f"tg://user?id={aid}"
            seller_text = f"{seller_label} <a href=\"{seller_link}\">{html.escape(seller_full_name)}</a>"
        elif msg_link:
            lang = detect_lang(f"{item.get('title') or ''}\n{item.get('description') or ''}")
            link_label = "Оригінал оголошення" if lang == "uk" else "Оригинал объявления"
            safe_link = html.escape(msg_link, quote=True)
            seller_text = f"{seller_label} <a href=\"{safe_link}\">{html.escape(link_label)}</a>"
        else:
            seller_text = f"{seller_label} {html.escape(seller_default_name)}"

    bot_username = (os.getenv("BOT_USERNAME") or BOT_USERNAME or "TradeGroundBot").lstrip("@")
    bot_link = f"https://t.me/{bot_username}"
    bot_text = f"\n\n{t(user_id_for_lang, 'listing.submit_ad_text', bot_link=bot_link)}"

    text = f"""{title_style}

{description}

{t(user_id_for_lang, 'listing.details.price_channel')} {price_text}
{t(user_id_for_lang, 'listing.details.category_channel')} {category_text}
{t(user_id_for_lang, 'listing.details.location_channel')} {location_esc}
{seller_text}

{t(user_id_for_lang, 'listing.details.hashtag')} {hashtags}"""

    text_with_bot = text + bot_text
    if len(text_with_bot) > 1024:
        text_with_bot = text_with_bot[:1023] + "…"

    button_text = t(user_id_for_lang, "listing.submit_ad_button")
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=button_text, url=bot_link)]]
    )

    photo_inputs = _channel_photo_inputs_from_images_web(list(images_web) if images_web else [])

    try:
        if len(photo_inputs) == 1:
            await bot.send_photo(
                chat_id=chat_id,
                photo=photo_inputs[0],
                caption=text_with_bot,
                parse_mode="HTML",
                reply_markup=keyboard,
            )
        elif len(photo_inputs) > 1:
            media = []
            for i, ph in enumerate(photo_inputs):
                cap = text_with_bot if i == 0 else None
                pmode = "HTML" if i == 0 else None
                media.append(InputMediaPhoto(media=ph, caption=cap, parse_mode=pmode))
            await bot.send_media_group(chat_id=chat_id, media=media)
        else:
            default_path = _default_channel_photo_path()
            if default_path:
                await bot.send_photo(
                    chat_id=chat_id,
                    photo=FSInputFile(default_path),
                    caption=text_with_bot,
                    parse_mode="HTML",
                    reply_markup=keyboard,
                )
            else:
                await bot.send_message(
                    chat_id=chat_id,
                    text=text_with_bot,
                    parse_mode="HTML",
                    disable_web_page_preview=False,
                )
        logger.info("Listing %s опубліковано в канал послуг chat_id=%s", listing_id, chat_id)
    except TelegramBadRequest as e:
        logger.warning(
            "Telegram: не вдалося опублікувати listing %s у канал послуг: %s",
            listing_id,
            e,
        )
    except Exception as e:
        logger.warning(
            "Помилка публікації listing %s у канал послуг: %s",
            listing_id,
            e,
            exc_info=True,
        )
