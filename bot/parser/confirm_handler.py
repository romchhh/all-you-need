"""
Обробник callback-кнопок Підтвердити / Відхилити для парсованих оголошень.

Коли менеджер натискає "Підтвердити":
  1. Переносимо оголошення в таблицю Listing маркетплейсу.
  2. Пишемо автору оголошення (якщо відомий username) повідомлення на рос. мові.
  3. Оновлюємо статус в parsed_items -> 'approved'.
  4. Редагуємо повідомлення в групі (прибираємо кнопки, додаємо статус).

Коли менеджер натискає "Відхилити":
  1. Оновлюємо статус в parsed_items -> 'rejected'.
  2. Редагуємо повідомлення в групі.
"""

import os
import asyncio
import json
import html
import logging
from typing import Optional
from pathlib import Path

from aiogram import Bot, Router, F
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from parser.db import (
    get_parsed_item_by_id,
    update_parsed_item_status,
    set_marketplace_listing_id,
    get_or_create_bot_user,
    create_marketplace_listing,
    copy_parser_images_to_public,
)
from parser.parser import enrich_description, detect_lang
from utils.city_subscription_notify import notify_city_subscribers_marketplace

logger = logging.getLogger(__name__)
router = Router()

WEBAPP_URL: str = os.getenv("WEBAPP_URL", "https://allyouneed.de")
BOT_USERNAME: str = (os.getenv("BOT_USERNAME") or "").lstrip("@")
PARSER_BOT_TELEGRAM_ID: int = int(os.getenv("PARSER_BOT_TELEGRAM_ID", "0"))
PARSER_SERVICES_BOT_TELEGRAM_ID: int = int(
    os.getenv("PARSER_SERVICES_BOT_TELEGRAM_ID", "5587484547")
)
PARSER_SERVICES_BOT_USERNAME: str = (
    os.getenv("PARSER_SERVICES_BOT_USERNAME") or "tradeground_seller2"
)
# Telegram user id «другого продавця» у БД маркетплейсу (не другий Bot API — бот один, TOKEN один).

PARSER_API_ID: int = int(os.getenv("PARSER_API_ID", "0"))
PARSER_API_HASH: str = os.getenv("PARSER_API_HASH", "")
PARSER_PHONE: str = os.getenv("PARSER_PHONE", "")
PARSER_SERVICES_API_ID: int = int(os.getenv("PARSER_SERVICES_API_ID", "0"))
PARSER_SERVICES_API_HASH: str = os.getenv("PARSER_SERVICES_API_HASH", "")
PARSER_SERVICES_PHONE: str = os.getenv("PARSER_SERVICES_PHONE", "")
PARSER_SESSION_PATH = Path(__file__).resolve().parent / "parser_session"
PARSER_SERVICES_SESSION_PATH = Path(__file__).resolve().parent / "parser_services_session"

NOTIFY_AUTHOR_TEXT_RU = (
    "Привет! 👋\n\n"
    "Мы нашли ваше объявление «{title}» и добавили его на наш маркетплейс "
    "<b>Trade Ground</b> — площадку для украино- и русскоязычных в Германии.\n\n"
    "🔗 Ваше объявление: <a href=\"{listing_url}\">открыть в мини-приложении бота</a>\n\n"
    "Если хотите внести изменения или удалить объявление — напишите нам."
)


# ──────────────────────────────────────────────
# Допоміжні функції
# ──────────────────────────────────────────────

def _listing_url(listing_id: int) -> str:
    """Пряме посилання на веб (резерв)."""
    base = WEBAPP_URL.rstrip("/")
    return f"{base}/listing/{listing_id}"


def _listing_miniapp_url(listing_id: int) -> str:
    """Посилання на міні-додаток бота (Direct Link for Mini Apps)."""
    if BOT_USERNAME:
        return f"https://t.me/{BOT_USERNAME}?startapp=listing_{listing_id}"
    return _listing_url(listing_id)


async def _try_notify_author_via_pyrogram(
    item: dict,
    listing_id: int,
    use_services_sender: bool = False,
    _retried_main_fallback: bool = False,
):
    """
    Надсилає повідомлення автору через Pyrogram (акаунт парсера).
    Для послуг (use_services_sender) — другий акаунт (PARSER_SERVICES_*), інакше основний.
    Якщо з другого акаунта peer невідомий — одна повторна спроба з основного.
    """
    author_id = item.get("author_id")
    author_username = item.get("author_username")
    title = item.get("title", "")

    if not author_id and not author_username:
        logger.info(f"Автор оголошення {item['id']} невідомий — пропускаємо сповіщення")
        return

    api_id = PARSER_API_ID
    api_hash = PARSER_API_HASH
    phone = PARSER_PHONE
    session_path = PARSER_SESSION_PATH
    sender_label = "main"

    if use_services_sender:
        if PARSER_SERVICES_API_ID and PARSER_SERVICES_API_HASH and PARSER_SERVICES_PHONE:
            api_id = PARSER_SERVICES_API_ID
            api_hash = PARSER_SERVICES_API_HASH
            phone = PARSER_SERVICES_PHONE
            session_path = PARSER_SERVICES_SESSION_PATH
            sender_label = "services"
        else:
            logger.warning(
                "PARSER_SERVICES_API_ID/HASH/PHONE не заповнені — "
                "DM автору через основний parser-акаунт"
            )

    if not api_id or not api_hash or not phone:
        logger.info("Pyrogram не налаштовано — пропускаємо сповіщення автору")
        return

    try:
        from pyrogram import Client
    except ImportError:
        logger.warning("Pyrogram не встановлено — пропускаємо сповіщення автору")
        return

    plain_text = NOTIFY_AUTHOR_TEXT_RU.format(
        title=title,
        listing_url=_listing_miniapp_url(listing_id),
    )

    try:
        app = Client(
            name=str(session_path),
            api_id=int(api_id),
            api_hash=api_hash,
            phone_number=phone,
        )
        async with app:
            target = author_id or f"@{author_username}"
            await app.send_message(target, plain_text)
            logger.info(f"Pyrogram[{sender_label}]: надіслано сповіщення автору {target}")
    except Exception as e:
        err_s = str(e)
        logger.warning(
            f"Pyrogram[{sender_label}]: не вдалося надіслати автору сповіщення: {e}"
        )
        if (
            use_services_sender
            and not _retried_main_fallback
            and ("PEER_ID_INVALID" in err_s or "peer id" in err_s.lower())
        ):
            logger.info("Повтор DM автору через основний parser-акаунт (services peer невідомий)")
            await _try_notify_author_via_pyrogram(
                item,
                listing_id,
                use_services_sender=False,
                _retried_main_fallback=True,
            )


async def _edit_group_message(
    bot: Bot,
    group_id: int,
    message_id: int,
    status_text: str,
    parse_mode: Optional[str] = None,
):
    """Редагує повідомлення в групі — прибирає кнопки, додає статус."""
    try:
        await bot.edit_message_reply_markup(
            chat_id=group_id,
            message_id=message_id,
            reply_markup=None,
        )
    except Exception:
        pass
    try:
        kwargs = {
            "chat_id": group_id,
            "text": status_text,
            "reply_to_message_id": message_id,
        }
        if parse_mode:
            kwargs["parse_mode"] = parse_mode
        await bot.send_message(**kwargs)
    except Exception as e:
        logger.warning(f"Не вдалося оновити повідомлення групи: {e}")


# ──────────────────────────────────────────────
# Формування опису для маркетплейсу
# ──────────────────────────────────────────────

def _build_marketplace_description(item: dict) -> str:
    """
    Збирає фінальний опис оголошення для маркетплейсу:
      - основний текст (збагачений);
      - контакт автора (@username або посилання на пост);
      - підпис про відкрите джерело (укр. / рос. за detect_lang від тексту оголошення).
    """
    base = enrich_description(item["title"], item["description"])
    lang = detect_lang(
        f"{item.get('title') or ''}\n{item.get('description') or ''}"
    )

    author_username = item.get("author_username")
    source_channel = item.get("source_channel", "")
    message_id = item.get("message_id")
    msg_link = (
        f"https://t.me/{source_channel}/{message_id}"
        if source_channel and message_id
        else None
    )

    if author_username:
        contact_line = f"👤 Автор: @{author_username}"
    elif msg_link:
        if lang == "uk":
            contact_line = f"🔗 Оригінальне оголошення: {msg_link}"
        else:
            contact_line = f"🔗 Оригинальное объявление: {msg_link}"
    else:
        contact_line = ""

    parts = [base]
    if contact_line:
        parts.append(contact_line)

    return "\n\n".join(parts)


# ──────────────────────────────────────────────
# Callback-хендлери
# ──────────────────────────────────────────────

@router.callback_query(F.data.startswith("parser_approve:"))
async def handle_parser_approve(callback: CallbackQuery, bot: Bot):
    item_id = int(callback.data.split(":")[1])
    moderator_id = callback.from_user.id

    item = get_parsed_item_by_id(item_id)
    if not item:
        await callback.answer("❌ Оголошення не знайдено в БД", show_alert=True)
        return

    if item.get("status") == "approved":
        await callback.answer("ℹ️ Оголошення вже підтверджено", show_alert=True)
        return
    if item.get("status") == "rejected":
        await callback.answer("ℹ️ Оголошення вже відхилено", show_alert=True)
        return

    # Товари → parser_bot; послуги (services_work) → другий продавець у маркетплейсі.
    item_category = (item.get("category") or "").strip().lower()
    if item_category == "services_work":
        user_id = get_or_create_bot_user(
            PARSER_SERVICES_BOT_TELEGRAM_ID,
            PARSER_SERVICES_BOT_USERNAME,
            "TradeGround Seller 2",
        )
    else:
        bot_tg_id = PARSER_BOT_TELEGRAM_ID or 8590825131
        user_id = get_or_create_bot_user(bot_tg_id, "parser_bot", "Parser Bot")

    # Отримуємо зображення
    images_raw = item.get("images_json") or "[]"
    try:
        images: list[str] = json.loads(images_raw)
    except Exception:
        images = []

    images_web = copy_parser_images_to_public(images, prefix=f"pi{item_id}")
    description = _build_marketplace_description(item)

    # Переносимо в маркетплейс
    try:
        listing_id = create_marketplace_listing(
            user_id=user_id,
            title=item["title"],
            description=description,
            price=item.get("price"),
            currency=item.get("currency"),
            is_free=bool(item.get("is_free")),
            category=item.get("category", "other"),
            subcategory=item.get("subcategory"),
            condition=item.get("condition"),
            location=item.get("location", "Germany"),
            images=images_web,
        )
    except Exception as e:
        logger.error(f"Помилка створення Listing для parsed_item {item_id}: {e}", exc_info=True)
        await callback.answer("❌ Помилка при додаванні в маркетплейс", show_alert=True)
        return

    set_marketplace_listing_id(item_id, listing_id)
    update_parsed_item_status(item_id, "approved", moderated_by=moderator_id)

    # Чат, де натиснули кнопку (звичайна група або канал послуг) — туди ж відповідь-статус
    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    mini_url = html.escape(_listing_miniapp_url(listing_id))
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"
    status_text = (
        f"✅ <b>Підтверджено</b> модератором {mod_mention}\n"
        f"📌 Listing #{listing_id}: "
        f"<a href=\"{mini_url}\">відкрити в міні-додатку бота</a>"
    )

    # answerCallbackQuery має бути швидко (~до 60 с). Розсилка підписникам і оновлення чату — у фоні.
    try:
        await callback.answer("✅ Оголошення додано в маркетплейс!", show_alert=False)
    except TelegramBadRequest as e:
        low = str(e).lower()
        if "query is too old" in low or "query id is invalid" in low:
            logger.warning("Approve: callback query already expired, skip answer: %s", e)
        else:
            raise

    async def _approve_followup():
        try:
            await notify_city_subscribers_marketplace(bot, listing_id)
        except Exception as notify_err:
            logger.warning(
                "Не вдалося надіслати city-subscription сповіщення для Listing %s: %s",
                listing_id,
                notify_err,
            )
        await _edit_group_message(
            bot,
            group_id,
            msg_id,
            status_text,
            parse_mode="HTML",
        )

    asyncio.create_task(_approve_followup())
    asyncio.create_task(
        _try_notify_author_via_pyrogram(
            item,
            listing_id,
            use_services_sender=(item_category == "services_work"),
        )
    )

    logger.info(f"parsed_item {item_id} → Listing {listing_id} (підтв. {moderator_id})")


@router.callback_query(F.data.startswith("parser_reject:"))
async def handle_parser_reject(callback: CallbackQuery, bot: Bot):
    item_id = int(callback.data.split(":")[1])
    moderator_id = callback.from_user.id

    item = get_parsed_item_by_id(item_id)
    if not item:
        await callback.answer("❌ Оголошення не знайдено в БД", show_alert=True)
        return

    if item.get("status") in ("approved", "rejected"):
        await callback.answer(f"ℹ️ Оголошення вже {item['status']}", show_alert=True)
        return

    update_parsed_item_status(item_id, "rejected", moderated_by=moderator_id)

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"
    await _edit_group_message(
        bot,
        group_id,
        msg_id,
        f"❌ <b>Відхилено</b> модератором {mod_mention}",
        parse_mode="HTML",
    )

    await callback.answer("❌ Оголошення відхилено", show_alert=False)
    logger.info(f"parsed_item {item_id} відхилено модератором {moderator_id}")
