import os
from aiogram import Router, types, F
from aiogram.filters import CommandStart
from dotenv import load_dotenv

from main import bot
from database_functions.client_db import check_user, add_user, get_user_agreement_status, set_user_agreement_status, get_user_phone, set_user_phone, get_user_avatar
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from utils.download_avatar import download_user_avatar
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
            "📋 **Угода користувача (Оферта)**\n\n"
            "Ласкаво просимо до AYN Marketplace!\n\n"
            "Для використання нашого сервісу необхідно ознайомитися з умовами використання та погодитися з ними.\n\n"
            "Будь ласка:\n"
            "1️⃣ Натисніть кнопку 'Прочитати оферту' та уважно прочитайте всі умови\n"
            "2️⃣ Після прочитання натисніть 'Погоджуюсь'\n\n"
            "Продовжуючи, ви підтверджуєте, що прочитали та згодні з умовами використання."
        )
        
        await message.answer(
            offer_text,
            reply_markup=get_agreement_keyboard(user_id),
            parse_mode="Markdown"
        )
        return

    # Якщо користувач не надав номер телефону
    user_phone = get_user_phone(user_id)
    if not user_phone:
        await message.answer(
            "📱 Для повноцінного використання сервісу необхідно поділитися номером телефону.\n\n"
            "Це дозволить іншим користувачам зв'язатися з вами.",
            reply_markup=get_phone_share_keyboard()
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
    if len(args) > 1:
        param = args[1]
        if param.startswith('listing_'):
            try:
                listing_id = int(param.split('_')[1])
                shared_item = {'type': 'listing', 'id': listing_id}
            except (ValueError, IndexError):
                pass
        elif param.startswith('user_'):
            try:
                user_telegram_id = param.split('_')[1]
                shared_item = {'type': 'user', 'id': user_telegram_id}
            except IndexError:
                pass

    welcome_text = (
        "👋 Вітаємо в AYN Marketplace!\n\n"
    )
    
    # Якщо є поділений товар або профіль, додаємо інформацію
    if shared_item:
        if shared_item['type'] == 'listing':
            welcome_text += "📦 Товар, яким з вами поділилися, тут:\n\n"
        elif shared_item['type'] == 'user':
            welcome_text += "👤 Профіль користувача, яким з вами поділилися, тут:\n\n"
    else:
        welcome_text += (
            "🛍️ Оберіть товари з каталогу\n"
            "📱 Створюйте свої оголошення\n"
            "💬 Спілкуйтесь з продавцями\n\n"
        )
    
    welcome_text += "Натисніть кнопку нижче, щоб відкрити каталог:"
    
    # Створюємо клавіатуру з посиланням на поділений товар/профіль
    if shared_item:
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
        webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
        if shared_item['type'] == 'listing':
            webapp_url_with_params = f"{webapp_url}?listing={shared_item['id']}&telegramId={user_id}"
        else:
            webapp_url_with_params = f"{webapp_url}?user={shared_item['id']}&telegramId={user_id}"
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="🛍️ Відкрити каталог",
                web_app=WebAppInfo(url=webapp_url_with_params)
            )]
        ])
        await message.answer(welcome_text, reply_markup=keyboard)
    else:
        await message.answer(welcome_text, reply_markup=get_catalog_webapp_keyboard(user_id))


@router.callback_query(F.data.startswith("agree_"))
async def agree_agreement(callback: types.CallbackQuery):
    try:
        user_id = int(callback.data.split("_")[1])
        
        # Перевіряємо чи це той самий користувач
        if callback.from_user.id != user_id:
            await callback.answer("Помилка доступу", show_alert=True)
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
            "✅ Дякуємо за згоду з умовами використання!\n\n"
            "📱 Для повноцінного використання сервісу необхідно поділитися номером телефону.\n\n"
            "Це дозволить іншим користувачам зв'язатися з вами.",
            reply_markup=get_phone_share_keyboard()
        )
        
        await callback.answer()
    except Exception as e:
        print(f"Error in agree_agreement: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer("Помилка", show_alert=True)


@router.callback_query(F.data == "decline_agreement")
async def decline_agreement(callback: types.CallbackQuery):
    await callback.message.edit_text(
        "❌ Ви відхилили угоду користувача.\n\n"
        "Для використання сервісу необхідно погодитися з умовами.\n\n"
        "Спробуйте ще раз: /start"
    )
    await callback.answer()


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
            "✅ Номер телефону збережено!\n\n"
            "Тепер ви можете повноцінно використовувати сервіс.",
            reply_markup=types.ReplyKeyboardRemove()
        )
        
        # Показуємо кнопку відкриття каталогу
        await message.answer(
            "👋 Вітаємо в AYN Marketplace!\n\n"
            "Натисніть кнопку нижче, щоб відкрити каталог:",
            reply_markup=get_catalog_webapp_keyboard(user_id)
        )
    else:
        await message.answer("❌ Будь ласка, поділіться своїм номером телефону.")


async def on_startup(router):
    me = await bot.get_me()
    create_dbs()
    print(f'Bot: @{me.username} запущений!')

async def on_shutdown(router):
    me = await bot.get_me()
    print(f'Bot: @{me.username} зупинений!')

