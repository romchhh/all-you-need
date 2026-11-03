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
    async def __call__(self, event: Message | CallbackQuery) -> bool:
        user = event.from_user
        if user is None:
            return False
        user_id = user.id
        if user_id == administrators[0]:
            return True
        try:
            admin_ids = get_all_admin_ids()
        except Exception as e:
            # Не валимо весь update через мертвий PG cursor — супер-адмін уже пропущений вище
            print(f"IsAdmin get_all_admin_ids failed: {e}")
            return False
        return user_id in admin_ids


class IsSuperAdmin(Filter):
    async def __call__(self, message: Message) -> bool:
        user_id = message.from_user.id
        return user_id == administrators[0]
