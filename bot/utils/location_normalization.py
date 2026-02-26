import re

CITY_SYNONYMS = {
    # Гамбург
    "гамбург": "Hamburg",
    "hamburg": "Hamburg",
    # Мюнхен
    "мюнхен": "München",
    "munich": "München",
    # Берлин
    "берлин": "Berlin",
    "berlin": "Berlin",
    # Кёльн
    "кёльн": "Köln",
    "кельн": "Köln",
    "cologne": "Köln",
    # Дюссельдорф
    "дюссельдорф": "Düsseldorf",
    "dusseldorf": "Düsseldorf",
    "düsseldorf": "Düsseldorf",
    # Штутгарт
    "штутгарт": "Stuttgart",
    "stuttgart": "Stuttgart",
    # Ганновер
    "ганновер": "Hannover",
    "hannover": "Hannover",
    "hanover": "Hannover",
    # Бремен
    "бремен": "Bremen",
    "bremen": "Bremen",
    # Лейпциг
    "лейпциг": "Leipzig",
    "leipzig": "Leipzig",
    # Дрезден
    "дрезден": "Dresden",
    "dresden": "Dresden",
    # Дортмунд
    "дортмунд": "Dortmund",
    "dortmund": "Dortmund",
    # Эссен
    "эссен": "Essen",
    "essen": "Essen",
    # Дуйсбург
    "дуйсбург": "Duisburg",
    "duisburg": "Duisburg",
    # Бонн
    "бонн": "Bonn",
    "bonn": "Bonn",
    # Карлсруэ
    "карлсруэ": "Karlsruhe",
    "karlsruhe": "Karlsruhe",
    # Мангейм / Маннхайм
    "маннгейм": "Mannheim",
    "манхайм": "Mannheim",
    "mannheim": "Mannheim",
    # Нюрнберг
    "нюрнберг": "Nürnberg",
    "nuremberg": "Nürnberg",
    "nürnberg": "Nürnberg",
    # Франкфурт (пользовательский пример)
    "франкфурт": "Frankfurt (Oder)",
    "frankfurt": "Frankfurt (Oder)",
}


def normalize_city_name(name: str) -> str:
    """
    Нормализует введённое пользователем название города
    к каноническому немецкому варианту (для хранения в БД).
    Если город не в списке, возвращает исходную строку без изменений.
    """
    if not name:
        return name
    key = name.strip().lower()
    return CITY_SYNONYMS.get(key, name.strip())


_CYRILLIC_RE = re.compile(r"[А-Яа-яЁёІіЇїЄєҐґ]")


def contains_cyrillic(text: str) -> bool:
    """Проверяет, есть ли в строке кириллические символы."""
    return bool(_CYRILLIC_RE.search(text or ""))

