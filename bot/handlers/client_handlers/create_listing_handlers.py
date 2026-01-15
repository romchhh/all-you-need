import json
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.filters import Command

from utils.translations import t
from states.client_states import CreateListing
from keyboards.client_keyboards import (
    get_categories_keyboard,
    get_condition_keyboard,
    get_listing_confirmation_keyboard,
    get_main_menu_keyboard,
    get_publication_tariff_keyboard,
    get_german_cities_keyboard,
    get_continue_photos_keyboard
)
from database_functions.telegram_listing_db import (
    get_user_id_by_telegram_id,
    create_telegram_listing,
    get_categories,
    get_user_telegram_listings,
    get_telegram_listing_by_id,
    update_telegram_listing_publication_tariff
)
from database_functions.client_db import check_user
from utils.moderation_manager import ModerationManager
from utils.monopay_functions import create_publication_payment_link
from main import bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, InputMediaPhoto
import os
from datetime import datetime, timedelta


router = Router()

MAX_PHOTOS = 10


@router.message(F.text.in_([
    "➕ Додати оголошення",  # UK
    "➕ Добавить объявление"  # RU
]))
async def start_create_listing(message: types.Message, state: FSMContext):      
    user_id = message.from_user.id
    
    if not check_user(user_id):
        await message.answer("Будь ласка, спочатку зареєструйтесь: /start")
        return
    
    await state.set_state(CreateListing.waiting_for_title)
    await message.answer(
        t(user_id, 'create_listing.title_prompt'),
        parse_mode="HTML",
        reply_markup=types.ReplyKeyboardMarkup(
            keyboard=[[types.KeyboardButton(text=t(user_id, 'create_listing.cancel'))]],
            resize_keyboard=True
        )
    )


@router.message(CreateListing.waiting_for_title)
async def process_title(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    title = message.text.strip()
    
    if not title or len(title) < 3:
        await message.answer("❌ Назва повинна містити мінімум 3 символи. Спробуйте ще раз:")
        return
    
    await state.update_data(title=title)
    await state.set_state(CreateListing.waiting_for_description)
    await message.answer(
        t(user_id, 'create_listing.description_prompt'),
        parse_mode="HTML"
    )


@router.message(CreateListing.waiting_for_description)
async def process_description(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    description = message.text.strip()
    
    if not description or len(description) < 10:
        await message.answer("❌ Опис повинен містити мінімум 10 символів. Спробуйте ще раз:")
        return
    
    await state.update_data(description=description)
    await state.set_state(CreateListing.waiting_for_photos)
    await state.update_data(photos=[])
    
    await message.answer(
        t(user_id, 'create_listing.photos_prompt'),
        parse_mode="HTML"
    )


@router.message(CreateListing.waiting_for_photos, F.photo, F.media_group_id)
async def process_media_group_photo(message: types.Message, state: FSMContext):
    """Обробляє фото з медіа групи - відповідає тільки один раз на всю групу"""
    user_id = message.from_user.id
    data = await state.get_data()
    photos = data.get('photos', [])
    media_group_id = message.media_group_id
    media_group_responses = data.get('media_group_responses', {})
    
    if len(photos) >= MAX_PHOTOS:
        return
    
    file_id = message.photo[-1].file_id
    photos.append(file_id)
    
    # Перевіряємо чи це перше фото з групи
    if media_group_id not in media_group_responses:
        # Перше фото з групи - зберігаємо інформацію та запускаємо таймер
        media_group_responses[media_group_id] = True
        
        await state.update_data(
            photos=photos,
            media_group_responses=media_group_responses
        )
        
        # Запускаємо відкладений відповідь
        import asyncio
        asyncio.create_task(delayed_media_group_response(user_id, media_group_id, state))
    else:
        # Наступні фото з тієї ж групи - просто додаємо без відповіді
        await state.update_data(photos=photos)


async def delayed_media_group_response(user_id: int, media_group_id: str, state: FSMContext):
    """Відповідає на медіа групу після затримки - тільки один раз"""
    import asyncio
    # Чекаємо 2 секунди, щоб зібрати всі фото з групи
    await asyncio.sleep(2)
    
    # Перевіряємо чи група ще не оброблена
    data = await state.get_data()
    media_group_responses = data.get('media_group_responses', {})
    
    if media_group_id in media_group_responses:
        # Видаляємо інформацію про групу
        del media_group_responses[media_group_id]
        await state.update_data(media_group_responses=media_group_responses)
        
        # Відправляємо одне повідомлення
        last_photo_message_id = data.get('last_photo_message_id')
        if last_photo_message_id:
            try:
                await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
            except:
                pass
        
        current_data = await state.get_data()
        current_photos_count = len(current_data.get('photos', []))
        
        sent_message = await bot.send_message(
            chat_id=user_id,
            text=t(user_id, 'create_listing.photo_added').format(
                current=current_photos_count,
                max=MAX_PHOTOS
            ),
            reply_markup=get_continue_photos_keyboard(user_id)
        )
        
        await state.update_data(last_photo_message_id=sent_message.message_id)


@router.message(CreateListing.waiting_for_photos, F.photo)
async def process_photo(message: types.Message, state: FSMContext):
    """Обробляє окремі фото (не медіа групи)"""
    user_id = message.from_user.id
    data = await state.get_data()
    photos = data.get('photos', [])
    last_photo_message_id = data.get('last_photo_message_id')
    
    if len(photos) >= MAX_PHOTOS:
        await message.answer(
            t(user_id, 'create_listing.photo_limit_reached'),
            reply_markup=get_continue_photos_keyboard(user_id)
        )
        return
    
    file_id = message.photo[-1].file_id
    photos.append(file_id)
    
    # Видаляємо старе повідомлення якщо є
    if last_photo_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
        except:
            pass
    
    # Відправляємо повідомлення про додавання фото з кнопкою "Продовжити"
    sent_message = await message.answer(
        t(user_id, 'create_listing.photo_added').format(
            current=len(photos),
            max=MAX_PHOTOS
        ),
        reply_markup=get_continue_photos_keyboard(user_id)
    )

    await state.update_data(
        photos=photos,
        last_photo_message_id=sent_message.message_id
    )


@router.callback_query(F.data == "continue_after_photos", CreateListing.waiting_for_photos)
async def continue_after_photos(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    data = await state.get_data()
    photos = data.get('photos', [])
    
    if not photos or len(photos) == 0:
        await callback.answer("❌ Обов'язково потрібно додати хоча б одне фото!", show_alert=True)
        return
    
    # Очищаємо оброблені медіа групи при переході до наступного кроку
    await state.update_data(processed_media_groups={}, media_group_responses={})
    
    await callback.answer()
    await process_category_selection(callback.message, state)


@router.message(CreateListing.waiting_for_photos, F.text == "/skip")
async def skip_photos_handler(message: types.Message, state: FSMContext):   
    user_id = message.from_user.id
    await message.answer("❌ <b>Не можна пропустити додавання фото!</b>\n\nБудь ласка, надішліть хоча б одне фото вашого товару. Після додавання фото надішліть /next для продовження.", parse_mode="HTML")


@router.message(CreateListing.waiting_for_photos, F.text)
async def handle_text_in_photos_state(message: types.Message, state: FSMContext):   
    user_id = message.from_user.id
    
    if message.text == t(user_id, 'create_listing.cancel'):
        await state.clear()
        await message.answer(
            t(user_id, 'create_listing.cancelled'),
            parse_mode="HTML",
            reply_markup=get_main_menu_keyboard(user_id)
        )
        return
    
    await message.answer("📸 <b>Будь ласка, надішліть фото товару!</b>\n\nВи можете надіслати до 10 фото. Після додавання фото надішліть /next для продовження.", parse_mode="HTML")


async def process_category_selection(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    categories = get_categories()
    
    if not categories:
        await message.answer("❌ Помилка: категорії не знайдені. Спробуйте пізніше.")
        await state.clear()
        return
    
    await state.set_state(CreateListing.waiting_for_category)
    await message.answer(
        t(user_id, 'create_listing.category_prompt'),
        parse_mode="HTML",
        reply_markup=get_categories_keyboard(user_id, categories)
    )


@router.callback_query(F.data.startswith("cat_"), CreateListing.waiting_for_category)
async def process_category(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    category_id = int(callback.data.split("_")[1])
    
    categories = get_categories()
    selected_category = next((c for c in categories if c['id'] == category_id), None)
    
    if not selected_category:
        await callback.answer("❌ Категорія не знайдена", show_alert=True)
        return
    
    await state.set_state(CreateListing.waiting_for_price)
    await state.update_data(category_id=category_id, category_name=selected_category['name'])
    
    await callback.message.edit_text(
        t(user_id, 'create_listing.price_prompt'),
        parse_mode="HTML"
    )
    await callback.answer()


@router.message(CreateListing.waiting_for_price)
async def process_price(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    try:
        price = float(message.text.replace(',', '.').strip())
        if price < 0:
            raise ValueError("Ціна не може бути від'ємною")
    except ValueError:
        await message.answer(t(user_id, 'create_listing.price_invalid'))
        return
    
    await state.update_data(price=price)
    await state.set_state(CreateListing.waiting_for_condition)
    
    await message.answer(
        t(user_id, 'create_listing.condition_prompt'),
        parse_mode="HTML",
        reply_markup=get_condition_keyboard(user_id)
    )


@router.callback_query(F.data.startswith("condition_"), CreateListing.waiting_for_condition)
async def process_condition(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    condition = callback.data.split("_")[1]  # "new" або "used"
    
    condition_text = t(user_id, 'create_listing.condition_new') if condition == 'new' else t(user_id, 'create_listing.condition_used')
    
    await state.update_data(condition=condition, condition_text=condition_text)
    await state.set_state(CreateListing.waiting_for_location)
    
    location_text = t(user_id, 'create_listing.location_prompt') + "\n\n<i>Або оберіть місто зі списку:</i>"
    
    await callback.message.edit_text(
        location_text,
        parse_mode="HTML",
        reply_markup=get_german_cities_keyboard(user_id)
    )
    await callback.answer()


@router.callback_query(F.data == "cancel_listing", CreateListing.waiting_for_location)
async def cancel_listing_from_city_selection(callback: types.CallbackQuery, state: FSMContext):
    """Окремий обробник для кнопки 'Скасувати' під час вибору міста"""
    user_id = callback.from_user.id
    await state.clear()
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.cancelled'),
            parse_mode="HTML"
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.cancelled'),
            parse_mode="HTML"
        )
    
    await callback.answer()
    await callback.message.answer(
        "Головне меню:",
        reply_markup=get_main_menu_keyboard(user_id)
    )


@router.callback_query(F.data.startswith("city_"), CreateListing.waiting_for_location)
async def process_city_selection(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    
    # Отримуємо назву міста з callback_data
    city_name = callback.data.replace("city_", "")
    
    await state.update_data(location=city_name)
    
    data = await state.get_data()
    preview_text = build_preview(user_id, data)
    photos = data.get('photos', [])
    
    await state.set_state(CreateListing.waiting_for_confirmation)
    
    # Видаляємо попереднє повідомлення з клавіатурою міст
    try:
        await callback.message.delete()
    except:
        pass
    
    # Відправляємо фото/медіа-групу з preview
    if photos and len(photos) > 0:
        if len(photos) == 1:
            # Для одного фото
            await callback.message.answer_photo(
                photo=photos[0],
                caption=preview_text,
                parse_mode="HTML"
            )
        else:
            # Для кількох фото - медіа-група
            media = []
            for i, photo_id in enumerate(photos):
                if i == 0:
                    media.append(InputMediaPhoto(
                        media=photo_id,
                        caption=preview_text,
                        parse_mode="HTML"
                    ))
                else:       
                    media.append(InputMediaPhoto(media=photo_id))
            
            await callback.message.answer_media_group(media=media)
    
    # Відправляємо окреме повідомлення з кнопками підтвердження (без дублювання інформації)
    await callback.message.answer(
        t(user_id, 'create_listing.preview_confirm'),
        parse_mode="HTML",
        reply_markup=get_listing_confirmation_keyboard(user_id)
    )
    
    await callback.answer()


@router.message(CreateListing.waiting_for_location)
async def cancel_listing_from_location_text(message: types.Message, state: FSMContext):
    """Окремий обробник для текстової кнопки 'Скасувати' під час вибору міста"""
    user_id = message.from_user.id
    
    # Перевіряємо чи це текст "Скасувати"
    cancel_text = t(user_id, 'create_listing.cancel')
    if message.text and message.text == cancel_text:
        await state.clear()
        await message.answer(
            t(user_id, 'create_listing.cancelled'),
            parse_mode="HTML",
            reply_markup=get_main_menu_keyboard(user_id)
        )
        return


@router.message(CreateListing.waiting_for_location)
async def process_location(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    # Перевіряємо чи це не кнопка "Скасувати" (якщо не обробив попередній обробник)
    cancel_text = t(user_id, 'create_listing.cancel')
    if message.text and message.text == cancel_text:
        return  # Обробляється окремим обробником вище
    
    if not message.text:
        return
    
    location = message.text.strip()
    
    if not location or len(location) < 2:
        await message.answer("❌ Місто повинно містити мінімум 2 символи. Спробуйте ще раз:", reply_markup=get_german_cities_keyboard(user_id))
        return
    
    await state.update_data(location=location)
    
    data = await state.get_data()
    preview_text = build_preview(user_id, data)
    photos = data.get('photos', [])
    
    await state.set_state(CreateListing.waiting_for_confirmation)
    
    if photos and len(photos) > 0:
        if len(photos) == 1:
            # Для одного фото - попередній перегляд в caption, потім окреме повідомлення з кнопками
            await message.answer_photo(
                photo=photos[0],
                caption=preview_text,
                parse_mode="HTML"
            )
            # Відправляємо окреме повідомлення з кнопками підтвердження (без дублювання інформації)
            await message.answer(
                t(user_id, 'create_listing.preview_confirm'),
                parse_mode="HTML",
                reply_markup=get_listing_confirmation_keyboard(user_id)
            )
        else:
            # Для кількох фото - попередній перегляд в caption першого фото
            media = []
            for i, photo_id in enumerate(photos):
                if i == 0:
                    media.append(InputMediaPhoto(
                        media=photo_id,
                        caption=preview_text,
                        parse_mode="HTML"
                    ))
                else:       
                    media.append(InputMediaPhoto(media=photo_id))
            
            sent_messages = await message.answer_media_group(media=media)
            
            # Відправляємо окреме повідомлення з кнопками підтвердження (без дублювання інформації)
            await message.answer(
                t(user_id, 'create_listing.preview_confirm'),
                parse_mode="HTML",
                reply_markup=get_listing_confirmation_keyboard(user_id)
            )
    else:
        # Якщо немає фото (не повинно бути, але на всяк випадок)
        await message.answer(
            preview_text,
            parse_mode="HTML",
            reply_markup=get_listing_confirmation_keyboard(user_id)
        )


def capitalize_first_letter(text: str) -> str:
    """Робить першу літеру великою, якщо вона не велика"""
    if not text:
        return text
    return text[0].upper() + text[1:] if len(text) > 1 else text.upper()


def build_preview(user_id: int, data: dict) -> str:
    # Автоматично робимо першу літеру великою для назви та опису
    title = capitalize_first_letter(data.get('title', ''))
    description = capitalize_first_letter(data.get('description', ''))
    
    preview = t(user_id, 'create_listing.preview')
    preview += t(user_id, 'create_listing.preview_title').format(title=title)
    preview += t(user_id, 'create_listing.preview_description').format(description=description)
    
    category_text = data.get('category_name', '')
    preview += t(user_id, 'create_listing.preview_category').format(category=category_text)
    
    preview += t(user_id, 'create_listing.preview_price').format(price=data.get('price', 0))
    preview += t(user_id, 'create_listing.preview_condition').format(condition=data.get('condition_text', ''))
    preview += t(user_id, 'create_listing.preview_location').format(location=data.get('location', ''))
    
    # Видалено preview_photos - не показуємо кількість фото
    
    return preview


@router.callback_query(F.data == "confirm_listing", CreateListing.waiting_for_confirmation)
async def confirm_listing(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    data = await state.get_data()
    
    photos = data.get('photos', [])
    if not photos or len(photos) == 0:
        await callback.answer("❌ Помилка: потрібно додати хоча б одне фото!", show_alert=True)
        return
    
    db_user_id = get_user_id_by_telegram_id(user_id)
    if not db_user_id:
        await callback.answer("❌ Помилка: користувач не знайдений", show_alert=True)
        await state.clear()
        return
    
    try:
        # Автоматично робимо першу літеру великою для назви та опису
        title = capitalize_first_letter(data['title'])
        description = capitalize_first_letter(data['description'])
        
        listing_id = create_telegram_listing(
            user_id=db_user_id,
            title=title,
            description=description,
            price=float(data['price']),
            currency='EUR',
            category=data['category_name'],
            subcategory=None,
            condition=data['condition'],
            location=data.get('location', 'Не вказано'),
            images=photos
        )
        
        # Зберігаємо listing_id в стані для подальшого використання
        await state.update_data(listing_id=listing_id)
        
        # Переходимо до вибору тарифу публікації
        await state.set_state(CreateListing.waiting_for_publication_tariff)
        
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except:
            pass
        
        tariff_text = """💰 <b>Оберіть тариф для публікації оголошення:</b>

📌 <b>Звичайна публікація</b> — 3€
• Стандартний пост
• Без виділень
• Публікується в загальний потік

⭐ <b>Виділене оголошення</b> — 4,5€
• Емодзі на початку
• Жирний заголовок
• Візуально виділяється серед звичайних
• Публікується в загальному потоці

📌 <b>Закріп у каналі</b> — 5,5€ / 12 годин
• Закріплюється зверху каналу
• Автоматично знімається після закінчення терміну

📸 <b>Сторіс у каналі</b> — 5€ / 24 години
• 1 сторіс
• Формат: текст + кнопка
• Посилання на оголошення / профіль

<i>Без оплати оголошення не буде опубліковане.</i>"""
        
        await callback.message.answer(
            tariff_text,
            parse_mode="HTML",
            reply_markup=get_publication_tariff_keyboard(user_id)
        )
        await callback.answer()
        
    except Exception as e:
        print(f"Error creating listing: {e}")
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except:
            pass
        
        await callback.message.answer(
            t(user_id, 'create_listing.error'),
            parse_mode="HTML"
        )
        await callback.answer()
        
        await state.clear()
        
        await callback.message.answer(
            "✅",
            reply_markup=get_main_menu_keyboard(user_id)
        )


@router.callback_query(F.data == "cancel_listing")
async def cancel_listing_callback(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    await state.clear()
    await callback.message.edit_text(
        t(user_id, 'create_listing.cancelled'),
        parse_mode="HTML"
    )
    await callback.answer()
    await callback.message.answer(
        "Головне меню:",
        reply_markup=get_main_menu_keyboard(user_id)
    )


async def cancel_listing(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    await state.clear()
    await message.answer(
        t(user_id, 'create_listing.cancelled'),
        parse_mode="HTML",
        reply_markup=get_main_menu_keyboard(user_id)
    )



@router.message(F.text.in_([
    "📦 Мої оголошення",  # UK
    "📦 Мои объявления"   # RU
]))
async def show_my_listings(message: types.Message):
    user_id = message.from_user.id
    
    listings = get_user_telegram_listings(user_id)
    
    if not listings:
        await message.answer(
            t(user_id, 'my_listings.empty'),
            parse_mode="HTML"
        )
        return
    
    keyboard_buttons = []
    for listing in listings:
        title = listing.get('title', 'Без назви')
        status = listing.get('status', 'pending')
        status_emoji = {
            'pending_moderation': '⏳',
            'approved': '✅',
            'rejected': '❌',
            'published': '📢'
        }.get(status, '📦')
        
        button_text = f"{status_emoji} {title[:30]}{'...' if len(title) > 30 else ''}"
        keyboard_buttons.append([
            InlineKeyboardButton(
                text=button_text,
                callback_data=f"view_telegram_listing_{listing['id']}"
            )
        ])
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
    
    await message.answer(
        t(user_id, 'my_listings.title', count=len(listings)),
        reply_markup=keyboard,
        parse_mode="HTML"
    )


@router.callback_query(F.data.startswith("view_telegram_listing_"))
async def view_telegram_listing(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    try:
        listing_id = int(callback.data.split("_")[-1])
        listing = get_telegram_listing_by_id(listing_id)
        
        if not listing:
            await callback.answer("❌ Оголошення не знайдено", show_alert=True)
            return
        
        if listing.get('sellerTelegramId') != user_id:
            await callback.answer("❌ Це не ваше оголошення", show_alert=True)
            return
        
        title = listing.get('title', 'Без назви')
        description = listing.get('description', 'Без опису')
        price = listing.get('price', 0)
        currency = listing.get('currency', 'EUR')
        category = listing.get('category', 'Не вказано')
        subcategory = listing.get('subcategory')
        condition = listing.get('condition', 'Не вказано')
        location = listing.get('location', 'Не вказано')
        status = listing.get('status', 'pending')
        created_at = listing.get('createdAt', '')
        
        status_translations = {
            'pending_moderation': t(user_id, 'listing.status.pending_moderation'),
            'approved': t(user_id, 'listing.status.approved'),
            'rejected': t(user_id, 'listing.status.rejected'),
            'published': t(user_id, 'listing.status.published')
        }
        status_text = status_translations.get(status, status)
        
        message_text = f"""📦 <b>{title}</b>\n\n"""
        message_text += f"📝 <b>Опис:</b> {description[:500]}{'...' if len(description) > 500 else ''}\n\n"
        message_text += f"💰 <b>Ціна:</b> {price} {currency}\n"
        message_text += f"📂 <b>Категорія:</b> {category}"
        if subcategory:
            message_text += f" / {subcategory}"
        message_text += f"\n"
        message_text += f"🔧 <b>Стан:</b> {condition}\n"
        message_text += f"📍 <b>Локація:</b> {location}\n"
        message_text += f"📊 <b>Статус:</b> {status_text}\n"
        if created_at:
            # Форматуємо дату в нормальний формат
            from datetime import datetime
            try:
                dt = None
                if isinstance(created_at, str):
                    # Спробуємо різні формати
                    try:
                        # ISO формат з Z
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    except:
                        try:
                            # ISO формат без Z
                            dt = datetime.fromisoformat(created_at)
                        except:
                            try:
                                # Формат з пробілом: "2026-01-12 20:30:12.360820"
                                if ' ' in created_at:
                                    parts = created_at.split(' ')
                                    date_part = parts[0]
                                    time_part = parts[1].split('.')[0]  # Прибираємо мікросекунди
                                    dt = datetime.strptime(f"{date_part} {time_part}", "%Y-%m-%d %H:%M:%S")
                            except:
                                pass
                elif hasattr(created_at, 'strftime'):
                    # Якщо це вже datetime об'єкт
                    dt = created_at
                
                if dt:
                    formatted_date = dt.strftime("%d.%m.%Y %H:%M")
                    message_text += f"📅 <b>Створено:</b> {formatted_date}\n"
                else:
                    # Якщо не вдалося розпарсити, виводимо як є
                    message_text += f"📅 <b>Створено:</b> {created_at}\n"
            except Exception as e:
                # Якщо не вдалося розпарсити, виводимо як є
                message_text += f"📅 <b>Створено:</b> {created_at}\n"
        
        keyboard_buttons = []
        
        channel_message_id = listing.get('channelMessageId') or listing.get('channel_message_id')
        if channel_message_id and channel_message_id != 'None' and str(channel_message_id).strip():
            channel_id = os.getenv('TRADE_CHANNEL_ID', '')
            channel_username = os.getenv('TRADE_CHANNEL_USERNAME', '')
            
            if channel_username:
                channel_link = f"https://t.me/{channel_username}/{channel_message_id}"
            elif channel_id:
                clean_channel_id = str(channel_id).replace('-100', '')
                channel_link = f"https://t.me/c/{clean_channel_id}/{channel_message_id}"
            else:
                channel_link = None
            
            if channel_link:
                keyboard_buttons.append([
                    InlineKeyboardButton(
                        text="🔗 Переглянути в каналі",
                        url=channel_link
                    )
                ])
        
        # Додаємо кнопку "Оновити оголошення" для опублікованих оголошень
        published_at = listing.get('publishedAt')
        moderation_status = listing.get('moderationStatus', '')
        
        # Перевіряємо чи оголошення опубліковане (статус може бути 'approved' або 'published', або moderationStatus = 'approved')
        is_published = (
            (published_at and status in ['approved', 'published']) or
            (published_at and moderation_status == 'approved')
        )
        
        # Якщо статус 'sold', не показуємо кнопки управління та refresh
        is_sold = status == 'sold'
        
        if is_published and not is_sold:
            from datetime import datetime, timedelta
            try:
                if isinstance(published_at, str):
                    published_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
                else:
                    published_date = published_at
                
                now = datetime.now(published_date.tzinfo) if published_date.tzinfo else datetime.now()
                time_since_publication = now - published_date
                
                # Перевіряємо умови: доступно не раніше ніж через 1 годину (без обмеження 24 годинами)
                one_hour = timedelta(hours=1)
                
                print(f"DEBUG refresh check: listing_id={listing_id}, published_at={published_at}, time_since={time_since_publication}, status={status}, moderationStatus={moderation_status}")
                
                if time_since_publication >= one_hour:
                    # Доступно після 1 години (без обмеження 24 годинами)
                    keyboard_buttons.append([
                        InlineKeyboardButton(
                            text="🔄 Оновити оголошення — 1,5€",
                            callback_data=f"refresh_listing_{listing_id}"
                        )
                    ])
                    print(f"DEBUG: Refresh button added for listing {listing_id}")
                else:
                    # Показуємо скільки залишилось до 1 години
                    minutes_left = int((one_hour - time_since_publication).total_seconds() / 60)
                    if minutes_left > 0:
                        keyboard_buttons.append([
                            InlineKeyboardButton(
                                text=f"⏳ Оновлення доступне через {minutes_left} хв",
                                callback_data="refresh_not_available"
                            )
                        ])
            except Exception as e:
                print(f"Error checking refresh availability: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"DEBUG: Refresh not available - not published: published_at={published_at}, status={status}, moderationStatus={moderation_status}")
        
        # Додаємо кнопки для управління оголошенням (тільки якщо не продане)
        if not is_sold and (status in ['approved', 'published'] or moderation_status == 'approved'):
            keyboard_buttons.append([
                InlineKeyboardButton(
                    text="✅ Позначити як продане",
                    callback_data=f"confirm_mark_sold_{listing_id}"
                ),
                InlineKeyboardButton(
                    text="🗑️ Видалити",
                    callback_data=f"confirm_delete_{listing_id}"
                )
            ])
        
        keyboard_buttons.append([
            InlineKeyboardButton(
                text="⬅️ Назад до списку",
                callback_data="back_to_my_listings"
            )
        ])
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
        
        images = listing.get('images', [])
        if images and len(images) > 0:
            try:
                await bot.send_photo(
                    chat_id=user_id,
                    photo=images[0],
                    caption=message_text,
                    reply_markup=keyboard,
                    parse_mode="HTML"
                )
            except Exception as e:
                print(f"Error sending photo: {e}")
                await callback.message.answer(
                    message_text,
                    reply_markup=keyboard,
                    parse_mode="HTML"
                )
        else:
            await callback.message.answer(
                message_text,
                reply_markup=keyboard,
                parse_mode="HTML"
            )
        
        await callback.answer()
        
    except Exception as e:
        print(f"Error viewing listing: {e}")
        await callback.answer("❌ Помилка при перегляді оголошення", show_alert=True)


@router.callback_query(F.data == "refresh_not_available")
async def refresh_not_available(callback: types.CallbackQuery):
    await callback.answer("⏳ Оновлення доступне не раніше ніж через 1 годину після публікації", show_alert=True)


@router.callback_query(F.data.startswith("refresh_listing_"))
async def refresh_listing(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    
    try:
        listing_id = int(callback.data.split("_")[-1])
        listing = get_telegram_listing_by_id(listing_id)
        
        if not listing:
            await callback.answer("❌ Оголошення не знайдено", show_alert=True)
            return
        
        if listing.get('sellerTelegramId') != user_id:
            await callback.answer("❌ Це не ваше оголошення", show_alert=True)
            return
        
        # Перевіряємо умови ще раз
        published_at = listing.get('publishedAt')
        status = listing.get('status', 'pending')
        moderation_status = listing.get('moderationStatus', '')
        
        is_published = (
            (published_at and status in ['approved', 'published']) or
            (published_at and moderation_status == 'approved')
        )
        
        if not is_published:
            await callback.answer("❌ Оголошення не опубліковане", show_alert=True)
            return

        from datetime import datetime, timedelta
        try:
            if isinstance(published_at, str):
                published_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
            else:
                published_date = published_at
            
            now = datetime.now(published_date.tzinfo) if published_date.tzinfo else datetime.now()
            time_since_publication = now - published_date
            
            # Перевіряємо умови: доступно не раніше ніж через 1 годину (без обмеження 24 годинами)
            one_hour = timedelta(hours=1)
            
            if time_since_publication < one_hour:
                minutes_left = int((one_hour - time_since_publication).total_seconds() / 60)
                await callback.answer(f"⏳ Оновлення доступне не раніше ніж через 1 годину після публікації. Залишилось: {minutes_left} хв", show_alert=True)
                return
        except Exception as e:
            print(f"Error checking refresh conditions: {e}")
            await callback.answer("❌ Помилка перевірки умов оновлення", show_alert=True)
            return
        
        # Створюємо платіж за оновлення
        amount = 1.5
        payment_result = create_publication_payment_link(
            user_id=user_id,
            listing_id=listing_id,
            tariff_type='refresh',
            amount=amount
        )
        
        if not payment_result.get('success'):
            await callback.answer(f"❌ Помилка створення платежу: {payment_result.get('error', 'Невідома помилка')}", show_alert=True)
            return
        
        payment_url = payment_result['payment_url']
        
        # Зберігаємо дані про платіж
        await state.update_data(
            listing_id=listing_id,
            refresh_payment_invoice_id=payment_result['invoice_id'],
            refresh_payment_local_id=payment_result['local_payment_id']
        )
        
        payment_keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="💳 Оплатити 1,5€",
                    url=payment_url
                )
            ]
        ])
        
        payment_text = """🔄 <b>Оновити оголошення (Refresh)</b>

💰 <b>Сума:</b> 1,5€

Натисніть кнопку "Оплатити" для переходу до оплати через Monobank.

<i>Платіж перевіряється автоматично. Після підтвердження оплати ваше оголошення буде повторно опубліковане в каналі.</i>"""
        
        try:
            await callback.message.edit_text(
                payment_text,
                parse_mode="HTML",
                reply_markup=payment_keyboard
            )
        except:
            await callback.message.answer(
                payment_text,
                parse_mode="HTML",
                reply_markup=payment_keyboard
            )
        
        await callback.answer()
        
    except Exception as e:
        print(f"Error refreshing listing: {e}")
        await callback.answer("❌ Помилка при оновленні оголошення", show_alert=True)


@router.callback_query(F.data.startswith("tariff_"), CreateListing.waiting_for_publication_tariff)
async def process_publication_tariff(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    data = await state.get_data()
    listing_id = data.get('listing_id')
    
    if not listing_id:
        await callback.answer("❌ Помилка: оголошення не знайдено", show_alert=True)
        await state.clear()
        return
    
    tariff_type = callback.data.replace("tariff_", "")
    
    # Визначаємо ціну тарифу
    tariff_prices = {
        'standard': 3.0,
        'highlighted': 4.5,
        'pinned': 5.5,
        'story': 5.0
    }
    
    if tariff_type not in tariff_prices:
        await callback.answer("❌ Невірний тариф", show_alert=True)
        return
    
    amount = tariff_prices[tariff_type]
    
    # Оновлюємо тариф в БД
    update_telegram_listing_publication_tariff(listing_id, tariff_type, 'pending')
    
    # Створюємо платіж
    payment_result = create_publication_payment_link(
        user_id=user_id,
        listing_id=listing_id,
        tariff_type=tariff_type,
        amount=amount
    )
    
    if not payment_result.get('success'):
        await callback.answer(f"❌ Помилка створення платежу: {payment_result.get('error', 'Невідома помилка')}", show_alert=True)
        return
    
    payment_url = payment_result['payment_url']
    
    # Зберігаємо дані про платіж
    await state.update_data(
        tariff_type=tariff_type,
        payment_invoice_id=payment_result['invoice_id'],
        payment_local_id=payment_result['local_payment_id']
    )
    await state.set_state(CreateListing.waiting_for_payment)
    
    tariff_names = {
        'standard': 'Звичайна публікація',
        'highlighted': 'Виділене оголошення',
        'pinned': 'Закріп у каналі',
        'story': 'Сторіс у каналі'
    }
    
    payment_keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="💳 Оплатити",
                url=payment_url
            )
        ]
    ])
    
    payment_text = f"""💳 <b>Оплата тарифу: {tariff_names.get(tariff_type, tariff_type)}</b>

💰 <b>Сума:</b> {amount}€

Натисніть кнопку "Оплатити" для переходу до оплати через Monobank.

<i>Платіж перевіряється автоматично. Після підтвердження оплати ваше оголошення буде відправлено на модерацію.</i>"""
    
    try:
        await callback.message.edit_text(
            payment_text,
            parse_mode="HTML",
            reply_markup=payment_keyboard
        )
    except:
        await callback.message.answer(
            payment_text,
            parse_mode="HTML",
            reply_markup=payment_keyboard
        )
    
    await callback.answer()


@router.callback_query(F.data == "back_to_my_listings")
async def back_to_my_listings(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    listings = get_user_telegram_listings(user_id)
    
    if not listings:
        await callback.message.edit_text(
            t(user_id, 'my_listings.empty'),
            parse_mode="HTML"
        )
        await callback.answer()
        return

    keyboard_buttons = []
    for listing in listings:
        title = listing.get('title', 'Без назви')
        status = listing.get('status', 'pending')
        status_emoji = {
            'pending_moderation': '⏳',
            'approved': '✅',
            'rejected': '❌',
            'published': '📢'
        }.get(status, '📦')
        
        button_text = f"{status_emoji} {title[:30]}{'...' if len(title) > 30 else ''}"
        keyboard_buttons.append([
            InlineKeyboardButton(
                text=button_text,
                callback_data=f"view_telegram_listing_{listing['id']}"
            )
        ])
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
    
    try:
        await callback.message.edit_text(
            t(user_id, 'my_listings.title', count=len(listings)),
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    except:
        await callback.message.answer(
            t(user_id, 'my_listings.title', count=len(listings)),
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    
    await callback.answer()


@router.callback_query(F.data.startswith("confirm_mark_sold_"))
async def confirm_mark_sold(callback: types.CallbackQuery):
    """Показує підтвердження перед позначенням як продане"""
    user_id = callback.from_user.id
    listing_id = int(callback.data.split("_")[-1])
    
    listing = get_telegram_listing_by_id(listing_id)
    if not listing or listing.get('sellerTelegramId') != user_id:
        await callback.answer("❌ Оголошення не знайдено", show_alert=True)
        return
    
    title = listing.get('title', 'Оголошення')
    
    confirmation_text = f"""⚠️ <b>Підтвердження</b>

Ви впевнені, що хочете позначити оголошення "<b>{title}</b>" як продане?

Оголошення буде видалено з каналу та змінить статус на "Продане"."""
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="✅ Так, позначити як продане",
                callback_data=f"mark_sold_{listing_id}"
            )
        ],
        [
            InlineKeyboardButton(
                text="❌ Скасувати",
                callback_data=f"view_telegram_listing_{listing_id}"
            )
        ]
    ])
    
    try:
        await callback.message.edit_text(
            confirmation_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    except:
        await callback.message.answer(
            confirmation_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    
    await callback.answer()


@router.callback_query(F.data.startswith("mark_sold_"))
async def mark_listing_as_sold(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    try:
        listing_id = int(callback.data.split("_")[-1])
        listing = get_telegram_listing_by_id(listing_id)
        
        if not listing:
            await callback.answer("❌ Оголошення не знайдено", show_alert=True)
            return
        
        if listing.get('sellerTelegramId') != user_id:
            await callback.answer("❌ Це не ваше оголошення", show_alert=True)
            return
        
        # Видаляємо з каналу
        moderation_manager = ModerationManager(bot)
        await moderation_manager.delete_from_channel(listing_id)
        
        # Оновлюємо статус на 'sold'
        from database_functions.telegram_listing_db import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("PRAGMA table_info(TelegramListing)")
        columns = [row[1] for row in cursor.fetchall()]
        has_status = 'status' in columns
        
        if has_status:
            cursor.execute("""
                UPDATE TelegramListing
                SET status = 'sold',
                    updatedAt = ?
                WHERE id = ?
            """, (datetime.now(), listing_id))
            conn.commit()
        
        conn.close()
        
        await callback.answer("✅ Оголошення позначено як продане та видалено з каналу")
        
        # Повертаємо до списку оголошень
        await back_to_my_listings(callback)
        
    except Exception as e:
        print(f"Error marking listing as sold: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer("❌ Помилка при позначенні оголошення", show_alert=True)


@router.callback_query(F.data.startswith("confirm_delete_"))
async def confirm_delete(callback: types.CallbackQuery):
    """Показує підтвердження перед видаленням"""
    user_id = callback.from_user.id
    listing_id = int(callback.data.split("_")[-1])
    
    listing = get_telegram_listing_by_id(listing_id)
    if not listing or listing.get('sellerTelegramId') != user_id:
        await callback.answer("❌ Оголошення не знайдено", show_alert=True)
        return
    
    title = listing.get('title', 'Оголошення')
    
    confirmation_text = f"""⚠️ <b>Підтвердження видалення</b>

Ви впевнені, що хочете видалити оголошення "<b>{title}</b>"?

Оголошення буде видалено з каналу та прибрано з вашого списку. Цю дію неможливо скасувати."""
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="🗑️ Так, видалити",
                callback_data=f"delete_listing_{listing_id}"
            )
        ],
        [
            InlineKeyboardButton(
                text="❌ Скасувати",
                callback_data=f"view_telegram_listing_{listing_id}"
            )
        ]
    ])
    
    try:
        await callback.message.edit_text(
            confirmation_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    except:
        await callback.message.answer(
            confirmation_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    
    await callback.answer()


@router.callback_query(F.data.startswith("delete_listing_"))
async def delete_listing(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    try:
        listing_id = int(callback.data.split("_")[-1])
        listing = get_telegram_listing_by_id(listing_id)
        
        if not listing:
            await callback.answer("❌ Оголошення не знайдено", show_alert=True)
            return
        
        if listing.get('sellerTelegramId') != user_id:
            await callback.answer("❌ Це не ваше оголошення", show_alert=True)
            return
        
        # Видаляємо з каналу
        moderation_manager = ModerationManager(bot)
        await moderation_manager.delete_from_channel(listing_id)
        
        # Оновлюємо статус на 'deleted'
        from database_functions.telegram_listing_db import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("PRAGMA table_info(TelegramListing)")
        columns = [row[1] for row in cursor.fetchall()]
        has_status = 'status' in columns
        
        if has_status:
            cursor.execute("""
                UPDATE TelegramListing
                SET status = 'deleted',
                    updatedAt = ?
                WHERE id = ?
            """, (datetime.now(), listing_id))
            conn.commit()
        
        conn.close()
        
        await callback.answer("✅ Оголошення видалено та прибрано з каналу")
        
        # Повертаємо до списку оголошень
        await back_to_my_listings(callback)
        
    except Exception as e:
        print(f"Error deleting listing: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer("❌ Помилка при видаленні оголошення", show_alert=True)
