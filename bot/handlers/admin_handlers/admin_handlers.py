from aiogram import F, Router, types
from aiogram.types import FSInputFile
from main import bot
from utils.filters import IsAdmin
from aiogram.fsm.context import FSMContext
from keyboards.admin_keyboards import (
    admin_keyboard,
    get_broadcast_stats_keyboard,
    get_export_database_keyboard,
)
from utils.admin_functions import generate_database_export, format_statistics_message
from utils.weekly_marketplace_broadcast import (
    BROADCAST_STATS_PAGE_SIZE,
    format_broadcast_stats_message,
    get_broadcast_stats_total_pages,
)
from datetime import datetime
import os


router = Router()


@router.message(IsAdmin(), F.text.in_(["Адмін панель 💻", "/admin"]))
async def admin_panel(message: types.Message):
    await message.answer(
        "<b>💻 Вітаю в адмін панелі</b>\n\n"
        "Ось ваші доступні опції.\n\n"
        "🔍 Парсинг усіх груп: <code>/parse</code>\n"
        "💡 Останні N постів: <code>/parse10</code>\n"
        "👤 Акаунти парсера: кнопка <b>Парсер акаунти</b>",
        reply_markup=admin_keyboard(),
        parse_mode="HTML",
    )
    
    
@router.message(IsAdmin(), F.text.in_(["Статистика"]))
async def statistic_handler(message: types.Message):
    response_message = format_statistics_message()
    await message.answer(response_message, parse_mode="HTML", reply_markup=get_export_database_keyboard())


async def _send_broadcast_stats(target: types.Message | types.CallbackQuery, page: int = 0) -> None:
    total_pages = get_broadcast_stats_total_pages(BROADCAST_STATS_PAGE_SIZE)
    page = max(0, min(page, total_pages - 1))
    text = format_broadcast_stats_message(page=page)
    keyboard = get_broadcast_stats_keyboard(page, total_pages)

    if isinstance(target, types.CallbackQuery):
        await target.message.edit_text(text, parse_mode="HTML", reply_markup=keyboard)
        await target.answer()
    else:
        await target.answer(text, parse_mode="HTML", reply_markup=keyboard)


@router.message(IsAdmin(), F.text.in_(["Авто-розсилки"]))
async def auto_broadcast_stats_handler(message: types.Message):
    await _send_broadcast_stats(message, page=0)


@router.callback_query(IsAdmin(), F.data.startswith("broadcast_stats:"))
async def auto_broadcast_stats_callback(callback: types.CallbackQuery):
    try:
        page = int(callback.data.split(":", 1)[1])
    except (IndexError, ValueError):
        page = 0
    await _send_broadcast_stats(callback, page=page)


@router.callback_query(IsAdmin(), F.data == "export_database")
async def export_database(callback: types.CallbackQuery):
    response_message = (
            "<b>ВИГРУЗКА БАЗИ ДАНИХ</b>\n\n"
            f"Зачекайте поки ми сформуємо ексель файл з базою даних"
        )
    await callback.message.answer(response_message, parse_mode="HTML")
    
    filename, users_count, links_count = generate_database_export()
    
    file = FSInputFile(filename)
    await bot.send_document(
        callback.message.chat.id, 
        document=file, 
        caption=f"<b>📊 База даних експортована</b>\n\n"
                f"👥 <b>Користувачів:</b> {users_count}\n"
                f"🔗 <b>Посилань:</b> {links_count}\n"
                f"📅 <b>Дата:</b> {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        parse_mode="HTML"
    )
    
    if os.path.exists(filename):
        os.remove(filename)