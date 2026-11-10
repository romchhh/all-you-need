"""Мапінг категорій бота (українські/російські назви) → slug маркетплейсу."""

from __future__ import annotations

# bot Category.name → (marketplace category, subcategory)
_BOT_CATEGORY_TO_MARKETPLACE: dict[str, tuple[str, str]] = {
    "послуги": ("services_work", "services"),
    "услуги": ("services_work", "services"),
    "вакансія/пошук роботи": ("services_work", "vacancies"),
    "вакансия/поиск работы": ("services_work", "vacancies"),
    "доставка/перевезення": ("services_work", "transportation"),
    "доставка/перевозки": ("services_work", "transportation"),
    "нерухомість": ("realestate", "other"),
    "недвижимость": ("realestate", "other"),
    "автопослуги": ("services_work", "auto_services"),
    "автоуслуги": ("services_work", "auto_services"),
    "реклама бізнесу": ("services_work", "other_services"),
    "реклама бизнеса": ("services_work", "other_services"),
    "послуги для дітей": ("services_work", "other_services"),
    "услуги для детей": ("services_work", "other_services"),
    "краса та здоров'я": ("services_work", "beauty_health"),
    "краса та здоровʼя": ("services_work", "beauty_health"),
    "красота и здоровье": ("services_work", "beauty_health"),
    "подія": ("services_work", "other_services"),
    "мероприятие": ("services_work", "other_services"),
    "інше": ("services_work", "other_services"),
    "другое": ("services_work", "other_services"),
}

# Вже slug маркетплейсу — лишаємо як є (підкатегорія опційна).
_KNOWN_MARKETPLACE_CATEGORIES = frozenset(
    {
        "services_work",
        "realestate",
        "fashion",
        "furniture",
        "electronics",
        "appliances",
        "kids",
        "home",
        "auto",
        "hobby_sports",
        "pets",
        "beauty_wellness",
        "food_gastro",
        "free",
    }
)

JOB_SUBCATEGORIES = frozenset(
    {"vacancies", "part_time", "looking_for_work", "other_work"}
)

SERVICE_SUBCATEGORIES = frozenset(
    {
        "services",
        "repair_installation",
        "cleaning",
        "transportation",
        "beauty_health",
        "beauty_services",
        "it_design_websites",
        "it_services",
        "photo_video",
        "education_tutors",
        "translations",
        "auto_services",
        "consultations",
        "online_services",
        "other_services",
    }
)


def map_bot_category_to_marketplace(
    category: str | None,
    subcategory: str | None = None,
) -> tuple[str, str | None]:
    """
    Повертає (category_slug, subcategory_slug) для Listing.
    Якщо вже marketplace-slug — не чіпаємо subcategory (окрім порожньої).
    """
    raw = (category or "").strip()
    sub_raw = (subcategory or "").strip() or None
    if not raw:
        return "services_work", sub_raw or "other_services"

    lowered = raw.lower()
    if lowered in _KNOWN_MARKETPLACE_CATEGORIES:
        return lowered, sub_raw

    mapped = _BOT_CATEGORY_TO_MARKETPLACE.get(lowered)
    if mapped:
        cat, default_sub = mapped
        return cat, sub_raw or default_sub

    return "services_work", sub_raw or "other_services"


def channel_publish_mode(category: str | None, subcategory: str | None = None) -> str | None:
    """
    Куди дублювати оголошення користувача з маркетплейсу:
      'services' — TRADE_SERVICES_* (послуги)
      'trade'    — TRADE_* (нерухомість / робота / подія)
      None       — не публікувати в канал (товари тощо)
    """
    cat = (category or "").strip().lower()
    sub = (subcategory or "").strip().lower()

    if cat == "realestate":
        return "trade"
    if cat in {"event", "events", "подія", "мероприятие"}:
        return "trade"
    if cat == "services_work":
        if sub in JOB_SUBCATEGORIES:
            return "trade"
        if not sub or sub in SERVICE_SUBCATEGORIES:
            return "services"
        # невідома підкатегорія services_work — у services-канал
        return "services"
    # Ботські назви, якщо ще не замаплені
    if cat in _BOT_CATEGORY_TO_MARKETPLACE:
        mapped_cat, mapped_sub = _BOT_CATEGORY_TO_MARKETPLACE[cat]
        return channel_publish_mode(mapped_cat, mapped_sub)
    return None
