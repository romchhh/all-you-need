from typing import Dict, Any, Optional
from database_functions.client_db import get_user_language, set_user_language

# Імпортуємо переклади
import sys
import os
# Додаємо корінь проекту до шляху
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from locales import uk, ru

TRANSLATIONS = {
    'uk': uk.TEXTS,
    'ru': ru.TEXTS,
}

DEFAULT_LANGUAGE = 'uk'


def get_user_lang(user_id: int) -> str:
    """Отримує мову користувача з БД або повертає мову за замовчуванням"""
    lang = get_user_language(user_id)
    return lang if lang in TRANSLATIONS else DEFAULT_LANGUAGE


def t(user_id: int, key: str, **kwargs) -> str:
    """
    Отримує переклад для користувача
    
    Args:
        user_id: ID користувача
        key: Ключ перекладу (наприклад, 'agreement.title')
        **kwargs: Параметри для форматування рядка
    
    Returns:
        Перекладений текст
    """
    lang = get_user_lang(user_id)
    translations = TRANSLATIONS.get(lang, TRANSLATIONS[DEFAULT_LANGUAGE])
    
    # Розбиваємо ключ на частини
    keys = key.split('.')
    value = translations
    
    # Проходимо по вкладеним словникам
    for k in keys:
        if isinstance(value, dict) and k in value:
            value = value[k]
        else:
            # Якщо переклад не знайдено, повертаємо ключ
            return key
    
    # Якщо значення - рядок, форматуємо його з параметрами
    if isinstance(value, str):
        try:
            return value.format(**kwargs)
        except KeyError:
            return value
    
    return str(value) if value else key


def set_language(user_id: int, language: str):
    """Встановлює мову користувача"""
    if language in TRANSLATIONS:
        set_user_language(user_id, language)
        return True
    return False

