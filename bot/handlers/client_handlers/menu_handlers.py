import os
from aiogram import Router, types, F
from aiogram.filters import Command
from dotenv import load_dotenv

from utils.translations import t, get_user_lang
from keyboards.client_keyboards import get_main_menu_keyboard, get_language_selection_keyboard
from database_functions.client_db import check_user

load_dotenv()

router = Router()


@router.message(Command("menu"))
async def menu_command(message: types.Message):
    """Команда для відображення головного меню"""
    user_id = message.from_user.id
    
    # Перевіряємо чи користувач зареєстрований
    if not check_user(user_id):
        await message.answer(
            "Будь ласка, спочатку зареєструйтесь: /start"
        )
        return
    
    await message.answer(
        f"{t(user_id, 'welcome.greeting')}{t(user_id, 'welcome.features')}",
        reply_markup=get_main_menu_keyboard(user_id)
    )


@router.message(Command("language"))
async def language_command(message: types.Message):
    """Команда для зміни мови"""
    user_id = message.from_user.id
    
    await message.answer(
        t(user_id, 'language.select'),
        reply_markup=get_language_selection_keyboard()
    )


# Обробники для текстових кнопок меню
@router.message(F.text.in_([
    "🛍️ Перейти в каталог", "🛍️ Перейти в каталог",  # UK
    "🛍️ Перейти в каталог", "🛍️ Перейти в каталог"   # RU
]))
async def catalog_button_handler(message: types.Message):
    """Обробник кнопки 'Перейти в каталог'"""
    # WebApp відкриється автоматично при натисканні на кнопку
    pass


@router.message(F.text.in_([
    "📦 Мої оголошення",  # UK
    "📦 Мои объявления"   # RU
]))
async def my_listings_button_handler(message: types.Message):
    """Обробник кнопки 'Мої оголошення'"""
    # WebApp відкриється автоматично при натисканні на кнопку
    pass


@router.message(F.text.in_([
    "➕ Додати оголошення",  # UK
    "➕ Добавить объявление"  # RU
]))
async def add_listing_button_handler(message: types.Message):
    """Обробник кнопки 'Додати оголошення'"""
    # WebApp відкриється автоматично при натисканні на кнопку
    pass


@router.message(F.text.in_([
    "👤 Мій профіль",  # UK
    "👤 Мой профиль"   # RU
]))
async def my_profile_button_handler(message: types.Message):
    """Обробник кнопки 'Мій профіль'"""
    # WebApp відкриється автоматично при натисканні на кнопку
    pass
