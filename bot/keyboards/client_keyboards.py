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
    offer_webapp_url = f"{offer_url}?telegramId={user_id}" if "?" not in offer_url else f"{offer_url}&telegramId={user_id}"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(user_id, 'agreement.read_button'), web_app=WebAppInfo(url=offer_webapp_url))],
        [InlineKeyboardButton(text=t(user_id, 'agreement.agree_button'), callback_data=f"agree_{user_id}")],
        [InlineKeyboardButton(text=t(user_id, 'agreement.decline_button'), callback_data="decline_agreement")]
    ])


def get_username_prompt_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура для кроку «немає юзернейму» на початку реєстрації."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'registration.added_username'),
            callback_data=f"username_check_{user_id}"
        )],
        [InlineKeyboardButton(
            text=t(user_id, 'registration.use_phone_instead'),
            callback_data=f"username_use_phone_{user_id}"
        )]
    ])


def get_phone_share_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    """Одна кнопка — поділитися номером (для користувачів без username після оферти)."""
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
    
    referral_button = KeyboardButton(
        text=t(user_id, 'referral.menu_button')
    )
    
    polezno_button = KeyboardButton(
        text=t(user_id, 'menu.polezno')
    )
    
    return ReplyKeyboardMarkup(
        keyboard=[
            [add_listing_button, my_listings_button],
            [about_us_button, my_profile_button],
            [support_button, referral_button],
            [polezno_button]
        ],
        resize_keyboard=True,
        is_persistent=True
    )


def get_about_us_keyboard(user_id: int) -> InlineKeyboardMarkup:
    instagram_url = os.getenv('INSTAGRAM_URL', 'https://www.instagram.com/tradeground?igsh=MWs3dnEybWpscXY4dQ==')
    tiktok_url = os.getenv('TIKTOK_URL', 'https://www.tiktok.com/@tradeground')
    lang = get_user_lang(user_id)
    offer_url = get_offer_url(lang)
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.instagram'),
                url=instagram_url
            ),
            InlineKeyboardButton(
                text=t(user_id, 'about_us.tiktok'),
                url=tiktok_url
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.telegram'),
                callback_data="about_telegram"
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
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.partners'),
                callback_data="about_partners"
            )
        ],

    ])


def get_about_us_back_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t(user_id, 'about_us.back'),
            callback_data="about_us_main"
        )]
    ])


def get_about_us_telegram_channels_keyboard(user_id: int) -> InlineKeyboardMarkup:
    hamburg_url = os.getenv('TELEGRAM_URL', 'https://t.me/TradeGroundHamburg')
    germany_url = os.getenv('TELEGRAM_GERMANY_URL', 'https://t.me/TradeGroundGermany')
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.telegram_channel_hamburg'),
                url=hamburg_url
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.telegram_channel_germany'),
                url=germany_url
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.telegram_channel_polezno'),
                callback_data="partner_polezno"
            )
        ],
        [InlineKeyboardButton(
            text=t(user_id, 'about_us.back'),
            callback_data="about_us_main"
        )]
    ])


# Партнери: id для callback_data та ключ назви кнопки в локалі
PARTNERS_LIST = [
    {"id": "sho_events", "name_key": "about_us.partner_name_sho_events"},
    {"id": "polezno", "name_key": "about_us.partner_name_polezno"},
    {"id": "mebel_nrw", "name_key": "about_us.partner_name_mebel_nrw"},
    {"id": "events_pati", "name_key": "about_us.partner_name_events_pati"},
]


def get_partners_list_keyboard(user_id: int) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(
            text=t(user_id, p["name_key"]),
            callback_data=f"partner_{p['id']}"
        )]
        for p in PARTNERS_LIST
    ]
    buttons.append([
        InlineKeyboardButton(
            text=t(user_id, 'about_us.back'),
            callback_data="about_us_main"
        )
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_partner_detail_keyboard(user_id: int, partner_url: str, link_label_key: str = "about_us.partner_link_instagram") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(user_id, link_label_key), url=partner_url)],
        [InlineKeyboardButton(text=t(user_id, 'about_us.back'), callback_data="partners_back")]
    ])


def get_about_us_rules_keyboard(user_id: int) -> InlineKeyboardMarkup:
    lang = get_user_lang(user_id)
    offer_url = get_offer_url(lang)
    offer_webapp_url = f"{offer_url}?telegramId={user_id}" if "?" not in offer_url else f"{offer_url}&telegramId={user_id}"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'about_us.open_full_version'),
                web_app=WebAppInfo(url=offer_webapp_url)
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


def get_referral_keyboard(user_id: int, bot_username: str) -> InlineKeyboardMarkup:
    """Створює клавіатуру для реферальної програми"""
    import urllib.parse
    referral_link = f"https://t.me/{bot_username}?start=ref_{user_id}"
    share_text = t(user_id, 'referral.share_text')
    share_url = f"https://t.me/share/url?url={urllib.parse.quote(referral_link)}&text={urllib.parse.quote(share_text)}"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=t(user_id, 'referral.share_button'),
                url=share_url
            )
        ]
    ])


def get_category_translation(user_id: int, category_name: str) -> str:
    """Отримує переклад назви категорії з урахуванням мови користувача"""
    # Мапінг українських назв категорій (як вони зберігаються в БД) до ключів перекладу
    category_map = {
        'Послуги': 'categories.services',
        'Вакансія/пошук роботи': 'categories.vacancy',
        'Доставка/перевезення': 'categories.delivery',
        'Нерухомість': 'categories.realestate',
        'Автопослуги': 'categories.auto_services',
        'Реклама бізнесу': 'categories.business_ad',
        'Послуги для дітей': 'categories.kids_services',
        'Краса та здоров\'я': 'categories.beauty_health',
        'Інше': 'categories.other',
        'Подія': 'categories.event',
        # Російські назви (на випадок якщо в БД будуть російські)
        'Услуги': 'categories.services',
        'Вакансия/поиск работы': 'categories.vacancy',
        'Доставка/перевозки': 'categories.delivery',
        'Недвижимость': 'categories.realestate',
        'Автоуслуги': 'categories.auto_services',
        'Реклама бизнеса': 'categories.business_ad',
        'Услуги для детей': 'categories.kids_services',
        'Красота и здоровье': 'categories.beauty_health',
        'Другое': 'categories.other',
        'Мероприятие': 'categories.event',
    }
    
    # Отримуємо ключ перекладу для категорії
    translation_key = category_map.get(category_name)
    
    # Якщо знайшли ключ, використовуємо переклад з урахуванням мови користувача
    if translation_key:
        return t(user_id, translation_key)
    
    # Якщо не знайшли, повертаємо оригінальну назву
    return category_name


def get_categories_keyboard(user_id: int, categories: list) -> InlineKeyboardMarkup:
    keyboard = []
    for category in categories:
        category_name = get_category_translation(user_id, category['name'])
        keyboard.append([
            InlineKeyboardButton(
                text=f"{category.get('icon', '📂')} {category_name}",
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
        # Для підкатегорій також використовуємо переклад, якщо він є
        subcat_name = get_category_translation(user_id, subcat['name'])
        keyboard.append([
            InlineKeyboardButton(
                text=subcat_name,
                callback_data=f"subcat_{subcat['id']}_{category_id}"
            )
        ])
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.back'),
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
        'standard': {'name': t(user_id, 'tariffs.standard_name'), 'price': 3.0, 'icon': '📌', 'base': True},
        'highlighted': {'name': t(user_id, 'tariffs.highlighted_name'), 'price': 1.5, 'icon': '⭐', 'base': False},
        'pinned_12h': {'name': t(user_id, 'tariffs.pinned_12h_name'), 'price': 2.5, 'icon': '📌', 'base': False},
        'pinned_24h': {'name': t(user_id, 'tariffs.pinned_24h_name'), 'price': 4.5, 'icon': '📌', 'base': False},
        'story': {'name': t(user_id, 'tariffs.story_name'), 'price': 5.0, 'icon': '📸', 'base': False}
    }
    
    keyboard = []
    
    # Додаємо кнопки для кожного тарифу з чекбоксами
    for tariff_type, info in tariff_info.items():
        is_selected = tariff_type in selected_tariffs
        
        # Базова публікація завжди вибрана і не може бути знята
        if info['base']:
            checkbox = '✔️'
            # Додаємо "Безкоштовно" без закреслення
            free_text = t(user_id, 'common.free')
            button_text = f"{checkbox} {info['icon']} {info['name']} — {free_text} {t(user_id, 'tariffs.base_label')}"
            # Не додаємо callback для базової публікації - вона не може бути знята
            keyboard.append([
                InlineKeyboardButton(
                    text=button_text,
                    callback_data="tariff_base_locked"
                )
            ])
        else:
            checkbox = '✔️' if is_selected else '☐'
            button_text = f"{checkbox} {info['icon']} {info['name']} — {info['price']}€"
            
            keyboard.append([
                InlineKeyboardButton(
                    text=button_text,
                    callback_data=f"tariff_toggle_{tariff_type}"
                )
            ])
    
    # Завжди показуємо кнопку "Готово" (базова публікація завжди вибрана)
    # Базова публікація тепер безкоштовна (0€)
    base_price = 0.0
    additional_price = sum(tariff_info[tariff]['price'] for tariff in selected_tariffs if tariff != 'standard' and tariff in tariff_info)
    total_price = base_price + additional_price
    
    # Формуємо текст кнопки "Готово" - якщо сума 0, показуємо "Безкоштовно"
    if total_price == 0:
        done_text = f"✅ {t(user_id, 'common.continue')} ({t(user_id, 'common.free')})"
    else:
        done_text = t(user_id, 'tariffs.done_button', total=total_price)
    
    keyboard.append([
        InlineKeyboardButton(
            text=done_text,
            callback_data="tariff_confirm"
        )
    ])
    
    # Кнопка "Скасувати" для повернення в головне меню
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.cancel_button'),
            callback_data="cancel_listing"
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
                text=t(user_id, 'payment.pay_from_balance', balance=balance),
                callback_data="payment_balance"
            )
        ])
    
    # Кнопка оплати картою (URL-кнопка якщо є посилання)
    if payment_url:
        keyboard.append([
            InlineKeyboardButton(
                text=t(user_id, 'payment.pay_by_card'),
                url=payment_url
            )
        ])
    else:
        # Fallback на callback якщо посилання ще не готове
        keyboard.append([
            InlineKeyboardButton(
                text=t(user_id, 'payment.pay_by_card'),
                callback_data="payment_card"
            )
        ])
    
    # Кнопка "Назад" для повернення до вибору тарифів
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.back'),
            callback_data="back_to_tariffs"
        )
    ])
    
    # Кнопка "Скасувати" для повернення в головне меню
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.cancel_button'),
            callback_data="cancel_listing"
        )
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_region_selection_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура для вибору регіону: Гамбург або інші регіони Німеччини"""
    keyboard = [
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.region.hamburg'),
                callback_data="region_hamburg"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.region.other_germany'),
                callback_data="region_other_germany"
            )
        ],
        [
            InlineKeyboardButton(
                text=t(user_id, 'create_listing.cancel'),
                callback_data="cancel_listing"
            )
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_german_cities_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура для міст Гамбурга та околиць"""
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
    
    # Додаємо кнопку "Назад"
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.back'),
            callback_data="back_from_location"
        )
    ])
    
    # Додаємо кнопку "Скасувати"
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.cancel'),
            callback_data="cancel_listing"
        )
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_other_germany_cities_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Клавіатура для інших міст Німеччини"""
    cities = [
        "Berlin", "Bremen",
        "Hannover", "München",
        "Frankfurt", "Köln",
        "Düsseldorf", "Stuttgart",
        "Leipzig", "Dortmund"
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
    
    # Додаємо кнопку "Назад"
    keyboard.append([
        InlineKeyboardButton(
            text=t(user_id, 'create_listing.back'),
            callback_data="back_from_location"
        )
    ])
    
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
