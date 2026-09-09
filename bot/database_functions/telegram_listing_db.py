import sqlite3
import os
import json
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from datetime import datetime

from database_functions.db_connection import get_connection

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"


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
    images: Union[List[str], List[Dict[str, Any]]],
    price_display: Optional[str] = None,
    region: Optional[str] = None
) -> int:
    """Створює нове оголошення для Telegram каналу. images — список file_id (str) або [{"type":"photo"|"video","file_id":str}]."""
    conn = get_connection()
    cursor = conn.cursor()

    images_json = json.dumps(images)
    
    # Перевіряємо чи є колонки в таблиці
    cursor.execute("PRAGMA table_info(TelegramListing)")
    columns = [row[1] for row in cursor.fetchall()]
    has_location = 'location' in columns
    has_publication_tariff = 'publicationTariff' in columns
    has_payment_status = 'paymentStatus' in columns
    has_price_display = 'priceDisplay' in columns
    has_region = 'region' in columns
    
    # Додаємо колонки якщо їх немає
    if not has_location:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN location TEXT")
    if not has_publication_tariff:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN publicationTariff TEXT")
    if not has_payment_status:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN paymentStatus TEXT DEFAULT 'pending'")
    if not has_price_display:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN priceDisplay TEXT")
    if not has_region:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN region TEXT")
    
    # Якщо price_display не передано, використовуємо звичайну ціну
    if price_display is None:
        price_display = str(price) if price > 0 else None
    
    # Якщо region не передано, встановлюємо за замовчуванням 'hamburg'
    if region is None:
        region = 'hamburg'
    
    cursor.execute("""
        INSERT INTO TelegramListing (
            userId, title, description, price, currency, category, subcategory,
            condition, location, images, status, moderationStatus, createdAt, updatedAt, priceDisplay, region
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, title, description, price, currency, category, subcategory,
        condition, location, images_json, 'pending_moderation', 'pending',
        datetime.now(), datetime.now(), price_display, region
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
    
    # Перевіряємо чи є колонки publicationTariff та paymentStatus
    if 'publicationTariff' not in result:
        result['publicationTariff'] = None
    if 'paymentStatus' not in result:
        result['paymentStatus'] = 'pending'
    
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
        
        # Перевіряємо чи є колонки publicationTariff та paymentStatus
        if 'publicationTariff' not in item:
            item['publicationTariff'] = None
        if 'paymentStatus' not in item:
            item['paymentStatus'] = 'pending'
        
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
    
    # Отримуємо всі оголошення користувача (виключаємо видалені)
    cursor.execute("""
        SELECT tl.*
        FROM TelegramListing tl
        WHERE tl.userId = ?
        AND (tl.status IS NULL OR tl.status != 'deleted')
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
        
        # Перевіряємо чи є колонки publicationTariff та paymentStatus
        if 'publicationTariff' not in item:
            item['publicationTariff'] = None
        if 'paymentStatus' not in item:
            item['paymentStatus'] = 'pending'
        
        result.append(item)
    
    return result


def update_telegram_listing(
    listing_id: int,
    title: str,
    description: str,
    price: float,
    currency: str,
    category: str,
    subcategory: Optional[str],
    condition: str,
    location: str,
    images: Union[List[str], List[Dict[str, Any]]],
    price_display: Optional[str] = None,
    region: Optional[str] = None
) -> bool:
    """Оновлює оголошення (для повторної модерації після відхилення). images — список file_id або [{"type":"photo"|"video","file_id":str}]."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        price = float(price) if price is not None else 0.0
    except (TypeError, ValueError):
        price = 0.0
    images_json = json.dumps(images)
    if price_display is None:
        price_display = str(price) if price > 0 else None
    if region is None:
        region = 'hamburg'  # За замовчуванням
    cursor.execute("PRAGMA table_info(TelegramListing)")
    columns = [row[1] for row in cursor.fetchall()]
    has_price_display = 'priceDisplay' in columns
    has_region = 'region' in columns
    
    # Додаємо колонку region якщо її немає
    if not has_region:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN region TEXT")
        has_region = True
    
    set_clause = """
        title = ?, description = ?, price = ?, currency = ?, category = ?, subcategory = ?,
        condition = ?, location = ?, images = ?, status = 'pending_moderation',
        moderationStatus = 'pending', rejectionReason = NULL, updatedAt = ?
    """
    params = [title, description, price, currency, category, subcategory, condition, location, images_json, datetime.now()]
    if has_price_display:
        set_clause = set_clause.replace("updatedAt = ?", "priceDisplay = ?, updatedAt = ?")
        params.insert(-1, price_display)
    if has_region:
        set_clause = set_clause.replace("updatedAt = ?", "region = ?, updatedAt = ?")
        params.insert(-1, region)
    cursor.execute(f"UPDATE TelegramListing SET {set_clause} WHERE id = ?", params + [listing_id])
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success


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


def update_telegram_listing_publication_tariff(
    listing_id: int,
    tariff_type: str,
    payment_status: str = 'pending'
) -> bool:
    """Оновлює тариф публікації та статус оплати для оголошення"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Перевіряємо чи є колонки
    cursor.execute("PRAGMA table_info(TelegramListing)")
    columns = [row[1] for row in cursor.fetchall()]
    has_publication_tariff = 'publicationTariff' in columns
    has_payment_status = 'paymentStatus' in columns
    
    if not has_publication_tariff:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN publicationTariff TEXT")
    if not has_payment_status:
        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN paymentStatus TEXT DEFAULT 'pending'")
    
    cursor.execute("""
        UPDATE TelegramListing
        SET publicationTariff = ?,
            paymentStatus = ?,
            updatedAt = ?
        WHERE id = ?
    """, (tariff_type, payment_status, datetime.now(), listing_id))
    
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return success


def get_telegram_listing_payment_status(listing_id: int) -> Optional[str]:
    """Отримує статус оплати для оголошення"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT paymentStatus FROM TelegramListing WHERE id = ?
    """, (listing_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    return result[0] if result else None


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
    
    # Категорії для бота (без підкатегорій)
    categories_data = [
        {
            'name': 'Послуги',
            'icon': '🛠️',
            'sortOrder': 1,
            'subcategories': []
        },
        {
            'name': 'Вакансія/пошук роботи',
            'icon': '💼',
            'sortOrder': 2,
            'subcategories': []
        },
        {
            'name': 'Доставка/перевезення',
            'icon': '🚚',
            'sortOrder': 3,
            'subcategories': []
        },
        {
            'name': 'Нерухомість',
            'icon': '🏠',
            'sortOrder': 4,
            'subcategories': []
        },
        {
            'name': 'Автопослуги',
            'icon': '🚗',
            'sortOrder': 5,
            'subcategories': []
        },
        {
            'name': 'Реклама бізнесу',
            'icon': '📢',
            'sortOrder': 6,
            'subcategories': []
        },
        {
            'name': 'Послуги для дітей',
            'icon': '🧸',
            'sortOrder': 7,
            'subcategories': []
        },
        {
            'name': 'Краса та здоров\'я',
            'icon': '💅',
            'sortOrder': 8,
            'subcategories': []
        },
        {
            'name': 'Подія',
            'icon': '🎉',
            'sortOrder': 9,
            'subcategories': []
        },
        {
            'name': 'Інше',
            'icon': '❓',
            'sortOrder': 10,
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
                VALUES (?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)
            """, (cat_data['name'], cat_data['icon'], cat_data['sortOrder'], True))
            
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
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (subcat_data['name'], '', category_id, subcat_data['sortOrder'], True))
    
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
