"""Оновлення повідомлень у групі модерації."""

import logging
from typing import Optional

from aiogram import Bot

logger = logging.getLogger(__name__)


async def edit_group_message(
    bot: Bot,
    group_id: int,
    message_id: int,
    status_text: str,
    parse_mode: Optional[str] = None,
):
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
        logger.warning("Не вдалося оновити повідомлення групи: %s", e)
