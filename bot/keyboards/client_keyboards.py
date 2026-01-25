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

def get_offer_url(language: str = 'uk') -> str:
    base_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
    return f"{base_url}/{language}/oferta"


def get_agreement_keyboard(user_id: int) -> InlineKeyboardMarkup:
    lang = get_user_lang(user_id)
    offer_url = get_offer_url(lang)
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(user_id, 'agreement.read_button'), url=offer_url)],
        [InlineKeyboardButton(text=t(user_id, 'agreement.agree_button'), callback_data=f"agree_{user_id}")],
        [InlineKeyboardButton(text=t(user_id, 'agreement.decline_button'), callback_data="decline_agreement")]
    ])


def get_phone_share_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=t(user_id, 'phone.share_button'), request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True
    )


def get_catalog_webapp_keyboard(user_id: int, language: str = None) -> InlineKeyboardMarkup:
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
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Українська", callback_data="set_lang_uk")],
        [InlineKeyboardButton(text="Русский", callback_data="set_lang_ru")]
    ])


def get_main_menu_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
    lang = get_user_lang(user_id)
    
    add_listing_button = KeyboardButton(
        text=t(user_id, 'menu.add_listing')
    )
    
    my_listings_button = KeyboardButton(
        text=t(user_id, 'menu.my_listings')
    )
    
    about_us_button = KeyboardButton(
        text=t(user_id, 'menu.about_us')
    )
    
    my_profile_button = KeyboardButton(
        text=t(user_id, 'menu.my_profile'),
        web_app=WebAppInfo(url=f"{webapp_url}/{lang}/profile?telegramId={user_id}")
    )
    
    support_button = KeyboardButton(
        text=t(user_id, 'menu.support')
    )
    
    return ReplyKeyboardMarkup(
        keyboard=[
            [add_listing_button, my_listings_button],
            [about_us_button, my_profile_button],
            [support_button]
        ],
        resize_keyboard=True,
        is_persistent=True
    )


def get_about_us_keyboard(user_id: int) -> InlineKeyboardMarkup:
    telegram_url = os.getenv('TELEGRAM_URL', 'https://t.me/your_channel')
    instagram_url = os.getenv('INSTAGRAM_URL', 'https://instagram.com/your_account')
    tiktok_url = os.getenv('TIKTOK_URL', 'https://tiktok.com/@your_account')
    support_url = os.getenv('SUPPORT_URL', telegram_url)  # Якщо немає окремого URL, використовуємо telegram
    lang = get_user_lang(user_id)
    offer_url = get_offer_url(lang)
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.telegram'),
                url=telegram_url
            ),
            InlineKeyboardButton(
                text=t(user_id, 'about_us.instagram'),
                url=instagram_url
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.tiktok'),
                url=tiktok_url
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.tariffs'),
                callback_data="about_tariffs"
            ),
            InlineKeyboardButton(
                text=t(user_id, 'about_us.faq'),
                callback_data="about_faq"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.instructions'),
                callback_data="about_instructions"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.rules'),
                callback_data="about_rules"
            )
        ]
    ])


def get_about_us_back_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'about_us.back'),
            callback_data="about_us_main"
        )]
    ])


def get_about_us_rules_keyboard(user_id: int) -> InlineKeyboardMarkup:
    lang = get_user_lang(user_id)
    offer_url = get_offer_url(lang)
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.open_full_version'),
                url=offer_url
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.back'),
                callback_data="about_us_main"
            )
        ]
    ])


def get_support_keyboard(user_id: int) -> InlineKeyboardMarkup:
    support_manager = os.getenv('SUPPORT_MANAGER', 'https://t.me/your_support_manager')
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'support.contact_manager'),
                url=support_manager
            )
        ]
    ])


def get_categories_keyboard(user_id: int, categories: list) -> InlineKeyboardMarkup:
    keyboard = []
    for category in categories:
        keyboard.append([
            InlineKeyboardButton(
                text=f"{category.get('icon', '📂')} {category['name']}",
                callback_data=f"cat_{category['id']}"
            )
        ])
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.cancel'),
            callback_data="cancel_listing"
        )
    ])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_subcategories_keyboard(user_id: int, subcategories: list, category_id: int) -> InlineKeyboardMarkup:
    keyboard = []
    for subcat in subcategories:
        keyboard.append([
            InlineKeyboardButton(
                text=subcat['name'],
                callback_data=f"subcat_{subcat['id']}_{category_id}"
            )
        ])
    keyboard.append([
        InlineKeyboardButton(
            text="⬅️ Назад",
            callback_data="back_to_categories"
        )
    ])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_condition_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.condition_new'),
                callback_data="condition_new"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.condition_used'),
                callback_data="condition_used"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.cancel'),
                callback_data="cancel_listing"
            )
        ]
    ])


def get_listing_confirmation_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.confirm_button'),
                callback_data="confirm_listing"
            ),
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.cancel_button'),
                callback_data="cancel_listing"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_button'),
                callback_data="edit_listing_preview"
            )
        ]
    ])


def get_edit_listing_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура для вибору поля для редагування"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_title'),
                callback_data="edit_field_title"
            ),
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_description'),
                callback_data="edit_field_description"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_photos'),
                callback_data="edit_field_photos"
            ),
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_category'),
                callback_data="edit_field_category"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_price'),
                callback_data="edit_field_price"
            ),
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.edit_location'),
                callback_data="edit_field_location"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.back_to_preview'),
                callback_data="back_to_preview"
            )
        ]
    ])


def get_publication_tariff_keyboard(user_id: int, selected_tariffs: list = None) -> InlineKeyboardMarkup:
    """Створює клавіатуру для вибору тарифів публікації з множинним вибором"""
    if selected_tariffs is None:
        selected_tariffs = []
    
    # Завжди включаємо базову публікацію
    if 'standard' not in selected_tariffs:
        selected_tariffs.append('standard')
    
    # Визначаємо ціни та назви тарифів
    # Для рекламних тарифів показуємо тільки додаткову вартість
    tariff_info = {
        'standard': {'name': 'Звичайна публікація', 'price': 3.0, 'icon': '📌', 'base': True},
        'highlighted': {'name': 'Виділене оголошення', 'price': 1.5, 'icon': '⭐', 'base': False},
        'pinned_12h': {'name': 'Закріп на 12 годин', 'price': 2.5, 'icon': '📌', 'base': False},
        'pinned_24h': {'name': 'Закріп на 24 години', 'price': 4.5, 'icon': '📌', 'base': False},
        'story': {'name': 'Сторіс на 24 години', 'price': 5.0, 'icon': '📸', 'base': False}
    }
    
    keyboard = []
    
    # Додаємо кнопки для кожного тарифу з чекбоксами
    for tariff_type, info in tariff_info.items():
        is_selected = tariff_type in selected_tariffs
        
        # Базова публікація завжди вибрана і не може бути знята
        if info['base']:
            checkbox = '✅'
            button_text = f"{checkbox} {info['icon']} {info['name']} — {info['price']}€ (базова)"
            # Не додаємо callback для базової публікації - вона не може бути знята
            keyboard.append([
                InlineKeyboardButton(
                    text=button_text,
                    callback_data="tariff_base_locked"
                )
            ])
        else:
            checkbox = '✅' if is_selected else '☐'
            button_text = f"{checkbox} {info['icon']} {info['name']} — {info['price']}€"
            
            keyboard.append([
                InlineKeyboardButton(
                    text=button_text,
                    callback_data=f"tariff_toggle_{tariff_type}"
                )
            ])
    
    # Завжди показуємо кнопку "Готово" (базова публікація завжди вибрана)
    base_price = tariff_info['standard']['price']
    additional_price = sum(tariff_info[tariff]['price'] for tariff in selected_tariffs if tariff != 'standard' and tariff in tariff_info)
    total_price = base_price + additional_price
    
    keyboard.append([
        InlineKeyboardButton(
            text=f"✅ Готово (Разом: {total_price}€)",
            callback_data="tariff_confirm"
        )
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_payment_method_keyboard(user_id: int, balance: float, amount: float, payment_url: str = None) -> InlineKeyboardMarkup:
    """Створює клавіатуру для вибору способу оплати"""
    keyboard = []
    
    # Кнопка оплати з балансу (тільки якщо достатньо коштів)
    if balance >= amount:
        keyboard.append([
            InlineKeyboardButton(
                text=f"💰 Оплатити з балансу ({balance:.2f}€)",
                callback_data="payment_balance"
            )
        ])
    
    # Кнопка оплати картою (URL-кнопка якщо є посилання)
    if payment_url:
        keyboard.append([
            InlineKeyboardButton(
                text="💳 Оплатити картою",
                url=payment_url
            )
        ])
    else:
        # Fallback на callback якщо посилання ще не готове
        keyboard.append([
            InlineKeyboardButton(
                text="💳 Оплатити картою",
                callback_data="payment_card"
            )
        ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_german_cities_keyboard(user_id: int) -> InlineKeyboardMarkup:
    # Гамбург та найближчі міста
    cities = [
        "Hamburg", "Norderstedt",
        "Pinneberg", "Wedel",
        "Ahrensburg", "Reinbek",
        "Barsbüttel", "Elmshorn",
        "Stade", "Buxtehude"
    ]
    
    keyboard = []
    for i in range(0, len(cities), 2):
        row = []
        row.append(InlineKeyboardButton(
            text=cities[i],
            callback_data=f"city_{cities[i]}"
        ))
        if i + 1 < len(cities):
            row.append(InlineKeyboardButton(
                text=cities[i + 1],
                callback_data=f"city_{cities[i + 1]}"
            ))
        keyboard.append(row)
    
    # Додаємо кнопку "Скасувати"
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.cancel'),
            callback_data="cancel_listing"
        )
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_continue_photos_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура для продовження після додавання фото"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'create_listing.continue_button'),
            callback_data="continue_after_photos"
        )]
    ])
