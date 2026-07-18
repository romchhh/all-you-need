"""Відхилення парсованого оголошення модератором."""

import html
import logging

from aiogram import Bot
from aiogram.types import CallbackQuery

from parser.moderation.approve_routing import is_services_moderation_chat
from parser.moderation.formatting import edit_group_message
from parser.storage.parsed_items import (
    resolve_parsed_item_for_moderation,
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

    update_parsed_item_status(item_id, "rejected", moderated_by=moderator_id)

    group_id = callback.message.chat.id
    msg_id = callback.message.message_id
    if callback.from_user.username:
        mod_mention = "@" + html.escape(callback.from_user.username)
    else:
        mod_mention = f"<code>{moderator_id}</code>"

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
