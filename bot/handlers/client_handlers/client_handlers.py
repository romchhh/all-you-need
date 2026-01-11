import os
from datetime import datetime
from aiogram import Router, types, F
from aiogram.filters import CommandStart
from dotenv import load_dotenv

from main import bot
from config import bot_username
from database_functions.client_db import check_user, add_user, update_user_activity, get_user_avatar 
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from database_functions.prisma_db import PrismaDB
from utils.download_avatar import download_user_avatar
from utils.translations import t, get_user_lang
from keyboards.client_keyboards import get_catalog_webapp_keyboard, get_language_selection_keyboard
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

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
    
    # Завантажуємо аватарку ТІЛЬКИ для нових користувачів
    avatar_path = None
    
    if not user_exists:
        # Новий користувач - завантажуємо аватарку
        try:
            avatar_path = await download_user_avatar(user_id, username, None)
            if avatar_path:
                print(f"Avatar downloaded for new user {user_id}: {avatar_path}")
            else:
                print(f"No avatar found for new user {user_id}")
        except Exception as e:
            print(f"Error downloading avatar for new user {user_id}: {e}")
        
        # Додаємо нового користувача з аватаркою
        add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)
    else:
        # Існуючий користувач - НЕ завантажуємо аватарку
        # Просто оновлюємо базову інформацію (ім'я, прізвище) без зміни аватара
        print(f"User {user_id} already exists, skipping avatar download")
        
        # Оновлюємо тільки базову інформацію (БЕЗ аватара)
        from database_functions.client_db import cursor, conn
        cursor.execute('''
            UPDATE User 
            SET username = ?, firstName = ?, lastName = ?, updatedAt = ?
            WHERE telegramId = ?
        ''', (
            username,
            user.first_name,
            user.last_name,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            int(user_id)
        ))
        conn.commit()

    # Обробляємо параметри для поділених товарів/профілів
    shared_item = None
    shared_data = None
    db = PrismaDB()
    
    if len(args) > 1:
        param = args[1]
        if param.startswith('listing_'):
            try:
                listing_id = int(param.split('_')[1])
                listing_data = db.get_listing_by_id(listing_id)
                if listing_data:
                    shared_item = {'type': 'listing', 'id': listing_id}
                    shared_data = listing_data
            except (ValueError, IndexError):
                pass
        elif param.startswith('user_'):
            try:
                user_telegram_id = int(param.split('_')[1])
                user_data = db.get_user_by_telegram_id_with_profile(user_telegram_id)
                if user_data:
                    shared_item = {'type': 'user', 'id': str(user_telegram_id)}
                    shared_data = user_data
            except (ValueError, IndexError):
                pass

    welcome_text = t(user_id, 'welcome.greeting')
    
    # Якщо є поділений товар або профіль, додаємо детальну інформацію
    if shared_item and shared_data:
        webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
        
        if shared_item['type'] == 'listing':
            listing = shared_data
            is_free = listing.get('isFree') or (isinstance(listing.get('isFree'), int) and listing.get('isFree') == 1)
            price_text = t(user_id, 'common.free') if is_free else f"{listing.get('price', 'N/A')} €"
            seller_name = f"{listing.get('firstName', '')} {listing.get('lastName', '')}".strip() or listing.get('username', t(user_id, 'common.user'))
            
            welcome_text += (
                f"{t(user_id, 'shared.listing.title', title=listing.get('title', 'Оголошення'))}\n\n"
                f"{t(user_id, 'shared.listing.price', price=price_text)}\n"
                f"{t(user_id, 'shared.listing.location', location=listing.get('location', 'N/A'))}\n"
                f"{t(user_id, 'shared.listing.seller', seller=seller_name)}\n\n"
                f"{t(user_id, 'shared.listing.instruction')}"
            )
            
            webapp_url_with_params = f"{webapp_url}?listing={shared_item['id']}&telegramId={user_id}"
            button_text = t(user_id, 'shared.listing.button')
            
        elif shared_item['type'] == 'user':
            user = shared_data
            user_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get('username', t(user_id, 'common.user'))
            username_text = f"@{user.get('username')}" if user.get('username') else ""
            total_listings = user.get('totalListings', 0) or 0
            active_listings = user.get('activeListings', 0) or 0
            
            welcome_text += (
                f"{t(user_id, 'shared.user.title', name=user_name, username=username_text)}\n\n"
                f"{t(user_id, 'shared.user.listings', total=total_listings)}\n"
                f"{t(user_id, 'shared.user.active', active=active_listings)}\n\n"
                f"{t(user_id, 'shared.user.instruction')}"
            )
            
            webapp_url_with_params = f"{webapp_url}?user={shared_item['id']}&telegramId={user_id}"
            button_text = t(user_id, 'shared.user.button')
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text=button_text,
                web_app=WebAppInfo(url=webapp_url_with_params)
            )]
        ])
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode="HTML")
    else:
        welcome_text += t(user_id, 'welcome.features')
        await message.answer(welcome_text, reply_markup=get_catalog_webapp_keyboard(user_id))
    
    # Показуємо кнопку вибору мови після привітання
    from utils.translations import get_user_lang
    from keyboards.client_keyboards import get_language_selection_keyboard
    user_lang = get_user_lang(user_id)
    await message.answer(
        t(user_id, 'language.select'),
        reply_markup=get_language_selection_keyboard()
    )

    
    
async def on_startup(router):
    create_dbs()
    username = bot_username or (await bot.get_me()).username
    print(f'Bot: @{username} запущений!')

async def on_shutdown(router):
    username = bot_username or (await bot.get_me()).username
    print(f'Bot: @{username} зупинений!')
