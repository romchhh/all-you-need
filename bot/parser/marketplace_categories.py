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
        "beauty_health": "маникюр, косметолог, массаж, брови, ресницы",
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
    ("services_work", None): ("services_work", "services"),
    ("clothing", "womens"): ("fashion", "women_clothing"),
    ("clothing", "mens"): ("fashion", "men_clothing"),
    ("clothing", "kids"): ("kids", "clothing"),
    ("clothing", "shoes"): ("fashion", "other"),
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
    ("other", None): ("fashion", "other"),
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
        "women_shoes": ["женск", "жіноч", "туфл", "ботин", "кроссовк", "кросівк"],
        "men_clothing": ["мужск", "чоловіч", "рубашк", "костюм", "джинс"],
        "men_shoes": ["мужск", "чоловіч", "ботин", "кроссовк", "кросівк"],
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
        ],
        "repair_installation": [
            "ремонт", "сантехник", "сантехнік", "электрик", "електрик", "монтаж", "установк",
        ],
        "cleaning": ["уборк", "клінінг", "чистк", "мийк"],
        "transportation": ["перевоз", "перевез", "грузоперевоз", "ван", "грузчик"],
        "it_design_websites": ["програм", "сайт", "it ", "компьютер", "ноутбук", "windows"],
        "photo_video": ["фото", "видео", "оператор", "съемк", "зйомк"],
        "education_tutors": ["репетитор", "репетит", "урок", "обучен", "навчан"],
        "translations": ["перевод", "переклад", "translator"],
        "auto_services": ["автосервис", "автосервіс", "шиномонтаж", "sto "],
        "vacancies": ["ваканс", "ищу работ", "шукаю робот", "job"],
        "part_time": ["подработ", "підробіт"],
        "looking_for_work": ["ищу работ", "шукаю робот"],
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
        score = 0
        for kw in keywords:
            if kw in lower:
                score += 1
        if score > best_score:
            best_score = score
            best_sub = sub_id

    return best_sub if best_score > 0 else None


def _refine_subcategory(category: str, subcategory: str | None, text: str) -> str | None:
    """Уточнює підкатегорію, якщо AI/парсер дав загальну."""
    subs = MARKETPLACE_TAXONOMY.get(category)
    if subs is None:
        return None

    sub = (subcategory or "").strip() or None
    if sub and sub not in _GENERIC_SUB_IDS and sub in subs:
        return sub

    detected = detect_marketplace_subcategory(category, text)
    if detected and detected in subs:
        return detected

    from parser.category_keywords import detect_category

    p_cat, p_sub = detect_category(text, skip_free=True)
    mapped = map_parser_to_marketplace(p_cat, p_sub)
    if mapped[0] == category and mapped[1] and mapped[1] in subs:
        return mapped[1]

    if sub and sub in subs:
        return sub
    if "other" in subs:
        return "other"
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

    key = (p_cat, p_sub)
    if key in PARSER_TO_MARKETPLACE:
        return PARSER_TO_MARKETPLACE[key]

    key_no_sub = (p_cat, None)
    if key_no_sub in PARSER_TO_MARKETPLACE:
        return PARSER_TO_MARKETPLACE[key_no_sub]

    if p_sub and p_sub.startswith("other_"):
        key_other = (p_cat, p_sub)
        for k, v in PARSER_TO_MARKETPLACE.items():
            if k[0] == p_cat and k[1] and k[1].startswith("other"):
                return v

    return "fashion", "other"


def resolve_marketplace_category(
    ai_category: str,
    ai_subcategory: str | None,
    item: dict,
) -> tuple[str, str | None]:
    """AI id → marketplace id; fallback на парсер + keyword detect."""
    text = "\n".join(
        str(item.get(k) or "")
        for k in ("raw_text", "title", "description")
    )

    cat, sub = validate_marketplace_category(ai_category, ai_subcategory, text)
    if cat:
        return cat, sub

    mapped = map_parser_to_marketplace(
        str(ai_category or item.get("category") or ""),
        ai_subcategory or item.get("subcategory"),
    )
    cat, sub = validate_marketplace_category(mapped[0], mapped[1], text)
    if cat:
        return cat, sub

    from parser.category_keywords import detect_category

    skip_free = bool(re.search(r"\d+\s*€|\d+\s*eur|\d+\s*евро", text.lower()))
    p_cat, p_sub = detect_category(text, skip_free=skip_free)
    mapped = map_parser_to_marketplace(p_cat, p_sub)
    result = validate_marketplace_category(mapped[0], mapped[1], text)
    return result if result[0] else ("fashion", "other")


def clean_title(title: str, raw_text: str = "") -> str:
    t = (title or "").strip()
    t = re.sub(r"^[\s🔥⭐️✨🎁📦💥❗️]+", "", t)
    t = re.sub(
        r"^(?:продам|продаю|продаётся|продается|отдам|віддам|"
        r"продаюсь|куплю|ищу|шукаю|продаю!)\s*[-–—:]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(r"\s+", " ", t).strip(" -–—,.")
    if len(t) < 4 and raw_text:
        first_line = raw_text.strip().split("\n", 1)[0][:100]
        t = clean_title(first_line, "")
    return t[:100] if t else "Объявление"


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
