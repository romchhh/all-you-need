import asyncio
import json
import re
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.filters import Command

from utils.translations import t, get_user_lang
from states.client_states import CreateListing
from keyboards.client_keyboards import (
    get_categories_keyboard,
    get_listing_confirmation_keyboard,
    get_main_menu_keyboard,
    get_publication_tariff_keyboard,
    get_payment_method_keyboard,
    get_german_cities_keyboard,
    get_other_germany_cities_keyboard,
    get_region_selection_keyboard,
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
    update_telegram_listing,
    update_telegram_listing_publication_tariff
)
from database_functions.client_db import check_user, get_user_balance, deduct_user_balance
from utils.location_normalization import normalize_city_name, contains_cyrillic
from utils.moderation_manager import ModerationManager
from utils.monopay_functions import create_publication_payment_link
from main import bot
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
    InputMediaPhoto,
    InputMediaVideo,
    FSInputFile,
)
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


router = Router()

MAX_PHOTOS = 10
MAX_MEDIA = 10
MAX_TITLE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 600
LISTINGS_PER_PAGE = 8

# Lock для серіалізації обробки медіа-групи (1 відео + 2 фото приходять окремими повідомленнями і мають оброблятися по черзі)
_media_group_lock = asyncio.Lock()


def _format_listing_date(listing: dict) -> str:
    """Повертає коротку дату/час для кнопки: dd.mm.yy HH:mm з publishedAt або createdAt."""
    dt = None
    published_at = listing.get('publishedAt') or listing.get('published_at')
    created_at = listing.get('createdAt') or listing.get('created_at')
    value = published_at if published_at else created_at
    if not value:
        return ""
    try:
        if isinstance(value, str):
            try:
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError:
                try:
                    dt = datetime.fromisoformat(value)
                except ValueError:
                    if ' ' in value:
                        parts = value.split(' ')
                        date_part = parts[0]
                        time_part = parts[1].split('.')[0]
                        dt = datetime.strptime(f"{date_part} {time_part}", "%Y-%m-%d %H:%M:%S")
        elif hasattr(value, 'strftime'):
            dt = value
        if dt:
            if dt.tzinfo:
                dt = dt.astimezone(ZoneInfo('Europe/Berlin'))
            else:
                dt = dt.replace(tzinfo=ZoneInfo('UTC')).astimezone(ZoneInfo('Europe/Berlin'))
            return dt.strftime("%d.%m.%y %H:%M")
    except Exception:
        pass
    return ""


def _format_created_display(value) -> str:
    """Повертає дату для відображення «Создано»: dd.mm.yyyy HH:mm. Приймає str або datetime."""
    if not value:
        return ""
    dt = None
    try:
        if hasattr(value, 'strftime'):
            dt = value
        elif isinstance(value, str):
            s = value.strip()
            try:
                dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S.%f")
            except ValueError:
                try:
                    dt = datetime.strptime(s.split('.')[0], "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    if ' ' in s:
                        parts = s.split(' ', 1)
                        time_part = parts[1].split('.')[0][:8]
                        dt = datetime.strptime(f"{parts[0]} {time_part}", "%Y-%m-%d %H:%M:%S")
        if dt:
            if getattr(dt, 'tzinfo', None):
                dt = dt.astimezone(ZoneInfo('Europe/Berlin'))
            else:
                dt = dt.replace(tzinfo=ZoneInfo('UTC')).astimezone(ZoneInfo('Europe/Berlin'))
            return dt.strftime("%d.%m.%Y %H:%M")
    except Exception:
        pass
    return ""


def _normalize_media_list(data: dict) -> list:
    """Повертає список медіа: [{"type": "photo"|"video", "file_id": str}, ...]. Підтримує старий формат photos (list of str)."""
    media = data.get('media', [])
    if not media and data.get('photos'):
        photos = data.get('photos', [])
        return [{"type": "photo", "file_id": (p if isinstance(p, str) else p.get("file_id"))} for p in photos]
    result = []
    for m in media:
        if isinstance(m, dict) and m.get("type") in ("photo", "video") and m.get("file_id"):
            result.append({"type": m["type"], "file_id": m["file_id"]})
        elif isinstance(m, str):
            result.append({"type": "photo", "file_id": m})
    return result


def _media_to_image_file_ids(media: list) -> list:
    """Повертає лише file_id фото для збереження в БД (канал підтримує тільки фото)."""
    return [m["file_id"] for m in media if m.get("type") == "photo"]


def _first_channel_message_id(channel_message_id) -> str:
    """Повертає перший message_id для посилання в канал (якщо збережено JSON масив — бере перший)."""
    if not channel_message_id or channel_message_id == 'None':
        return ''
    s = str(channel_message_id).strip()
    if not s:
        return ''
    if s.startswith('['):
        try:
            arr = json.loads(s)
            if isinstance(arr, list) and len(arr) > 0:
                return str(arr[0])
        except (json.JSONDecodeError, TypeError):
            pass
    return s


def _count_listing_stats(listings: list) -> dict:
    """Підраховує кількість по статусах: active, sold, moderation, inactive."""
    active = sold = moderation = inactive = 0
    for listing in listings:
        status = (listing.get('status') or '').lower()
        if status in ('published', 'approved'):
            active += 1
        elif status == 'sold':
            sold += 1
        elif status == 'pending_moderation':
            moderation += 1
        elif status in ('rejected', 'expired'):
            inactive += 1
        else:
            inactive += 1
    return {"active": active, "sold": sold, "moderation": moderation, "inactive": inactive}


def _build_my_listings_page(user_id: int, listings: list, page: int):
    """Повертає (текст повідомлення, клавіатура) для сторінки списку оголошень."""
    total = len(listings)
    total_pages = max(1, (total + LISTINGS_PER_PAGE - 1) // LISTINGS_PER_PAGE)
    page = max(0, min(page, total_pages - 1))
    start = page * LISTINGS_PER_PAGE
    end = min(start + LISTINGS_PER_PAGE, total)
    page_listings = listings[start:end]

    stats = _count_listing_stats(listings)

    keyboard_buttons = []
    for listing in page_listings:
        title = listing.get('title', t(user_id, 'moderation.no_title'))
        status = listing.get('status', 'pending')
        status_emoji = {
            'pending_moderation': '⏳',
            'approved': '✅',
            'rejected': '❌',
            'published': '📢',
            'expired': '🕐',
            'sold': '💰'
        }.get(status, '📦')
        date_str = _format_listing_date(listing)
        if date_str:
            suffix = f"  •  {date_str}"
            max_title_len = 18
            title_part = (title[:max_title_len] + '...') if len(title) > max_title_len else title
            button_text = f"{status_emoji} {title_part}{suffix}"
        else:
            button_text = f"{status_emoji} {title[:30]}{'...' if len(title) > 30 else ''}"
        keyboard_buttons.append([
            InlineKeyboardButton(
                text=button_text,
                callback_data=f"view_telegram_listing_{listing['id']}_{page}"
            )
        ])

    if total_pages > 1:
        nav_row = []
        if page > 0:
            nav_row.append(InlineKeyboardButton(
                text=t(user_id, 'my_listings.prev_page'),
                callback_data=f"my_listings_page_{page - 1}"
            ))
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1} / {total_pages}",
            callback_data="my_listings_noop"
        ))
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text=t(user_id, 'my_listings.next_page'),
                callback_data=f"my_listings_page_{page + 1}"
            ))
        keyboard_buttons.append(nav_row)

    if total_pages > 1:
        header = t(user_id, 'my_listings.title_page', count=total, page=page + 1, total_pages=total_pages)
    else:
        header = t(user_id, 'my_listings.title', count=total)
    stats_line = t(
        user_id, 'my_listings.stats_line',
        active=stats['active'], sold=stats['sold'],
        moderation=stats['moderation'], inactive=stats['inactive']
    )
    text = f"{header}\n\n{stats_line}"
    keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
    return text, keyboard


@router.message(F.text.in_([
    "➕ Додати оголошення",  # UK
    "➕ Добавить объявление"  # RU
]))
async def start_create_listing(message: types.Message, state: FSMContext):      
    user_id = message.from_user.id
    
    if not check_user(user_id):
        await message.answer("<b>⚠️ Будь ласка, спочатку зареєструйтесь:</b> /start", parse_mode="HTML")
        return

    lang = get_user_lang(user_id)
    if lang == "ru":
        prompt = "<b>Вы добавляете:</b>\n\nВыберите тип объявления:"
        btn_services = "🧰 Услуги"
        btn_goods = "🛍 Товары"
    else:
        prompt = "<b>Ви додаєте:</b>\n\nОберіть тип оголошення:"
        btn_services = "🧰 Послуги"
        btn_goods = "🛍 Товари"

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=btn_services, callback_data="listing_type:services")],
            [InlineKeyboardButton(text=btn_goods, callback_data="listing_type:goods")],
        ]
    )
    await message.answer(prompt, parse_mode="HTML", reply_markup=kb)


async def _start_services_listing_flow(message: types.Message, state: FSMContext) -> None:
    """Старий flow створення оголошення в канали (послуги)."""
    user_id = message.from_user.id
    await state.set_state(CreateListing.waiting_for_title)

    initial_message = await message.answer(
        t(user_id, 'create_listing.start'),
        parse_mode="HTML",
        reply_markup=types.ReplyKeyboardMarkup(
            keyboard=[[types.KeyboardButton(text=t(user_id, 'create_listing.cancel'))]],
            resize_keyboard=True
        )
    )

    sent_message = await message.answer(
        t(user_id, 'create_listing.title_prompt'),
        parse_mode="HTML"
    )
    await state.update_data(
        last_message_id=sent_message.message_id,
        initial_message_id=initial_message.message_id
    )


@router.callback_query(F.data == "listing_type:services")
async def choose_listing_type_services(callback: types.CallbackQuery, state: FSMContext):
    await callback.answer()
    try:
        await callback.message.delete()
    except Exception:
        pass
    await _start_services_listing_flow(callback.message, state)


@router.callback_query(F.data == "listing_type:goods")
async def choose_listing_type_goods(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    await callback.answer()
    try:
        await state.clear()
    except Exception:
        pass

    webapp_url = (os.getenv("WEBAPP_URL") or "https://tradegrnd.com").rstrip("/")
    lang = get_user_lang(user_id)
    target = f"{webapp_url}/{lang}/bazaar?telegramId={user_id}&create=1"

    if lang == "ru":
        text = (
            "🛍 <b>Товары создаются в маркетплейсе.</b>\n\n"
            "Нажмите кнопку ниже, чтобы открыть форму создания объявления."
        )
        btn = "🔗 Открыть"
    else:
        text = (
            "🛍 <b>Товари створюються в маркетплейсі.</b>\n\n"
            "Натисніть кнопку нижче, щоб відкрити форму створення оголошення."
        )
        btn = "🔗 Відкрити"

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=btn, web_app=WebAppInfo(url=target))]
        ]
    )
    await callback.message.answer(text, parse_mode="HTML", reply_markup=kb)
    try:
        await callback.message.delete()
    except Exception:
        pass


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
    await state.update_data(media=[], photos=[], media_group_limit_notified=[], media_group_buffer={})

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


@router.message(CreateListing.waiting_for_photos, F.media_group_id, F.photo)
async def process_media_group_photo(message: types.Message, state: FSMContext):
    """Обробляє фото з медіа групи."""
    await _process_media_group_item(message, state, "photo", message.photo[-1].file_id)


@router.message(CreateListing.waiting_for_photos, F.media_group_id, F.video)
async def process_media_group_video(message: types.Message, state: FSMContext):
    """Обробляє відео з медіа групи."""
    await _process_media_group_item(message, state, "video", message.video.file_id)


async def _process_media_group_item(message: types.Message, state: FSMContext, media_type: str, file_id: str):
    """Додає один елемент (фото або відео) з медіа-групи. Lock усуває race. Порядок зберігається через буфер і сортування по message_id."""
    user_id = message.from_user.id
    media_group_id = message.media_group_id
    message_id = message.message_id

    async with _media_group_lock:
        data = await state.get_data()
        media = _normalize_media_list(data)
        media_group_buffer = dict(data.get('media_group_buffer', {}))
        media_group_responses = data.get('media_group_responses', {})
        media_group_limit_notified = set(data.get('media_group_limit_notified', []))

        if media_group_id not in media_group_buffer:
            media_group_buffer[media_group_id] = []
        buffer_for_group = media_group_buffer[media_group_id]
        current_total = len(media) + len(buffer_for_group)

        if len(media) >= MAX_MEDIA and not buffer_for_group:
            try:
                await message.delete()
            except Exception:
                pass
            if media_group_id not in media_group_limit_notified:
                media_group_limit_notified.add(media_group_id)
                await state.update_data(media_group_limit_notified=list(media_group_limit_notified))
                last_photo_message_id = data.get('last_photo_message_id')
                if last_photo_message_id:
                    try:
                        await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
                    except Exception:
                        pass
                sent_message = await message.answer(
                    t(user_id, 'create_listing.media_limit_reached'),
                    reply_markup=get_continue_photos_keyboard(user_id)
                )
                await state.update_data(last_photo_message_id=sent_message.message_id)
            return

        buffer_for_group.append({"message_id": message_id, "type": media_type, "file_id": file_id})
        media_group_buffer[media_group_id] = buffer_for_group
        await state.update_data(media_group_buffer=media_group_buffer)

        if media_group_id not in media_group_responses:
            media_group_responses[media_group_id] = True
            last_message_id = data.get('last_message_id')
            if last_message_id and len(media) == 0 and len(buffer_for_group) == 1:
                try:
                    await bot.delete_message(chat_id=user_id, message_id=last_message_id)
                    await state.update_data(last_message_id=None)
                except Exception:
                    pass
            await state.update_data(media_group_responses=media_group_responses)
            try:
                await message.delete()
            except Exception:
                pass
            asyncio.create_task(delayed_media_group_response(user_id, media_group_id, state))
        else:
            try:
                await message.delete()
            except Exception:
                pass


async def delayed_media_group_response(user_id: int, media_group_id: str, state: FSMContext):
    """Після затримки зливає буфер групи в media у правильному порядку (сортування по message_id) і відповідає один раз."""
    await asyncio.sleep(2)

    data = await state.get_data()
    media_group_responses = data.get('media_group_responses', {})
    media_group_buffer = dict(data.get('media_group_buffer', {}))

    if media_group_id not in media_group_responses:
        return

    buffer_list = media_group_buffer.pop(media_group_id, [])
    del media_group_responses[media_group_id]
    await state.update_data(media_group_responses=media_group_responses, media_group_buffer=media_group_buffer)

    media = _normalize_media_list(data)
    room = max(0, MAX_MEDIA - len(media))
    # Зберігаємо порядок як у користувача: перше фото в альбомі має найменший message_id
    sorted_buffer = sorted(buffer_list, key=lambda x: x["message_id"])[:room]
    for item in sorted_buffer:
        media.append({"type": item["type"], "file_id": item["file_id"]})
    await state.update_data(media=media)

    last_photo_message_id = data.get('last_photo_message_id')
    if last_photo_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
        except Exception:
            pass
    current_data = await state.get_data()
    media_final = _normalize_media_list(current_data)
    sent_message = await bot.send_message(
        chat_id=user_id,
        text=t(user_id, 'create_listing.media_added').format(
            current=len(media_final),
            max=MAX_MEDIA
        ),
        reply_markup=get_continue_photos_keyboard(user_id)
    )
    await state.update_data(last_photo_message_id=sent_message.message_id)


@router.message(CreateListing.waiting_for_photos, F.photo)
async def process_photo(message: types.Message, state: FSMContext):
    """Обробляє окремі фото (не медіа групи)."""
    await _process_single_media(message, state, "photo", message.photo[-1].file_id)


@router.message(CreateListing.waiting_for_photos, F.video)
async def process_video(message: types.Message, state: FSMContext):
    """Обробляє окреме відео."""
    await _process_single_media(message, state, "video", message.video.file_id)


async def _process_single_media(message: types.Message, state: FSMContext, media_type: str, file_id: str):
    """Додає одне фото або відео (не з групи)."""
    user_id = message.from_user.id
    data = await state.get_data()
    media = _normalize_media_list(data)
    last_photo_message_id = data.get('last_photo_message_id')
    last_message_id = data.get('last_message_id')

    if len(media) >= MAX_MEDIA:
        try:
            await message.delete()
        except Exception:
            pass
        if last_photo_message_id:
            try:
                await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
            except Exception:
                pass
        sent_message = await message.answer(
            t(user_id, 'create_listing.media_limit_reached'),
            reply_markup=get_continue_photos_keyboard(user_id)
        )
        await state.update_data(last_photo_message_id=sent_message.message_id)
        return

    media.append({"type": media_type, "file_id": file_id})

    try:
        await message.delete()
    except Exception:
        pass

    if last_message_id and len(media) == 1:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
            await state.update_data(last_message_id=None)
        except Exception:
            pass

    if last_photo_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_photo_message_id)
        except Exception:
            pass

    sent_message = await message.answer(
        t(user_id, 'create_listing.media_added').format(
            current=len(media),
            max=MAX_MEDIA
        ),
        reply_markup=get_continue_photos_keyboard(user_id)
    )
    await state.update_data(media=media, last_photo_message_id=sent_message.message_id)


@router.callback_query(F.data == "continue_after_photos", CreateListing.waiting_for_photos)
async def continue_after_photos(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    data = await state.get_data()
    media = _normalize_media_list(data)

    if not media or len(media) == 0:
        default_photo_path = get_default_photo_path()
        if default_photo_path:
            await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)
    
    # Очищаємо оброблені медіа групи та буфер при переході до наступного кроку
    await state.update_data(processed_media_groups={}, media_group_responses={}, media_group_limit_notified=[], media_group_buffer={})
    
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
    
    await message.answer(
        t(user_id, 'create_listing.send_media_hint'),
        parse_mode="HTML"
    )


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
    await state.set_state(CreateListing.waiting_for_region)
    
    await callback.message.edit_text(
        t(user_id, 'create_listing.region_prompt'),
        parse_mode="HTML",
        reply_markup=get_region_selection_keyboard(user_id)
    )
    await callback.answer(t(user_id, 'create_listing.price_negotiable_set'))


@router.message(CreateListing.waiting_for_price)
async def process_price(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    if message.text == t(user_id, 'create_listing.cancel'):
        await cancel_listing(message, state)
        return
    
    text = message.text.replace(',', '.').strip()
    
    # Перевіряємо чи це почасова оплата (наприклад "50/год", "25 €/год", "50/час", "50/hour")
    if '/' in text and '-' not in text:
        parts_h = [p.strip() for p in text.split('/', 1)]
        if len(parts_h) == 2:
            right = parts_h[1].lower().replace('.', '').strip()
            if right in ('год', 'год.', 'г', 'г.', 'hour', 'час', 'час.'):
                left = parts_h[0].replace('€', '').replace('eur', '').strip()
                try:
                    hourly_price = float(left)
                    if hourly_price < 0:
                        raise ValueError("Ціна не може бути від'ємною")
                    per_hour_suffix = t(user_id, 'create_listing.price_per_hour_suffix')
                    price_display = f"{hourly_price} {per_hour_suffix}"
                    await state.update_data(price=hourly_price, price_display=price_display)
                    data = await state.get_data()
                    is_editing = data.get('location') is not None
                    if is_editing:
                        try:
                            await message.delete()
                        except Exception:
                            pass
                        await show_preview(user_id, state, message=message)
                        return
                    await state.set_state(CreateListing.waiting_for_region)
                    last_message_id = data.get('last_message_id')
                    if last_message_id:
                        try:
                            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
                        except Exception:
                            pass
                    sent_message = await message.answer(
                        t(user_id, 'create_listing.region_prompt'),
                        parse_mode="HTML",
                        reply_markup=get_region_selection_keyboard(user_id)
                    )
                    await state.update_data(last_message_id=sent_message.message_id)
                    return
                except ValueError:
                    await message.answer(t(user_id, 'create_listing.price_invalid'))
                    return
    
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
                await state.set_state(CreateListing.waiting_for_region)
                
                # Видаляємо попереднє повідомлення якщо є
                last_message_id = data.get('last_message_id')
                if last_message_id:
                    try:
                        await bot.delete_message(chat_id=user_id, message_id=last_message_id)
                    except:
                        pass
                
                sent_message = await message.answer(
                    t(user_id, 'create_listing.region_prompt'),
                    parse_mode="HTML",
                    reply_markup=get_region_selection_keyboard(user_id)
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
    await state.set_state(CreateListing.waiting_for_region)
    
    # Видаляємо попереднє повідомлення якщо є
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    sent_message = await message.answer(
        t(user_id, 'create_listing.region_prompt'),
        parse_mode="HTML",
        reply_markup=get_region_selection_keyboard(user_id)
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


@router.callback_query(F.data == "region_hamburg", CreateListing.waiting_for_region)
async def process_region_hamburg(callback: types.CallbackQuery, state: FSMContext):
    """Обробка вибору регіону Гамбург"""
    user_id = callback.from_user.id
    
    # Зберігаємо вибраний регіон
    await state.update_data(region='hamburg')
    
    # Переходимо до вибору міста
    await state.set_state(CreateListing.waiting_for_location)
    
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
            t(user_id, 'create_listing.location_prompt'),
            parse_mode="HTML",
            reply_markup=get_german_cities_keyboard(user_id)
        )
    except:
        sent_message = await callback.message.answer(
            t(user_id, 'create_listing.location_prompt'),
            parse_mode="HTML",
            reply_markup=get_german_cities_keyboard(user_id)
        )
        await state.update_data(last_message_id=sent_message.message_id)
    
    await callback.answer()


@router.callback_query(F.data == "region_other_germany", CreateListing.waiting_for_region)
async def process_region_other_germany(callback: types.CallbackQuery, state: FSMContext):
    """Обробка вибору інших регіонів Німеччини"""
    user_id = callback.from_user.id
    
    # Зберігаємо вибраний регіон
    await state.update_data(region='other_germany')
    
    # Переходимо до вибору міста
    await state.set_state(CreateListing.waiting_for_location)
    
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
            t(user_id, 'create_listing.location_prompt_other'),
            parse_mode="HTML",
            reply_markup=get_other_germany_cities_keyboard(user_id)
        )
    except:
        sent_message = await callback.message.answer(
            t(user_id, 'create_listing.location_prompt_other'),
            parse_mode="HTML",
            reply_markup=get_other_germany_cities_keyboard(user_id)
        )
        await state.update_data(last_message_id=sent_message.message_id)
    
    await callback.answer()


@router.callback_query(F.data == "back_from_region", CreateListing.waiting_for_region)
async def back_from_region(callback: types.CallbackQuery, state: FSMContext):
    """Повернення до вибору ціни з етапу вибору регіону"""
    user_id = callback.from_user.id
    
    # Видаляємо збережений регіон та локацію (якщо були вибрані раніше)
    await state.update_data(region=None, location=None)
    
    # Повертаємося до етапу вибору ціни
    await state.set_state(CreateListing.waiting_for_price)
    
    # Видаляємо попереднє повідомлення якщо є
    data = await state.get_data()
    last_message_id = data.get('last_message_id')
    if last_message_id:
        try:
            await bot.delete_message(chat_id=user_id, message_id=last_message_id)
        except:
            pass
    
    # Створюємо клавіатуру з кнопкою "Договірна"
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'create_listing.price_negotiable_button_alt'),
            callback_data="price_negotiable"
        )]
    ])
    
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


@router.callback_query(F.data == "cancel_listing", CreateListing.waiting_for_region)
async def cancel_listing_from_region(callback: types.CallbackQuery, state: FSMContext):
    """Скасування створення оголошення з етапу вибору регіону"""
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


@router.callback_query(F.data == "back_from_location", CreateListing.waiting_for_location)
async def back_from_location(callback: types.CallbackQuery, state: FSMContext):
    """Повернення до вибору регіону з етапу вибору міста"""
    user_id = callback.from_user.id
    
    # Видаляємо збережену локацію
    await state.update_data(location=None)
    
    # Повертаємося до етапу вибору регіону
    await state.set_state(CreateListing.waiting_for_region)
    
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
            t(user_id, 'create_listing.region_prompt'),
            parse_mode="HTML",
            reply_markup=get_region_selection_keyboard(user_id)
        )
        await state.update_data(last_message_id=callback.message.message_id)
    except:
        sent_message = await callback.message.answer(
            t(user_id, 'create_listing.region_prompt'),
            parse_mode="HTML",
            reply_markup=get_region_selection_keyboard(user_id)
        )
        await state.update_data(last_message_id=sent_message.message_id)
    
    await callback.answer()


@router.callback_query(F.data.startswith("city_"), CreateListing.waiting_for_location)
async def process_city_selection(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    
    # Отримуємо назву міста з callback_data та нормалізуємо
    raw_city_name = callback.data.replace("city_", "")
    city_name = normalize_city_name(raw_city_name)
    
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
    
    raw_location = message.text.strip()
    
    # Визначаємо яку клавіатуру показувати на основі регіону
    data = await state.get_data()
    region = data.get('region', 'hamburg')  # За замовчуванням Гамбург
    cities_keyboard = get_german_cities_keyboard(user_id) if region == 'hamburg' else get_other_germany_cities_keyboard(user_id)
    
    # Забороняємо вводити місто кирилицею — тільки латиниця (англ/нім)
    if contains_cyrillic(raw_location):
        await message.answer(
            "<b>❌ Пожалуйста, вводите название города латиницей.</b>\n\n"
            "Например: <b>Hamburg</b>, <b>München</b>, <b>Köln</b>.\n\n"
            "Или выберите город из списка ниже.",
            reply_markup=cities_keyboard,
            parse_mode="HTML"
        )
        return
    
    # Нормалізуємо введене місто (Hamburg/Munich → Hamburg/München тощо)
    location = normalize_city_name(raw_location)
    
    if not location or len(location) < 2:
        await message.answer("<b>❌ Місто повинно містити мінімум 2 символи.</b>\n\nСпробуйте ще раз:", reply_markup=cities_keyboard, parse_mode="HTML")
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
    price_display = data.get('price_display') or data.get('price', 0)
    negotiable_text = t(user_id, 'moderation.negotiable')
    
    if isinstance(price_display, str):
        if price_display == negotiable_text or price_display == "Договірна" or price_display == "Договорная":
            price_display = negotiable_text
        elif '-' in price_display:
            price_display = f"{price_display} EUR"
        elif '/год' in price_display or '/час' in price_display:
            pass
        else:
            price_display = f"{price_display} EUR"
    else:
        price_display = f"{price_display} EUR"
    
    if price_display == negotiable_text:
        preview += t(user_id, 'create_listing.preview_price_negotiable').format(price=negotiable_text)
    elif isinstance(price_display, str) and ('/год' in price_display or '/час' in price_display):
        preview += t(user_id, 'create_listing.preview_price_negotiable').format(price=price_display)
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
    media = _normalize_media_list(data)
    image_ids = _media_to_image_file_ids(media)

    if not media or len(media) == 0:
        default_photo_path = get_default_photo_path()
        if not default_photo_path:
            await callback.answer("❌ Помилка: не вдалося знайти дефолтне зображення!", show_alert=True)
            return
        await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)
    elif not image_ids:
        default_photo_path = get_default_photo_path()
        if default_photo_path:
            await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)

    images_for_db = media

    db_user_id = get_user_id_by_telegram_id(user_id)
    if not db_user_id:
        await callback.answer("❌ Помилка: користувач не знайдений", show_alert=True)
        await state.clear()
        return
    
    try:
        # Автоматично робимо першу літеру великою для назви та опису
        title = capitalize_first_letter(data['title'])
        description = capitalize_first_letter(data['description'])
        
        # Обробляємо ціну: число, діапазон, почасова (€/год, €/час) або "Договірна"
        price_value = data.get('price', 0)
        is_negotiable = data.get('isNegotiable', False)
        price_display = data.get('price_display')
        negotiable_text = t(user_id, 'moderation.negotiable')
        
        if price_display and ('/год' in str(price_display) or '/час' in str(price_display)):
            price_value = float(price_value) if price_value else 0
        elif isinstance(price_value, str):
            if price_value == negotiable_text or price_value == "Договірна" or price_value == "Договорная" or is_negotiable:
                price_display = negotiable_text
                price_value = 0
            elif '-' in price_value:
                try:
                    parts = price_value.split('-')
                    price_min = float(parts[0].strip())
                    price_max = float(parts[1].strip())
                    price_display = f"{price_min}-{price_max}"
                    price_value = price_min
                except Exception:
                    price_value = 0
            else:
                price_value = 0
        else:
            price_value = float(price_value) if price_value else 0
        
        editing_listing_id = data.get('editing_listing_id')
        if editing_listing_id:
            success = update_telegram_listing(
                listing_id=editing_listing_id,
                title=title,
                description=description,
                price=price_value,
                currency='EUR',
                category=data['category_name'],
                subcategory=None,
                condition='service',
                location=data.get('location', t(user_id, 'moderation.not_specified')),
                images=images_for_db,
                price_display=price_display,
                region=data.get('region', 'hamburg')  # Зберігаємо регіон
            )
            if not success:
                await callback.answer("❌ Помилка оновлення оголошення", show_alert=True)
                return
            listing_id = editing_listing_id
            await state.update_data(listing_id=listing_id)
            await state.update_data(editing_listing_id=None)
        else:
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
                images=images_for_db,
                price_display=price_display,  # Передаємо оригінальне значення
                region=data.get('region', 'hamburg')  # Зберігаємо регіон
            )
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
    """Показує preview оголошення з кнопками підтвердження."""
    data = await state.get_data()
    preview_text = build_preview(user_id, data)
    media = _normalize_media_list(data)

    await state.set_state(CreateListing.waiting_for_confirmation)

    use_default_photo = False
    if not media or len(media) == 0:
        default_photo_path = get_default_photo_path()
        if default_photo_path:
            use_default_photo = True
            await state.update_data(use_default_photo=True, default_photo_path=default_photo_path)

    target_message = callback.message if callback else message

    if media and len(media) > 0:
        if len(media) == 1:
            m = media[0]
            if m.get("type") == "video":
                if callback:
                    try:
                        await callback.message.delete()
                    except Exception:
                        pass
                    await callback.message.answer_video(
                        video=m["file_id"],
                        caption=preview_text,
                        parse_mode="HTML"
                    )
                else:
                    await message.answer_video(
                        video=m["file_id"],
                        caption=preview_text,
                        parse_mode="HTML"
                    )
            else:
                if callback:
                    try:
                        await callback.message.delete()
                    except Exception:
                        pass
                    await callback.message.answer_photo(
                        photo=m["file_id"],
                        caption=preview_text,
                        parse_mode="HTML"
                    )
                else:
                    await message.answer_photo(
                        photo=m["file_id"],
                        caption=preview_text,
                        parse_mode="HTML"
                    )
        else:
            input_media = []
            for i, m in enumerate(media):
                caption = (preview_text if i == 0 else None)
                parse = "HTML" if i == 0 else None
                if m.get("type") == "video":
                    input_media.append(InputMediaVideo(media=m["file_id"], caption=caption, parse_mode=parse))
                else:
                    input_media.append(InputMediaPhoto(media=m["file_id"], caption=caption, parse_mode=parse))
            if callback:
                try:
                    await callback.message.delete()
                except Exception:
                    pass
                await callback.message.answer_media_group(media=input_media)
            else:
                await message.answer_media_group(media=input_media)
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
    await state.update_data(media=[], photos=[], media_group_limit_notified=[], media_group_buffer={})
    
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
    # При редагуванні переходимо безпосередньо до вибору міста (пропускаємо вибір регіону)
    await state.set_state(CreateListing.waiting_for_location)
    
    # Визначаємо яку клавіатуру показати на основі збереженого регіону
    data = await state.get_data()
    region = data.get('region', 'hamburg')  # За замовчуванням Гамбург
    
    cities_keyboard = get_german_cities_keyboard(user_id) if region == 'hamburg' else get_other_germany_cities_keyboard(user_id)
    loc_prompt_key = 'create_listing.location_prompt_other' if region == 'other_germany' else 'create_listing.location_prompt'
    try:
        await callback.message.edit_text(
            t(user_id, loc_prompt_key),
            parse_mode="HTML",
            reply_markup=cities_keyboard
        )
    except:
        await callback.message.answer(
            t(user_id, loc_prompt_key),
            parse_mode="HTML",
            reply_markup=cities_keyboard
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

    text, keyboard = _build_my_listings_page(user_id, listings, 0)
    await message.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.callback_query(F.data == "my_listings_noop")
async def my_listings_noop(callback: types.CallbackQuery):
    await callback.answer()


@router.callback_query(F.data.startswith("view_telegram_listing_"))
async def view_telegram_listing(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    parts = callback.data.split("_")
    listing_id = int(parts[3])
    current_page = int(parts[4]) if len(parts) > 4 else 0

    try:
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
        price_display = listing.get('priceDisplay')
        currency = listing.get('currency', 'EUR')
        negotiable_text = t(user_id, 'moderation.negotiable')
        if price_display:
            if price_display == negotiable_text or price_display == "Договірна" or price_display == "Договорная":
                price_text = negotiable_text
            elif '/год' in str(price_display) or '/час' in str(price_display):
                price_text = price_display
            else:
                price_text = f"{price_display} {currency}"
        else:
            price_text = f"{price} {currency}"
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
            'published': t(user_id, 'listing.status.published'),
            'expired': t(user_id, 'listing.status.expired')
        }
        status_text = status_translations.get(status, status)
        
        message_text = f"""📦 <b>{title}</b>\n\n"""
        message_text += f"{t(user_id, 'listing.details.description')} {description[:500]}{'...' if len(description) > 500 else ''}\n\n"
        message_text += f"{t(user_id, 'listing.details.price')} {price_text}\n"
        message_text += f"{t(user_id, 'listing.details.category')} {category}"
        if subcategory:
            message_text += f" / {subcategory}"
        message_text += f"\n"
        message_text += f"{t(user_id, 'listing.details.location')} {location}\n"
        message_text += f"{t(user_id, 'listing.details.status')} {status_text}\n"
        if status == 'rejected':
            rejection_reason = listing.get('rejectionReason') or listing.get('rejection_reason') or ''
            if rejection_reason:
                message_text += f"\n{t(user_id, 'my_listings.rejection_reason')}\n{rejection_reason}\n"
        formatted_created = _format_created_display(created_at)
        if formatted_created:
            message_text += f"{t(user_id, 'listing.details.created')} {formatted_created}\n"
        
        keyboard_buttons = []
        
        channel_message_id_raw = listing.get('channelMessageId') or listing.get('channel_message_id')
        channel_message_id = _first_channel_message_id(channel_message_id_raw)
        if channel_message_id and channel_message_id != 'None' and str(channel_message_id).strip() and status != 'expired':
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
        # Для відхилених — редагувати та відправити на повторну модерацію (з оплатою) або видалити
        if status == 'rejected':
            keyboard_buttons.append([
                InlineKeyboardButton(
                    text=t(user_id, 'my_listings.edit_button'),
                    callback_data=f"edit_rejected_listing_{listing_id}"
                ),
                InlineKeyboardButton(
                    text=t(user_id, 'my_listings.delete_button'),
                    callback_data=f"confirm_delete_{listing_id}"
                )
            ])
        # Для закінчених за терміном (деактивованих) — редагувати та подати знову або видалити
        if status == 'expired':
            keyboard_buttons.append([
                InlineKeyboardButton(
                    text=t(user_id, 'my_listings.edit_button'),
                    callback_data=f"edit_rejected_listing_{listing_id}"
                ),
                InlineKeyboardButton(
                    text=t(user_id, 'my_listings.delete_button'),
                    callback_data=f"confirm_delete_{listing_id}"
                )
            ])
        
        keyboard_buttons.append([
            InlineKeyboardButton(
                text=t(user_id, 'my_listings.back_to_list'),
                callback_data=f"back_to_my_listings_{current_page}"
            )
        ])
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
        
        images = listing.get('images', [])
        if images and len(images) > 0:
            try:
                def _item_file_id_and_type(item):
                    if isinstance(item, dict):
                        return (item.get('file_id') or '', (item.get('type') or 'photo').lower())
                    return (str(item), 'photo')

                if len(images) > 1:
                    media = []
                    for i, item in enumerate(images):
                        file_id, mtype = _item_file_id_and_type(item)
                        if not file_id:
                            continue
                        cap = message_text if i == 0 else None
                        parse = "HTML" if i == 0 else None
                        if mtype == 'video':
                            media.append(InputMediaVideo(media=file_id, caption=cap, parse_mode=parse))
                        else:
                            media.append(InputMediaPhoto(media=file_id, caption=cap, parse_mode=parse))
                    if media:
                        await bot.send_media_group(chat_id=user_id, media=media)
                    await bot.send_message(
                        chat_id=user_id,
                        text=t(user_id, 'my_listings.choose_action'),
                        reply_markup=keyboard,
                        parse_mode="HTML"
                    )
                else:
                    file_id, mtype = _item_file_id_and_type(images[0])
                    if mtype == 'video':
                        await bot.send_video(
                            chat_id=user_id,
                            video=file_id,
                            caption=message_text,
                            reply_markup=keyboard,
                            parse_mode="HTML"
                        )
                    else:
                        await bot.send_photo(
                            chat_id=user_id,
                            photo=file_id,
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


@router.callback_query(F.data.startswith("edit_rejected_listing_"))
async def edit_rejected_listing(callback: types.CallbackQuery, state: FSMContext):
    """Почати редагування відхиленого оголошення та відправку на повторну модерацію (з оплатою)"""
    user_id = callback.from_user.id
    try:
        listing_id = int(callback.data.split("_")[-1])
        listing = get_telegram_listing_by_id(listing_id)
        if not listing or listing.get('sellerTelegramId') != user_id:
            await callback.answer(t(user_id, 'my_listings.listing_not_found'), show_alert=True)
            return
        if listing.get('status') not in ('rejected', 'expired'):
            await callback.answer(t(user_id, 'my_listings.not_rejected'), show_alert=True)
            return
        price_val = listing.get('priceDisplay') or listing.get('price')
        if price_val is None:
            price_val = listing.get('price', 0)
        images = listing.get('images', []) or []
        media = []
        for f in images:
            if isinstance(f, str) and f:
                media.append({"type": "photo", "file_id": f})
            elif isinstance(f, dict) and f.get("file_id"):
                media.append({"type": (f.get("type") or "photo").lower(), "file_id": f.get("file_id")})
        await state.update_data(
            title=listing.get('title', ''),
            description=listing.get('description', ''),
            photos=images,
            media=media,
            category_name=listing.get('category', ''),
            price=price_val,
            location=listing.get('location', ''),
            editing_listing_id=listing_id
        )
        await state.set_state(CreateListing.waiting_for_confirmation)
        await show_preview(user_id, state, callback=callback)
    except Exception as e:
        print(f"Error starting edit rejected listing: {e}")
        await callback.answer("❌ Помилка", show_alert=True)


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


def _parse_my_listings_page(callback_data: str) -> int:
    """Парсить номер сторінки з callback_data: back_to_my_listings або back_to_my_listings_1."""
    if callback_data == "back_to_my_listings":
        return 0
    if callback_data.startswith("back_to_my_listings_"):
        try:
            return int(callback_data.split("_")[-1])
        except (ValueError, IndexError):
            return 0
    return 0


@router.callback_query(F.data.startswith("back_to_my_listings"))
async def back_to_my_listings(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    page = _parse_my_listings_page(callback.data)

    listings = get_user_telegram_listings(user_id)

    if not listings:
        try:
            await callback.message.edit_text(
                t(user_id, 'my_listings.empty'),
                parse_mode="HTML"
            )
        except Exception:
            await callback.message.answer(
                t(user_id, 'my_listings.empty'),
                parse_mode="HTML"
            )
        await callback.answer()
        return

    text, keyboard = _build_my_listings_page(user_id, listings, page)
    try:
        await callback.message.edit_text(
            text,
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    except Exception:
        await callback.message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML"
        )

    await callback.answer()


@router.callback_query(F.data.startswith("my_listings_page_"))
async def my_listings_page(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    try:
        page = int(callback.data.split("_")[-1])
    except (ValueError, IndexError):
        page = 0

    listings = get_user_telegram_listings(user_id)
    if not listings:
        try:
            await callback.message.edit_text(
                t(user_id, 'my_listings.empty'),
                parse_mode="HTML"
            )
        except Exception:
            await callback.message.answer(
                t(user_id, 'my_listings.empty'),
                parse_mode="HTML"
            )
        await callback.answer()
        return

    text, keyboard = _build_my_listings_page(user_id, listings, page)
    try:
        await callback.message.edit_text(
            text,
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    except Exception:
        await callback.message.answer(
            text,
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
