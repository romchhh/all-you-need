from aiogram import Router, types, F
from main import bot
from utils.filters import IsAdmin
from aiogram.fsm.context import FSMContext
from aiogram.filters import StateFilter
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from keyboards.admin_keyboards import get_broadcast_keyboard, create_post, publish_post, post_keyboard, back_mailing_keyboard, confirm_mailing
from utils.admin_functions import parse_url_buttons, format_entities
from Content.texts import mailing_text
from database_functions.admin_db import get_all_user_ids
from states.admin_states import Mailing
import asyncio


router = Router()


user_data = {}

# Тимчасове сховище медіагруп під час збирання: { (user_id, media_group_id): [file_id, ...] }
_media_group_buffer: dict[tuple, list[str]] = {}
# Задачі таймерів для медіагруп: { (user_id, media_group_id): Task }
_media_group_tasks: dict[tuple, asyncio.Task] = {}


def initialize_user_data(user_id: str):
    if user_id not in user_data:
        user_data[user_id] = {}


async def send_preview(chat_id: int, user_id: int, url_buttons: list = None):
    """Відправляє превʼю поста адміну: альбом якщо > 1 фото, інакше одне фото/відео/документ або текст."""
    media_info = user_data[user_id].get('media')
    media_type = user_data[user_id].get('media_type')
    content_info = user_data[user_id].get('content', '') or ''
    kb = create_post(user_data, user_id, url_buttons)

    if media_type == 'photo':
        photos = media_info if isinstance(media_info, list) else [media_info]
        if len(photos) == 1:
            await bot.send_photo(chat_id, photos[0], caption=content_info or None, parse_mode='HTML', reply_markup=kb)
        else:
            media_group = [
                types.InputMediaPhoto(
                    media=pid,
                    caption=content_info if i == 0 else None,
                    parse_mode='HTML' if i == 0 else None
                )
                for i, pid in enumerate(photos)
            ]
            await bot.send_media_group(chat_id=chat_id, media=media_group)
            # Кнопки керування постом окремим повідомленням (без дублювання тексту)
            await bot.send_message(
                chat_id,
                f"📸 Фото у розсилці: {len(photos)}",
                reply_markup=kb
            )
    elif media_type == 'video':
        await bot.send_video(chat_id, media_info, caption=content_info or None, parse_mode='HTML', reply_markup=kb)
    elif media_type == 'document':
        await bot.send_document(chat_id, media_info, caption=content_info or None, parse_mode='HTML', reply_markup=kb)
    else:
        await bot.send_message(chat_id, content_info, parse_mode='HTML', reply_markup=kb)


      
@router.message(IsAdmin(), lambda message: message.text == "Розсилка")
async def create_mailing(message: types.Message):
    user_id = message.from_user.id
    description = mailing_text
    await message.answer(description, parse_mode='HTML', reply_markup=get_broadcast_keyboard())
    
 

@router.callback_query(IsAdmin(), F.data =="create_post")
async def process_channel_selection(callback_query: CallbackQuery, state: FSMContext):
    user_id = callback_query.from_user.id
    initialize_user_data(user_id)
    
    await state.set_state(Mailing.content)
    inline_kb_list = [
        [InlineKeyboardButton(text="Назад", callback_data="back_to_posts")]
    ]
    reply_markup = InlineKeyboardMarkup(inline_keyboard=inline_kb_list)

    await callback_query.message.edit_text(
        "Будь ласка, надішліть те, що ви хочете розіслати користувачам:",
        parse_mode='HTML',
        reply_markup=reply_markup
    )
    
async def _flush_media_group(user_id: int, mg_id: str, state: FSMContext, context: str):
    """Викликається після затримки: збирає всі фото з буфера і відповідає адміну один раз."""
    await asyncio.sleep(0.7)
    key = (user_id, mg_id)
    photos = _media_group_buffer.pop(key, [])
    _media_group_tasks.pop(key, None)
    if not photos:
        return

    user_data[user_id]['media'] = photos
    user_data[user_id]['media_type'] = 'photo'
    content_info = user_data[user_id].get('content', '')
    url_buttons = user_data[user_id].get('url_buttons')

    await send_preview(user_id, user_id, url_buttons)

    if context == 'content':
        await state.clear()


@router.message(Mailing.content)
async def handle_content(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    content_type = message.content_type
    html_content = None

    if content_type == 'text':
        content_info = message.text
        entities = message.entities
        html_content = format_entities(content_info, entities) if entities else content_info
        user_data[user_id]['content'] = html_content
        await state.update_data(content=html_content)
        await message.answer(html_content, parse_mode='HTML', reply_markup=create_post(user_data, user_id, user_data[user_id].get('url_buttons')))
        user_data[user_id]['media'] = None
        user_data[user_id]['media_type'] = None
        await state.clear()

    elif content_type == 'photo':
        photo_id = message.photo[-1].file_id
        mg_id = message.media_group_id

        if mg_id:
            key = (user_id, mg_id)
            if key not in _media_group_buffer:
                _media_group_buffer[key] = []
            _media_group_buffer[key].append(photo_id)
            if key in _media_group_tasks:
                _media_group_tasks[key].cancel()
            _media_group_tasks[key] = asyncio.create_task(
                _flush_media_group(user_id, mg_id, state, 'content')
            )
        else:
            user_data[user_id]['media'] = [photo_id]
            user_data[user_id]['media_type'] = 'photo'
            await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))
            await state.clear()

    elif content_type == 'video':
        media_info = message.video.file_id
        user_data[user_id]['media'] = media_info
        user_data[user_id]['media_type'] = 'video'
        await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))
        await state.clear()

    elif content_type == 'document':
        media_info = message.document.file_id
        user_data[user_id]['media'] = media_info
        user_data[user_id]['media_type'] = 'document'
        await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))
        await state.clear()

    else:
        await message.answer("Невідомий формат.")

    
@router.callback_query(F.data.startswith('media_'))
async def handle_media(callback_query: types.CallbackQuery, state: FSMContext):
    await state.set_state(Mailing.media)
    await callback_query.message.answer(
        "Будь ласка, надішліть медіа, яке ви хочете додати або змінити:",
        reply_markup=back_mailing_keyboard())

@router.message(Mailing.media)
async def handle_media_content(message: types.Message, state: FSMContext):
    user_id = message.from_user.id

    if message.content_type == 'photo':
        photo_id = message.photo[-1].file_id
        mg_id = message.media_group_id

        if mg_id:
            # Фото з медіагрупи — накопичуємо у буфер
            key = (user_id, mg_id)
            if key not in _media_group_buffer:
                _media_group_buffer[key] = []
            _media_group_buffer[key].append(photo_id)

            # Скасовуємо попередній таймер і запускаємо новий
            if key in _media_group_tasks:
                _media_group_tasks[key].cancel()
            _media_group_tasks[key] = asyncio.create_task(
                _flush_media_group(user_id, mg_id, state, 'media')
            )
            # Не відповідаємо зараз — _flush_media_group відповість один раз
            return

        # Одне фото без медіагрупи — просто додаємо до списку
        existing = user_data[user_id].get('media')
        if isinstance(existing, list):
            existing.append(photo_id)
        elif existing:
            user_data[user_id]['media'] = [existing, photo_id]
        else:
            user_data[user_id]['media'] = [photo_id]
        user_data[user_id]['media_type'] = 'photo'
        await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))

    elif message.content_type == 'video':
        user_data[user_id]['media'] = message.video.file_id
        user_data[user_id]['media_type'] = 'video'
        await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))

    elif message.content_type == 'document':
        user_data[user_id]['media'] = message.document.file_id
        user_data[user_id]['media_type'] = 'document'
        await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))


@router.callback_query(F.data.startswith('description_'))
async def handle_description(callback_query: types.CallbackQuery, state: FSMContext):
    await state.set_state(Mailing.description)
    await callback_query.message.answer(
        "Будь ласка, надішліть опис, який ви хочете додати або змінити:",
        reply_markup=back_mailing_keyboard())


@router.message(Mailing.description)
async def handle_description_content(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    content_info = message.text
    entities = message.entities or []
    
    formatted_content = format_entities(content_info, entities)
    user_data[user_id]['content'] = formatted_content

    await send_preview(message.chat.id, user_id, user_data[user_id].get('url_buttons'))
    await state.clear()


@router.callback_query(F.data == 'url_buttons_disabled_')
async def handle_url_buttons_disabled(callback_query: types.CallbackQuery):
    await callback_query.answer(
        "⛔ URL-кнопки недоступні при кількох фото.\n"
        "Telegram не підтримує inline-кнопки з альбомом.",
        show_alert=True
    )


@router.callback_query(F.data.startswith('url_buttons_'))
async def handle_url_buttons(callback_query: types.CallbackQuery, state: FSMContext):
    await state.set_state(Mailing.url_buttons)
    await callback_query.message.answer(
        "<b>URL-КНОПКИ</b>\n\n"
        "Будь ласка, надішліть список URL-кнопок у форматі:\n\n"
        "<code>Кнопка 1 - http://link.com\n"
        "Кнопка 2 - http://link.com</code>\n\n"
        "Використовуйте роздільник <code>' | '</code>, щоб додати до 8 кнопок в один ряд (допустимо 15 рядів):\n\n"
        "<code>Кнопка 1 - http://link.com | Кнопка 2 - http://link.com</code>\n\n",
        parse_mode='HTML',
        reply_markup=back_mailing_keyboard(),
        disable_web_page_preview=True)


@router.message(Mailing.url_buttons)
async def handle_url_buttons_content(message: types.Message, state: FSMContext):
    user_id = message.from_user.id

    url_buttons_text = message.text
    url_buttons = parse_url_buttons(url_buttons_text)

    user_data[user_id]['url_buttons'] = url_buttons

    await send_preview(message.chat.id, user_id, url_buttons)
    await state.clear()


@router.callback_query(F.data.startswith('bell_'))
async def handle_comments(callback_query: types.CallbackQuery, state: FSMContext):
    user_id = callback_query.from_user.id
    if 'bell' not in user_data[user_id]:
        user_data[user_id]['bell'] = 0  
    user_data[user_id]['bell'] = 1 if user_data[user_id]['bell'] == 0 else 0
    await callback_query.message.edit_reply_markup(reply_markup=create_post(user_data, user_id, user_data[user_id].get('url_buttons')))

    
@router.callback_query(F.data.startswith('nextmailing_'))
async def handle_url_buttons(callback_query: types.CallbackQuery, state: FSMContext):
    user_id = callback_query.from_user.id
    
    await callback_query.message.answer("<b>💼 НАЛАШТУВАННЯ ВІДПРАВКИ</b>\n\n"
                                           f"Пост готовий до розсилки.", parse_mode='HTML', reply_markup=publish_post())
    
    
@router.callback_query(F.data.startswith('publish_'))
async def confirm_publish(callback_query: types.CallbackQuery, state: FSMContext):
    await callback_query.message.edit_text("Ви впевнені, що хочете зробити розсилку?", reply_markup=confirm_mailing())


@router.callback_query(F.data.startswith('confirm_publish_'))
async def handle_publish_confirmation(callback_query: types.CallbackQuery, state: FSMContext):
    user_id = callback_query.from_user.id
    await callback_query.message.edit_text("Починаю розсилку...", reply_markup=None)
    initialize_user_data(user_id)

    media_info = user_data[user_id].get('media')
    media_type = user_data[user_id].get('media_type')
    content_info = user_data[user_id].get('content')
    url_buttons = user_data[user_id].get('url_buttons')

    bell = user_data[user_id].get('bell', 0) 
    disable_notification = (bell == 0)
    user_ids = get_all_user_ids()

    sent_count = 0
    for recipient_id in user_ids: 
        try:
            if media_info:
                if media_type == 'photo':
                    photos = media_info if isinstance(media_info, list) else [media_info]
                    if len(photos) == 1:
                        # Одне фото з описом і кнопками
                        await bot.send_photo(
                            recipient_id,
                            photos[0],
                            caption=content_info,
                            parse_mode='HTML',
                            reply_markup=post_keyboard(user_data, user_id, url_buttons),
                            disable_notification=disable_notification
                        )
                    else:
                        # Кілька фото — альбом з описом на першому фото
                        media_group = [
                            types.InputMediaPhoto(
                                media=photo_id,
                                caption=content_info if idx == 0 else None,
                                parse_mode='HTML' if idx == 0 else None
                            )
                            for idx, photo_id in enumerate(photos)
                        ]
                        await bot.send_media_group(
                            chat_id=recipient_id,
                            media=media_group,
                            disable_notification=disable_notification
                        )
                        # Якщо є URL-кнопки — окреме повідомлення тільки з кнопками (без тексту)
                        kb = post_keyboard(user_data, user_id, url_buttons)
                        if kb.inline_keyboard:
                            await bot.send_message(
                                recipient_id,
                                '​',  # невидимий символ (zero-width space)
                                reply_markup=kb,
                                disable_notification=disable_notification
                            )
                elif media_type == 'video':
                    await bot.send_video(recipient_id, media_info, caption=content_info, parse_mode='HTML', reply_markup=post_keyboard(user_data, user_id, url_buttons), disable_notification=disable_notification)
                elif media_type == 'document':
                    await bot.send_document(recipient_id, media_info, caption=content_info, parse_mode='HTML', reply_markup=post_keyboard(user_data, user_id, url_buttons), disable_notification=disable_notification)
            else:
                await bot.send_message(recipient_id, content_info, parse_mode='HTML', reply_markup=post_keyboard(user_data, user_id, url_buttons), disable_notification=disable_notification)
            sent_count += 1
        except Exception as e:
            print(f"Failed to send message to user {recipient_id}: {e}")
        await asyncio.sleep(2)

    await callback_query.message.answer(f"Пост опубліковано для {sent_count} користувачів!")


@router.callback_query(F.data == "back_to",)
async def process_channel_info(callback_query: types.CallbackQuery):
    await callback_query.message.delete()
    
@router.callback_query(IsAdmin(), F.data == "back_to_my_post", StateFilter(Mailing.content, Mailing.media, Mailing.description, Mailing.url_buttons))
async def process_channel_info(callback_query: types.CallbackQuery, state: FSMContext):
    await callback_query.message.delete()
    await state.clear()

@router.callback_query(IsAdmin(), F.data == "back_to_posts", Mailing.content)
async def process_channel_info(callback_query: types.CallbackQuery, state: FSMContext):
    await state.clear()
    description = mailing_text
    await callback_query.message.edit_text(description, parse_mode='HTML', reply_markup=get_broadcast_keyboard())

    
@router.callback_query(F.data == 'cancel_publish')
async def cancel_publish(callback_query: types.CallbackQuery):
    await callback_query.answer("Публікацію скасовано.", show_alert=True)