import sqlite3
from datetime import datetime, timedelta
from config import administrators
from database_functions.client_db import get_user_id_by_username, get_username_by_user_id
from database_functions.db_config import DATABASE_PATH

def get_optimized_connection():
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False, timeout=30.0)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA foreign_keys = ON;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA cache_size = -16384;')
    return conn

conn = get_optimized_connection()
cursor = conn.cursor()


def get_users_count():
    cursor.execute("SELECT COUNT(*) FROM User")
    count = cursor.fetchone()[0]
    return count

def get_all_user_ids():
    cursor.execute('SELECT telegramId FROM User')
    user_ids = [row[0] for row in cursor.fetchall()]
    return user_ids


def get_all_users_data():
    cursor.execute('''
        SELECT id, telegramId, username, firstName, lastName, balance, rating, reviewsCount, isActive, createdAt, updatedAt
        FROM User
    ''')
    users_data = cursor.fetchall()
    users_columns = [description[0] for description in cursor.description]
    return users_data, users_columns


def get_all_links_data():
    try:
        cursor.execute('SELECT id, link_name, link_url FROM links')
        links_data = cursor.fetchall()
        links_columns = [description[0] for description in cursor.description]
        return links_data, links_columns
    except sqlite3.OperationalError:
        return [], []


def get_new_users_count(days: int):
    date_threshold = datetime.now() - timedelta(days=days)
    cursor.execute("SELECT COUNT(*) FROM User WHERE createdAt >= ?", (date_threshold,))
    count = cursor.fetchone()[0]
    return count


def get_active_users_count(days: int):
    date_threshold = datetime.now() - timedelta(days=days)
    cursor.execute("SELECT COUNT(*) FROM User WHERE updatedAt >= ?", (date_threshold,))
    count = cursor.fetchone()[0]
    return count


def get_users_with_phone():
    cursor.execute("SELECT COUNT(*) FROM User WHERE phone IS NOT NULL AND phone != ''")
    count = cursor.fetchone()[0]
    return count


def get_users_by_language():
    """Отримує статистику користувачів по мовах (рахує унікальних користувачів)"""
    try:
        language_counts = {}
        
        # Спочатку перевіряємо таблицю User (якщо там є колонка language)
        try:
            cursor.execute("PRAGMA table_info(User)")
            columns = cursor.fetchall()
            has_language_column = any(col[1] == 'language' for col in columns)
            
            if has_language_column:
                cursor.execute("""
                    SELECT language, COUNT(*) as count 
                    FROM User 
                    WHERE language IS NOT NULL AND language != ''
                    GROUP BY language
                """)
                user_results = cursor.fetchall()
                for lang, count in user_results:
                    if lang:
                        language_counts[lang] = count
        except sqlite3.OperationalError:
            pass
        
        # Якщо в User немає даних про мови, беремо з users_legacy
        # Але рахуємо унікальних користувачів (DISTINCT user_id)
        if not language_counts:
            try:
                cursor.execute("""
                    SELECT language, COUNT(DISTINCT user_id) as count 
                    FROM users_legacy 
                    WHERE language IS NOT NULL AND language != ''
                    GROUP BY language
                """)
                results = cursor.fetchall()
                language_counts = {lang: count for lang, count in results if lang}
            except sqlite3.OperationalError:
                pass
        
        # Сортуємо за кількістю (спочатку найбільші)
        sorted_languages = sorted(language_counts.items(), key=lambda x: x[1], reverse=True)
        return sorted_languages
    except sqlite3.OperationalError:
        return []


def get_total_links_count():
    try:
        cursor.execute("SELECT COUNT(*) FROM links")
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_total_link_clicks():
    try:
        cursor.execute("SELECT COALESCE(SUM(link_count), 0) FROM links")
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_top_links(limit: int = 5):
    try:
        cursor.execute("SELECT link_name, link_count FROM links ORDER BY link_count DESC LIMIT ?", (limit,))
        return cursor.fetchall()
    except sqlite3.OperationalError:
        return []


def get_users_with_ref_link():
    """Кількість користувачів, які перейшли по посиланнях (linktowatch). ref_link зберігається в users_legacy."""
    try:
        cursor.execute("SELECT COUNT(*) FROM users_legacy WHERE ref_link IS NOT NULL")
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_telegram_listings_count():
    """Отримує загальну кількість оголошень в TelegramListing"""
    try:
        cursor.execute("SELECT COUNT(*) FROM TelegramListing")
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_telegram_listings_by_status():
    """Отримує кількість оголошень в TelegramListing по статусах"""
    try:
        cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM TelegramListing 
            GROUP BY status
        """)
        results = cursor.fetchall()
        return {status: count for status, count in results}
    except sqlite3.OperationalError:
        return {}


def get_telegram_listings_by_moderation_status():
    """Отримує кількість оголошень в TelegramListing по статусах модерації"""
    try:
        cursor.execute("""
            SELECT COALESCE(moderationStatus, 'none') as status, COUNT(*) as count 
            FROM TelegramListing 
            GROUP BY moderationStatus
        """)
        results = cursor.fetchall()
        return {status if status != 'none' else None: count for status, count in results}
    except sqlite3.OperationalError:
        return {}


def get_new_telegram_listings_count(days: int):
    """Отримує кількість нових оголошень в TelegramListing за період"""
    try:
        date_threshold = datetime.now() - timedelta(days=days)
        cursor.execute("SELECT COUNT(*) FROM TelegramListing WHERE createdAt >= ?", (date_threshold,))
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_marketplace_listings_count():
    """Отримує загальну кількість оголошень в Listing (маркетплейс)"""
    try:
        cursor.execute("SELECT COUNT(*) FROM Listing")
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_marketplace_listings_by_status():
    """Отримує кількість оголошень в Listing по статусах"""
    try:
        cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM Listing 
            GROUP BY status
        """)
        results = cursor.fetchall()
        return {status: count for status, count in results}
    except sqlite3.OperationalError:
        return {}


def get_new_marketplace_listings_count(days: int):
    """Отримує кількість нових оголошень в Listing за період"""
    try:
        date_threshold = datetime.now() - timedelta(days=days)
        cursor.execute("SELECT COUNT(*) FROM Listing WHERE createdAt >= ?", (date_threshold,))
        count = cursor.fetchone()[0]
        return count
    except sqlite3.OperationalError:
        return 0


def get_statistics_summary():
    total_users = get_users_count()
    new_today = get_new_users_count(1)
    new_week = get_new_users_count(7)
    new_month = get_new_users_count(30)
    
    active_today = get_active_users_count(1)
    active_week = get_active_users_count(7)
    active_month = get_active_users_count(30)
    
    users_with_phone = get_users_with_phone()
    languages = get_users_by_language()
    
    total_links = get_total_links_count()
    total_clicks = get_total_link_clicks()
    top_links = get_top_links(5)
    users_from_links = get_users_with_ref_link()
    
    # Статистика оголошень
    telegram_listings_total = get_telegram_listings_count()
    telegram_listings_by_status = get_telegram_listings_by_status()
    telegram_listings_by_moderation = get_telegram_listings_by_moderation_status()
    telegram_listings_today = get_new_telegram_listings_count(1)
    telegram_listings_week = get_new_telegram_listings_count(7)
    telegram_listings_month = get_new_telegram_listings_count(30)
    
    marketplace_listings_total = get_marketplace_listings_count()
    marketplace_listings_by_status = get_marketplace_listings_by_status()
    marketplace_listings_today = get_new_marketplace_listings_count(1)
    marketplace_listings_week = get_new_marketplace_listings_count(7)
    marketplace_listings_month = get_new_marketplace_listings_count(30)
    
    return {
        'total_users': total_users,
        'new_today': new_today,
        'new_week': new_week,
        'new_month': new_month,
        'active_today': active_today,
        'active_week': active_week,
        'active_month': active_month,
        'users_with_phone': users_with_phone,
        'languages': languages,
        'total_links': total_links,
        'total_clicks': total_clicks,
        'top_links': top_links,
        'users_from_links': users_from_links,
        'telegram_listings_total': telegram_listings_total,
        'telegram_listings_by_status': telegram_listings_by_status,
        'telegram_listings_by_moderation': telegram_listings_by_moderation,
        'telegram_listings_today': telegram_listings_today,
        'telegram_listings_week': telegram_listings_week,
        'telegram_listings_month': telegram_listings_month,
        'marketplace_listings_total': marketplace_listings_total,
        'marketplace_listings_by_status': marketplace_listings_by_status,
        'marketplace_listings_today': marketplace_listings_today,
        'marketplace_listings_week': marketplace_listings_week,
        'marketplace_listings_month': marketplace_listings_month
    }


def create_admins_table():
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER UNIQUE,
            username TEXT,
            addedBy INTEGER,
            addedDate TEXT,
            isSuperadmin INTEGER DEFAULT 0
        )
    ''')
    conn.commit()


def add_admin(user_id, username, added_by):
    try:
        current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if not user_id and username:
            found_user_id = get_user_id_by_username(username)
            if found_user_id:
                user_id = found_user_id
            else:
                return "not_found"
        
        user_internal_id = None
        if user_id:
            cursor.execute("SELECT id FROM User WHERE telegramId = ?", (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                return "not_found"
            # Отримуємо внутрішній id користувача з User таблиці
            user_internal_id = user_row[0]
        else:
            return "not_found"
        
        existing_admin = None
        if user_id:
            existing_admin = get_admin_by_id(user_id)
        if not existing_admin and username:
            found_id = get_user_id_by_username(username)
            if found_id:
                existing_admin = get_admin_by_id(found_id)

        if existing_admin:
            return "already_admin"

        if not username and user_id:
            cursor.execute("SELECT username FROM User WHERE telegramId = ?", (user_id,))
            result = cursor.fetchone()
            if result:
                username = result[0]
        
        added_by_internal_id = None
        if added_by:
            cursor.execute("SELECT id FROM User WHERE telegramId = ?", (added_by,))
            added_by_row = cursor.fetchone()
            if added_by_row:
                added_by_internal_id = added_by_row[0]
        
        cursor.execute(
            "INSERT INTO Admin (userId, username, addedBy, addedDate) VALUES (?, ?, ?, ?)",
            (user_internal_id, username, added_by_internal_id, current_date)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def remove_admin(telegram_user_id):
    try:
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return False
        user_internal_id = user_row[0]
        
        cursor.execute("SELECT isSuperadmin FROM Admin WHERE userId = ?", (user_internal_id,))
        admin_data = cursor.fetchone()
        
        if admin_data and admin_data[0] == 1:
            return False
            
        cursor.execute("DELETE FROM Admin WHERE userId = ?", (user_internal_id,))
        if cursor.rowcount > 0:
            conn.commit()
            return True
        return False
    except Exception:
        return False


def get_admin_by_id(telegram_user_id):
    if not telegram_user_id:
        return None
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        return None
    user_internal_id = user_row[0]
    cursor.execute("SELECT * FROM Admin WHERE userId = ?", (user_internal_id,))
    return cursor.fetchone()


def get_all_admins():
    cursor.execute("""
        SELECT a.id, a.userId, a.username, a.addedDate, a.isSuperadmin, a.addedBy,
               u.username as added_by_username,
               u2.telegramId as admin_telegram_id,
               u2.username as admin_user_name,
               u2.firstName as admin_first_name,
               u2.lastName as admin_last_name
        FROM Admin a
        LEFT JOIN User u ON a.addedBy = u.id
        LEFT JOIN User u2 ON a.userId = u2.id
        ORDER BY a.isSuperadmin DESC, a.addedDate DESC
    """)
    return cursor.fetchall()


def get_admin_info_by_id(admin_id):
    cursor.execute("""
        SELECT a.userId, a.username, a.addedDate, a.isSuperadmin, a.addedBy,
               u.username as current_username
        FROM Admin a
        LEFT JOIN User u ON a.userId = u.id
        WHERE a.userId = ?
    """, (admin_id,))
    return cursor.fetchone()

def is_superadmin(telegram_user_id):
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        return False
    user_internal_id = user_row[0]
    cursor.execute("SELECT isSuperadmin FROM Admin WHERE userId = ?", (user_internal_id,))
    result = cursor.fetchone()
    return result and result[0] == 1


def init_superadmin(telegram_superadmin_id):
    try:
        cursor.execute("SELECT userId FROM Admin WHERE isSuperadmin = 1")
        if cursor.fetchone():
            return False
        
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_superadmin_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return False
        user_internal_id = user_row[0]
        
        current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        username = get_username_by_user_id(telegram_superadmin_id)
        
        cursor.execute(
            "INSERT OR IGNORE INTO Admin (userId, username, addedBy, addedDate, isSuperadmin) VALUES (?, ?, ?, ?, 1)",
            (user_internal_id, username, user_internal_id, current_date)
        )
        conn.commit()
        return True
    except Exception:
        return False


def get_all_admin_ids():
    """Повертає список Telegram ID всіх адмінів"""
    cursor.execute("""
        SELECT u.telegramId 
        FROM Admin a
        JOIN User u ON a.userId = u.id
    """)
    return [row[0] for row in cursor.fetchall()]


def get_all_administrators():
    db_admins = get_all_admin_ids()
    all_admins = list(set([administrators[0]] + db_admins))
    
    return all_admins


