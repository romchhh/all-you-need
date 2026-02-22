import os
from pathlib import Path
from aiogram import Router, types, F
from aiogram.types import FSInputFile
from utils.translations import t
from keyboards.client_keyboards import (
    get_about_us_keyboard,
    get_about_us_back_keyboard,
    get_about_us_rules_keyboard,
    get_partners_list_keyboard,
    get_partner_detail_keyboard,
)

router = Router()

# Директорія Content відносно кореня бота
BOT_ROOT = Path(__file__).resolve().parent.parent.parent

# Дані партнерів: id, шлях до фото, URL, ключ підпису в локалі
PARTNERS_DATA = {
    "sho_events": {
        "photo": BOT_ROOT / "Content" / "474905083_18135166426381507_7459950685770101771_n.jpg",
        "url": "https://www.instagram.com/sho_events_?igsh=emljYjRkZWNqd2w3",
        "caption_key": "about_us.partner_caption_sho_events",
    },
}


@router.message(F.text.in_([
    "ℹ️ Про нас",  # UK
    "ℹ️ О нас"     # RU
]))
async def about_us_handler(message: types.Message):
    user_id = message.from_user.id
    
    about_text = (
        t(user_id, 'about_us.title') +
        t(user_id, 'about_us.description')
    )
    
    await message.answer(
        about_text,
        reply_markup=get_about_us_keyboard(user_id),
        parse_mode="HTML"
    )


@router.callback_query(F.data == "about_us_main")
async def about_us_main_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    about_text = (
        t(user_id, 'about_us.title') +
        t(user_id, 'about_us.description')
    )
    
    await callback.message.edit_text(
        about_text,
        reply_markup=get_about_us_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_tariffs")
async def about_tariffs_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    tariffs_text = t(user_id, 'about_us.tariffs_text')
    
    await callback.message.edit_text(
        tariffs_text,
        reply_markup=get_about_us_back_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_faq")
async def about_faq_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    faq_text = t(user_id, 'about_us.faq_text')
    
    await callback.message.edit_text(
        faq_text,
        reply_markup=get_about_us_back_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_instructions")
async def about_instructions_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    instructions_text = t(user_id, 'about_us.instructions_text')
    
    await callback.message.edit_text(
        instructions_text,
        reply_markup=get_about_us_back_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_rules")
async def about_rules_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    rules_text = t(user_id, 'about_us.rules_text')
    
    await callback.message.edit_text(
        rules_text,
        reply_markup=get_about_us_rules_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_partners")
async def about_partners_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    partners_title = t(user_id, 'about_us.partners_title')
    await callback.message.edit_text(
        partners_title,
        reply_markup=get_partners_list_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data.startswith("partner_"))
async def partner_detail_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    partner_id = callback.data.replace("partner_", "", 1)
    if partner_id not in PARTNERS_DATA:
        await callback.answer()
        return
    data = PARTNERS_DATA[partner_id]
    photo_path = data["photo"]
    if not photo_path.exists():
        await callback.answer("Фото тимчасово недоступне.", show_alert=True)
        return
    caption = t(user_id, data["caption_key"])
    keyboard = get_partner_detail_keyboard(user_id, data["url"])
    photo_file = FSInputFile(str(photo_path))
    await callback.message.answer_photo(
        photo_file,
        caption=caption,
        reply_markup=keyboard,
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "partners_back")
async def partners_back_callback(callback: types.CallbackQuery):
    await callback.message.delete()
    await callback.answer()
