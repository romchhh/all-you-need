import json
import re
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.filters import Command

from utils.translations import t
from states.client_states import CreateListing
from keyboards.client_keyboards import (
    get_categories_keyboard,
    get_listing_confirmation_keyboard,
    get_main_menu_keyboard,
    get_publication_tariff_keyboard,
    get_payment_method_keyboard,
    get_german_cities_keyboard,
    get_continue_photos_keyboard,
    get_edit_listing_keyboard,
    get_category_translation
)
from database_functions.telegram_listing_db import (
    get_user_id_by_telegram_id,
    create_telegram_listing,
    get_categories,
    get_user_telegram_listings,
    get_telegram_listing_by_id,
    update_telegram_listing_publication_tariff
)
from database_functions.client_db import check_user, get_user_balance, deduct_user_balance
from utils.moderation_manager import ModerationManager
from utils.monopay_functions import create_publication_payment_link
from main import bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, InputMediaPhoto, FSInputFile
import os
from datetime import datetime, timedelta


router = Router()

MAX_PHOTOS = 10
MAX_TITLE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 600


@router.message(F.text.in_([
    "➕ Додати оголошення",  # UK
    "➕ Добавить объявление"  # RU
]))
async def start_create_listing(message: types.Message, state: FSMContext):      
    user_id = message.from_user.id
    
    if not check_user(user_id):
        await message.answer("<b>⚠️ Будь ласка, спочатку зареєструйтесь:</b> /start", parse_mode="HTML")
        return
    
    await state.set_state(CreateListing.waiting_for_title)
    
    # Відправляємо початкове повідомлення з кнопкою "Скасувати" (не видаляється)
    initial_message = await message.answer(
        t(user_id, 'create_listing.start'),
        parse_mode="HTML",
        reply_markup=types.ReplyKeyboardMarkup(
            keyboard=[[types.KeyboardButton(text=t(user_id, 'create_listing.cancel'))]],
            resize_keyboard=True
        )
    )
    
    # Зберігаємо ID повідомлення для можливого видалення
    sent_message = await message.answer(
        t(user_id, 'create_listing.title_prompt'),
        parse_mode="HTML"
        )
    await state.update_data(
        last_message_id=sent_message.message_id,
        initial_message_id=initial_message.message_id  # Зберігаємо ID початкового повідомлення (не видаляємо)
    )


@router.message(CreateListing.waiting_for_title)
async def process_title(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    title = message.text.strip()
    
    if not title or len(title) < 3:
        await message.answer("<b>❌ Назва повинна містити мінімум 3 символи.</b>\n\nСпробуйте ще раз:", parse_mode="HTML")
        return
    
    if len(title) > MAX_TITLE_LENGTH:
        excess = len(title) - MAX_TITLE_LENGTH
        await message.answer(
            t(user_id, 'create_listing.title_max_length', 
              max_length=MAX_TITLE_LENGTH, 
              current_length=len(title), 
              excess=excess),
            parse_mode="HTML"
        )
        return
    
    await state.update_data(title=title)
    
    # Перевіряємо, чи це редагування (є дані про інші поля)
    data = await state.get_data()
    is_editing = data.get('description') is not None or data.get('category_name') is not None
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        try:
            await message.delete()
        except:
            pass
        await show_preview(user_id, state, message=message)
        return
    
    # Якщо створюємо нове, переходимо до наступного кроку
    await state.set_state(CreateListing.waiting_for_description)
    
    # Видаляємо попереднє повідомлення про назву (промпт) та повідомлення користувача
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    # Видаляємо повідомлення користувача з назвою
    try:
        await message.delete()
    except:
        pass
    
    sent_message = await message.answer(
        t(user_id, 'create_listing.description_prompt'),
        parse_mode="HTML"
    )
    await state.update_data(last_message_id=sent_message.message_id)


@router.message(CreateListing.waiting_for_description)
async def process_description(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    description = message.text.strip()
    
    if not description or len(description) < 10:
        await message.answer("<b>❌ Опис повинен містити мінімум 10 символів.</b>\n\nСпробуйте ще раз:", parse_mode="HTML")
        return
    
    if len(description) > MAX_DESCRIPTION_LENGTH:
        excess = len(description) - MAX_DESCRIPTION_LENGTH
        await message.answer(
            t(user_id, 'create_listing.description_max_length',
              max_length=MAX_DESCRIPTION_LENGTH,
              current_length=len(description),
              excess=excess),
            parse_mode="HTML"
        )
        return
    
    await state.update_data(description=description)
    
    # Перевіряємо, чи це редагування
    data = await state.get_data()
    is_editing = data.get('category_name') is not None or data.get('location') is not None
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        try:
            await message.delete()
        except:
            pass
        await show_preview(user_id, state, message=message)
        return
    
    # Якщо створюємо нове, переходимо до наступного кроку
    await state.set_state(CreateListing.waiting_for_photos)
    await state.update_data(photos=[], media_group_limit_notified=[])
    
    # Видаляємо попереднє повідомлення про опис (промпт) та повідомлення користувача
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    # Видаляємо повідомлення користувача з описом
    try:
        await message.delete()
    except:
        pass
    
    sent_message = await message.answer(
        t(user_id, 'create_listing.photos_prompt'),
        parse_mode="HTML",
        reply_markup=get_continue_photos_keyboard(user_id)
    )
    await state.update_data(last_message_id=sent_message.message_id)


@router.message(CreateListing.waiting_for_photos, F.photo, F.media_group_id)
async def process_media_group_photo(message: types.Message, state: FSMContext):
    """Обробляє фото з медіа групи - відповідає тільки один раз на всю групу"""
    user_id = message.from_user.id
    data = await state.get_data()
    photos = data.get('photos', [])
    media_group_id = message.media_group_id
    media_group_responses = data.get('media_group_responses', {})
    media_group_limit_notified = set(data.get('media_group_limit_notified', []))
    
    # Перевіряємо ліміт ПЕРЕД додаванням фото
    if len(photos) >= MAX_PHOTOS:
        # Видаляємо фото від користувача
        try:
            await message.delete()
        except:
            pass
        # Відправляємо повідомлення про досягнення ліміту тільки один раз для медіа-групи
        if media_group_id not in media_group_limit_notified:
            media_group_limit_notified.add(media_group_id)
            await state.update_data(media_group_limit_notified=list(media_group_limit_notified))
            # Видаляємо старе повідомлення про фото якщо є
            last_photo_message_id = data.get('last_photo_message_id')
            if last_photo_message_id:
                try:
                    await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
                except:
                    pass
            sent_message = await message.answer(
                t(user_id, 'create_listing.photo_limit_reached'),
                reply_markup=get_continue_photos_keyboard(user_id)
            )
            await state.update_data(last_photo_message_id=sent_message.message_id)
        return
    
    file_id = message.photo[-1].file_id
    photos.append(file_id)
    
    # Перевіряємо чи це перше фото з групи
    if media_group_id not in media_group_responses:
        # Перше фото з групи - зберігаємо інформацію та запускаємо таймер
        media_group_responses[media_group_id] = True
        
        # Видаляємо промпт про фото при першому додаванні
        last_message_id = data.get('last_message_id')
        if last_message_id and len(photos) == 1:
            try:
                await bot.delete_message(chat_id=user_id, message_id=last_message_id)
                await state.update_data(last_message_id=None)  # Очищаємо ID промпта
            except:
                pass
        
        await state.update_data(
            photos=photos,
            media_group_responses=media_group_responses
        )
        
        # Видаляємо фото від користувача
        try:
            await message.delete()
        except:
            pass
        
        # Запускаємо відкладений відповідь
        import asyncio
        asyncio.create_task(delayed_media_group_response(user_id, media_group_id, state))
    else:
        # Наступні фото з тієї ж групи - просто додаємо без відповіді
        await state.update_data(photos=photos)
        # Видаляємо фото від користувача
        try:
            await message.delete()
        except:
            pass


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
        
        # Видаляємо попереднє повідомлення "Фото додано!" якщо є
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
    last_message_id = data.get('last_message_id')  # Промпт про фото
    
    # Перевіряємо ліміт ПЕРЕД додаванням фото
    if len(photos) >= MAX_PHOTOS:
        # Видаляємо фото від користувача
        try:
            await message.delete()
        except:
            pass
        # Видаляємо старе повідомлення про ліміт якщо є
        if last_photo_message_id:
            try:
                await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
            except:
                pass
        # Відправляємо повідомлення про досягнення ліміту
        sent_message = await message.answer(
            t(user_id, 'create_listing.photo_limit_reached'),
            reply_markup=get_continue_photos_keyboard(user_id)
        )
        await state.update_data(last_photo_message_id=sent_message.message_id)
        return
    
    file_id = message.photo[-1].file_id
    photos.append(file_id)
    
    # Видаляємо фото від користувача
    try:
        await message.delete()
    except:
        pass
    
    # Видаляємо промпт про фото при першому додаванні
    if last_message_id and len(photos) == 1:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
            await state.update_data(last_message_id=None)  # Очищаємо ID промпта
        except:
            pass
    
    # Видаляємо старе повідомлення "Фото додано!" якщо є
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
    
    # Якщо фото немає, позначаємо що використовується дефолтне зображення
    if not photos or len(photos) == 0:
        default_photo_path = get_default_photo_path()
        if default_photo_path:
            await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)
    
    # Очищаємо оброблені медіа групи при переході до наступного кроку
    await state.update_data(processed_media_groups={}, media_group_responses={}, media_group_limit_notified=[])
    
    # Видаляємо останнє повідомлення "Фото додано!" при переході до наступного кроку
    data = await state.get_data()
    last_photo_message_id = data.get('last_photo_message_id')
    if last_photo_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
        except:
            pass
    
    # Видаляємо промпт про фото
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    # Перевіряємо, чи це редагування
    is_editing = data.get('category_name') is not None or data.get('location') is not None
    
    await callback.answer()
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        await show_preview(user_id, state, callback=callback)
    else:
        # Якщо створюємо нове, переходимо до наступного кроку
        await process_category_selection(callback.message, state, user_id)


@router.message(CreateListing.waiting_for_photos, F.text == "/skip")
async def skip_photos_handler(message: types.Message, state: FSMContext):   
    user_id = message.from_user.id
    # Видаляємо повідомлення користувача
    try:
        await message.delete()
    except:
        pass
    # Можна пропустити фото - використовується дефолтне зображення
    await message.answer("✅ <b>Фото пропущено.</b> Буде використано стандартне зображення.\n\nНатисніть кнопку 'Продовжити' для продовження.", parse_mode="HTML")


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
    
    await message.answer("📸 <b>Будь ласка, надішліть фото!</b>\n\nВи можете надіслати до 10 фото. Після додавання фото натисніть Продовжити для продовження.", parse_mode="HTML")


async def process_category_selection(message: types.Message, state: FSMContext, user_id: int):
    categories = get_categories()
    
    if not categories:
        await message.answer(f"<b>{t(user_id, 'create_listing.categories_not_found')}</b>", parse_mode="HTML")
        await state.clear()
        return
    
    await state.set_state(CreateListing.waiting_for_category)
    
    # Видаляємо попереднє повідомлення якщо є
    data = await state.get_data()
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass

    print(t(user_id, 'create_listing.category_prompt'))
    print(user_id)
    print(categories)
    
    sent_message = await message.answer(
        t(user_id, 'create_listing.category_prompt'),
        parse_mode="HTML",
        reply_markup=get_categories_keyboard(user_id, categories)
    )
    await state.update_data(last_message_id=sent_message.message_id)


@router.callback_query(F.data.startswith("cat_"), CreateListing.waiting_for_category)
async def process_category(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    category_id = int(callback.data.split("_")[1])
    
    categories = get_categories()
    selected_category = next((c for c in categories if c['id'] == category_id), None)
    
    if not selected_category:
        await callback.answer(t(user_id, 'create_listing.category_not_found'), show_alert=True)
        return
    
    await state.update_data(category_id=category_id, category_name=selected_category['name'])
    
    # Перевіряємо, чи це редагування
    data = await state.get_data()
    is_editing = data.get('location') is not None or data.get('price') is not None
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        await callback.answer()
        await show_preview(user_id, state, callback=callback)
        return
    
    # Якщо створюємо нове, переходимо до наступного кроку
    await state.set_state(CreateListing.waiting_for_price)
    
    # Створюємо клавіатуру з кнопкою "Договірна"
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'create_listing.price_negotiable_button_alt'),
            callback_data="price_negotiable"
        )]
    ])
    
    # Видаляємо попереднє повідомлення якщо є
    data = await state.get_data()
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.price_prompt'),
            parse_mode="HTML",
            reply_markup=keyboard
        )
        await state.update_data(last_message_id=callback.message.message_id)
    except:
        sent_message = await callback.message.answer(
            t(user_id, 'create_listing.price_prompt'),
            parse_mode="HTML",
            reply_markup=keyboard
        )
        await state.update_data(last_message_id=sent_message.message_id)
    
    await callback.answer()


@router.callback_query(F.data == "price_negotiable", CreateListing.waiting_for_price)
async def process_price_negotiable(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    
    # Зберігаємо "Договірна" як ціну (використовуємо переклад)
    negotiable_text = t(user_id, 'moderation.negotiable')
    await state.update_data(price=negotiable_text, isNegotiable=True)
    
    # Перевіряємо, чи це редагування
    data = await state.get_data()
    is_editing = data.get('location') is not None
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        await callback.answer(t(user_id, 'create_listing.price_negotiable_set'))
        await show_preview(user_id, state, callback=callback)
        return
    
    # Якщо створюємо нове, переходимо до наступного кроку
    await state.set_state(CreateListing.waiting_for_location)
    
    await callback.message.edit_text(
        t(user_id, 'create_listing.location_prompt'),
        parse_mode="HTML",
        reply_markup=get_german_cities_keyboard(user_id)
    )
    await callback.answer(t(user_id, 'create_listing.price_negotiable_set'))


@router.message(CreateListing.waiting_for_price)
async def process_price(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    text = message.text.replace(',', '.').strip()
    
    # Перевіряємо чи це діапазон ціни (наприклад "50-100" або "50 - 100")
    if '-' in text:
        try:
            parts = [p.strip() for p in text.split('-')]
            if len(parts) == 2:
                price_min = float(parts[0])
                price_max = float(parts[1])
                if price_min < 0 or price_max < 0:
                    raise ValueError("Ціна не може бути від'ємною")
                if price_min > price_max:
                    raise ValueError("Мінімальна ціна не може бути більшою за максимальну")
                # Зберігаємо як рядок діапазону
                price = f"{price_min}-{price_max}"
                await state.update_data(price=price, priceMin=price_min, priceMax=price_max)
                
                # Перевіряємо, чи це редагування
                data = await state.get_data()
                is_editing = data.get('location') is not None
                
                if is_editing:
                    # Якщо редагуємо, повертаємося до preview
                    try:
                        await message.delete()
                    except:
                        pass
                    await show_preview(user_id, state, message=message)
                    return
                
                # Якщо створюємо нове, переходимо до наступного кроку
                await state.set_state(CreateListing.waiting_for_location)
                
                # Видаляємо попереднє повідомлення якщо є
                last_message_id = data.get('last_message_id')
                if last_message_id:
                    try:
                        await bot.delete_message(chat_id=user_id, message_id=last_message_id)
                    except:
                        pass
                
                sent_message = await message.answer(
                    t(user_id, 'create_listing.location_prompt'),
                    parse_mode="HTML",
                    reply_markup=get_german_cities_keyboard(user_id)
                )
                await state.update_data(last_message_id=sent_message.message_id)
                return
        except ValueError as e:
            await message.answer(t(user_id, 'create_listing.price_invalid'))
            return
    
    # Якщо не діапазон, обробляємо як звичайну ціну
    try:
        price = float(text)
        if price < 0:
            raise ValueError("Ціна не може бути від'ємною")
    except ValueError:
        await message.answer(t(user_id, 'create_listing.price_invalid'))
        return
    
    await state.update_data(price=price)
    
    # Перевіряємо, чи це редагування
    data = await state.get_data()
    is_editing = data.get('location') is not None
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        try:
            await message.delete()
        except:
            pass
        await show_preview(user_id, state, message=message)
        return
    
    # Якщо створюємо нове, переходимо до наступного кроку
    await state.set_state(CreateListing.waiting_for_location)
    
    # Видаляємо попереднє повідомлення якщо є
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    sent_message = await message.answer(
        t(user_id, 'create_listing.location_prompt'),
        parse_mode="HTML",
        reply_markup=get_german_cities_keyboard(user_id)
    )
    await state.update_data(last_message_id=sent_message.message_id)




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
        f"<b>{t(user_id, 'menu.main_menu')}</b>",
        reply_markup=get_main_menu_keyboard(user_id),
        parse_mode="HTML"
    )


@router.callback_query(F.data.startswith("city_"), CreateListing.waiting_for_location)
async def process_city_selection(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    
    # Отримуємо назву міста з callback_data
    city_name = callback.data.replace("city_", "")
    
    await state.update_data(location=city_name)
    
    # Перевіряємо, чи це редагування (якщо вже є всі дані)
    data = await state.get_data()
    is_editing = data.get('title') is not None and data.get('description') is not None and data.get('category_name') is not None
    
    await callback.answer()
    
    if is_editing:
        # Якщо редагуємо, повертаємося до preview
        await show_preview(user_id, state, callback=callback)
    else:
        # Якщо створюємо нове, показуємо preview
        await show_preview(user_id, state, callback=callback)


@router.message(CreateListing.waiting_for_location)
async def process_location(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    # Перевіряємо чи це кнопка "Скасувати"
    cancel_text = t(user_id, 'create_listing.cancel')
    if message.text and message.text == cancel_text:
        await state.clear()
        await message.answer(
            t(user_id, 'create_listing.cancelled'),
            parse_mode="HTML",
            reply_markup=get_main_menu_keyboard(user_id)
        )
        return
    
    if not message.text:
        return
    
    location = message.text.strip()
    
    if not location or len(location) < 2:
        await message.answer("<b>❌ Місто повинно містити мінімум 2 символи.</b>\n\nСпробуйте ще раз:", reply_markup=get_german_cities_keyboard(user_id), parse_mode="HTML")
        return
    
    # Видаляємо повідомлення користувача з локацією
    try:
        await message.delete()
    except:
        pass
    
    await state.update_data(location=location)
    
    # Видаляємо попереднє повідомлення про локацію (промпт) якщо є
    data = await state.get_data()
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    # Показуємо preview (працює і для створення, і для редагування)
    try:
        await message.delete()
    except:
        pass
    await show_preview(user_id, state, message=message)


def capitalize_first_letter(text: str) -> str:
    """Робить першу літеру великою, якщо вона не велика"""
    if not text:
        return text
    return text[0].upper() + text[1:] if len(text) > 1 else text.upper()


def get_default_photo_path() -> str:
    """Повертає шлях до дефолтного зображення"""
    default_image_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'Content', 'tgground.jpg')
    
    # Перевіряємо чи файл існує
    if not os.path.exists(default_image_path):
        print(f"Default image not found at: {default_image_path}")
        return None
    
    return default_image_path


def build_preview(user_id: int, data: dict) -> str:
    # Автоматично робимо першу літеру великою для назви та опису
    title = capitalize_first_letter(data.get('title', ''))
    description = capitalize_first_letter(data.get('description', ''))
    
    preview = t(user_id, 'create_listing.preview')
    preview += t(user_id, 'create_listing.preview_title').format(title=title)
    preview += t(user_id, 'create_listing.preview_description').format(description=description)
    
    category_text = data.get('category_name', '')
    # Використовуємо переклад категорії
    category_text = get_category_translation(user_id, category_text)
    preview += t(user_id, 'create_listing.preview_category').format(category=category_text)
    
    # Форматуємо ціну для відображення
    price_display = data.get('price', 0)
    negotiable_text = t(user_id, 'moderation.negotiable')
    
    if isinstance(price_display, str):
        # Перевіряємо обидві мови для "Договірна"
        if price_display == negotiable_text or price_display == "Договірна" or price_display == "Договорная":
            price_display = negotiable_text
        elif '-' in price_display:
            # Діапазон ціни - вже містить формат "50-100"
            price_display = f"{price_display} EUR"
        else:
            # Звичайна ціна як рядок
            price_display = f"{price_display} EUR"
    else:
        # Числова ціна
        price_display = f"{price_display} EUR"
    
    # Використовуємо спеціальний формат для "Договірна"
    if price_display == negotiable_text:
        preview += t(user_id, 'create_listing.preview_price_negotiable').format(price=negotiable_text)
    else:
        preview += t(user_id, 'create_listing.preview_price').format(price=price_display.replace(' EUR', ''))
    # Убрано preview_condition - не показуємо стан для послуг
    preview += t(user_id, 'create_listing.preview_location').format(location=data.get('location', ''))
    
    # Видалено preview_photos - не показуємо кількість фото
    
    return preview


@router.callback_query(F.data == "confirm_listing", CreateListing.waiting_for_confirmation)
async def confirm_listing(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    data = await state.get_data()
    
    photos = data.get('photos', [])
    # Якщо фото немає, перевіряємо чи є дефолтне зображення
    if not photos or len(photos) == 0:
        default_photo_path = get_default_photo_path()
        if not default_photo_path:
            await callback.answer("❌ Помилка: не вдалося знайти дефолтне зображення!", show_alert=True)
            return
        # Позначаємо що використовується дефолтне фото (шлях буде використаний при публікації)
        await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)
    
    db_user_id = get_user_id_by_telegram_id(user_id)
    if not db_user_id:
        await callback.answer("❌ Помилка: користувач не знайдений", show_alert=True)
        await state.clear()
        return
    
    try:
        # Автоматично робимо першу літеру великою для назви та опису
        title = capitalize_first_letter(data['title'])
        description = capitalize_first_letter(data['description'])
        
        # Обробляємо ціну: може бути число, діапазон або "Договірна"
        price_value = data.get('price', 0)
        is_negotiable = data.get('isNegotiable', False)
        price_display = None  # Оригінальне значення для відображення
        negotiable_text = t(user_id, 'moderation.negotiable')
        
        if isinstance(price_value, str):
            # Перевіряємо обидві мови для "Договірна"
            if price_value == negotiable_text or price_value == "Договірна" or price_value == "Договорная" or is_negotiable:
                # Для "Договірна" зберігаємо як 0, але зберігаємо оригінальне значення
                price_display = negotiable_text
                price_value = 0
            elif '-' in price_value:
                # Для діапазону беремо мінімальне значення для сортування, але зберігаємо діапазон
                try:
                    parts = price_value.split('-')
                    price_min = float(parts[0].strip())
                    price_max = float(parts[1].strip())
                    price_display = f"{price_min}-{price_max}"  # Зберігаємо діапазон для відображення
                    price_value = price_min  # Зберігаємо мінімальну ціну для сортування
                except:
                    price_value = 0
        else:
            price_value = float(price_value) if price_value else 0
        
        listing_id = create_telegram_listing(
            user_id=db_user_id,
            title=title,
            description=description,
            price=price_value,
            currency='EUR',
            category=data['category_name'],
            subcategory=None,
            condition='service',  # Для послуг завжди 'service'
            location=data.get('location', t(user_id, 'moderation.not_specified')),
            images=photos,
            price_display=price_display  # Передаємо оригінальне значення
        )
        
        # Зберігаємо listing_id в стані для подальшого використання
        await state.update_data(listing_id=listing_id)
        
        # Переходимо до вибору тарифу публікації
        await state.set_state(CreateListing.waiting_for_publication_tariff)
        
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except:
            pass
        
        # Отримуємо баланс користувача
        user_balance = get_user_balance(user_id)
        
        # Ініціалізуємо список вибраних тарифів (базова публікація завжди включена)
        await state.update_data(selected_tariffs=['standard'])
        
        tariff_text = f"""{t(user_id, 'tariffs.select_title')}

{t(user_id, 'tariffs.standard_title')}
{t(user_id, 'tariffs.standard_desc')}

{t(user_id, 'tariffs.additional_options')}

{t(user_id, 'tariffs.highlighted_title')}
{t(user_id, 'tariffs.highlighted_desc')}

{t(user_id, 'tariffs.pinned_12h_title')}
{t(user_id, 'tariffs.pinned_12h_desc')}

{t(user_id, 'tariffs.pinned_24h_title')}
{t(user_id, 'tariffs.pinned_24h_desc')}

{t(user_id, 'tariffs.story_title')}
{t(user_id, 'tariffs.story_desc')}

{t(user_id, 'tariffs.default_note')}

{t(user_id, 'tariffs.your_balance', balance=user_balance)}
"""
        
        await callback.message.answer(
            tariff_text,
            parse_mode="HTML",
            reply_markup=get_publication_tariff_keyboard(user_id, ['standard'])
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


async def show_preview(user_id: int, state: FSMContext, message: types.Message = None, callback: types.CallbackQuery = None):
    """Показує preview оголошення з кнопками підтвердження"""
    data = await state.get_data()
    preview_text = build_preview(user_id, data)
    photos = data.get('photos', [])
    
    await state.set_state(CreateListing.waiting_for_confirmation)
    
    # Якщо фото немає, використовуємо дефолтне зображення
    use_default_photo = False
    if not photos or len(photos) == 0:
        default_photo_path = get_default_photo_path()
        if default_photo_path:
            use_default_photo = True
            # Зберігаємо маркер, що використовується дефолтне фото
            await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)
    
    target_message = callback.message if callback else message
    
    if photos and len(photos) > 0:
        if len(photos) == 1:
            # Для одного фото
            if callback:
                try:
                    await callback.message.delete()
                except:
                    pass
                await callback.message.answer_photo(
                    photo=photos[0],
                    caption=preview_text,
                    parse_mode="HTML"
                )
            else:
                await message.answer_photo(
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
            
            if callback:
                try:
                    await callback.message.delete()
                except:
                    pass
                await callback.message.answer_media_group(media=media)
            else:
                await message.answer_media_group(media=media)
    elif use_default_photo:
        # Використовуємо дефолтне фото безпосередньо з FSInputFile
        default_photo_path = get_default_photo_path()
        if default_photo_path:
            photo_file = FSInputFile(default_photo_path)
            if callback:
                try:
                    await callback.message.delete()
                except:
                    pass
                await callback.message.answer_photo(
                    photo=photo_file,
                    caption=preview_text,
                    parse_mode="HTML"
                )
            else:
                await message.answer_photo(
                    photo=photo_file,
                    caption=preview_text,
                    parse_mode="HTML"
                )
    
    # Відправляємо окреме повідомлення з кнопками підтвердження
    if callback:
        await callback.message.answer(
            t(user_id, 'create_listing.preview_confirm'),
            parse_mode="HTML",
            reply_markup=get_listing_confirmation_keyboard(user_id)
        )
        await callback.answer()
    else:
        await message.answer(
            t(user_id, 'create_listing.preview_confirm'),
            parse_mode="HTML",
            reply_markup=get_listing_confirmation_keyboard(user_id)
        )


@router.callback_query(F.data == "edit_listing_preview", CreateListing.waiting_for_confirmation)
async def edit_listing_preview(callback: types.CallbackQuery, state: FSMContext):
    """Показує клавіатуру для вибору поля для редагування"""
    user_id = callback.from_user.id
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.edit_select_field'),
            parse_mode="HTML",
            reply_markup=get_edit_listing_keyboard(user_id)
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.edit_select_field'),
            parse_mode="HTML",
            reply_markup=get_edit_listing_keyboard(user_id)
        )
    await callback.answer()


@router.callback_query(F.data == "back_to_preview", CreateListing.waiting_for_confirmation)
async def back_to_preview(callback: types.CallbackQuery, state: FSMContext):
    """Повертає до preview після редагування"""
    user_id = callback.from_user.id
    await show_preview(user_id, state, callback=callback)


@router.callback_query(F.data == "edit_field_title", CreateListing.waiting_for_confirmation)
async def edit_field_title(callback: types.CallbackQuery, state: FSMContext):
    """Починає редагування назви"""
    user_id = callback.from_user.id
    await state.set_state(CreateListing.waiting_for_title)
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.title_prompt'),
            parse_mode="HTML"
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.title_prompt'),
            parse_mode="HTML"
        )
    await callback.answer()


@router.callback_query(F.data == "edit_field_description", CreateListing.waiting_for_confirmation)
async def edit_field_description(callback: types.CallbackQuery, state: FSMContext):
    """Починає редагування опису"""
    user_id = callback.from_user.id
    await state.set_state(CreateListing.waiting_for_description)
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.description_prompt'),
            parse_mode="HTML"
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.description_prompt'),
            parse_mode="HTML"
        )
    await callback.answer()


@router.callback_query(F.data == "edit_field_photos", CreateListing.waiting_for_confirmation)
async def edit_field_photos(callback: types.CallbackQuery, state: FSMContext):
    """Починає редагування фото"""
    user_id = callback.from_user.id
    await state.set_state(CreateListing.waiting_for_photos)
    await state.update_data(photos=[], media_group_limit_notified=[])
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.photos_prompt'),
            parse_mode="HTML",
            reply_markup=get_continue_photos_keyboard(user_id)
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.photos_prompt'),
            parse_mode="HTML",
            reply_markup=get_continue_photos_keyboard(user_id)
        )
    await callback.answer()


@router.callback_query(F.data == "edit_field_category", CreateListing.waiting_for_confirmation)
async def edit_field_category(callback: types.CallbackQuery, state: FSMContext):
    """Починає редагування категорії"""
    user_id = callback.from_user.id
    categories = get_categories()
    
    if not categories:
        await callback.answer(t(user_id, 'create_listing.categories_not_found_short'), show_alert=True)
        return
    
    await state.set_state(CreateListing.waiting_for_category)
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.category_prompt'),
            parse_mode="HTML",
            reply_markup=get_categories_keyboard(user_id, categories)
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.category_prompt'),
            parse_mode="HTML",
            reply_markup=get_categories_keyboard(user_id, categories)
        )
    await callback.answer()


@router.callback_query(F.data == "edit_field_price", CreateListing.waiting_for_confirmation)
async def edit_field_price(callback: types.CallbackQuery, state: FSMContext):
    """Починає редагування ціни"""
    user_id = callback.from_user.id
    await state.set_state(CreateListing.waiting_for_price)
    
    # Створюємо клавіатуру з кнопкою "Договірна"
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'create_listing.price_negotiable_button'),
            callback_data="price_negotiable"
        )]
    ])
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.price_prompt'),
            parse_mode="HTML",
            reply_markup=keyboard
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.price_prompt'),
            parse_mode="HTML",
            reply_markup=keyboard
        )
    await callback.answer()


@router.callback_query(F.data == "edit_field_location", CreateListing.waiting_for_confirmation)
async def edit_field_location(callback: types.CallbackQuery, state: FSMContext):
    """Починає редагування міста"""
    user_id = callback.from_user.id
    await state.set_state(CreateListing.waiting_for_location)
    
    try:
        await callback.message.edit_text(
            t(user_id, 'create_listing.location_prompt'),
            parse_mode="HTML",
            reply_markup=get_german_cities_keyboard(user_id)
        )
    except:
        await callback.message.answer(
            t(user_id, 'create_listing.location_prompt'),
            parse_mode="HTML",
            reply_markup=get_german_cities_keyboard(user_id)
        )
    await callback.answer()


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
        f"<b>{t(user_id, 'menu.main_menu')}</b>",
        reply_markup=get_main_menu_keyboard(user_id),
        parse_mode="HTML"
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
        title = listing.get('title', t(user_id, 'moderation.no_title'))
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
        description = listing.get('description', t(user_id, 'moderation.no_description'))
        price = listing.get('price', 0)
        currency = listing.get('currency', 'EUR')
        category = listing.get('category', t(user_id, 'moderation.not_specified'))
        subcategory = listing.get('subcategory')
        condition = listing.get('condition', t(user_id, 'moderation.not_specified'))
        location = listing.get('location', t(user_id, 'moderation.not_specified'))
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
        message_text += f"{t(user_id, 'listing.details.description')} {description[:500]}{'...' if len(description) > 500 else ''}\n\n"
        message_text += f"{t(user_id, 'listing.details.price')} {price} {currency}\n"
        message_text += f"{t(user_id, 'listing.details.category')} {category}"
        if subcategory:
            message_text += f" / {subcategory}"
        message_text += f"\n"
        message_text += f"{t(user_id, 'listing.details.location')} {location}\n"
        message_text += f"{t(user_id, 'listing.details.status')} {status_text}\n"
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
                    message_text += f"{t(user_id, 'listing.details.created')} {formatted_date}\n"
                else:
                    # Якщо не вдалося розпарсити, виводимо як є
                    message_text += f"{t(user_id, 'listing.details.created')} {created_at}\n"
            except Exception as e:
                # Якщо не вдалося розпарсити, виводимо як є
                message_text += f"{t(user_id, 'listing.details.created')} {created_at}\n"
        
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
                        text=t(user_id, 'my_listings.view_in_channel'),
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
                            text=t(user_id, 'my_listings.refresh_button'),
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
                                text=t(user_id, 'my_listings.refresh_available_in', minutes=minutes_left),
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
                    text=t(user_id, 'my_listings.mark_sold_button'),
                    callback_data=f"confirm_mark_sold_{listing_id}"
                ),
                InlineKeyboardButton(
                    text=t(user_id, 'my_listings.delete_button'),
                    callback_data=f"confirm_delete_{listing_id}"
                )
            ])
        
        keyboard_buttons.append([
            InlineKeyboardButton(
                text=t(user_id, 'my_listings.back_to_list'),
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
                    text=t(user_id, 'payment.refresh_button'),
                    url=payment_url
                )
            ]
        ])
        
        payment_text = f"""{t(user_id, 'payment.refresh_title')}

{t(user_id, 'payment.refresh_amount')}

{t(user_id, 'payment.refresh_instruction')}

{t(user_id, 'payment.refresh_note')}"""
        
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
        await callback.answer(t(user_id, 'payment.refresh_error'), show_alert=True)


@router.callback_query(F.data == "tariff_base_locked", CreateListing.waiting_for_publication_tariff)
async def tariff_base_locked(callback: types.CallbackQuery):
    """Обробник для заблокованої базової публікації"""
    user_id = callback.from_user.id
    await callback.answer(t(user_id, 'tariffs.base_locked'), show_alert=True)


@router.callback_query(F.data.startswith("tariff_toggle_"), CreateListing.waiting_for_publication_tariff)
async def toggle_tariff_selection(callback: types.CallbackQuery, state: FSMContext):
    """Перемикає вибір тарифу (додає/прибирає з вибраних)"""
    user_id = callback.from_user.id
    data = await state.get_data()
    listing_id = data.get('listing_id')
    
    if not listing_id:
        await callback.answer("❌ Помилка: оголошення не знайдено", show_alert=True)
        await state.clear()
        return
    
    tariff_type = callback.data.replace("tariff_toggle_", "")
    
    # Не дозволяємо зняти базову публікацію
    if tariff_type == 'standard':
        await callback.answer("📌 Базова публікація обов'язкова та не може бути знята", show_alert=True)
        return
    
    # Визначаємо ціни тарифів (додаткова вартість для рекламних)
    tariff_prices = {
        'standard': 0.0,  # Базова публікація (безкоштовно)
        'highlighted': 1.5,  # Додаткова вартість
        'pinned_12h': 2.5,  # Додаткова вартість
        'pinned_24h': 4.5,  # Додаткова вартість
        'story': 5.0  # Додаткова вартість
    }
    
    if tariff_type not in tariff_prices:
        await callback.answer(f"❌ {t(user_id, 'tariffs.invalid')}", show_alert=True)
        return
    
    # Отримуємо поточний список вибраних тарифів
    selected_tariffs = data.get('selected_tariffs', [])
    if not isinstance(selected_tariffs, list):
        selected_tariffs = []
    
    # Завжди включаємо базову публікацію
    if 'standard' not in selected_tariffs:
        selected_tariffs.append('standard')
    
    # Перемикаємо вибір
    if tariff_type in selected_tariffs:
        selected_tariffs.remove(tariff_type)
        tariff_names = {
            'highlighted': t(user_id, 'tariffs.highlighted_name'),
            'pinned_12h': t(user_id, 'tariffs.pinned_12h_name'),
            'pinned_24h': t(user_id, 'tariffs.pinned_24h_name'),
            'story': t(user_id, 'tariffs.story_name')
        }
        await callback.answer(f"❌ {tariff_names.get(tariff_type, tariff_type)} {t(user_id, 'tariffs.removed')}")
    else:
        # Якщо вибирається pinned_24h, видаляємо pinned_12h і навпаки (взаємовиключні)
        if tariff_type == 'pinned_24h' and 'pinned_12h' in selected_tariffs:
            selected_tariffs.remove('pinned_12h')
        elif tariff_type == 'pinned_12h' and 'pinned_24h' in selected_tariffs:
            selected_tariffs.remove('pinned_24h')
        
        selected_tariffs.append(tariff_type)
        tariff_names = {
            'highlighted': t(user_id, 'tariffs.highlighted_name'),
            'pinned_12h': t(user_id, 'tariffs.pinned_12h_name'),
            'pinned_24h': t(user_id, 'tariffs.pinned_24h_name'),
            'story': t(user_id, 'tariffs.story_name')
        }
        await callback.answer(f"✅ {tariff_names.get(tariff_type, tariff_type)} {t(user_id, 'tariffs.added')}")
    
    # Оновлюємо список у стані
    await state.update_data(selected_tariffs=selected_tariffs)
    
    # Отримуємо баланс користувача
    user_balance = get_user_balance(user_id)
    
    # Перераховуємо загальну суму (базова + додаткові)
    base_price = tariff_prices['standard']
    additional_price = sum(tariff_prices[t] for t in selected_tariffs if t != 'standard' and t in tariff_prices)
    total_amount = base_price + additional_price
    
    # Формуємо рядок з загальною сумою
    if total_amount == 0:
        total_amount_text = re.sub(r'0\.00€|0€', t(user_id, 'common.free'), t(user_id, 'tariffs.total_amount', amount=total_amount))
    else:
        total_amount_text = t(user_id, 'tariffs.total_amount', amount=total_amount)
    
    # Оновлюємо повідомлення
    tariff_text = f"""{t(user_id, 'tariffs.select_title')}

{t(user_id, 'tariffs.standard_title')}
{t(user_id, 'tariffs.standard_desc')}

{t(user_id, 'tariffs.additional_options')}

{t(user_id, 'tariffs.highlighted_title')}
{t(user_id, 'tariffs.highlighted_desc')}

{t(user_id, 'tariffs.pinned_12h_title')}
{t(user_id, 'tariffs.pinned_12h_desc')}

{t(user_id, 'tariffs.pinned_24h_title')}
{t(user_id, 'tariffs.pinned_24h_desc')}

{t(user_id, 'tariffs.story_title')}
{t(user_id, 'tariffs.story_desc')}

{t(user_id, 'tariffs.default_note')}

{t(user_id, 'tariffs.your_balance', balance=user_balance)}
{total_amount_text}"""
    
    try:
        await callback.message.edit_text(
            tariff_text,
            parse_mode="HTML",
            reply_markup=get_publication_tariff_keyboard(user_id, selected_tariffs)
        )
    except:
        await callback.message.answer(
            tariff_text,
            parse_mode="HTML",
            reply_markup=get_publication_tariff_keyboard(user_id, selected_tariffs)
        )


@router.callback_query(F.data == "tariff_confirm", CreateListing.waiting_for_publication_tariff)
async def confirm_tariff_selection(callback: types.CallbackQuery, state: FSMContext):
    """Підтверджує вибір тарифів та переходить до вибору способу оплати"""
    user_id = callback.from_user.id
    data = await state.get_data()
    listing_id = data.get('listing_id')
    selected_tariffs = data.get('selected_tariffs', [])
    
    if not listing_id:
        await callback.answer("❌ Помилка: оголошення не знайдено", show_alert=True)
        await state.clear()
        return
    
    # Завжди включаємо базову публікацію
    if 'standard' not in selected_tariffs:
        selected_tariffs.append('standard')
    
    if not selected_tariffs or len(selected_tariffs) == 0:
        await callback.answer(t(user_id, 'tariffs.base_not_found'), show_alert=True)
        return
    
    # Визначаємо ціни тарифів (додаткова вартість для рекламних)
    tariff_prices = {
        'standard': 0.0,  # Базова публікація (безкоштовно)
        'highlighted': 1.5,  # Додаткова вартість
        'pinned_12h': 2.5,  # Додаткова вартість
        'pinned_24h': 4.5,  # Додаткова вартість
        'story': 5.0  # Додаткова вартість
    }
    
    tariff_names = {
        'standard': t(user_id, 'tariffs.standard_name'),
        'highlighted': t(user_id, 'tariffs.highlighted_name'),
        'pinned_12h': t(user_id, 'tariffs.pinned_12h_name'),
        'pinned_24h': t(user_id, 'tariffs.pinned_24h_name'),
        'story': t(user_id, 'tariffs.story_name')
    }
    
    # Розраховуємо загальну суму (базова + додаткові)
    base_price = tariff_prices['standard']
    additional_price = sum(tariff_prices[t] for t in selected_tariffs if t != 'standard' and t in tariff_prices)
    total_amount = base_price + additional_price
    
    # Зберігаємо тарифи як JSON у БД
    import json
    tariffs_json = json.dumps(selected_tariffs)
    
    # Якщо сума 0 (тільки базова публікація), одразу відправляємо на модерацію
    if total_amount == 0:
        update_telegram_listing_publication_tariff(listing_id, tariffs_json, 'paid')
        await state.clear()
        
        # Відправляємо на модерацію
        moderation_manager = ModerationManager(bot)
        await moderation_manager.send_listing_to_moderation(
            listing_id=listing_id,
            source='telegram'
        )
        
        # Видаляємо клавіатуру з попереднього повідомлення
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except:
            pass
        
        # Відправляємо нове повідомлення з головним меню
        await callback.message.answer(
            t(user_id, 'payment.balance_success_message'),
            parse_mode="HTML",
            reply_markup=get_main_menu_keyboard(user_id)
        )
        await callback.answer()
        return
    
    # Якщо є додаткові тарифи, створюємо платіж
    update_telegram_listing_publication_tariff(listing_id, tariffs_json, 'pending')
    
    # Створюємо платіжне посилання для картки
    # Для множинних тарифів передаємо JSON рядок як tariff_type
    payment_result = create_publication_payment_link(
        user_id=user_id,
        listing_id=listing_id,
        tariff_type=tariffs_json,
        amount=total_amount
    )
    
    payment_url = None
    if payment_result.get('success'):
        payment_url = payment_result['payment_url']
        await state.update_data(
            selected_tariffs=selected_tariffs,
            tariff_amount=total_amount,
            payment_invoice_id=payment_result['invoice_id'],
            payment_local_id=payment_result['local_payment_id']
        )
    else:
        await state.update_data(selected_tariffs=selected_tariffs, tariff_amount=total_amount)
    
    await state.set_state(CreateListing.waiting_for_payment_method)
    
    # Отримуємо баланс користувача
    user_balance = get_user_balance(user_id)
    
    # Формуємо список вибраних тарифів для відображення
    tariff_names_display = {
        'standard': t(user_id, 'tariffs.standard_name'),
        'highlighted': t(user_id, 'tariffs.highlighted_name'),
        'pinned_12h': t(user_id, 'tariffs.pinned_12h_name'),
        'pinned_24h': t(user_id, 'tariffs.pinned_24h_name'),
        'story': t(user_id, 'tariffs.story_name')
    }
    selected_tariffs_text = []
    for tariff_type in selected_tariffs:
        if tariff_type in tariff_prices:
            if tariff_type == 'standard':
                free_text = t(user_id, 'common.free')
                selected_tariffs_text.append(f"• {tariff_names_display.get(tariff_type, tariff_type)} — {free_text} {t(user_id, 'tariffs.base_label')}")
            else:
                selected_tariffs_text.append(f"• {tariff_names_display.get(tariff_type, tariff_type)} — {tariff_prices.get(tariff_type, 0)}€ {t(user_id, 'tariffs.additional_label')}")
    selected_tariffs_text = "\n".join(selected_tariffs_text)
    
    # Формуємо текст загальної суми - якщо 0, показуємо "Безкоштовно"
    if total_amount == 0:
        total_amount_text = f"💰 <b>{t(user_id, 'payment.total_amount', amount=0).split(':')[0]}:</b> {t(user_id, 'common.free')}"
    else:
        total_amount_text = t(user_id, 'payment.total_amount', amount=total_amount)
    
    payment_method_text = f"""{t(user_id, 'payment.select_method_title')}

{t(user_id, 'payment.selected_tariffs')}
{selected_tariffs_text}

{t(user_id, 'payment.how_to_pay')}

{total_amount_text}
{t(user_id, 'payment.your_balance', balance=user_balance)}"""
    
    try:
        await callback.message.edit_text(
            payment_method_text,
            parse_mode="HTML",
            reply_markup=get_payment_method_keyboard(user_id, user_balance, total_amount, payment_url)
        )
    except:
        await callback.message.answer(
            payment_method_text,
            parse_mode="HTML",
            reply_markup=get_payment_method_keyboard(user_id, user_balance, total_amount, payment_url)
        )
    
    await callback.answer()


@router.callback_query(F.data == "back_to_tariffs", CreateListing.waiting_for_payment_method)
async def back_to_tariffs_selection(callback: types.CallbackQuery, state: FSMContext):
    """Повертає користувача до вибору тарифів"""
    user_id = callback.from_user.id
    data = await state.get_data()
    listing_id = data.get('listing_id')
    selected_tariffs = data.get('selected_tariffs', [])
    
    if not listing_id:
        await callback.answer("❌ Помилка: оголошення не знайдено", show_alert=True)
        await state.clear()
        return
    
    # Завжди включаємо базову публікацію
    if 'standard' not in selected_tariffs:
        selected_tariffs.append('standard')
    
    # Змінюємо стан на вибір тарифів
    await state.set_state(CreateListing.waiting_for_publication_tariff)
    
    # Отримуємо баланс користувача
    user_balance = get_user_balance(user_id)
    
    # Визначаємо ціни тарифів
    tariff_prices = {
        'standard': 0.0,  # Базова публікація (безкоштовно)
        'highlighted': 1.5,  # Додаткова вартість
        'pinned_12h': 2.5,  # Додаткова вартість
        'pinned_24h': 4.5,  # Додаткова вартість
        'story': 5.0  # Додаткова вартість
    }
    
    # Розраховуємо загальну суму
    base_price = tariff_prices['standard']
    additional_price = sum(tariff_prices[t] for t in selected_tariffs if t != 'standard' and t in tariff_prices)
    total_amount = base_price + additional_price
    
    # Формуємо рядок з загальною сумою
    if total_amount == 0:
        total_amount_text = re.sub(r'0\.00€|0€', t(user_id, 'common.free'), t(user_id, 'tariffs.total_amount', amount=total_amount))
    else:
        total_amount_text = t(user_id, 'tariffs.total_amount', amount=total_amount)
    
    # Формуємо текст для вибору тарифів
    tariff_text = f"""{t(user_id, 'tariffs.select_title')}

{t(user_id, 'tariffs.standard_title')}
{t(user_id, 'tariffs.standard_desc')}

{t(user_id, 'tariffs.additional_options')}

{t(user_id, 'tariffs.highlighted_title')}
{t(user_id, 'tariffs.highlighted_desc')}

{t(user_id, 'tariffs.pinned_12h_title')}
{t(user_id, 'tariffs.pinned_12h_desc')}

{t(user_id, 'tariffs.pinned_24h_title')}
{t(user_id, 'tariffs.pinned_24h_desc')}

{t(user_id, 'tariffs.story_title')}
{t(user_id, 'tariffs.story_desc')}

{t(user_id, 'tariffs.default_note')}

{t(user_id, 'tariffs.your_balance', balance=user_balance)}
{total_amount_text}"""
    
    try:
        await callback.message.edit_text(
            tariff_text,
            parse_mode="HTML",
            reply_markup=get_publication_tariff_keyboard(user_id, selected_tariffs)
        )
    except:
        await callback.message.answer(
            tariff_text,
            parse_mode="HTML",
            reply_markup=get_publication_tariff_keyboard(user_id, selected_tariffs)
        )
    
    await callback.answer()


@router.callback_query(F.data == "payment_balance", CreateListing.waiting_for_payment_method)
async def process_payment_balance(callback: types.CallbackQuery, state: FSMContext):
    """Обробляє оплату з балансу"""
    user_id = callback.from_user.id
    data = await state.get_data()
    listing_id = data.get('listing_id')
    selected_tariffs = data.get('selected_tariffs', [])
    amount = data.get('tariff_amount')
    
    if not listing_id or not selected_tariffs or not amount:
        await callback.answer("❌ Помилка: дані не знайдено", show_alert=True)
        await state.clear()
        return
    
    # Якщо сума 0, не списуємо кошти
    if amount > 0:
        # Перевіряємо баланс
        current_balance = get_user_balance(user_id)
        if current_balance < amount:
            await callback.answer(t(user_id, 'payment.insufficient_balance', required=amount, current=current_balance), show_alert=True)
            return
        
        # Списуємо з балансу
        success = deduct_user_balance(user_id, amount)
        if not success:
            await callback.answer(t(user_id, 'payment.balance_deduction_error'), show_alert=True)
            return
    
    # Оновлюємо тарифи в БД як оплачені (зберігаємо як JSON)
    import json
    tariffs_json = json.dumps(selected_tariffs)
    update_telegram_listing_publication_tariff(listing_id, tariffs_json, 'paid')
    
    # Очищаємо стан
    await state.clear()
    
    tariff_names_display = {
        'standard': t(user_id, 'tariffs.standard_name'),
        'highlighted': t(user_id, 'tariffs.highlighted_name'),
        'pinned_12h': t(user_id, 'tariffs.pinned_12h_name'),
        'pinned_24h': t(user_id, 'tariffs.pinned_24h_name'),
        'story': t(user_id, 'tariffs.story_name')
    }
    
    tariff_prices = {
        'standard': 0.0,  # Базова публікація (безкоштовно)
        'highlighted': 1.5,  # Додаткова вартість
        'pinned_12h': 2.5,  # Додаткова вартість
        'pinned_24h': 4.5,  # Додаткова вартість
        'story': 5.0  # Додаткова вартість
    }
    
    # Формуємо список вибраних тарифів
    selected_tariffs_text = []
    for tariff_type in selected_tariffs:
        if tariff_type in tariff_names_display:
            if tariff_type == 'standard':
                free_text = t(user_id, 'common.free')
                selected_tariffs_text.append(f"• {tariff_names_display.get(tariff_type, tariff_type)} — {free_text} {t(user_id, 'tariffs.base_label')}")
            else:
                selected_tariffs_text.append(f"• {tariff_names_display.get(tariff_type, tariff_type)} — {tariff_prices.get(tariff_type, 0)}€ {t(user_id, 'tariffs.additional_label')}")
    selected_tariffs_text = "\n".join(selected_tariffs_text)
    
    # Відправляємо на модерацію
    try:
        moderation_manager = ModerationManager(bot)
        await moderation_manager.send_listing_to_moderation(
            listing_id=listing_id,
            source='telegram'
        )
        
        new_balance = get_user_balance(user_id)
        # Якщо сума 0, не показуємо інформацію про списання коштів
        if amount == 0:
            success_text = f"""{t(user_id, 'payment.balance_success_title')}

{t(user_id, 'payment.balance_success_tariffs')}
{selected_tariffs_text}

{t(user_id, 'payment.balance_success_message')}"""
        else:
            success_text = f"""{t(user_id, 'payment.balance_success_title')}

{t(user_id, 'payment.balance_success_tariffs')}
{selected_tariffs_text}

{t(user_id, 'payment.balance_success_charged', amount=amount)}
{t(user_id, 'payment.balance_success_remaining', balance=new_balance)}

{t(user_id, 'payment.balance_success_message')}"""
        
        try:
            await callback.message.edit_text(
                success_text,
                parse_mode="HTML",
                reply_markup=get_main_menu_keyboard(user_id)
            )
        except:
            await callback.message.answer(
                success_text,
                parse_mode="HTML",
                reply_markup=get_main_menu_keyboard(user_id)
            )
        
        await callback.answer(t(user_id, 'payment.balance_success_notification'))
        
    except Exception as e:
        print(f"Error processing balance payment: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer("❌ Помилка при обробці оплати", show_alert=True)


@router.callback_query(F.data == "payment_card", CreateListing.waiting_for_payment_method)
async def process_payment_card(callback: types.CallbackQuery, state: FSMContext):
    """Обробляє оплату картою (fallback якщо URL не було створено)"""
    user_id = callback.from_user.id
    data = await state.get_data()
    listing_id = data.get('listing_id')
    selected_tariffs = data.get('selected_tariffs', [])
    amount = data.get('tariff_amount')
    payment_url = data.get('payment_url')
    
    if not listing_id or not selected_tariffs or not amount:
        await callback.answer("❌ Помилка: дані не знайдено", show_alert=True)
        await state.clear()
        return
    
    # Якщо посилання вже є, просто показуємо його
    if payment_url:
        await callback.answer("Натисніть кнопку 'Оплатити картою' для переходу до оплати", show_alert=True)
        return
    
    # Якщо посилання немає, створюємо його
    # Оновлюємо тарифи в БД
    import json
    tariffs_json = json.dumps(selected_tariffs)
    update_telegram_listing_publication_tariff(listing_id, tariffs_json, 'pending')
    
    # Створюємо платіж
    payment_result = create_publication_payment_link(
        user_id=user_id,
        listing_id=listing_id,
        tariff_type=tariffs_json,
        amount=amount
    )
    
    if not payment_result.get('success'):
        await callback.answer(f"❌ Помилка створення платежу: {payment_result.get('error', 'Невідома помилка')}", show_alert=True)
        return
    
    payment_url = payment_result['payment_url']
    
    # Зберігаємо дані про платіж
    await state.update_data(
        payment_invoice_id=payment_result['invoice_id'],
        payment_local_id=payment_result['local_payment_id'],
        payment_url=payment_url
    )
    await state.set_state(CreateListing.waiting_for_payment)
    
    tariff_names_display = {
        'standard': t(user_id, 'tariffs.standard_name'),
        'highlighted': t(user_id, 'tariffs.highlighted_name'),
        'pinned_12h': t(user_id, 'tariffs.pinned_12h_name'),
        'pinned_24h': t(user_id, 'tariffs.pinned_24h_name'),
        'story': t(user_id, 'tariffs.story_name')
    }
    
    tariff_prices = {
        'standard': 0.0,  # Базова публікація (безкоштовно)
        'highlighted': 1.5,  # Додаткова вартість
        'pinned_12h': 2.5,  # Додаткова вартість
        'pinned_24h': 4.5,  # Додаткова вартість
        'story': 5.0  # Додаткова вартість
    }
    
    selected_tariffs_text = []
    for tariff_type in selected_tariffs:
        if tariff_type in tariff_names_display:
            if tariff_type == 'standard':
                free_text = t(user_id, 'common.free')
                selected_tariffs_text.append(f"• {tariff_names_display.get(tariff_type, tariff_type)} — {free_text} {t(user_id, 'tariffs.base_label')}")
            else:
                selected_tariffs_text.append(f"• {tariff_names_display.get(tariff_type, tariff_type)} — {tariff_prices.get(tariff_type, 0)}€ {t(user_id, 'tariffs.additional_label')}")
    selected_tariffs_text = "\n".join(selected_tariffs_text)
    
    payment_keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'payment.pay_button'),
                url=payment_url
            )
        ]
    ])
    
    payment_text = f"""{t(user_id, 'payment.pay_tariffs_title')}

{t(user_id, 'payment.selected_tariffs')}
{selected_tariffs_text}

{t(user_id, 'payment.pay_tariffs_instruction')}

{t(user_id, 'payment.pay_tariffs_note')}

{t(user_id, 'payment.total_amount', amount=amount)}"""
    
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
        title = listing.get('title', t(user_id, 'moderation.no_title'))
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
        await callback.answer(t(user_id, 'my_listings.listing_not_found'), show_alert=True)
        return
    
    title = listing.get('title', t(user_id, 'my_listings.listing_default_title'))
    
    confirmation_text = t(user_id, 'my_listings.confirm_mark_sold_text', title=title)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'my_listings.confirm_mark_sold_button'),
                callback_data=f"mark_sold_{listing_id}"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'my_listings.cancel'),
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
            await callback.answer(t(user_id, 'my_listings.listing_not_found'), show_alert=True)
            return
        
        if listing.get('sellerTelegramId') != user_id:
            await callback.answer(t(user_id, 'my_listings.not_your_listing'), show_alert=True)
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
        
        await callback.answer(t(user_id, 'my_listings.mark_sold_success'))
        
        # Повертаємо до списку оголошень
        await back_to_my_listings(callback)
        
    except Exception as e:
        print(f"Error marking listing as sold: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer(t(user_id, 'my_listings.mark_sold_error'), show_alert=True)


@router.callback_query(F.data.startswith("confirm_delete_"))
async def confirm_delete(callback: types.CallbackQuery):
    """Показує підтвердження перед видаленням"""
    user_id = callback.from_user.id
    listing_id = int(callback.data.split("_")[-1])
    
    listing = get_telegram_listing_by_id(listing_id)
    if not listing or listing.get('sellerTelegramId') != user_id:
        await callback.answer(t(user_id, 'my_listings.listing_not_found'), show_alert=True)
        return
    
    title = listing.get('title', t(user_id, 'my_listings.listing_default_title'))
    
    confirmation_text = t(user_id, 'my_listings.confirm_delete_text', title=title)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'my_listings.confirm_delete_button'),
                callback_data=f"delete_listing_{listing_id}"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'my_listings.cancel'),
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
            await callback.answer(t(user_id, 'my_listings.listing_not_found'), show_alert=True)
            return
        
        if listing.get('sellerTelegramId') != user_id:
            await callback.answer(t(user_id, 'my_listings.not_your_listing'), show_alert=True)
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
        
        await callback.answer(t(user_id, 'my_listings.delete_success'))
        
        # Повертаємо до списку оголошень
        await back_to_my_listings(callback)
        
    except Exception as e:
        print(f"Error deleting listing: {e}")
        import traceback
        traceback.print_exc()
        await callback.answer(t(user_id, 'my_listings.delete_error'), show_alert=True)
