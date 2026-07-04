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
from parser.moderation.approve_routing import (
    APPROVE_TARGET_SERVICES_CHANNEL,
    resolve_parser_approve_target,
    validate_parser_approve_context,
)
from parser.marketplace_categories import apply_marketplace_categories_to_item
from parser.moderation.author_notify import try_notify_author_via_pyrogram
from parser.moderation.config import (
    PARSER_BOT_TELEGRAM_ID,
    PARSER_FALLBACK_BOT_TELEGRAM_ID,
    PARSER_FALLBACK_BOT_USERNAME,
    PARSER_FALLBACK_ENABLED,
    PARSER_SERVICES_BOT_TELEGRAM_ID,
    PARSER_SERVICES_BOT_USERNAME,
)
from parser.moderation.description import build_marketplace_description
from parser.moderation.group_message import edit_group_message
from parser.moderation.services_channel_routing import format_services_channels_labels
from parser.moderation.services_publish import publish_services_listing_to_channel
from parser.moderation.urls import listing_miniapp_url
from parser.storage.marketplace import (
    copy_parser_images_to_public,
    create_marketplace_listing,
    get_or_create_bot_user,
)
from parser.storage.parsed_items import (
    resolve_parsed_item_for_moderation,
    set_marketplace_listing_id,
    update_parsed_item_status,
)
from utils.city_digest_notify import enqueue_city_digest_listing

logger = logging.getLogger(__name__)


async def _apply_ai_enrichment(
    callback: CallbackQuery,
    item: dict,
    item_id: int,
    force_ai: bool = False,
) -> tuple[dict, str]:
    listing_item = dict(item)
    ai_summary = ""

    ai_enabled = is_ai_enrich_enabled() or force_ai
    if ai_enabled:
        try:
            await callback.answer("🤖 AI аналізує оголошення…", show_alert=False)
        except TelegramBadRequest:
            pass
        enriched = await enrich_parsed_item_with_ai(item)
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
            await callback.answer("⏳ Обробляємо…", show_alert=False)
        except TelegramBadRequest:
            pass

    return listing_item, ai_summary


async def _approve_services_channel_only(
    callback: CallbackQuery,
    bot: Bot,
    item_id: int,
    item: dict,
    moderator_id: int,
):
    """Послуги з AI-парсера: лише публікація в Telegram-канал, без маркетплейсу."""
    images_raw = item.get("images_json") or "[]"
    try:
        images: list[str] = json.loads(images_raw)
    except Exception:
        images = []

    listing_item, ai_summary = await _apply_ai_enrichment(
        callback, item, item_id, force_ai=True
    )
    listing_item = apply_marketplace_categories_to_item(listing_item)

    item_category = (listing_item.get("category") or "").strip().lower()
    if item_category != "services_work":
        await callback.answer("❌ AI не класифікував як послугу — відхиліть або перевірте текст", show_alert=True)
        return

    images_web = copy_parser_images_to_public(images, prefix=f"pi{item_id}")
    description = build_marketplace_description(listing_item)
    update_parsed_item_status(item_id, "approved", moderated_by=moderator_id)

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"
    location_label = html.escape(str(listing_item.get("location") or listing_item.get("source_city") or ""))
    status_text = (
        f"✅ <b>Підтверджено</b> модератором {mod_mention}\n"
        f"📣 Буде опубліковано в канал послуг (за містом)\n"
        f"📂 {html.escape(get_category_label(listing_item.get('category', 'services_work'), listing_item.get('subcategory')))}\n"
        f"📍 {location_label}"
    )
    if ai_summary:
        status_text += f"\n🤖 {html.escape(ai_summary[:220])}"

    async def _followup():
        published_chats = await publish_services_listing_to_channel(
            bot, listing_item, item_id, description, images_web
        )
        final_status = status_text
        if published_chats:
            final_status += f"\n📢 {html.escape(format_services_channels_labels(published_chats))}"
        await edit_group_message(
            bot,
            group_id,
            msg_id,
            final_status,
            parse_mode="HTML",
        )

    asyncio.create_task(_followup())
    asyncio.create_task(
        try_notify_author_via_pyrogram(
            listing_item,
            item_id,
            use_services_sender=True,
            channel_only=True,
        )
    )
    logger.info("parsed_item %s → канал послуг (підтв. %s)", item_id, moderator_id)


async def _approve_marketplace(
    callback: CallbackQuery,
    bot: Bot,
    item_id: int,
    item: dict,
    moderator_id: int,
):
    images_raw = item.get("images_json") or "[]"
    try:
        images: list[str] = json.loads(images_raw)
    except Exception:
        images = []

    listing_item, ai_summary = await _apply_ai_enrichment(callback, item, item_id)
    listing_item = apply_marketplace_categories_to_item(listing_item)

    item_category = (listing_item.get("category") or "").strip().lower()
    if item_category == "services_work" and PARSER_FALLBACK_ENABLED and (
        PARSER_FALLBACK_BOT_TELEGRAM_ID or PARSER_SERVICES_BOT_TELEGRAM_ID
    ):
        seller_tg_id = PARSER_FALLBACK_BOT_TELEGRAM_ID or PARSER_SERVICES_BOT_TELEGRAM_ID
        seller_username = PARSER_FALLBACK_BOT_USERNAME or PARSER_SERVICES_BOT_USERNAME
        user_id = get_or_create_bot_user(
            seller_tg_id,
            seller_username,
            "TradeGround Seller",
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
            category=listing_item.get("category", "fashion"),
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


async def handle_parser_approve(callback: CallbackQuery, bot: Bot):
    callback_item_id = int(callback.data.split(":")[1])
    moderator_id = callback.from_user.id
    chat_id = callback.message.chat.id

    item = resolve_parsed_item_for_moderation(
        callback_item_id,
        callback.message.message_id,
        callback.message.reply_to_message.message_id
        if callback.message.reply_to_message
        else None,
    )
    if not item:
        await callback.answer(
            "❌ Запис не знайдено в БД. "
            "Можливо, оголошення вже оброблено або видалено після перезапуску парсера.",
            show_alert=True,
        )
        return

    item_id = int(item["id"])

    if item.get("status") == "approved":
        await callback.answer("ℹ️ Оголошення вже підтверджено", show_alert=True)
        return
    if item.get("status") == "rejected":
        await callback.answer("ℹ️ Оголошення вже відхилено", show_alert=True)
        return

    err = validate_parser_approve_context(chat_id, item)
    if err:
        await callback.answer(err, show_alert=True)
        return

    target = resolve_parser_approve_target(chat_id, item)
    logger.info(
        "parsed_item %s approve: chat_id=%s target=%s parser_type=%s",
        item_id,
        chat_id,
        target,
        item.get("parser_type"),
    )

    if target == APPROVE_TARGET_SERVICES_CHANNEL:
        await _approve_services_channel_only(callback, bot, item_id, item, moderator_id)
    else:
        await _approve_marketplace(callback, bot, item_id, item, moderator_id)

    try:
        await callback.answer("✅ Підтверджено", show_alert=False)
    except TelegramBadRequest:
        pass
