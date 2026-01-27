import os
from aiogram import Router, types, F
from aiogram.filters import CommandStart
from dotenv import load_dotenv

from main import bot
from config import bot_username
from database_functions.client_db import check_user, add_user, get_user_agreement_status, set_user_agreement_status, get_user_phone, set_user_phone, get_user_avatar, update_user_activity
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from database_functions.prisma_db import PrismaDB
from database_functions.referral_db import add_referral, create_referral_table
from utils.download_avatar import download_user_avatar
from utils.translations import t, set_language as set_user_language, get_user_lang, get_welcome_message
from keyboards.client_keyboards import get_agreement_keyboard, get_phone_share_keyboard, get_catalog_webapp_keyboard, get_main_menu_keyboard, get_language_selection_keyboard
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, FSInputFile
import aiohttp


load_dotenv()

router = Router()

# Шлях до фото привітання
HELLO_PHOTO_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'Content', 'hello.jpg')


@router.message(CommandStart())
async def start_command(message: types.Message):
    user = message.from_user
    user_id = user.id
    username = user.username
    args = message.text.split()

    ref_link = None
    referral_id = None
    if len(args) > 1:
        if args[1].startswith('linktowatch_'):
            try:
                ref_link = int(args[1].split('_')[1])
            except (ValueError, IndexError) as e:
                pass
        elif args[1].startswith('ref_'):
            try:
                referral_id = int(args[1].split('_')[1])
            except (ValueError, IndexError) as e:
                pass

    user_exists = check_user(user_id)
    
    # Створюємо користува   челя якщо його немає
    if not user_exists:
        avatar_path = None
        try:
            avatar_path = await download_user_avatar(user_id, username)
            if avatar_path:
                print(f"Avatar downloaded for new user {user_id}: {avatar_path}")
        except Exception as e:
            print(f"Error downloading avatar for user {user_id}: {e}")
        
        # Створюємо користувача в БД
        add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)
        user_exists = True
        
        # Зберігаємо реферальний зв'язок якщо є
        if referral_id:
            create_referral_table()
            if add_referral(referral_id, user_id):
                print(f"Referral link saved: {referral_id} -> {user_id}")
                # Відправляємо повідомлення запрошувачу
                try:
                    referrer_lang = get_user_lang(referral_id)
                    new_user_name = user.first_name or user.username or "користувач"
                    notification_text = (
                        f"🎉 {t(referral_id, 'referral.new_user_registered', name=new_user_name)}\n\n"
                        f"💰 {t(referral_id, 'referral.reward_info')}"
                    )
                    await bot.send_message(referral_id, notification_text, parse_mode="HTML")
                except Exception as e:
                    print(f"Error sending referral notification: {e}")
    
    update_user_activity(str(user_id))
    
    # Перевіряємо чи користувач вже погодився з офертою
    has_agreed = get_user_agreement_status(user_id)
    
    # Крок 1: Привітання з коротким описом апки (тільки для нових користувачів)
    # Визначаємо мову з інтерфейсу Telegram (за замовчуванням українська)
    telegram_lang = user.language_code or 'uk'
    
    # Крок 2: Вибір мови (якщо оферта не погоджена - значить користувач новий)
    if not has_agreed:
        # Для нових користувачів показуємо привітання з HTML форматуванням та фото
        welcome_text = get_welcome_message(telegram_lang)
        try:
            photo_file = FSInputFile(HELLO_PHOTO_PATH)
            await message.answer_photo(photo_file, caption=welcome_text, parse_mode="HTML")
        except Exception as e:
            print(f"Error sending hello photo: {e}")
            await message.answer(welcome_text, parse_mode="HTML")
        
        # Показуємо вибір мови
        await message.answer(
            "🌐 <b>Оберіть мову інтерфейсу / Выберите язык интерфейса:</b>",
            reply_markup=get_language_selection_keyboard(),
            parse_mode="HTML"
        )
        return
    
    # Якщо оферта вже погоджена, використовуємо мову користувача
    user_lang = get_user_lang(user_id)
    
    # Крок 3: Оферта (якщо не погоджено)

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

    user_phone = get_user_phone(user_id)
    if not user_phone:
        await message.answer(
            t(user_id, 'phone.request'),
            reply_markup=get_phone_share_keyboard(user_id),
            parse_mode="HTML"
        )
        return

    existing_avatar = get_user_avatar(user_id)
    avatar_path = None
    if not existing_avatar:
        try:
            avatar_path = await download_user_avatar(user_id, username)
            if avatar_path:
                print(f"Avatar downloaded for user {user_id}: {avatar_path}")
        except Exception as e:
            print(f"Error downloading avatar for user {user_id}: {e}")
    
    add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link, avatar_path)
    
    update_user_activity(str(user_id))
    
    if ref_link and not user_exists:
        increment_link_count(ref_link)

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

    # Для існуючих користувачів показуємо привітання тільки якщо немає shared_item
    if not (shared_item and shared_data):
        # greeting вже містить весь текст з HTML тегами
        welcome_text = t(user_id, 'welcome.greeting')
        try:
            photo_file = FSInputFile(HELLO_PHOTO_PATH)
            await message.answer_photo(photo_file, caption=welcome_text, reply_markup=get_main_menu_keyboard(user_id), parse_mode="HTML")
        except Exception as e:
            print(f"Error sending hello photo: {e}")
            await message.answer(welcome_text, reply_markup=get_main_menu_keyboard(user_id), parse_mode="HTML")
        return
    
    # Якщо є shared_item, показуємо інформацію про нього
    if shared_item and shared_data:
        webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
        
        if shared_item['type'] == 'listing':
            listing = shared_data
            import json
            
            # Отримуємо мову користувача для правильного URL
            user_lang = get_user_lang(user_id)
            
            # Обробка ціни
            is_free = listing.get('isFree') or (isinstance(listing.get('isFree'), int) and listing.get('isFree') == 1)
            price_value = listing.get('price', 'N/A')
            negotiable_text = t(user_id, 'moderation.negotiable')
            
            # Перевіряємо, чи це "Договірна" ціна
            is_negotiable = (
                price_value == negotiable_text or 
                price_value == 'Договірна' or 
                price_value == 'Договорная'
            )
            
            if is_free:
                price_text = t(user_id, 'common.free')
            elif is_negotiable:
                price_text = price_value  # Не додаємо валюту для "Договірна"
            else:
                # Додаємо валюту тільки якщо це не "Договірна"
                currency = listing.get('currency', 'EUR')
                currency_symbol = '€' if currency == 'EUR' else ('₴' if currency == 'UAH' else '$')
                price_text = f"{price_value} {currency_symbol}"
            
            seller_name = f"{listing.get('firstName', '')} {listing.get('lastName', '')}".strip() or listing.get('username', t(user_id, 'common.user'))
            
            # Для поділеного оголошення не додаємо привітання
            welcome_text = (
                f"{t(user_id, 'shared.listing.title', title=listing.get('title', 'Оголошення'))}\n\n"
                f"{t(user_id, 'shared.listing.price', price=price_text)}\n"
                f"{t(user_id, 'shared.listing.location', location=listing.get('location', 'N/A'))}\n"
                f"{t(user_id, 'shared.listing.seller', seller=seller_name)}\n\n"
                f"{t(user_id, 'shared.listing.instruction')}"
            )
            
            # Формуємо правильний URL на сторінку товару в мінідодатку
            webapp_url_with_params = f"{webapp_url}/{user_lang}/bazaar?listing={shared_item['id']}&telegramId={user_id}"
            button_text = t(user_id, 'shared.listing.button')
            
            # Створюємо клавіатуру для оголошення
            listing_keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text=button_text,
                    web_app=WebAppInfo(url=webapp_url_with_params)
                )]
            ])
            
            # Спробуємо відправити зображення товару, якщо воно є
            try:
                images = listing.get('images')
                if images:
                    if isinstance(images, str):
                        images = json.loads(images)
                    if isinstance(images, list) and len(images) > 0:
                        first_image = images[0]
                        # Якщо це file_id або URL, спробуємо відправити фото
                        if first_image and (first_image.startswith('http') or len(first_image) < 100):
                            # Якщо це URL, використовуємо InputFile з URL
                            if first_image.startswith('http'):
                                async with aiohttp.ClientSession() as session:
                                    async with session.get(first_image) as resp:
                                        if resp.status == 200:
                                            photo_data = await resp.read()
                                            from aiogram.types import BufferedInputFile
                                            photo_file = BufferedInputFile(photo_data, filename='listing.jpg')
                                            await message.answer_photo(
                                                photo_file,
                                                caption=welcome_text,
                                                reply_markup=listing_keyboard,
                                                parse_mode="HTML"
                                            )
                                            return
                            # Якщо це file_id, спробуємо використати його напряму
                            else:
                                try:
                                    await message.answer_photo(
                                        first_image,
                                        caption=welcome_text,
                                        reply_markup=listing_keyboard,
                                        parse_mode="HTML"
                                    )
                                    return
                                except:
                                    pass
            except Exception as e:
                print(f"Error sending listing image: {e}")
                # Продовжуємо без зображення
            
            # Якщо не вдалося відправити з фото, відправляємо текст
            await message.answer(welcome_text, reply_markup=listing_keyboard, parse_mode="HTML")
            return
            
        elif shared_item['type'] == 'user':
            user = shared_data
            # Отримуємо мову користувача для правильного URL
            user_lang = get_user_lang(user_id)
            
            user_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get('username', t(user_id, 'common.user'))
            username_text = f"@{user.get('username')}" if user.get('username') else ""
            total_listings = user.get('totalListings', 0) or 0
            active_listings = user.get('activeListings', 0) or 0
            
            # Для поділеного профілю не додаємо привітання
            welcome_text = (
                f"{t(user_id, 'shared.user.title', name=user_name, username=username_text)}\n\n"
                f"{t(user_id, 'shared.user.listings', total=total_listings)}\n"
                f"{t(user_id, 'shared.user.active', active=active_listings)}\n\n"
                f"{t(user_id, 'shared.user.instruction')}"
            )
            
            # Формуємо правильний URL на сторінку профілю в мінідодатку
            webapp_url_with_params = f"{webapp_url}/{user_lang}/bazaar?user={shared_item['id']}&telegramId={user_id}"
            button_text = t(user_id, 'shared.user.button')
            
            # Створюємо клавіатуру для профілю
            user_keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text=button_text,
                    web_app=WebAppInfo(url=webapp_url_with_params)
                )]
            ])
            await message.answer(welcome_text, reply_markup=user_keyboard, parse_mode="HTML")
            await message.answer(
                f"<b>{t(user_id, 'menu.main_menu')}</b>",
                reply_markup=get_main_menu_keyboard(user_id),
                parse_mode="HTML"
            )
            return
        
        # Якщо не вдалося відправити з фото (для listing), відправляємо текст
        if shared_item['type'] == 'listing':
            await message.answer(welcome_text, reply_markup=listing_keyboard, parse_mode="HTML")
        await message.answer(
            f"<b>{t(user_id, 'menu.main_menu')}</b>",
            reply_markup=get_main_menu_keyboard(user_id),
            parse_mode="HTML"
        )


@router.callback_query(F.data.startswith("agree_"))
async def agree_agreement(callback: types.CallbackQuery):
    try:
        user_id = int(callback.data.split("_")[1])
        
        if callback.from_user.id != user_id:
            await callback.answer(t(user_id, 'agreement.error'), show_alert=True)
            return

        user_exists = check_user(user_id)
        if not user_exists:
            user = callback.from_user
            avatar_path = None
            try:
                avatar_path = await download_user_avatar(user_id, user.username)
            except Exception as e:
                print(f"Error downloading avatar: {e}")
            
            add_user(user_id, user.username, user.first_name, user.last_name, user.language_code, None, avatar_path)
        
        set_user_agreement_status(user_id, True)
        
        await callback.message.delete()
        
        await callback.message.answer(
            f"{t(user_id, 'agreement.agreed')}\n\n{t(user_id, 'phone.request')}",
            reply_markup=get_phone_share_keyboard(user_id),
            parse_mode="HTML"
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
        t(user_id, 'agreement.declined'),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data.startswith("set_lang_"))
async def handle_language_selection(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    lang = callback.data.split("_")[-1]
    
    if lang in ['uk', 'ru']:
        set_user_language(user_id, lang)
        
        try:
            webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
            api_url = f"{webapp_url}/api/user/language"
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json={'telegramId': str(user_id), 'language': lang}) as response:
                    if response.status == 200:
                        print(f"Language synchronized with web app for user {user_id}")
        except Exception as e:
            print(f"Error synchronizing language with web app: {e}")
        
        await callback.answer(t(user_id, 'language.changed'), show_alert=False)
        
        await callback.message.edit_text(
            f"🌐 {t(user_id, 'language.changed')}",
            parse_mode="HTML"
        )
        
        # Після вибору мови показуємо оферту (якщо не погоджено)
        has_agreed = get_user_agreement_status(user_id)
        if not has_agreed:
            offer_text = (
                f"{t(user_id, 'agreement.title')}\n\n"
                f"{t(user_id, 'agreement.welcome')}\n\n"
                f"{t(user_id, 'agreement.description')}\n\n"
                f"{t(user_id, 'agreement.instructions')}"
            )
            
            await callback.message.answer(
                offer_text,
                reply_markup=get_agreement_keyboard(user_id),
                parse_mode="HTML"
            )
        else:
            # Якщо оферта вже погоджена, показуємо головне меню
            welcome_text = t(user_id, 'welcome.greeting')
            try:
                photo_file = FSInputFile(HELLO_PHOTO_PATH)
                await callback.message.answer_photo(photo_file, caption=welcome_text, reply_markup=get_main_menu_keyboard(user_id), parse_mode="HTML")
            except Exception as e:
                print(f"Error sending hello photo: {e}")
                await callback.message.answer(welcome_text, reply_markup=get_main_menu_keyboard(user_id), parse_mode="HTML")
    else:
        await callback.answer(t(user_id, 'agreement.error'), show_alert=True)


@router.message(F.contact)
async def handle_contact(message: types.Message):
    if message.contact and message.contact.user_id == message.from_user.id:
        phone = message.contact.phone_number
        user_id = message.from_user.id
        
        user_exists = check_user(user_id)
        if not user_exists:
            user = message.from_user
            avatar_path = None
            try:
                avatar_path = await download_user_avatar(user_id, user.username)
            except Exception as e:
                print(f"Error downloading avatar: {e}")
            
            add_user(user_id, user.username, user.first_name, user.last_name, user.language_code, None, avatar_path)
            print(f"User {user_id} created when sharing phone")
        
        set_user_phone(user_id, phone)
        print(f"Phone {phone} saved for user {user_id}")
        
        await message.answer(
            f"{t(user_id, 'phone.saved')}\n\n{t(user_id, 'phone.instructions')}",
            reply_markup=get_main_menu_keyboard(user_id),
            parse_mode="HTML"
        )
    else:
        await message.answer(t(user_id, 'phone.invalid'), parse_mode="HTML")


# on_startup та on_shutdown тепер в client_handlers.py

