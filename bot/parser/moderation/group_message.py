"""Оновлення повідомлень у групі модерації."""

import logging
from typing import Optional

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message

logger = logging.getLogger(__name__)


def _message_has_caption(message: Message | None) -> bool:
    if message is None:
        return False
    return bool(message.photo or message.video or message.document or message.animation)


async def edit_group_message(
    bot: Bot,
    group_id: int,
    message_id: int,
    status_text: str,
    parse_mode: Optional[str] = None,
    *,
    message: Message | None = None,
):
    """Редагує повідомлення модерації (текст або caption), прибирає кнопки."""
    base_kwargs = {
        "chat_id": group_id,
        "message_id": message_id,
        "reply_markup": None,
    }

    try:
        await bot.edit_message_reply_markup(**base_kwargs)
    except TelegramBadRequest:
        pass
    except Exception as e:
        logger.debug("edit_message_reply_markup: %s", e)

    use_caption = _message_has_caption(message)
    content = status_text[:1024] if use_caption else status_text[:4096]

    edit_kwargs = dict(base_kwargs)
    if parse_mode:
        edit_kwargs["parse_mode"] = parse_mode

    async def _edit_as_caption() -> None:
        await bot.edit_message_caption(caption=content, **edit_kwargs)

    async def _edit_as_text() -> None:
        await bot.edit_message_text(text=content, **edit_kwargs)

    try:
        if use_caption:
            await _edit_as_caption()
        else:
            await _edit_as_text()
    except TelegramBadRequest as e:
        err = str(e).lower()
        if "message is not modified" in err:
            return
        try:
            if use_caption:
                await _edit_as_text()
            else:
                await _edit_as_caption()
        except TelegramBadRequest as e2:
            if "message is not modified" not in str(e2).lower():
                logger.warning("Не вдалося оновити повідомлення групи: %s", e2)
        except Exception as e2:
            logger.warning("Не вдалося оновити повідомлення групи: %s", e2)
    except Exception as e:
        logger.warning("Не вдалося оновити повідомлення групи: %s", e)
