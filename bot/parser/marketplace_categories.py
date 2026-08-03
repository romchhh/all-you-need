"""
Категорії маркетплейсу (1:1 з app/constants/categories.ts).

AI при approve має повертати саме ці id, інакше оголошення не потрапляє в потрібний розділ.
"""

from __future__ import annotations

import re

# category_id -> { sub_id: "RU label for AI" | None for leaf-only categories }
MARKETPLACE_TAXONOMY: dict[str, dict[str, str] | None] = {
    "services_work": {
        "services": "прочие услуги",
        "repair_installation": "ремонт, монтаж, сантехник, электрик",
        "cleaning": "уборка, клининг",
        "transportation": "перевозки, грузоперевозки",
        "beauty_health": "маникюр, косметолог, массаж, брови, ресницы, тату, пирсинг, эпиляция",
        "it_design_websites": "IT, компьютеры, сайты, программирование",
        "photo_video": "фото, видео, оператор",
        "education_tutors": "репетитор, обучение",
        "translations": "переводы",
        "auto_services": "автосервис",
        "consultations": "консультации",
        "other_services": "другие услуги",
        "vacancies": "вакансии",
        "part_time": "подработка",
        "looking_for_work": "ищу работу",
        "other_work": "другая работа",
    },
    "fashion": {
        "women_clothing": "женская одежда",
        "women_shoes": "женская обувь",
        "men_clothing": "мужская одежда",
        "men_shoes": "мужская обувь",
        "accessories": "сумки, ремни, шарфы, аксессуары",
        "hats": "головные уборы",
        "other": "одежда прочее",
    },
    "furniture": {
        "sofas_chairs": "диваны, кресла",
        "wardrobes_chests": "шкафы, комоды, стеллажи",
        "tables_chairs": "столы, стулья, кухонная мебель",
        "beds_mattresses": "кровати, матрасы",
        "other": "мебель прочее",
    },
    "electronics": {
        "smartphones": "телефоны, смартфоны, iPhone, Samsung",
        "computers_laptops": "ноутбуки, компьютеры, планшеты",
        "tv_audio": "телевизоры, колонки, наушники, аудио",
        "games_consoles": "PlayStation, Xbox, Nintendo, игры",
        "accessories": "зарядки, кабели, чехлы, мониторы",
        "other": "электроника прочее",
    },
    "appliances": {
        "large_appliances": "холодильник, стиральная, сушилка, кондиционер",
        "small_appliances": "пылесос, утюг, мелкая техника",
        "kitchen_appliances": "микроволновка, кофеварка, блендер, кухонная техника",
        "other": "техника прочее",
    },
    "kids": {
        "toys": "игрушки, конструкторы",
        "strollers_car_seats": "коляски, автокресла, слинги",
        "clothing": "детская одежда",
        "beds_furniture": "детская мебель, кроватки",
        "other": "детское прочее",
    },
    "home": {
        "dishes": "посуда, кухонная утварь",
        "textiles": "текстиль, постельное, пледы",
        "lighting": "лампы, люстры, светильники",
        "decor": "декор, картины, вазы, ковры",
        "tools": "инструменты, дрель, перфоратор",
        "other": "для дома прочее",
    },
    "beauty_wellness": {
        "cosmetics": "косметика, кремы, макияж",
        "perfumery": "парфюмерия, духи",
        "personal_care": "уход, фен, эпилятор, для волос",
        "health_products": "БАД, витамины, здоровье",
        "hygiene": "гигиена",
        "other": "краса прочее",
    },
    "auto": {
        "cars": "автомобили",
        "tires_wheels": "шины, диски, колёса",
        "parts": "автозапчасти",
        "accessories": "аксессуары для авто",
        "child_seats": "детские автокресла (товар, не услуга)",
        "other": "авто прочее",
    },
    "hobby_sports": {
        "sports_equipment": "спорт, фитнес, тренажёры",
        "bikes_scooters": "велосипеды, самокаты",
        "music_instruments": "музыкальные инструменты",
        "tourism": "туризм, палатки, походное",
        "collections_hobby": "коллекции, хобби",
        "books_learning": "книги, учебники",
        "other": "хобби прочее",
    },
    "pets": {
        "sell_giveaway": "животные, отдам",
        "pet_goods": "товары для животных",
        "pet_services": "услуги для животных",
        "other": "питомцы прочее",
    },
    "realestate": {
        "rent_apartments": "аренда квартиры",
        "sell_apartments": "продажа квартиры",
        "rooms": "комнаты",
        "houses": "дома",
        "commercial": "коммерческая недвижимость",
        "garages_parking": "гаражи, парковки",
        "other": "недвижимость прочее",
    },
    "free": None,
}

# parser category/sub -> marketplace category/sub
PARSER_TO_MARKETPLACE: dict[tuple[str, str | None], tuple[str, str | None]] = {
    ("services_work", "repair"): ("services_work", "repair_installation"),
    ("services_work", "beauty_services"): ("services_work", "beauty_health"),
    ("services_work", "it_services"): ("services_work", "it_design_websites"),
    ("services_work", "other_services"): ("services_work", "other_services"),
    ("services_work", "vacancies"): ("services_work", "vacancies"),
    ("services_work", "looking_for_work"): ("services_work", "looking_for_work"),
    ("services_work", "part_time"): ("services_work", "part_time"),
    ("services_work", None): ("services_work", "services"),
    ("clothing", "womens"): ("fashion", "women_clothing"),
    ("clothing", "mens"): ("fashion", "men_clothing"),
    ("clothing", "kids"): ("kids", "clothing"),
    ("clothing", "shoes"): ("fashion", "men_shoes"),
    ("clothing", "outerwear"): ("fashion", "other"),
    ("clothing", "accessories_clothing"): ("fashion", "accessories"),
    ("clothing", "sportswear"): ("fashion", "other"),
    ("clothing", "other_clothing"): ("fashion", "other"),
    ("clothing", None): ("fashion", "other"),
    ("electronics", "phones"): ("electronics", "smartphones"),
    ("electronics", "laptops"): ("electronics", "computers_laptops"),
    ("electronics", "tablets"): ("electronics", "computers_laptops"),
    ("electronics", "computers"): ("electronics", "computers_laptops"),
    ("electronics", "tv"): ("electronics", "tv_audio"),
    ("electronics", "headphones"): ("electronics", "tv_audio"),
    ("electronics", "cameras"): ("electronics", "other"),
    ("electronics", "gaming"): ("electronics", "games_consoles"),
    ("electronics", "accessories"): ("electronics", "accessories"),
    ("electronics", "audio"): ("electronics", "tv_audio"),
    ("electronics", "other_electronics"): ("electronics", "other"),
    ("electronics", None): ("electronics", "other"),
    ("furniture", "bedroom"): ("furniture", "beds_mattresses"),
    ("furniture", "living_room"): ("furniture", "sofas_chairs"),
    ("furniture", "kitchen"): ("furniture", "tables_chairs"),
    ("furniture", "office_furniture"): ("furniture", "other"),
    ("furniture", "storage"): ("furniture", "wardrobes_chests"),
    ("furniture", "childrens_furniture"): ("kids", "beds_furniture"),
    ("furniture", "other_furniture"): ("furniture", "other"),
    ("furniture", None): ("furniture", "other"),
    ("appliances", "kitchen_appliances"): ("appliances", "kitchen_appliances"),
    ("appliances", "laundry"): ("appliances", "large_appliances"),
    ("appliances", "cleaning"): ("appliances", "small_appliances"),
    ("appliances", "climate"): ("appliances", "large_appliances"),
    ("appliances", "other_appliances"): ("appliances", "other"),
    ("appliances", None): ("appliances", "other"),
    ("kids", "strollers"): ("kids", "strollers_car_seats"),
    ("kids", "toys"): ("kids", "toys"),
    ("kids", "baby_care"): ("kids", "strollers_car_seats"),
    ("kids", "school"): ("kids", "other"),
    ("kids", "other_kids"): ("kids", "other"),
    ("kids", None): ("kids", "other"),
    ("sports", "fitness"): ("hobby_sports", "sports_equipment"),
    ("sports", "cycling"): ("hobby_sports", "bikes_scooters"),
    ("sports", "outdoor_sports"): ("hobby_sports", "tourism"),
    ("sports", "water_sports"): ("hobby_sports", "sports_equipment"),
    ("sports", "other_sports"): ("hobby_sports", "other"),
    ("sports", None): ("hobby_sports", "other"),
    ("vehicles", "cars"): ("auto", "cars"),
    ("vehicles", "motorcycles"): ("auto", "other"),
    ("vehicles", "car_parts"): ("auto", "parts"),
    ("vehicles", "other_vehicles"): ("auto", "other"),
    ("vehicles", None): ("auto", "other"),
    ("beauty", "cosmetics"): ("beauty_wellness", "cosmetics"),
    ("beauty", "hair"): ("beauty_wellness", "personal_care"),
    ("beauty", "skincare"): ("beauty_wellness", "cosmetics"),
    ("beauty", "beauty_devices"): ("beauty_wellness", "personal_care"),
    ("beauty", "other_beauty"): ("beauty_wellness", "other"),
    ("beauty", None): ("beauty_wellness", "other"),
    ("home_garden", "tools"): ("home", "tools"),
    ("home_garden", "garden"): ("home", "other"),
    ("home_garden", "decor"): ("home", "decor"),
    ("home_garden", "lighting"): ("home", "lighting"),
    ("home_garden", "bathroom"): ("home", "other"),
    ("home_garden", "other_home"): ("home", "other"),
    ("home_garden", None): ("home", "other"),
    ("food", "homemade"): ("home", "dishes"),
    ("food", "products"): ("home", "dishes"),
    ("food", "other_food"): ("home", "other"),
    ("food", None): ("home", "other"),
    ("realestate", "rent"): ("realestate", "rent_apartments"),
    ("realestate", "sell"): ("realestate", "sell_apartments"),
    ("realestate", "other_realestate"): ("realestate", "other"),
    ("realestate", None): ("realestate", "other"),
    ("free_stuff", "giveaway"): ("free", None),
    ("free_stuff", "exchange"): ("free", None),
    ("free_stuff", None): ("free", None),
    # Невідома категорія — не fashion (інакше вакансії/сміття стають «Мода»)
    ("other", None): ("home", "other"),
}

# Ключові слова → id підкатегорії маркетплейсу (для уточнення після AI / парсера)
MARKETPLACE_SUB_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "electronics": {
        "smartphones": [
            "iphone", "айфон", "samsung", "xiaomi", "телефон", "смартфон", "phone",
            "redmi", "huawei", "pixel",
        ],
        "computers_laptops": [
            "ноутбук", "laptop", "macbook", "компьютер", "планшет", "ipad", "tablet", "pc",
        ],
        "tv_audio": [
            "телевизор", "телевізор", "колонк", "наушник", "навушник", "airpods", "sony",
            "jbl", "audio",
        ],
        "games_consoles": [
            "playstation", "ps4", "ps5", "xbox", "nintendo", "switch", "приставк", "игр",
        ],
        "accessories": ["зарядк", "чехол", "кабель", "монитор", "монітор", "мыш", "миш"],
    },
    "fashion": {
        "women_clothing": [
            "женск", "жіноч", "платье", "сукн", "блуз", "юбк", "куртк", "пальто",
        ],
        "women_shoes": [
            "женск", "жіноч", "туфл", "ботин", "кроссовк", "кросівк", "босонож", "босоніж",
        ],
        "men_clothing": ["мужск", "чоловіч", "рубашк", "костюм", "джинс"],
        "men_shoes": [
            "мужск", "чоловіч", "ботин", "кроссовк", "кросівк", "кед",
            "new balance", "newbalance", "nike", "adidas", "puma", "reebok",
            "asics", "converse", "vans", "jordan", "yeezy", "salomon", "hoka",
            "sneakers", "sneaker", "timberland",
        ],
        "accessories": ["сумк", "рюкзак", "ремень", "шарф", "очк"],
        "hats": ["шапк", "кепк", "шляп"],
    },
    "furniture": {
        "sofas_chairs": ["диван", "кресл", "крісл", "sofa"],
        "wardrobes_chests": ["шкаф", "комод", "стеллаж", "гардероб"],
        "tables_chairs": ["стол", "стіл", "стул", "стілець", "кухн"],
        "beds_mattresses": ["кроват", "ліжк", "матрас", "матрац"],
    },
    "appliances": {
        "large_appliances": [
            "холодильник", "стиральн", "пральн", "сушил", "кондиционер", "кондиціонер",
        ],
        "small_appliances": ["пылесос", "пилосос", "утюг", "праск"],
        "kitchen_appliances": [
            "микроволнов", "мікрохвиль", "кофеварк", "кавовар", "блендер", "мультиварк",
        ],
    },
    "kids": {
        "toys": ["игруш", "іграш", "lego", "конструктор", "кукл", "ляльк"],
        "strollers_car_seats": ["коляск", "автокресл", "автокрісл", "слинг", "слінг"],
        "clothing": ["детск", "дитяч", "ребен", "дитин"],
        "beds_furniture": ["кроватк", "ліжечк", "манеж"],
    },
    "services_work": {
        "beauty_health": [
            "маникюр", "манікюр", "педикюр", "косметолог", "массаж", "масаж", "бров",
            "ресниц", "вії", "ногт",
            "эпиляц", "епіляц", "депиляц", "депіляц", "лазерн", "шугаринг", "восков",
            "ботокс", "филлер", "філер", "перманент", "татуаж", "перманентн",
            "beauty", "салон красот", "поцелил", "губы филлер", "губи філер",
            "ламинир", "ламінув", "наращиван ресниц", "нарощуван ві",
            "тату", "tattoo", "татуиров", "татуюван", "пирсинг", "piercing",
            "тату-мастер", "тату мастер", "майстер тату",
        ],
        "repair_installation": [
            "ремонт", "сантехник", "сантехнік", "электрик", "електрик", "монтаж", "установк",
        ],
        "cleaning": ["уборк", "клінінг", "клининг", "хімчист", "химчист"],
        "transportation": ["перевоз", "перевез", "грузоперевоз", "грузчик", "переезд"],
        "it_design_websites": [
            "сайт ", "сайты", "сайт:", "вебсайт", "web сайт", "landing", "лендинг",
            "программист", "програміст", "разработк сайт", "розробк сайт",
            "wordpress", "tilda", "figma", "ui/ux", "ui ux",
        ],
        "photo_video": ["фотосъ", "фотозй", "видеосъ", "відеозй", "оператор съем", "оператор зйом"],
        "education_tutors": ["репетитор", "репетит", "урок англий", "урок німец", "обучен англий"],
        "translations": ["переводчик", "перекладач", "translator", "перевод текст", "переклад текст"],
        "auto_services": ["автосервис", "автосервіс", "шиномонтаж", "сто "],
        "vacancies": [
            "ваканс", "ищу работ", "шукаю робот", "job", "сотрудник", "працівник",
            "требуется сотрудник", "потрібен працівник", "на постоянку", "полная занятость",
        ],
        "part_time": ["подработ", "підробіт", "part time", "nebenjob"],
        "looking_for_work": ["ищу работ", "шукаю робот", "ищу подработ", "шукаю підробіт"],
        "consultations": ["консультац", "юрист", "адвокат", "психолог"],
    },
    "beauty_wellness": {
        "cosmetics": ["косметик", "крем", "макияж", "мейкап"],
        "perfumery": ["духи", "парфюм", "туалетн"],
        "personal_care": ["фен", "эпилятор", "епілятор", "для волос"],
    },
    "auto": {
        "cars": ["автомобил", "автомобіль", "машин", "bmw", "audi", "mercedes", "vw "],
        "tires_wheels": ["шин", "диск", "колес", "коліс"],
        "parts": ["запчаст", "запчастин", "детал"],
    },
    "hobby_sports": {
        "sports_equipment": ["спорт", "фитнес", "фітнес", "тренаж", "гантел"],
        "bikes_scooters": ["велосипед", "самокат", "bike", "scooter"],
        "music_instruments": ["гитар", "гітар", "пианино", "фортеп", "синтез"],
        "books_learning": ["книг", "книж", "учебник", "підручник"],
    },
    "pets": {
        "sell_giveaway": ["щенок", "котен", "кошен", "щеня", "кот", "собак", "кошк"],
        "pet_goods": ["корм", "поводок", "клетк", "клітк", "для собак", "для кішок"],
    },
    "realestate": {
        "rent_apartments": ["аренд", "оренд", "сдам", "здам", "квартир"],
        "sell_apartments": ["продам квартир", "продаю квартир"],
        "rooms": ["комнат", "кімнат"],
        "houses": ["дом", "будинок", "коттедж"],
    },
    "home": {
        "dishes": ["посуд", "тарел", "таріл", "кастрюл"],
        "textiles": ["постель", "плед", "ковер", "килим", "штор"],
        "lighting": ["ламп", "люстр", "светильник", "світильник"],
        "decor": ["декор", "картин", "ваз"],
        "tools": ["дрель", "дриль", "перфоратор", "инструмент", "інструмент"],
    },
}

_GENERIC_SUB_IDS = frozenset({
    "other",
    "other_services",
    "services",
    "other_clothing",
    "other_electronics",
    "other_furniture",
    "other_appliances",
    "other_kids",
    "other_home",
    "other_beauty",
    "other_sports",
    "other_work",
})

def detect_marketplace_subcategory(category: str, text: str) -> str | None:
    """Підкатегорія маркетплейсу за ключовими словами в тексті."""
    subs = MARKETPLACE_SUB_KEYWORDS.get(category)
    if not subs:
        return None

    lower = (text or "").lower()
    best_sub: str | None = None
    best_score = 0

    for sub_id, keywords in subs.items():
        if sub_id in ("vacancies", "part_time", "looking_for_work"):
            continue
        score = 0
        for kw in keywords:
            if kw in lower:
                # Довші ключі важать більше (епіляц > загальне «сайт »)
                score += max(1, len(kw) // 4)
        if score > best_score:
            best_score = score
            best_sub = sub_id

    return best_sub if best_score > 0 else None


def subcategory_keyword_score(category: str, subcategory: str | None, text: str) -> int:
    """Наскільки subcategory підтверджена текстом (0 = AI-галюцинація)."""
    if not subcategory:
        return 0
    keywords = (MARKETPLACE_SUB_KEYWORDS.get(category) or {}).get(subcategory) or []
    lower = (text or "").lower()
    score = 0
    for kw in keywords:
        if kw in lower:
            score += max(1, len(kw) // 4)
    return score


def _refine_subcategory(category: str, subcategory: str | None, text: str) -> str | None:
    """AI subcategory лише якщо підтверджена текстом; інакше keywords."""
    subs = MARKETPLACE_TAXONOMY.get(category)
    if subs is None:
        return None

    sub = (subcategory or "").strip() or None
    detected = detect_marketplace_subcategory(category, text)

    if sub and sub in subs and sub not in _GENERIC_SUB_IDS:
        ai_score = subcategory_keyword_score(category, sub, text)
        det_score = subcategory_keyword_score(category, detected, text) if detected else 0
        # AI без опори в тексті, а keywords знайшли інше → беремо текст
        if ai_score == 0 and detected and detected in subs and det_score > 0:
            return detected
        if detected and det_score > ai_score * 2 and detected in subs:
            return detected
        return sub

    if sub and sub in subs:
        if detected and detected in subs and detected not in _GENERIC_SUB_IDS:
            return detected
        return sub

    if detected and detected in subs:
        return detected

    if "other" in subs:
        return "other"
    if "other_services" in subs:
        return "other_services"
    if "services" in subs:
        return "services"
    return next(iter(subs))


def marketplace_taxonomy_for_ai() -> str:
    lines: list[str] = []
    for cat_id, subs in MARKETPLACE_TAXONOMY.items():
        if subs is None:
            lines.append(f"- {cat_id}: (без подкатегории)")
            continue
        sub_parts = [f"{sid} ({label})" for sid, label in subs.items()]
        lines.append(f"- {cat_id}: [{', '.join(sub_parts)}]")
    return "\n".join(lines)


def validate_marketplace_category(
    category: str,
    subcategory: str | None,
    text: str = "",
) -> tuple[str, str | None]:
    cat = (category or "").strip().lower()
    if cat not in MARKETPLACE_TAXONOMY:
        return "", None

    subs = MARKETPLACE_TAXONOMY[cat]
    if subs is None:
        return cat, None

    sub = _refine_subcategory(cat, subcategory, text)
    return cat, sub


def map_parser_to_marketplace(
    parser_category: str | None,
    parser_subcategory: str | None,
) -> tuple[str, str | None]:
    p_cat = (parser_category or "other").strip().lower()
    p_sub = (parser_subcategory or "").strip() or None

    # Уже marketplace id (після AI / повторного resolve)
    if p_cat in MARKETPLACE_TAXONOMY:
        subs = MARKETPLACE_TAXONOMY[p_cat]
        if subs is None:
            return p_cat, None
        if p_sub and p_sub in subs:
            return p_cat, p_sub
        if "other" in subs:
            return p_cat, "other"
        if "services" in subs:
            return p_cat, "services"
        return p_cat, next(iter(subs)) if subs else None

    key = (p_cat, p_sub)
    if key in PARSER_TO_MARKETPLACE:
        return PARSER_TO_MARKETPLACE[key]

    key_no_sub = (p_cat, None)
    if key_no_sub in PARSER_TO_MARKETPLACE:
        return PARSER_TO_MARKETPLACE[key_no_sub]

    if p_sub and p_sub.startswith("other_"):
        for k, v in PARSER_TO_MARKETPLACE.items():
            if k[0] == p_cat and k[1] and k[1].startswith("other"):
                return v

    return "home", "other"


# Сильні сигнали товару: якщо AI поклав home/other — перевизначаємо
_STRONG_ITEM_SIGNALS: list[tuple[re.Pattern[str], str, str | None]] = [
    (
        re.compile(
            r"iphone|айфон|samsung\s*galaxy|xiaomi|redmi|pixel\s*\d|смартфон|телефон",
            re.I,
        ),
        "electronics",
        "smartphones",
    ),
    (
        re.compile(r"macbook|ноутбук|laptop|\bipad\b|планшет", re.I),
        "electronics",
        "computers_laptops",
    ),
    (
        re.compile(r"playstation|ps\s*[45]|xbox|nintendo|switch|приставк", re.I),
        "electronics",
        "game_consoles",
    ),
    (
        re.compile(
            r"new\s*balance|nike|adidas|puma|reebok|asics|converse|vans|jordan|"
            r"yeezy|salomon|hoka|timberland|sneakers?|кроссовк|кросівк|\bкед[ыи]?\b",
            re.I,
        ),
        "fashion",
        "men_shoes",
    ),
    (
        re.compile(r"\bдиван|\bкресл|\bкрісл|\bsofa\b", re.I),
        "furniture",
        "sofas_chairs",
    ),
    (
        re.compile(r"\bшкаф|\bкомод|\bстеллаж|гардероб", re.I),
        "furniture",
        "wardrobes_chests",
    ),
    (
        re.compile(r"холодильник|стиральн|сушильн|посудомой|посудомийн", re.I),
        "appliances",
        "large_appliances",
    ),
    (
        re.compile(r"\bколяск|автокресл|автокрісл", re.I),
        "kids",
        "strollers_car_seats",
    ),
]

_WEAK_AI_CATEGORIES = frozenset({"home", "free"})


def detect_strong_item_category(text: str) -> tuple[str, str | None] | None:
    """Явний бренд/товар у тексті — пріоритет над слабкою AI-категорією (home)."""
    if not (text or "").strip():
        return None
    for pattern, cat, sub in _STRONG_ITEM_SIGNALS:
        if pattern.search(text):
            # Жіноче взуття за маркерами
            if cat == "fashion" and sub == "men_shoes":
                low = text.lower()
                if re.search(r"женск|жіноч|women|lady|damas", low):
                    return cat, "women_shoes"
            return cat, sub
    return None


def resolve_marketplace_category(
    ai_category: str,
    ai_subcategory: str | None,
    item: dict,
) -> tuple[str, str | None]:
    """
    Категорію задає AI; сильні сигнали товару виправляють home/other помилки.
    """
    text = "\n".join(
        str(item.get(k) or "")
        for k in ("raw_text", "title", "description")
    )

    strong = detect_strong_item_category(text)

    # Послуга з beauty-маркерами, яку AI поклав у fashion/beauty_wellness
    from parser.core.quality import is_likely_service_ad

    service_like = is_likely_service_ad(text)

    # 1) Відповідь AI — пріоритет; сильний сигнал виправляє лише home/free
    cat, sub = validate_marketplace_category(ai_category, ai_subcategory, text)
    if cat:
        if service_like and cat in ("fashion", "beauty_wellness", "home", "hobby_sports"):
            forced = force_services_marketplace_categories(
                {"raw_text": text, "title": item.get("title"), "description": item.get("description"),
                 "subcategory": ai_subcategory}
            )
            return forced["category"], forced.get("subcategory")
        if strong and cat in _WEAK_AI_CATEGORIES:
            fixed = validate_marketplace_category(strong[0], strong[1], text)
            if fixed[0]:
                return fixed
        return cat, sub

    # 2) AI міг дати parser-id (clothing/shoes) — мапимо на marketplace
    mapped = map_parser_to_marketplace(
        str(ai_category or "").strip() or None,
        ai_subcategory,
    )
    if str(ai_category or "").strip():
        cat, sub = validate_marketplace_category(mapped[0], mapped[1], text)
        if cat:
            if strong and cat in _WEAK_AI_CATEGORIES:
                fixed = validate_marketplace_category(strong[0], strong[1], text)
                if fixed[0]:
                    return fixed
            return cat, sub

    # 3) Сильний сигнал без AI
    if strong:
        fixed = validate_marketplace_category(strong[0], strong[1], text)
        if fixed[0]:
            return fixed

    # 4) Fallback лише коли AI не дав category
    item_cat = str(item.get("category") or "").strip()
    if item_cat:
        mapped = map_parser_to_marketplace(item_cat, item.get("subcategory"))
        cat, sub = validate_marketplace_category(mapped[0], mapped[1], text)
        if cat:
            return cat, sub

    from parser.category_keywords import detect_category

    skip_free = bool(re.search(r"\d+\s*€|\d+\s*eur|\d+\s*евро", text.lower()))
    p_cat, p_sub = detect_category(text, skip_free=skip_free)
    mapped = map_parser_to_marketplace(p_cat, p_sub)
    result = validate_marketplace_category(mapped[0], mapped[1], text)
    return result if result[0] else ("home", "other")


def clean_title(title: str, raw_text: str = "") -> str:
    """
    Заголовок без префіксів «продам», привітань, ціни та міста.
    """
    from parser.core.patterns import GREETING_TITLE_RE, GENERIC_LISTING_TITLE_RE, PRICE_RE

    def _clean_once(src: str) -> str:
        t = (src or "").strip()
        t = re.sub(r"^[\s🔥⭐️✨🎁📦💥❗️]+", "", t)
        t = GREETING_TITLE_RE.sub("", t).strip()
        t = re.sub(
            r"^(?:продам|продаю|продаётся|продается|отдам|віддам|"
            r"продаюсь|куплю|ищу|шукаю|продаю!|предлагаю|пропоную|"
            r"выполняю|виконую|оказываю|надаю)\s*[-–—:]?\s*",
            "",
            t,
            flags=re.IGNORECASE,
        )
        t = re.sub(
            r"(?i)(?:ціна|цiна|цена|price|стоимость|вартість)\s*[:\s]*[\d\s.,]+"
            r"(?:\s*(?:[€$£]|євро|евро|euro|eur|грн))?",
            " ",
            t,
        )
        t = re.sub(
            r"(?i)(?<!\w)(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euro\b|євро|евро|\$|грн\b|uah\b)",
            " ",
            t,
        )
        t = re.sub(
            r"(?i)(?:€|\$)\s*(\d{1,6}(?:[.,]\d{1,2})?)\b",
            " ",
            t,
        )

        city_tokens: set[str] = set()
        try:
            from parser.core.location import _KNOWN_CITIES
            from utils.location_normalization import CITY_SYNONYMS

            city_tokens.update(_KNOWN_CITIES)
            city_tokens.update(CITY_SYNONYMS.keys())
        except Exception:
            pass
        for city in sorted(city_tokens, key=len, reverse=True):
            if len(city) < 3:
                continue
            stem = re.escape(city)
            t = re.sub(
                rf"(?i)(?:^|[\s,./|(])(?:в|у|in|из|із)?\s*{stem}\w{{0,6}}\b",
                " ",
                t,
            )
        t = re.sub(r"(?i)\b(?:germany|deutschland|нрв|nrw)\b", " ", t)
        t = re.sub(r"\b\d{5}\b", " ", t)
        # Хвости на кшталт «… — 50€» / «… Hamburg»
        t = re.sub(r"\s*[|/\-–—,]\s*$", "", t)
        t = re.sub(r"\s+", " ", t).strip(" -–—,.")
        # Якщо після чистки лишилась ціна — прибрати ще раз
        if PRICE_RE.search(t):
            t = PRICE_RE.sub(" ", t)
            t = re.sub(r"\s+", " ", t).strip(" -–—,.")
        return t

    t = _clean_once(title)

    if GENERIC_LISTING_TITLE_RE.match(t) or len(t) < 4 or not t:
        if raw_text:
            for line in raw_text.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                # Пропустити рядки = лише ціна / привітання
                if PRICE_RE.fullmatch(line.strip()) or len(PRICE_RE.sub("", line).strip()) < 3:
                    continue
                candidate = _clean_once(line)
                if (
                    candidate
                    and len(candidate) >= 4
                    and not GENERIC_LISTING_TITLE_RE.match(candidate)
                ):
                    t = candidate
                    break

    if not t or len(t) < 4 or GENERIC_LISTING_TITLE_RE.match(t):
        # Останній шанс: бренд із сильного сигналу
        strong = detect_strong_item_category(raw_text or title or "")
        if strong and strong[0] == "electronics" and strong[1] == "smartphones":
            m = re.search(
                r"(iphone\s*\d+[^\n,]{0,20}|айфон\s*\d+[^\n,]{0,20}|"
                r"samsung[^\n,]{0,24}|xiaomi[^\n,]{0,20})",
                raw_text or title or "",
                re.I,
            )
            if m:
                t = _clean_once(m.group(0))
        elif strong and strong[0] == "fashion":
            m = re.search(
                r"(new\s*balance[^\n,]{0,30}|nike[^\n,]{0,24}|adidas[^\n,]{0,24})",
                raw_text or title or "",
                re.I,
            )
            if m:
                t = _clean_once(m.group(0))

    # Слоган / «меня зовут…» замість суті послуги → епіляція / тату / манікюр з тексту
    blob = f"{raw_text or ''}\n{title or ''}"
    needs_service_title = bool(
        re.search(
            r"(?i)красота\s+начина|краса\s+почина|заботы\s+о\s+себе|турботи\s+про\s+себе"
            r"|меня\s+зовут|мене\s+звати|меня\s+звати|привет\b|вітаю\b",
            t or "",
        )
    ) or (
        t
        and len(t) > 8
        and not detect_marketplace_subcategory("services_work", t)
        and detect_marketplace_subcategory("services_work", blob)
    )
    if needs_service_title or (
        detect_marketplace_subcategory("services_work", blob) == "beauty_health"
        and (
            needs_service_title
            or re.search(r"(?i)зовут|звати|привет|из\s+украин|з\s+україн", t or "")
            or len(t or "") > 40
        )
    ):
        m = re.search(
            r"(?i)((?:курсы?\s+)?лазерн\w*\s+эпиляц\w*"
            r"|(?:курси?\s+)?лазерн\w*\s+епіляц\w*"
            r"|шугаринг\w*|маникюр\w*|манікюр\w*|педикюр\w*"
            r"|ботокс\w*|косметолог\w*"
            r"|тату[\s\-]?мастер\w*|майстер\s+тату|услуги?\s+тату|послуг[аиі]\s+тату"
            r"|татуировк\w*|татуюванн\w*|tattoo\s+artist)",
            blob,
        )
        if m:
            recovered = _clean_once(m.group(1))
            if recovered:
                t = recovered[:1].upper() + recovered[1:]
        elif re.search(r"(?i)\bтату\b|\btattoo\b", blob) and re.search(
            r"(?i)мастер|майстер|предлагаю|пропоную|делаю|роблю", blob
        ):
            t = "Тату-мастер"

    return t[:100] if t and len(t) >= 4 else ""


def force_services_marketplace_categories(item: dict) -> dict:
    """
    Для публікації послуг: category=services_work + підкатегорія з ТЕКСТУ
    (AI subcategory без підтвердження в тексті не довіряємо).
    """
    out = dict(item)
    text = "\n".join(
        str(out.get(k) or "")
        for k in ("raw_text", "title", "description")
    )
    current_sub = (out.get("subcategory") or "").strip() or None
    services_subs = MARKETPLACE_TAXONOMY.get("services_work") or {}
    job_subs = frozenset({"vacancies", "part_time", "looking_for_work"})

    if current_sub in job_subs:
        current_sub = None

    detected = detect_marketplace_subcategory("services_work", text)
    if detected in job_subs:
        detected = None

    # Текст має пріоритет над AI, якщо знайдена конкретна підкатегорія
    if detected and detected in services_subs:
        ai_score = subcategory_keyword_score("services_work", current_sub, text)
        det_score = subcategory_keyword_score("services_work", detected, text)
        if ai_score == 0 or det_score >= ai_score:
            out["category"] = "services_work"
            out["subcategory"] = detected
            return out

    if current_sub and current_sub in services_subs and current_sub not in _GENERIC_SUB_IDS:
        if subcategory_keyword_score("services_work", current_sub, text) > 0:
            out["category"] = "services_work"
            out["subcategory"] = current_sub
            return out

    mapped = map_parser_to_marketplace("services_work", out.get("subcategory"))
    sub = mapped[1] if mapped[0] == "services_work" else None
    if sub in job_subs:
        sub = None
    sub = _refine_subcategory("services_work", sub, text)
    if sub in job_subs:
        sub = "other_services"
    out["category"] = "services_work"
    out["subcategory"] = sub or "other_services"
    return out


def should_treat_as_service(
    text: str,
    *,
    force_service_channel: bool = False,
    category: str | None = None,
) -> bool:
    """Чи пост має йти як послуга (мод послуг + dual publish), а не як товар."""
    from parser.core.quality import is_likely_service_ad

    if force_service_channel:
        # На service-каналі товар (iPhone тощо) без сервісних маркерів — лишаємо товаром
        strong = detect_strong_item_category(text or "")
        if (
            strong
            and strong[0] in ("electronics", "furniture", "appliances", "auto")
            and not is_likely_service_ad(text or "")
        ):
            return False
        return True
    if (category or "").strip().lower() == "services_work":
        return True
    return is_likely_service_ad(text or "")


def apply_marketplace_categories_to_item(item: dict) -> dict:
    """Гарантує marketplace id категорії перед записом у Listing."""
    out = dict(item)
    cat, sub = resolve_marketplace_category(
        str(out.get("category") or ""),
        out.get("subcategory"),
        out,
    )
    out["category"] = cat
    out["subcategory"] = sub
    return out
