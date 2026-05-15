"""
Обробник callback-кнопок Підтвердити / Відхилити для парсованих оголошень.

Коли менеджер натискає "Підтвердити":
  1. Переносимо оголошення в таблицю Listing маркетплейсу.
  2. Для категорії «Послуги» (services_work) — дублюємо пост у публічний канал послуг (TRADE_SERVICES_CHANNEL_ID).
  3. Пишемо автору оголошення (якщо відомий username) повідомлення на рос. мові.
  4. Оновлюємо статус в parsed_items -> 'approved'.
  5. Редагуємо повідомлення в групі (прибираємо кнопки, додаємо статус).

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
from aiogram.types import (
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputMediaPhoto,
)

from parser.db import (
    get_parsed_item_by_id,
    update_parsed_item_status,
    set_marketplace_listing_id,
    get_or_create_bot_user,
    create_marketplace_listing,
    copy_parser_images_to_public,
)
from parser.parser import enrich_description, detect_lang
from parser.category_keywords import get_category_label
from utils.city_digest_notify import enqueue_city_digest_listing
from utils.translations import t

logger = logging.getLogger(__name__)
router = Router()

WEBAPP_URL: str = os.getenv("WEBAPP_URL", "https://allyouneed.de")
BOT_USERNAME: str = (os.getenv("BOT_USERNAME") or "").lstrip("@")
# Публічний канал оголошень про послуги (числовий id, напр. -100…). Той самий бот, що й для модерації.
TRADE_SERVICES_CHANNEL_ID_RAW: str = (os.getenv("TRADE_SERVICES_CHANNEL_ID") or "").strip()
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


def _main_pyrogram_configured() -> bool:
    return bool(PARSER_API_ID and PARSER_API_HASH and PARSER_PHONE)


def _services_pyrogram_configured() -> bool:
    return bool(
        PARSER_SERVICES_API_ID and PARSER_SERVICES_API_HASH and PARSER_SERVICES_PHONE
    )


def _is_peer_flood_error(err_s: str) -> bool:
    low = err_s.lower()
    return (
        "PEER_FLOOD" in err_s
        or "FLOOD_WAIT" in err_s
        or ("flood" in low and "limited" in low)
        or "currently limited" in low
    )


async def _try_notify_author_via_pyrogram(
    item: dict,
    listing_id: int,
    use_services_sender: bool = False,
    _retried_main_fallback: bool = False,
    _flood_account_switch_done: bool = False,
):
    """
    Надсилає повідомлення автору через Pyrogram (акаунт парсера).
    Для послуг (use_services_sender) — другий акаунт (PARSER_SERVICES_*), інакше основний.
    PEER_ID_INVALID з services → одна спроба з main.
    PEER_FLOOD / ліміт на поточному акаунті → одна спроба з іншого (якщо він налаштований).
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
                _flood_account_switch_done=_flood_account_switch_done,
            )
            return

        if _is_peer_flood_error(err_s) and not _flood_account_switch_done:
            if use_services_sender and _main_pyrogram_configured():
                logger.info(
                    "PEER_FLOOD/ліміт на акаунті послуг — пробуємо основний parser-акаунт"
                )
                await _try_notify_author_via_pyrogram(
                    item,
                    listing_id,
                    use_services_sender=False,
                    _retried_main_fallback=_retried_main_fallback,
                    _flood_account_switch_done=True,
                )
                return
            if not use_services_sender and _services_pyrogram_configured():
                logger.info(
                    "PEER_FLOOD/ліміт на основному parser — пробуємо акаунт послуг (Pyrogram)"
                )
                await _try_notify_author_via_pyrogram(
                    item,
                    listing_id,
                    use_services_sender=True,
                    _retried_main_fallback=_retried_main_fallback,
                    _flood_account_switch_done=True,
                )
                return


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

def _default_channel_photo_path() -> Optional[str]:
    """Той самий дефолт, що в moderation_manager._get_default_photo_path."""
    bot_dir = Path(__file__).resolve().parent.parent
    p = bot_dir / "Content" / "tgground.jpg"
    if p.is_file():
        return str(p)
    logger.warning("Дефолтне фото каналу не знайдено: %s", p)
    return None


def _channel_photo_inputs_from_images_web(images_web: list) -> list:
    """
    Шляхи /listings/... → FSInputFile з app/public, інакше повний URL рядком.
    Порядок як у images_web (до 10).
    """
    out: list = []
    base = (WEBAPP_URL or "").rstrip("/")
    project_root = Path(__file__).resolve().parent.parent.parent
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


async def _publish_services_listing_to_channel(
    bot: Bot,
    item: dict,
    listing_id: int,
    marketplace_description: str,
    images_web: list,
) -> None:
    """
    Дублює оголошення в канал послуг у тому ж вигляді, що й звичайні пости каналу
    (див. moderation_manager._publish_to_channel): заголовок, опис, блок деталей,
    хештеги, футер «Подати оголошення» + кнопка на бота — без окремого промо міні-ап.
    """
    if not TRADE_SERVICES_CHANNEL_ID_RAW:
        logger.warning(
            "TRADE_SERVICES_CHANNEL_ID не задано — пропускаємо публікацію в канал послуг "
            "(listing %s)",
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
            enqueue_city_digest_listing(listing_id)
        except Exception as notify_err:
            logger.warning(
                "Не вдалося поставити Listing %s в city-digest чергу: %s",
                listing_id,
                notify_err,
            )
        if item_category == "services_work":
            await _publish_services_listing_to_channel(
                bot, item, listing_id, description, images_web
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
