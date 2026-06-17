"""Відхилення парсованого оголошення модератором."""

import html
import logging

from aiogram import Bot
from aiogram.types import CallbackQuery

from parser.moderation.group_message import edit_group_message
from parser.storage.parsed_items import get_parsed_item_by_id, update_parsed_item_status

logger = logging.getLogger(__name__)


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
    await edit_group_message(
        bot,
        group_id,
        msg_id,
        f"❌ <b>Відхилено</b> модератором {mod_mention}",
        parse_mode="HTML",
    )

    await callback.answer("❌ Оголошення відхилено", show_alert=False)
    logger.info("parsed_item %s відхилено модератором %s", item_id, moderator_id)
