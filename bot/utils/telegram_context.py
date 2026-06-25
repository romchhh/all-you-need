"""Telegram update context helpers."""

from aiogram.types import CallbackQuery, Message


def user_id_from_callback(callback: CallbackQuery) -> int:
    """ID користувача, який натиснув inline-кнопку (не bot id з callback.message.from_user)."""
    return callback.from_user.id


def user_id_from_message(message: Message) -> int:
    return message.from_user.id
