import os
from aiogram import Router, types, F
from aiogram.filters import CommandStart
from dotenv import load_dotenv

from main import bot
from database_functions.client_db import check_user, add_user, update_user_activity, get_user_avatar 
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from utils.download_avatar import download_user_avatar
from keyboards.client_keyboards import get_catalog_webapp_keyboard

load_dotenv()

router = Router()


@router.message(CommandStart())
async def start_command(message: types.Message):
    user = message.from_user
    user_id = user.id
    username = user.username
    args = message.text.split()

    user_exists = check_user(user_id)

    ref_link = None
    if len(args) > 1 and args[1].startswith('linktowatch_'):
        try:
            ref_link = int(args[1].split('_')[1])
            if not user_exists:
                increment_link_count(ref_link)
        except (ValueError, IndexError) as e:
            pass
    
    # Завантажуємо аватарку тільки якщо користувач новий або аватарки немає в БД
    avatar_path = None
    if not user_exists:
        # Новий користувач - завантажуємо аватарку
        try:
            avatar_path = await download_user_avatar(user_id, username)
            if avatar_path:
                print(f"Avatar downloaded for new user {user_id}: {avatar_path}")
            else:
                print(f"No avatar found for user {user_id}")
        except Exception as e:
            print(f"Error downloading avatar for user {user_id}: {e}")
    else:
        # Існуючий користувач - перевіряємо чи є аватарка
        existing_avatar = get_user_avatar(user_id)
        if not existing_avatar:
            # Аватарки немає - завантажуємо
            try:
                avatar_path = await download_user_avatar(user_id, username)
                if avatar_path:
                    print(f"Avatar downloaded for existing user {user_id}: {avatar_path}")
                else:
                    print(f"No avatar found for user {user_id}")
            except Exception as e:
                print(f"Error downloading avatar for user {user_id}: {e}")
        else:
            print(f"User {user_id} already has avatar: {existing_avatar}")
    
    # Додаємо або оновлюємо користувача з аватаркою
    if not user_exists:
        add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)
    else:
        # Оновлюємо користувача (включаючи аватарку якщо вона завантажилася)
        add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)

    # Відправляємо привітальне повідомлення з кнопкою
    welcome_text = (
        "👋 Вітаємо в AYN Marketplace!\n\n"
        "🛍️ Оберіть товари з каталогу\n"
        "📱 Створюйте свої оголошення\n"
        "💬 Спілкуйтесь з продавцями\n\n"
        "Натисніть кнопку нижче, щоб відкрити каталог:"
    )
    
    await message.answer(welcome_text, reply_markup=get_catalog_webapp_keyboard(user_id))

    
    
async def on_startup(router):
    me = await bot.get_me()
    create_dbs()
    print(f'Bot: @{me.username} запущений!')

async def on_shutdown(router):
    me = await bot.get_me()
    print(f'Bot: @{me.username} зупинений!')
