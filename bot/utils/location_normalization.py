import re

CITY_SYNONYMS = {
    # Гамбург
    "гамбург": "Hamburg",
    "hamburg": "Hamburg",
    # Мюнхен
    "мюнхен": "München",
    "munich": "München",
    "muenchen": "München",
    "munchen": "München",
    "münchen": "München",
    # Берлин
    "берлин": "Berlin",
    "berlin": "Berlin",
    # Кёльн
    "кёльн": "Köln",
    "кельн": "Köln",
    "koln": "Köln",
    "koeln": "Köln",
    "cologne": "Köln",
    "köln": "Köln",
    # Дюссельдорф
    "дюссельдорф": "Düsseldorf",
    "dusseldorf": "Düsseldorf",
    "duesseldorf": "Düsseldorf",
    "düsseldorf": "Düsseldorf",
    "dusseldrof": "Düsseldorf",
    "duseldorf": "Düsseldorf",
    # Штутгарт
    "штутгарт": "Stuttgart",
    "stuttgart": "Stuttgart",
    "stutgart": "Stuttgart",
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
    # Магдебург
    "магдебург": "Magdeburg",
    "magdeburg": "Magdeburg",
    # Регенсбург
    "регенсбург": "Regensburg",
    "regensburg": "Regensburg",
    # Марль
    "марль": "Marl",
    "marl": "Marl",
    # Дрезден
    "дрезден": "Dresden",
    "dresden": "Dresden",
    # Дортмунд
    "дортмунд": "Dortmund",
    "dortmund": "Dortmund",
    # Эссен
    "эссен": "Essen",
    "ессен": "Essen",
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
    # Мангейм
    "маннгейм": "Mannheim",
    "манхайм": "Mannheim",
    "mannheim": "Mannheim",
    # Нюрнберг
    "нюрнберг": "Nürnberg",
    "нюрберг": "Nürnberg",
    "nuremberg": "Nürnberg",
    "nürnberg": "Nürnberg",
    "nuernberg": "Nürnberg",
    "nurnberg": "Nürnberg",
    # Франкфурт
    "франкфурт": "Frankfurt",
    "frankfurt": "Frankfurt",
    "frankfurt am main": "Frankfurt",
    # Вупперталь
    "вупперталь": "Wuppertal",
    "wuppertal": "Wuppertal",
    # Бохум
    "бохум": "Bochum",
    "bochum": "Bochum",
    # Мюнстер
    "мюнстер": "Münster",
    "munster": "Münster",
    "muenster": "Münster",
    "münster": "Münster",
    # Аахен
    "аахен": "Aachen",
    "aachen": "Aachen",
    # Дюльмен
    "дюльмен": "Dülmen",
    "дульмен": "Dülmen",
    "dulmen": "Dülmen",
    "dülmen": "Dülmen",
    # Білефельд
    "білефельд": "Bielefeld",
    "билефельд": "Bielefeld",
    "bielefeld": "Bielefeld",
    # Кельн-регіон / NRW
    "nrw": "NRW",
    "нрв": "NRW",
    # Німеччина
    "germany": "Germany",
    "deutschland": "Germany",
    "німеччина": "Germany",
    "немеччина": "Germany",
    "германия": "Germany",
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

