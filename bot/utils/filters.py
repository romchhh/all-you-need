from aiogram.filters import Filter
from aiogram.types import Message, CallbackQuery
from aiogram.enums.chat_type import ChatType
from main import bot
from config import administrators
from database_functions.admin_db import get_all_admin_ids


class IsPrivate(Filter):
    async def __call__(self, message: Message) -> bool:
        return message.chat.type == ChatType.PRIVATE


class IsAdmin(Filter):
    async def __call__(self, message: Message) -> bool:
        user_id = message.from_user.id
        if user_id == administrators[0]:
            return True
        admin_ids = get_all_admin_ids()
        return user_id in admin_ids


class IsSuperAdmin(Filter):
    async def __call__(self, message: Message) -> bool:
        user_id = message.from_user.id
        return user_id == administrators[0]
