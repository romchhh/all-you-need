import os
from pathlib import Path
from aiogram import Router, types, F
from aiogram.types import FSInputFile
from utils.translations import t
from keyboards.client_keyboards import (
    get_about_us_keyboard,
    get_about_us_back_keyboard,
    get_about_us_rules_keyboard,
    get_about_us_telegram_channels_keyboard,
    get_partners_list_keyboard,
    get_partner_detail_keyboard,
    get_trade_ground_channel_urls,
)

router = Router()

# Директорія Content відносно кореня бота
BOT_ROOT = Path(__file__).resolve().parent.parent.parent

# Дані партнерів: id, шлях до фото, URL, ключ підпису в локалі, опційно link_label_key для кнопки
PARTNERS_DATA = {
    "sho_events": {
        "photo": BOT_ROOT / "Content" / "474905083_18135166426381507_7459950685770101771_n.jpg",
        "url": "https://www.instagram.com/sho_events_?igsh=emljYjRkZWNqd2w3",
        "caption_key": "about_us.partner_caption_sho_events",
    },
    "polezno": {
        "photo": BOT_ROOT / "Content" / "IMAGE 2026-03-01 12:54:18.jpg",
        "url": "https://t.me/+V6huVx7G1-85OWE6",
        "caption_key": "about_us.partner_caption_polezno",
        "link_label_key": "about_us.partner_link_channel",
    },
    "mebel_nrw": {
        "photo": BOT_ROOT / "Content" / "IMAGE 2026-03-06 14:16:49.jpg",
        "url": "https://t.me/mebelitexnikaNRW",
        "caption_key": "about_us.partner_caption_mebel_nrw",
        "link_label_key": "about_us.partner_link_channel",
    },
    "events_pati": {
        "photo": BOT_ROOT / "Content" / "C6807DF5-A3FC-4129-820B-461A6FB61202.JPG",
        "url": "https://t.me/eventspati_de",
        "caption_key": "about_us.partner_caption_events_pati",
        "link_label_key": "about_us.partner_link_channel",
    },
}


# Кнопка в головному меню (RU / UK): текст розділу + inline-кнопки каналів.
TRADE_CHANNELS_MENU_BUTTON_TEXTS = [
    "📢 Каналы TradeGround",
    "📢 Канали TradeGround",
]

# Стара reply-кнопка для сумісності — одразу екран Polezno.
POLEZNO_LEGACY_REPLY_BUTTON_TEXTS = ["🇩🇪 Polezno | Germany"]


@router.message(F.text.in_(TRADE_CHANNELS_MENU_BUTTON_TEXTS))
async def trade_channels_menu_handler(message: types.Message):
    """Текст «Каналы TradeGround» + Hamburg/Germany (url) + Polezno (callback з інфо)."""
    user_id = message.from_user.id
    hamburg_url, germany_url = get_trade_ground_channel_urls()
    text = t(
        user_id,
        "about_us.telegram_channels_text",
        hamburg_url=hamburg_url,
        germany_url=germany_url,
    )
    await message.answer(
        text,
        reply_markup=get_about_us_telegram_channels_keyboard(user_id),
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


@router.message(F.text.in_(POLEZNO_LEGACY_REPLY_BUTTON_TEXTS))
async def polezno_menu_handler(message: types.Message):
    """Стара кнопка «Polezno» — фото, опис, кнопка посилання на канал."""
    user_id = message.from_user.id
    result = _send_partner_content(message.chat.id, user_id, "polezno")
    if not result:
        await message.answer("Фото тимчасово недоступне.")
        return
    photo_file, caption, keyboard = result
    await message.answer_photo(
        photo_file,
        caption=caption,
        reply_markup=keyboard,
        parse_mode="HTML",
    )


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


@router.callback_query(F.data == "about_telegram")
async def about_telegram_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    hamburg_url, germany_url = get_trade_ground_channel_urls()
    text = t(
        user_id,
        "about_us.telegram_channels_text",
        hamburg_url=hamburg_url,
        germany_url=germany_url,
    )
    await callback.message.edit_text(
        text,
        reply_markup=get_about_us_telegram_channels_keyboard(user_id),
        parse_mode="HTML",
        disable_web_page_preview=True,
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


def _send_partner_content(chat_id: int, user_id: int, partner_id: str):
    """Надсилає фото, опис і кнопку посилання для партнера (для callback і message handler)."""
    if partner_id not in PARTNERS_DATA:
        return
    data = PARTNERS_DATA[partner_id]
    photo_path = data["photo"]
    if not photo_path.exists():
        return
    caption = t(user_id, data["caption_key"])
    link_label_key = data.get("link_label_key", "about_us.partner_link_instagram")
    keyboard = get_partner_detail_keyboard(user_id, data["url"], link_label_key=link_label_key)
    photo_file = FSInputFile(str(photo_path))
    return photo_file, caption, keyboard


@router.callback_query(F.data.startswith("partner_"))
async def partner_detail_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    partner_id = callback.data.replace("partner_", "", 1)
    result = _send_partner_content(callback.message.chat.id, user_id, partner_id)
    if not result:
        await callback.answer("Фото тимчасово недоступне.", show_alert=True)
        return
    photo_file, caption, keyboard = result
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
