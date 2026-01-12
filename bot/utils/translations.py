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


def t(user_id: int, key: str, **kwargs) -> str:
    lang = get_user_lang(user_id)
    translations = TRANSLATIONS.get(lang, TRANSLATIONS[DEFAULT_LANGUAGE])
    
    keys = key.split('.')
    value = translations
    
    for k in keys:
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


def set_language(user_id: int, language: str):
    if language in TRANSLATIONS:
        set_user_language(user_id, language)
        return True
    return False

