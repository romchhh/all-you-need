import os
from aiogram.types import (
    InlineKeyboardMarkup, 
    InlineKeyboardButton, 
    ReplyKeyboardMarkup, 
    KeyboardButton, 
    WebAppInfo
)
from dotenv import load_dotenv

load_dotenv()

# URL оферти на сайті
OFFER_URL = os.getenv('WEBAPP_URL', 'https://your-domain.com') + '/oferta'


def get_agreement_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура з офертою для користувача"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📋 Прочитати оферту", url=OFFER_URL)],
        [InlineKeyboardButton(text="✅ Погоджуюсь", callback_data=f"agree_{user_id}")],
        [InlineKeyboardButton(text="❌ Відхилити", callback_data="decline_agreement")]
    ])


def get_phone_share_keyboard() -> ReplyKeyboardMarkup:
    """Клавіатура для поділу номером телефону"""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📱 Поділитися номером телефону", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True
    )


def get_catalog_webapp_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура з WebApp кнопкою для відкриття каталогу"""
    webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
    webapp_url_with_id = f"{webapp_url}?telegramId={user_id}"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🛍️ Відкрити каталог",
            web_app=WebAppInfo(url=webapp_url_with_id)
        )]
    ])
