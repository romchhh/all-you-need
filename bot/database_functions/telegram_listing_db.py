import sqlite3
import os
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime


BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"


def get_connection():
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA foreign_keys = ON;')
    return conn


def get_user_id_by_telegram_id(telegram_id: int) -> Optional[int]:
    """Отримує ID користувача з БД по telegramId"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_id,))
    row = cursor.fetchone()
    conn.close()
    
    return row['id'] if row else None


def create_telegram_listing(
    user_id: int,
    title: str,
    description: str,
    price: float,
    currency: str,
    category: str,
    subcategory: Optional[str],
    condition: str,
    location: str,
    images: List[str]
) -> int:
    """Створює нове оголошення для Telegram каналу"""
    conn = get_connection()
    cursor = conn.cursor()
    
    images_json = json.dumps(images)
    
    # Перевіряємо чи є колонка location в таблиці
    cursor.execute("PRAGMA table_info(TelegramListing)")
    columns = [row[1] for row in cursor.fetchall()]
    has_location = 'location' in columns
    
    if has_location:
        cursor.execute("""
            INSERT INTO TelegramListing (
                userId, title, description, price, currency, category, subcategory,
                condition, location, images, status, moderationStatus, createdAt, updatedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, title, description, price, currency, category, subcategory,
            condition, location, images_json, 'pending_moderation', 'pending',
            datetime.now(), datetime.now()
        ))
    else:
        # Якщо колонки немає, додаємо її
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN location TEXT")
        cursor.execute("""
            INSERT INTO TelegramListing (
                userId, title, description, price, currency, category, subcategory,
                condition, location, images, status, moderationStatus, createdAt, updatedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, title, description, price, currency, category, subcategory,
            condition, location, images_json, 'pending_moderation', 'pending',
            datetime.now(), datetime.now()
        ))
    
    listing_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return listing_id


def get_telegram_listing_by_id(listing_id: int) -> Optional[Dict[str, Any]]:
    """Отримує оголошення по ID"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT tl.*, u.username, u.firstName, u.lastName, CAST(u.telegramId AS INTEGER) as sellerTelegramId
        FROM TelegramListing tl
        JOIN User u ON tl.userId = u.id
        WHERE tl.id = ?
    """, (listing_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    
    result = dict(row)
    # Парсимо JSON images
    if result.get('images'):
        try:
            result['images'] = json.loads(result['images'])
        except:
            result['images'] = []
    else:
        result['images'] = []
    
    return result


def get_telegram_listings_for_moderation(
    status: str = 'pending',
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """Отримує оголошення для модерації"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT tl.*, u.username, u.firstName, u.lastName, CAST(u.telegramId AS INTEGER) as sellerTelegramId
        FROM TelegramListing tl
        JOIN User u ON tl.userId = u.id
        WHERE tl.moderationStatus = ?
        ORDER BY tl.createdAt DESC
        LIMIT ? OFFSET ?
    """, (status, limit, offset))
    
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for row in rows:
        item = dict(row)
        # Парсимо JSON images
        if item.get('images'):
            try:
                item['images'] = json.loads(item['images'])
            except:
                item['images'] = []
        else:
            item['images'] = []
        result.append(item)
    
    return result


def get_user_telegram_listings(telegram_id: int) -> List[Dict[str, Any]]:
    """Отримує всі Telegram оголошення користувача"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Спочатку отримуємо user_id
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_id,))
    user_row = cursor.fetchone()
    
    if not user_row:
        conn.close()
        return []
    
    user_id = user_row['id']
    
    # Отримуємо всі оголошення користувача
    cursor.execute("""
        SELECT tl.*
        FROM TelegramListing tl
        WHERE tl.userId = ?
        ORDER BY tl.createdAt DESC
    """, (user_id,))
    
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for row in rows:
        item = dict(row)
        # Парсимо JSON images
        if item.get('images'):
            try:
                item['images'] = json.loads(item['images'])
            except:
                item['images'] = []
        else:
            item['images'] = []
        result.append(item)
    
    return result


def update_telegram_listing_moderation_status(
    listing_id: int,
    status: str,
    admin_id: Optional[int] = None,
    rejection_reason: Optional[str] = None
) -> bool:
    """Оновлює статус модерації оголошення"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE TelegramListing
        SET moderationStatus = ?,
            moderatedAt = ?,
            moderatedBy = ?,
            rejectionReason = ?,
            updatedAt = ?
        WHERE id = ?
    """, (status, datetime.now(), admin_id, rejection_reason, datetime.now(), listing_id))
    
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return success


def init_categories_if_empty():
    """Ініціалізує категорії, якщо таблиця порожня"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Перевіряємо чи є категорії
    cursor.execute("SELECT COUNT(*) FROM Category")
    count = cursor.fetchone()[0]
    
    if count > 0:
        conn.close()
        return
    
    # Категорії з підкатегоріями (відповідають маркетплейсу)
    categories_data = [
        {
            'name': 'Мода та стиль',
            'icon': '👕',
            'sortOrder': 1,
            'subcategories': [
                {'name': 'Жіночий одяг', 'sortOrder': 1},
                {'name': 'Жіноче взуття', 'sortOrder': 2},
                {'name': 'Чоловічий одяг', 'sortOrder': 3},
                {'name': 'Чоловіче взуття', 'sortOrder': 4},
                {'name': 'Аксесуари', 'sortOrder': 5},
                {'name': 'Головні убори', 'sortOrder': 6},
                {'name': 'Краса / здоров\'я', 'sortOrder': 7},
                {'name': 'Інше', 'sortOrder': 8},
            ]
        },
        {
            'name': 'Меблі',
            'icon': '🛋️',
            'sortOrder': 2,
            'subcategories': [
                {'name': 'Дивани / крісла', 'sortOrder': 1},
                {'name': 'Шафи / комоди', 'sortOrder': 2},
                {'name': 'Столи / стільці', 'sortOrder': 3},
                {'name': 'Ліжка / матраци', 'sortOrder': 4},
                {'name': 'Інше', 'sortOrder': 5},
            ]
        },
        {
            'name': 'Електроніка',
            'icon': '📱',
            'sortOrder': 3,
            'subcategories': [
                {'name': 'Смартфони', 'sortOrder': 1},
                {'name': 'Комп\'ютери / ноутбуки', 'sortOrder': 2},
                {'name': 'ТВ / аудіо', 'sortOrder': 3},
                {'name': 'Ігри / приставки', 'sortOrder': 4},
                {'name': 'Аксесуари', 'sortOrder': 5},
                {'name': 'Інше', 'sortOrder': 6},
            ]
        },
        {
            'name': 'Побутова техніка',
            'icon': '🔌',
            'sortOrder': 4,
            'subcategories': [
                {'name': 'Велика техніка (холодильники, пральні машини)', 'sortOrder': 1},
                {'name': 'Дрібна техніка', 'sortOrder': 2},
                {'name': 'Кухонна техніка', 'sortOrder': 3},
                {'name': 'Інше', 'sortOrder': 4},
            ]
        },
        {
            'name': 'Дитячі товари',
            'icon': '🧸',
            'sortOrder': 5,
            'subcategories': [
                {'name': 'Іграшки', 'sortOrder': 1},
                {'name': 'Коляски / автокрісла', 'sortOrder': 2},
                {'name': 'Одяг', 'sortOrder': 3},
                {'name': 'Ліжечка / меблі', 'sortOrder': 4},
                {'name': 'Інше', 'sortOrder': 5},
            ]
        },
        {
            'name': 'Для дому',
            'icon': '🏡',
            'sortOrder': 6,
            'subcategories': [
                {'name': 'Посуд', 'sortOrder': 1},
                {'name': 'Текстиль', 'sortOrder': 2},
                {'name': 'Освітлення', 'sortOrder': 3},
                {'name': 'Декор', 'sortOrder': 4},
                {'name': 'Інструменти', 'sortOrder': 5},
                {'name': 'Інше', 'sortOrder': 6},
            ]
        },
        {
            'name': 'Авто',
            'icon': '🚗',
            'sortOrder': 7,
            'subcategories': [
                {'name': 'Автомобілі', 'sortOrder': 1},
                {'name': 'Шини / диски', 'sortOrder': 2},
                {'name': 'Запчастини', 'sortOrder': 3},
                {'name': 'Дитячі крісла', 'sortOrder': 4},
                {'name': 'Інше', 'sortOrder': 5},
            ]
        },
        {
            'name': 'Хобі / Спорт',
            'icon': '⚽',
            'sortOrder': 8,
            'subcategories': [
                {'name': 'Спортинвентар', 'sortOrder': 1},
                {'name': 'Велосипеди / самокати', 'sortOrder': 2},
                {'name': 'Музичні інструменти', 'sortOrder': 3},
                {'name': 'Туризм', 'sortOrder': 4},
                {'name': 'Колекції / хобі', 'sortOrder': 5},
                {'name': 'Інше', 'sortOrder': 6},
            ]
        },
        {
            'name': 'Нерухомість',
            'icon': '🏠',
            'sortOrder': 9,
            'subcategories': [
                {'name': 'Оренда квартир', 'sortOrder': 1},
                {'name': 'Продаж квартир', 'sortOrder': 2},
                {'name': 'Кімнати', 'sortOrder': 3},
                {'name': 'Будинки', 'sortOrder': 4},
                {'name': 'Комерційна нерухомість', 'sortOrder': 5},
                {'name': 'Гаражі, парковки', 'sortOrder': 6},
                {'name': 'Інше', 'sortOrder': 7},
            ]
        },
        {
            'name': 'Послуги та робота',
            'icon': '💼',
            'sortOrder': 10,
            'subcategories': [
                {'name': 'Послуги', 'sortOrder': 1},
                {'name': 'Ремонт і монтаж', 'sortOrder': 2},
                {'name': 'Прибирання', 'sortOrder': 3},
                {'name': 'Перевезення', 'sortOrder': 4},
                {'name': 'Краса / здоров\'я', 'sortOrder': 5},
                {'name': 'IT / дизайн / сайти', 'sortOrder': 6},
                {'name': 'Фото / відео', 'sortOrder': 7},
                {'name': 'Навчання / репетитори', 'sortOrder': 8},
                {'name': 'Переклади', 'sortOrder': 9},
                {'name': 'Автоуслуги', 'sortOrder': 10},
                {'name': 'Консультації', 'sortOrder': 11},
                {'name': 'Інше', 'sortOrder': 12},
                {'name': 'Вакансії', 'sortOrder': 13},
                {'name': 'Підробіток', 'sortOrder': 14},
                {'name': 'Шукаю роботу', 'sortOrder': 15},
                {'name': 'Інше', 'sortOrder': 16},
            ]
        },
        {
            'name': 'Безкоштовно / Віддам',
            'icon': '🎁',
            'sortOrder': 11,
            'subcategories': []
        },
    ]
    
    # Вставляємо категорії (використовуємо INSERT OR IGNORE щоб уникнути помилок при дублікатах)
    for cat_data in categories_data:
        # Перевіряємо чи категорія вже існує
        cursor.execute("SELECT id FROM Category WHERE name = ? AND parentId IS NULL", (cat_data['name'],))
        existing_cat = cursor.fetchone()
        
        if existing_cat:
            category_id = existing_cat[0]
        else:
            # Вставляємо категорію
            cursor.execute("""
                INSERT OR IGNORE INTO Category (name, icon, parentId, sortOrder, isActive, createdAt)
                VALUES (?, ?, NULL, ?, 1, CURRENT_TIMESTAMP)
            """, (cat_data['name'], cat_data['icon'], cat_data['sortOrder']))
            
            if cursor.lastrowid:
                category_id = cursor.lastrowid
            else:
                # Якщо не вставилося через IGNORE, отримуємо ID існуючої
                cursor.execute("SELECT id FROM Category WHERE name = ? AND parentId IS NULL", (cat_data['name'],))
                existing = cursor.fetchone()
                if existing:
                    category_id = existing[0]
                else:
                    continue  # Пропускаємо якщо не вдалося вставити
        
        # Вставляємо підкатегорії
        for subcat_data in cat_data.get('subcategories', []):
            # Перевіряємо чи підкатегорія вже існує
            cursor.execute("SELECT id FROM Category WHERE name = ? AND parentId = ?", (subcat_data['name'], category_id))
            existing_subcat = cursor.fetchone()
            
            if not existing_subcat:
                cursor.execute("""
                    INSERT OR IGNORE INTO Category (name, icon, parentId, sortOrder, isActive, createdAt)
                    VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                """, (subcat_data['name'], '', category_id, subcat_data['sortOrder']))
    
    conn.commit()
    conn.close()


def get_categories() -> List[Dict[str, Any]]:
    """Отримує всі категорії з підкатегоріями"""
    # Ініціалізуємо категорії, якщо їх немає
    init_categories_if_empty()
    
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Отримуємо головні категорії
    cursor.execute("""
        SELECT id, name, icon
        FROM Category
        WHERE parentId IS NULL AND isActive = 1
        ORDER BY sortOrder ASC
    """)
    
    categories = []
    for row in cursor.fetchall():
        category = dict(row)
        
        # Отримуємо підкатегорії
        cursor.execute("""
            SELECT id, name
            FROM Category
            WHERE parentId = ? AND isActive = 1
            ORDER BY sortOrder ASC
        """, (category['id'],))
        
        subcategories = [dict(sub) for sub in cursor.fetchall()]
        category['subcategories'] = subcategories
        
        categories.append(category)
    
    conn.close()
    return categories
