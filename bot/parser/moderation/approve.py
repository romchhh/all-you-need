"""Підтвердження парсованого оголошення модератором."""

import asyncio
import html
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from parser.category_keywords import get_category_label
from parser.moderation.approve_routing import (
    APPROVE_TARGET_SERVICES_BOTH,
    force_services_channel_ids_for_mod_chat,
    resolve_parser_approve_target,
    validate_parser_approve_context,
)
from parser.marketplace_categories import (
    apply_marketplace_categories_to_item,
    force_services_marketplace_categories,
)
from parser.core.parse_pipeline import finalize_listing_item_for_publish, ensure_parsed_item_ai_screened
from parser.moderation.author_notify import schedule_author_notify
from parser.core.location import resolve_parsed_location
from parser.moderation.formatting import (
    build_marketplace_description,
    edit_group_message,
    ensure_marketplace_description_has_source,
    format_listing_open_links_html,
    preserve_parsed_source_fields,
)
from parser.moderation.marketplace_publish import (
    MarketplacePublishError,
    publish_parsed_item_marketplace,
)
from parser.moderation.services_publish import (
    format_services_channels_labels,
    publish_services_listing_to_channel,
)
from parser.storage.marketplace import copy_parser_images_to_public
from utils.location_normalization import normalize_city_name
from parser.storage.parsed_items import (
    get_mod_path_status,
    parsed_item_image_refs,
    resolve_parsed_item_for_moderation,
    update_mod_path_status,
)
from utils.city_digest_notify import enqueue_city_digest_listing

logger = logging.getLogger(__name__)


async def _ack_processing(callback: CallbackQuery) -> None:
    """Швидкий ack модератору перед AI enrich."""
    try:
        await callback.answer("⏳ Обробляємо (AI)…", show_alert=False)
    except TelegramBadRequest:
        pass


async def _prepare_listing_for_publish(item: dict, source: dict) -> dict:
    """Завжди AI enrich + категорії + локація + фінальний title/description."""
    working = await ensure_parsed_item_ai_screened(dict(item))
    listing_item = preserve_parsed_source_fields(working, source)
    force_service = (
        (listing_item.get("category") or "").strip().lower() == "services_work"
        or (source.get("parser_type") or "") == "services_channel"
    )
    listing_item = finalize_listing_item_for_publish(
        listing_item, force_service=force_service
    )
    listing_item = _force_listing_location(listing_item)
    if force_service:
        listing_item = force_services_marketplace_categories(listing_item)
        listing_item["condition"] = "new"
    else:
        listing_item = apply_marketplace_categories_to_item(listing_item)
    return listing_item


async def _prepare_listing_for_publish_or_alert(
    callback: CallbackQuery, item: dict, source: dict
) -> dict | None:
    """AI enrich + finalize; при помилці AI — alert модератору."""
    try:
        return await _prepare_listing_for_publish(item, source)
    except RuntimeError as e:
        logger.error("parsed_item %s: AI publish failed: %s", source.get("id"), e)
        try:
            await callback.answer(f"❌ {e}", show_alert=True)
        except TelegramBadRequest:
            pass
        return None
    except Exception as e:
        logger.error(
            "parsed_item %s: prepare for publish failed: %s",
            source.get("id"),
            e,
            exc_info=True,
        )
        try:
            await callback.answer("❌ Помилка AI / підготовки оголошення", show_alert=True)
        except TelegramBadRequest:
            pass
        return None


def _force_listing_location(item: dict) -> dict:
    """Локальний канал → місто каналу; Germany → лише відомі міста."""
    out = dict(item)
    out["location"] = resolve_parsed_location(
        channel_city=str(item.get("source_city") or ""),
        source_channel=str(item.get("source_channel") or "") or None,
        suggested=str(item.get("location") or ""),
        text=(
            f"{item.get('title') or ''}\n"
            f"{item.get('description') or ''}\n"
            f"{item.get('raw_text') or ''}"
        ),
    )
    return out


async def _approve_services_both(
    callback: CallbackQuery,
    bot: Bot,
    item_id: int,
    item: dict,
    moderator_id: int,
):
    """Послуги: маркетплейс (якщо ще немає) + відповідний Telegram-канал."""
    existing_listing_id = item.get("marketplace_listing_id")
    try:
        existing_listing_id = int(existing_listing_id) if existing_listing_id else 0
    except (TypeError, ValueError):
        existing_listing_id = 0

    await _ack_processing(callback)
    listing_item = await _prepare_listing_for_publish_or_alert(callback, dict(item), item)
    if not listing_item:
        return

    item_category = (listing_item.get("category") or "").strip().lower()
    if item_category != "services_work":
        listing_item["category"] = "services_work"
        listing_item = force_services_marketplace_categories(listing_item)
        listing_item["condition"] = "new"

    images = parsed_item_image_refs(item)
    images_web = copy_parser_images_to_public(images, prefix=f"pi{item_id}")
    description = ensure_marketplace_description_has_source(
        build_marketplace_description(listing_item),
        listing_item,
    )

    listing_id = existing_listing_id
    if not listing_id:
        try:
            listing_id, description, images_web = publish_parsed_item_marketplace(
                item_id,
                listing_item,
                item,
                moderated_by=moderator_id,
            )
        except MarketplacePublishError as e:
            if str(e) == "duplicate":
                await callback.answer(
                    "❌ Таке оголошення вже є на маркетплейсі (дублікат)",
                    show_alert=True,
                )
                return
            await callback.answer("❌ Помилка при додаванні в маркетплейс", show_alert=True)
            return

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    open_links = format_listing_open_links_html(listing_id)
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"
    loc_raw = str(listing_item.get("location") or listing_item.get("source_city") or "")
    location_label = html.escape(normalize_city_name(loc_raw) or loc_raw)
    force_channels = force_services_channel_ids_for_mod_chat(group_id, listing_item)
    already_on_mp = bool(existing_listing_id)
    status_text = (
        f"✅ <b>Підтверджено</b> модератором {mod_mention}\n"
        f"📌 Listing #{listing_id}\n"
        f"{open_links}\n"
        f"📣 Публікуємо в Telegram-канал послуг"
        f"{' (маркетплейс уже був автопідтверджений)' if already_on_mp else ''}\n"
        f"📂 {html.escape(get_category_label(listing_item.get('category', 'services_work'), listing_item.get('subcategory')))}\n"
        f"📍 {location_label}"
    )

    async def _followup():
        if not existing_listing_id:
            try:
                enqueue_city_digest_listing(listing_id)
            except Exception as notify_err:
                logger.warning(
                    "Не вдалося поставити Listing %s в city-digest чергу: %s",
                    listing_id,
                    notify_err,
                )
        published_chats = await publish_services_listing_to_channel(
            bot,
            listing_item,
            item_id,
            description,
            images_web,
            marketplace_listing_id=listing_id,
            force_channel_ids=force_channels,
        )
        if published_chats:
            update_mod_path_status(
                item_id, "channel", "approved", moderated_by=moderator_id
            )
        final_status = status_text
        if published_chats:
            final_status += (
                f"\n📢 {html.escape(format_services_channels_labels(published_chats))}"
            )
        else:
            final_status += "\n⚠️ Не вдалося опублікувати в канал"
        await edit_group_message(
            bot,
            group_id,
            msg_id,
            final_status,
            parse_mode="HTML",
            message=callback.message,
        )

    asyncio.create_task(_followup())
    if not existing_listing_id:
        schedule_author_notify(
            listing_item,
            listing_id,
            use_services_sender=True,
            channel_only=False,
        )
    elif int(item.get("auto_approved") or 0) == 1:
        schedule_author_notify(
            listing_item,
            listing_id,
            use_services_sender=True,
            channel_only=True,
        )
    logger.info(
        "parsed_item %s → Listing %s + канал послуг (підтв. %s, mp_existed=%s)",
        item_id,
        listing_id,
        moderator_id,
        already_on_mp,
    )


async def _approve_marketplace(
    callback: CallbackQuery,
    bot: Bot,
    item_id: int,
    item: dict,
    moderator_id: int,
):
    await _ack_processing(callback)
    listing_item = await _prepare_listing_for_publish_or_alert(callback, dict(item), item)
    if not listing_item:
        return

    item_category = (listing_item.get("category") or "").strip().lower()
    if item_category == "services_work" or (item.get("parser_type") or "") == "services_channel":
        listing_item = force_services_marketplace_categories(listing_item)
        listing_item["condition"] = "new"
        item_category = "services_work"

    try:
        listing_id, _, _ = publish_parsed_item_marketplace(
            item_id,
            listing_item,
            item,
            moderated_by=moderator_id,
        )
    except MarketplacePublishError as e:
        if str(e) == "duplicate":
            await callback.answer(
                "❌ Таке оголошення вже є на маркетплейсі (дублікат)",
                show_alert=True,
            )
            return
        if str(e) == "already_listed":
            await callback.answer("ℹ️ Вже на маркетплейсі", show_alert=True)
            return
        await callback.answer("❌ Помилка при додаванні в маркетплейс", show_alert=True)
        return

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    open_links = format_listing_open_links_html(listing_id)
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"
    status_text = (
        f"✅ <b>Підтверджено</b> модератором {mod_mention}\n"
        f"📌 Listing #{listing_id}\n"
        f"{open_links}\n"
        f"📂 {html.escape(get_category_label(listing_item.get('category', 'other'), listing_item.get('subcategory')))}\n"
        f"📍 {html.escape(str(listing_item.get('location') or ''))}"
    )

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
            message=callback.message,
        )

    asyncio.create_task(_approve_followup())
    schedule_author_notify(
        listing_item,
        listing_id,
        use_services_sender=(item_category == "services_work"),
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

    if item.get("status") == "rejected":
        await callback.answer("ℹ️ Оголошення вже відхилено", show_alert=True)
        return
    if item.get("status") == "approved":
        await callback.answer("ℹ️ Оголошення вже підтверджено", show_alert=True)
        return

    err = validate_parser_approve_context(chat_id, item)
    if err:
        await callback.answer(err, show_alert=True)
        return

    target = resolve_parser_approve_target(chat_id, item)
    logger.info(
        "parsed_item %s approve: chat_id=%s target=%s parser_type=%s mp=%s",
        item_id,
        chat_id,
        target,
        item.get("parser_type"),
        item.get("marketplace_listing_id"),
    )

    if target == APPROVE_TARGET_SERVICES_BOTH:
        if get_mod_path_status(item, "channel") == "approved":
            await callback.answer("ℹ️ Канал уже опубліковано", show_alert=True)
            return
        if get_mod_path_status(item, "channel") == "rejected":
            await callback.answer(
                "ℹ️ Канал відхилено (маркетплейс лишається)",
                show_alert=True,
            )
            return
        await _approve_services_both(callback, bot, item_id, item, moderator_id)
    else:
        if get_mod_path_status(item, "marketplace") == "approved" or item.get(
            "marketplace_listing_id"
        ):
            await callback.answer("ℹ️ Вже на маркетплейсі", show_alert=True)
            return
        await _approve_marketplace(callback, bot, item_id, item, moderator_id)

    try:
        await callback.answer("✅ Підтверджено", show_alert=False)
    except TelegramBadRequest:
        pass
