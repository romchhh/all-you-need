"""Відхилення парсованого оголошення модератором."""

import html
import logging

from aiogram import Bot
from aiogram.types import CallbackQuery

from parser.moderation.approve_routing import is_services_moderation_chat
from parser.moderation.formatting import edit_group_message
from parser.storage.parsed_items import (
    get_mod_path_status,
    resolve_parsed_item_for_moderation,
    update_mod_path_status,
    update_parsed_item_status,
)

logger = logging.getLogger(__name__)


async def handle_parser_reject(callback: CallbackQuery, bot: Bot):
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

    if item.get("status") in ("approved", "rejected"):
        await callback.answer(f"ℹ️ Оголошення вже {item['status']}", show_alert=True)
        return

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"

    # Автопідтверджений маркетплейс: ❌ лише скасовує публікацію в канал
    if item.get("marketplace_listing_id") and int(item.get("auto_approved") or 0) == 1:
        if get_mod_path_status(item, "channel") == "rejected":
            await callback.answer("ℹ️ Канал уже відхилено", show_alert=True)
            return
        update_mod_path_status(
            item_id, "channel", "rejected", moderated_by=moderator_id
        )
        await edit_group_message(
            bot,
            group_id,
            msg_id,
            (
                f"❌ <b>Канал не публікуємо</b> (модератор {mod_mention})\n"
                "Маркетплейс лишається — оголошення вже було автопідтверджене."
            ),
            parse_mode="HTML",
            message=callback.message,
        )
        await callback.answer("❌ Канал відхилено, маркетплейс лишається", show_alert=False)
        logger.info(
            "parsed_item %s: канал відхилено після auto-approve (мод. %s)",
            item_id,
            moderator_id,
        )
        return

    update_parsed_item_status(item_id, "rejected", moderated_by=moderator_id)

    stream = " (послуги)" if is_services_moderation_chat(chat_id) else " (товари)"
    await edit_group_message(
        bot,
        group_id,
        msg_id,
        f"❌ <b>Відхилено</b>{stream} модератором {mod_mention}",
        parse_mode="HTML",
        message=callback.message,
    )

    await callback.answer("❌ Оголошення відхилено", show_alert=False)
    logger.info("parsed_item %s відхилено модератором %s", item_id, moderator_id)
