import json
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.filters import Command

from utils.translations import t
from states.client_states import CreateListing
from keyboards.client_keyboards import (
    get_categories_keyboard,
    get_subcategories_keyboard,
    get_condition_keyboard,
    get_listing_confirmation_keyboard,
    get_main_menu_keyboard
)
from database_functions.telegram_listing_db import (
    get_user_id_by_telegram_id,
    create_telegram_listing,
    get_categories,
    get_user_telegram_listings,
    get_telegram_listing_by_id
)
from database_functions.client_db import check_user
from utils.moderation_manager import ModerationManager
from main import bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, InputMediaPhoto
import os

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


@router.message(CreateListing.waiting_for_photos, F.photo)
async def process_photo(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    data = await state.get_data()
    photos = data.get('photos', [])
    last_photo_message_id = data.get('last_photo_message_id')
    
    if len(photos) >= MAX_PHOTOS:
        await message.answer(t(user_id, 'create_listing.photo_limit_reached'))
        return
    
    file_id = message.photo[-1].file_id
    photos.append(file_id)
    
    if last_photo_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
        except:
            pass
    
    sent_message = await message.answer(
        t(user_id, 'create_listing.photo_added').format(
            current=len(photos),
            max=MAX_PHOTOS
        )
    )

    await state.update_data(
        photos=photos,
        last_photo_message_id=sent_message.message_id
    )


@router.message(CreateListing.waiting_for_photos, F.text == "/next")
async def continue_after_photos(message: types.Message, state: FSMContext):     
    user_id = message.from_user.id
    data = await state.get_data()
    photos = data.get('photos', [])
    
    if len(photos) == 0:
        await message.answer("❌ <b>Обов'язково потрібно додати хоча б одне фото!</b>\n\nБудь ласка, надішліть фото вашого товару.", parse_mode="HTML")
        return
    
    await process_category_selection(message, state)


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
    
    subcategories = selected_category.get('subcategories', [])
    
    await state.update_data(category_id=category_id, category_name=selected_category['name'])
    
    if subcategories:
        await state.set_state(CreateListing.waiting_for_subcategory)
        await callback.message.edit_text(
            t(user_id, 'create_listing.subcategory_prompt'),
            parse_mode="HTML",
            reply_markup=get_subcategories_keyboard(user_id, subcategories, category_id)
        )
    else:
        await state.update_data(subcategory_id=None, subcategory_name=None)
        await state.set_state(CreateListing.waiting_for_price)
        await callback.message.edit_text(
            t(user_id, 'create_listing.price_prompt'),
            parse_mode="HTML"
        )
    
    await callback.answer()


@router.callback_query(F.data == "back_to_categories", CreateListing.waiting_for_subcategory)
async def back_to_categories(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    categories = get_categories()
    
    await state.set_state(CreateListing.waiting_for_category)
    await callback.message.edit_text(
        t(user_id, 'create_listing.category_prompt'),
        parse_mode="HTML",
        reply_markup=get_categories_keyboard(user_id, categories)
    )
    await callback.answer()


@router.callback_query(F.data.startswith("subcat_"), CreateListing.waiting_for_subcategory)
async def process_subcategory(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    parts = callback.data.split("_")
    subcategory_id = int(parts[1])
    category_id = int(parts[2])
    
    categories = get_categories()
    selected_category = next((c for c in categories if c['id'] == category_id), None)
    
    if not selected_category:
        await callback.answer("❌ Категорія не знайдена", show_alert=True)
        return
    
    subcategories = selected_category.get('subcategories', [])
    selected_subcategory = next((s for s in subcategories if s['id'] == subcategory_id), None)
    
    if not selected_subcategory:
        await callback.answer("❌ Підкатегорія не знайдена", show_alert=True)
        return
    
    await state.update_data(
        subcategory_id=subcategory_id,
        subcategory_name=selected_subcategory['name']
    )
    await state.set_state(CreateListing.waiting_for_price)
    
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
    
    await callback.message.edit_text(
        t(user_id, 'create_listing.location_prompt'),
        parse_mode="HTML"
    )
    await callback.answer()


@router.message(CreateListing.waiting_for_location)
async def process_location(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    location = message.text.strip()
    
    if not location or len(location) < 2:
        await message.answer("❌ Місто повинно містити мінімум 2 символи. Спробуйте ще раз:")
        return
    
    await state.update_data(location=location)
    
    data = await state.get_data()
    preview_text = build_preview(user_id, data)
    photos = data.get('photos', [])
    
    await state.set_state(CreateListing.waiting_for_confirmation)
    
    if photos and len(photos) > 0:
        if len(photos) == 1:
            await message.answer_photo(
                photo=photos[0],
                caption=preview_text,
                parse_mode="HTML",
                reply_markup=get_listing_confirmation_keyboard(user_id)
            )
        else:

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
            
            await message.answer(
                t(user_id, 'create_listing.preview_confirm'),
                parse_mode="HTML",
                reply_markup=get_listing_confirmation_keyboard(user_id)
            )
    else:
        await message.answer(
            preview_text,
            parse_mode="HTML",
            reply_markup=get_listing_confirmation_keyboard(user_id)
        )


def build_preview(user_id: int, data: dict) -> str:
    preview = t(user_id, 'create_listing.preview')
    preview += t(user_id, 'create_listing.preview_title').format(title=data.get('title', ''))
    preview += t(user_id, 'create_listing.preview_description').format(description=data.get('description', ''))
    
    category_text = data.get('category_name', '')
    if data.get('subcategory_name'):
        category_text += t(user_id, 'create_listing.preview_subcategory').format(subcategory=data.get('subcategory_name', ''))
    preview += t(user_id, 'create_listing.preview_category').format(category=category_text)
    
    preview += t(user_id, 'create_listing.preview_price').format(price=data.get('price', 0))
    preview += t(user_id, 'create_listing.preview_condition').format(condition=data.get('condition_text', ''))
    preview += t(user_id, 'create_listing.preview_location').format(location=data.get('location', ''))
    
    photos_count = len(data.get('photos', []))
    preview += t(user_id, 'create_listing.preview_photos').format(count=photos_count)
    preview += t(user_id, 'create_listing.preview_confirm')
    
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
        listing_id = create_telegram_listing(
            user_id=db_user_id,
            title=data['title'],
            description=data['description'],
            price=float(data['price']),
            currency='EUR',
            category=data['category_name'],
            subcategory=data.get('subcategory_name'),
            condition=data['condition'],
            location=data.get('location', 'Не вказано'),
            images=photos
        )
        
        moderation_manager = ModerationManager(bot)
        await moderation_manager.send_listing_to_moderation(
            listing_id=listing_id,
            source='telegram'
        )
        
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except:
            pass
        
        await callback.message.answer(
            t(user_id, 'create_listing.confirmed'),
            parse_mode="HTML"
        )
        await callback.answer()
        
        await state.clear()
        
        await callback.message.answer(
            "✅",
            reply_markup=get_main_menu_keyboard(user_id)
        )
        
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
