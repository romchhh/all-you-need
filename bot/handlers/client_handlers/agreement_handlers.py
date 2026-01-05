import os
from aiogram import Router, types, F
from aiogram.filters import CommandStart
from dotenv import load_dotenv

from main import bot
from config import bot_username
from database_functions.client_db import check_user, add_user, get_user_agreement_status, set_user_agreement_status, get_user_phone, set_user_phone, get_user_avatar
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from database_functions.prisma_db import PrismaDB
from utils.download_avatar import download_user_avatar
from utils.translations import t
from keyboards.client_keyboards import get_agreement_keyboard, get_phone_share_keyboard, get_catalog_webapp_keyboard

load_dotenv()

router = Router()


@router.message(CommandStart())
async def start_command(message: types.Message):
    user = message.from_user
    user_id = user.id
    username = user.username
    args = message.text.split()

    ref_link = None
    if len(args) > 1 and args[1].startswith('linktowatch_'):
        try:
            ref_link = int(args[1].split('_')[1])
        except (ValueError, IndexError) as e:
            pass

    user_exists = check_user(user_id)
    
    # Створюємо користувача якщо його немає (навіть якщо він не погодився з офертою)
    if not user_exists:
        # Завантажуємо аватарку для нового користувача
        avatar_path = None
        try:
            avatar_path = await download_user_avatar(user_id, username)
            if avatar_path:
                print(f"Avatar downloaded for new user {user_id}: {avatar_path}")
        except Exception as e:
            print(f"Error downloading avatar for user {user_id}: {e}")
        
        # Створюємо користувача в БД
        add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)
        print(f"User {user_id} created in database")
        user_exists = True
    
    has_agreed = get_user_agreement_status(user_id)

    # Якщо користувач не погодився з офертою, показуємо її
    if not has_agreed:
        offer_text = (
            f"{t(user_id, 'agreement.title')}\n\n"
            f"{t(user_id, 'agreement.welcome')}\n\n"
            f"{t(user_id, 'agreement.description')}\n\n"
            f"{t(user_id, 'agreement.instructions')}"
        )
        
        await message.answer(
            offer_text,
            reply_markup=get_agreement_keyboard(user_id),
            parse_mode="HTML"
        )
        return

    # Якщо користувач не надав номер телефону
    user_phone = get_user_phone(user_id)
    if not user_phone:
        await message.answer(
            t(user_id, 'phone.request'),
            reply_markup=get_phone_share_keyboard(user_id)
        )
        return

    # Оновлюємо дані користувача (ім'я може змінитися)
    existing_avatar = get_user_avatar(user_id)
    avatar_path = None
    if not existing_avatar:
        try:
            avatar_path = await download_user_avatar(user_id, username)
            if avatar_path:
                print(f"Avatar downloaded for user {user_id}: {avatar_path}")
        except Exception as e:
            print(f"Error downloading avatar for user {user_id}: {e}")
    
    # Оновлюємо дані користувача
    add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)
    
    # Обробляємо реферальні посилання
    if ref_link and not user_exists:
        increment_link_count(ref_link)

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

    welcome_text = "👋 Вітаємо в AYN Marketplace!\n\n"
    
    # Якщо є поділений товар або профіль, додаємо детальну інформацію
    if shared_item and shared_data:
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
        webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
        
        if shared_item['type'] == 'listing':
            listing = shared_data
            import json
            is_free = listing.get('isFree') or (isinstance(listing.get('isFree'), int) and listing.get('isFree') == 1)
            price_text = "Безкоштовно" if is_free else f"{listing.get('price', 'N/A')} €"
            seller_name = f"{listing.get('firstName', '')} {listing.get('lastName', '')}".strip() or listing.get('username', 'Користувач')
            
            welcome_text += (
                f"📦 <b>{listing.get('title', 'Оголошення')}</b>\n\n"
                f"💰 Ціна: {price_text}\n"
                f"📍 Місце: {listing.get('location', 'N/A')}\n"
                f"👤 Продавець: {seller_name}\n\n"
                f"Натисніть кнопку нижче, щоб переглянути деталі:"
            )
            
            webapp_url_with_params = f"{webapp_url}?listing={shared_item['id']}&telegramId={user_id}"
            button_text = "📦 Переглянути оголошення"
            
        elif shared_item['type'] == 'user':
            user = shared_data
            user_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get('username', 'Користувач')
            username_text = f"@{user.get('username')}" if user.get('username') else ""
            total_listings = user.get('totalListings', 0) or 0
            active_listings = user.get('activeListings', 0) or 0
            
            welcome_text += (
                f"👤 <b>{user_name}</b> {username_text}\n\n"
                f"📊 Оголошень: {total_listings}\n"
                f"✅ Активних: {active_listings}\n\n"
                f"Натисніть кнопку нижче, щоб переглянути профіль:"
            )
            
            webapp_url_with_params = f"{webapp_url}?user={shared_item['id']}&telegramId={user_id}"
            button_text = "👤 Переглянути профіль"
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text=button_text,
                web_app=WebAppInfo(url=webapp_url_with_params)
            )]
        ])
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode="HTML")
    else:
        welcome_text += (
            "🛍️ Оберіть товари з каталогу\n"
            "📱 Створюйте свої оголошення\n"
            "💬 Спілкуйтесь з продавцями\n\n"
            "Натисніть кнопку нижче, щоб відкрити каталог:"
        )
        await message.answer(welcome_text, reply_markup=get_catalog_webapp_keyboard(user_id))


@router.callback_query(F.data.startswith("agree_"))
async def agree_agreement(callback: types.CallbackQuery):
    try:
        user_id = int(callback.data.split("_")[1])
        
        # Перевіряємо чи це той самий користувач
        if callback.from_user.id != user_id:
            await callback.answer(t(user_id, 'agreement.error'), show_alert=True)
            return
        
        # Перевіряємо чи користувач існує в БД
        user_exists = check_user(user_id)
        if not user_exists:
            # Створюємо користувача якщо його немає
            user = callback.from_user
            avatar_path = None
            try:
                avatar_path = await download_user_avatar(user_id, user.username)
            except Exception as e:
                print(f"Error downloading avatar: {e}")
            
            add_user(user_id, user.username, user.first_name, user.last_name, user.language_code, None, avatar_path)
            print(f"User {user_id} created after agreement")
        
        # Встановлюємо згоду з офертою
        set_user_agreement_status(user_id, True)
        print(f"User {user_id} agreed to terms")
        
        # Видаляємо повідомлення з офертою
        await callback.message.delete()
        
        # Показуємо запит на номер телефону
        await callback.message.answer(
            f"{t(user_id, 'agreement.agreed')}\n\n{t(user_id, 'phone.request')}",
            reply_markup=get_phone_share_keyboard(user_id)
        )
        
        await callback.answer()
    except Exception as e:
        print(f"Error in agree_agreement: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer("Помилка", show_alert=True)


@router.callback_query(F.data == "decline_agreement")
async def decline_agreement(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    await callback.message.edit_text(
        t(user_id, 'agreement.declined')
    )
    await callback.answer()


@router.callback_query(F.data.startswith("set_lang_"))
async def handle_language_selection(callback: types.CallbackQuery):
    """Обробка вибору мови"""
    user_id = callback.from_user.id
    lang = callback.data.split("_")[-1]  # 'uk' або 'ru'
    
    if lang in ['uk', 'ru']:
        set_language(user_id, lang)
        await callback.answer(f"✅ Мова змінена на {'Українську' if lang == 'uk' else 'Русский'}", show_alert=False)
        
        # Оновлюємо повідомлення з новою мовою
        await callback.message.edit_text(
            f"🌐 {t(user_id, 'language.changed')}\n\n"
            f"{t(user_id, 'welcome.greeting')}{t(user_id, 'welcome.features')}",
            reply_markup=get_catalog_webapp_keyboard(user_id, lang)
        )
    else:
        await callback.answer("❌ Помилка вибору мови", show_alert=True)


@router.message(F.contact)
async def handle_contact(message: types.Message):
    if message.contact and message.contact.user_id == message.from_user.id:
        phone = message.contact.phone_number
        user_id = message.from_user.id
        
        # Перевіряємо чи користувач існує
        user_exists = check_user(user_id)
        if not user_exists:
            # Створюємо користувача якщо його немає
            user = message.from_user
            avatar_path = None
            try:
                avatar_path = await download_user_avatar(user_id, user.username)
            except Exception as e:
                print(f"Error downloading avatar: {e}")
            
            add_user(user_id, user.username, user.first_name, user.last_name, user.language_code, None, avatar_path)
            print(f"User {user_id} created when sharing phone")
        
        # Зберігаємо номер телефону
        set_user_phone(user_id, phone)
        print(f"Phone {phone} saved for user {user_id}")
        
        # Видаляємо клавіатуру
        await message.answer(
            t(user_id, 'phone.saved'),
            reply_markup=types.ReplyKeyboardRemove()
        )
        
        # Показуємо кнопку відкриття каталогу
        await message.answer(
            f"{t(user_id, 'welcome.greeting')}{t(user_id, 'welcome.features')}",
            reply_markup=get_catalog_webapp_keyboard(user_id)
        )
    else:
        await message.answer(t(user_id, 'phone.invalid'))


async def on_startup(router):
    create_dbs()
    username = bot_username or (await bot.get_me()).username
    print(f'Bot: @{username} запущений!')

async def on_shutdown(router):
    username = bot_username or (await bot.get_me()).username
    print(f'Bot: @{username} зупинений!')

