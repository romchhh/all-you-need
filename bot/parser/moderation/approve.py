"""Підтвердження парсованого оголошення модератором."""

import asyncio
import html
import json
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from parser.ai_enrich import (
    enrich_parsed_item_with_ai,
    is_ai_enrich_enabled,
    merge_enrichment_into_item,
)
from parser.category_keywords import get_category_label
from parser.moderation.author_notify import try_notify_author_via_pyrogram
from parser.moderation.config import (
    PARSER_BOT_TELEGRAM_ID,
    PARSER_SERVICES_BOT_TELEGRAM_ID,
    PARSER_SERVICES_BOT_USERNAME,
)
from parser.moderation.description import build_marketplace_description
from parser.moderation.group_message import edit_group_message
from parser.moderation.services_publish import publish_services_listing_to_channel
from parser.moderation.urls import listing_miniapp_url
from parser.storage.marketplace import (
    copy_parser_images_to_public,
    create_marketplace_listing,
    get_or_create_bot_user,
)
from parser.storage.parsed_items import (
    get_parsed_item_by_id,
    set_marketplace_listing_id,
    update_parsed_item_status,
)
from utils.city_digest_notify import enqueue_city_digest_listing

logger = logging.getLogger(__name__)


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

    images_raw = item.get("images_json") or "[]"
    try:
        images: list[str] = json.loads(images_raw)
    except Exception:
        images = []

    listing_item = dict(item)
    ai_summary = ""

    if is_ai_enrich_enabled():
        try:
            await callback.answer("🤖 AI аналізує оголошення…", show_alert=False)
        except TelegramBadRequest:
            pass
        enriched = await enrich_parsed_item_with_ai(item, images)
        if enriched and enriched.applied:
            listing_item = merge_enrichment_into_item(item, enriched)
            ai_summary = enriched.summary
            logger.info(
                "parsed_item %s AI enrich: cat=%s/%s loc=%s price=%s",
                item_id,
                listing_item.get("category"),
                listing_item.get("subcategory"),
                listing_item.get("location"),
                listing_item.get("price"),
            )
    else:
        try:
            await callback.answer("⏳ Додаємо в маркетплейс…", show_alert=False)
        except TelegramBadRequest:
            pass

    item_category = (listing_item.get("category") or "").strip().lower()
    if item_category == "services_work":
        user_id = get_or_create_bot_user(
            PARSER_SERVICES_BOT_TELEGRAM_ID,
            PARSER_SERVICES_BOT_USERNAME,
            "TradeGround Seller 2",
        )
    else:
        bot_tg_id = PARSER_BOT_TELEGRAM_ID or 8590825131
        user_id = get_or_create_bot_user(bot_tg_id, "parser_bot", "Parser Bot")

    images_web = copy_parser_images_to_public(images, prefix=f"pi{item_id}")
    description = build_marketplace_description(listing_item)

    try:
        listing_id = create_marketplace_listing(
            user_id=user_id,
            title=listing_item["title"],
            description=description,
            price=listing_item.get("price"),
            currency=listing_item.get("currency"),
            is_free=bool(listing_item.get("is_free")),
            category=listing_item.get("category", "other"),
            subcategory=listing_item.get("subcategory"),
            condition=listing_item.get("condition"),
            location=listing_item.get("location", "Germany"),
            images=images_web,
        )
    except Exception as e:
        logger.error("Помилка створення Listing для parsed_item %s: %s", item_id, e, exc_info=True)
        await callback.answer("❌ Помилка при додаванні в маркетплейс", show_alert=True)
        return

    set_marketplace_listing_id(item_id, listing_id)
    update_parsed_item_status(item_id, "approved", moderated_by=moderator_id)

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    mini_url = html.escape(listing_miniapp_url(listing_id))
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"
    status_text = (
        f"✅ <b>Підтверджено</b> модератором {mod_mention}\n"
        f"📌 Listing #{listing_id}: "
        f"<a href=\"{mini_url}\">відкрити в міні-додатку бота</a>\n"
        f"📂 {html.escape(get_category_label(listing_item.get('category', 'other'), listing_item.get('subcategory')))}\n"
        f"📍 {html.escape(str(listing_item.get('location') or ''))}"
    )
    if ai_summary:
        status_text += f"\n🤖 {html.escape(ai_summary[:220])}"

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
            await publish_services_listing_to_channel(
                bot, listing_item, listing_id, description, images_web
            )
        await edit_group_message(
            bot,
            group_id,
            msg_id,
            status_text,
            parse_mode="HTML",
        )

    asyncio.create_task(_approve_followup())
    asyncio.create_task(
        try_notify_author_via_pyrogram(
            listing_item,
            listing_id,
            use_services_sender=(item_category == "services_work"),
        )
    )

    logger.info("parsed_item %s → Listing %s (підтв. %s)", item_id, listing_id, moderator_id)
