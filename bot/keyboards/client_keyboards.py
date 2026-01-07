import os
from aiogram.types import (
    InlineKeyboardMarkup, 
    InlineKeyboardButton, 
    ReplyKeyboardMarkup, 
    KeyboardButton, 
    WebAppInfo
)
from dotenv import load_dotenv
from utils.translations import t, get_user_lang

load_dotenv()

# URL оферти на сайті
def get_offer_url(language: str = 'uk') -> str:
    base_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
    return f"{base_url}/{language}/oferta"


def get_agreement_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура з офертою для користувача"""
    lang = get_user_lang(user_id)
    offer_url = get_offer_url(lang)
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(user_id, 'agreement.read_button'), url=offer_url)],
        [InlineKeyboardButton(text=t(user_id, 'agreement.agree_button'), callback_data=f"agree_{user_id}")],
        [InlineKeyboardButton(text=t(user_id, 'agreement.decline_button'), callback_data="decline_agreement")]
    ])


def get_phone_share_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    """Клавіатура для поділу номером телефону"""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=t(user_id, 'phone.share_button'), request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True
    )


def get_catalog_webapp_keyboard(user_id: int, language: str = None) -> InlineKeyboardMarkup:
    """Клавіатура з WebApp кнопкою для відкриття каталогу"""
    webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
    lang = language or get_user_lang(user_id)
    webapp_url_with_params = f"{webapp_url}/{lang}?telegramId={user_id}"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'welcome.catalog_button'),
            web_app=WebAppInfo(url=webapp_url_with_params)
        )]
    ])


def get_language_selection_keyboard() -> InlineKeyboardMarkup:
    """Клавіатура для вибору мови"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Українська", callback_data="set_lang_uk")],
        [InlineKeyboardButton(text="Русский", callback_data="set_lang_ru")]
    ])
