"""aiogram router для модерації парсованих оголошень."""

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery

from parser.moderation.approve import handle_parser_approve
from parser.moderation.reject import handle_parser_reject

router = Router()


@router.callback_query(F.data.startswith("parser_approve:"))
async def on_parser_approve(callback: CallbackQuery, bot: Bot):
    await handle_parser_approve(callback, bot)


@router.callback_query(F.data.startswith("parser_reject:"))
async def on_parser_reject(callback: CallbackQuery, bot: Bot):
    await handle_parser_reject(callback, bot)
