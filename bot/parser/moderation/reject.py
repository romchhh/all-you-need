"""Відхилення парсованого оголошення модератором."""

import html
import logging

from aiogram import Bot
from aiogram.types import CallbackQuery

from parser.moderation.approve_routing import moderation_path_for_chat
from parser.moderation.group_message import edit_group_message
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
    mod_path = moderation_path_for_chat(chat_id, item)

    if mod_path:
        path_status = get_mod_path_status(item, mod_path)
        if path_status == "approved":
            label = "маркетплейс" if mod_path == "marketplace" else "Telegram-канал"
            await callback.answer(f"ℹ️ Вже підтверджено для {label}", show_alert=True)
            return
        if path_status == "rejected":
            await callback.answer("ℹ️ Цей напрямок уже відхилено", show_alert=True)
            return
        update_mod_path_status(item_id, mod_path, "rejected", moderated_by=moderator_id)
    else:
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
    path_note = ""
    if mod_path == "marketplace":
        path_note = " (маркетплейс)"
    elif mod_path == "channel":
        path_note = " (Telegram-канал)"
    await edit_group_message(
        bot,
        group_id,
        msg_id,
        f"❌ <b>Відхилено</b>{path_note} модератором {mod_mention}",
        parse_mode="HTML",
        message=callback.message,
    )

    await callback.answer("❌ Оголошення відхилено", show_alert=False)
    logger.info(
        "parsed_item %s відхилено модератором %s (path=%s)",
        item_id,
        moderator_id,
        mod_path or "default",
    )
