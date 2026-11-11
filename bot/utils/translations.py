from database_functions.client_db import get_user_language, set_user_language

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from locales import uk, ru

TRANSLATIONS = {
    'uk': uk.TEXTS,
    'ru': ru.TEXTS,
}

DEFAULT_LANGUAGE = 'uk'


def get_user_lang(user_id: int) -> str:
    lang = get_user_language(user_id)
    return lang if lang in TRANSLATIONS else DEFAULT_LANGUAGE


def t_lang(lang: str, key: str, **kwargs) -> str:
    """Переклад за фіксованою мовою (напр. канали завжди ru)."""
    code = (lang or DEFAULT_LANGUAGE).lower()
    if code.startswith("ru"):
        code = "ru"
    elif code.startswith("uk"):
        code = "uk"
    else:
        code = DEFAULT_LANGUAGE
    translations = TRANSLATIONS.get(code, TRANSLATIONS[DEFAULT_LANGUAGE])

    value = translations
    for k in key.split("."):
        if isinstance(value, dict) and k in value:
            value = value[k]
        else:
            return key

    if isinstance(value, str):
        try:
            return value.format(**kwargs)
        except KeyError:
            return value

    return str(value) if value else key


def t(user_id: int, key: str, **kwargs) -> str:
    return t_lang(get_user_lang(user_id), key, **kwargs)


def get_welcome_message(telegram_lang: str = None) -> str:
    if telegram_lang and telegram_lang.startswith('ru'):
        lang = 'ru'
    else:
        lang = 'uk'  # За замовчуванням українська
    
    # Отримуємо greeting з локалізації (там вже є HTML теги)
    translations = TRANSLATIONS.get(lang, TRANSLATIONS[DEFAULT_LANGUAGE])
    greeting = translations.get('welcome', {}).get('greeting', '')
    
    return greeting


def set_language(user_id: int, language: str):
    if language in TRANSLATIONS:
        set_user_language(user_id, language)
        return True
    return False

