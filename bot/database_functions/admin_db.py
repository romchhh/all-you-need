import sqlite3
from datetime import datetime, timedelta
from config import administrators
from database_functions.client_db import get_user_id_by_username, get_username_by_user_id
from database_functions.db_config import DATABASE_PATH

# Використовуємо спільну БД
conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
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
    # Отримуємо дані з Prisma User таблиці
    cursor.execute('''
        SELECT id, telegramId, username, firstName, lastName, balance, rating, reviewsCount, isActive, createdAt, updatedAt
        FROM User
    ''')
    users_data = cursor.fetchall()
    users_columns = [description[0] for description in cursor.description]
    return users_data, users_columns


def get_all_links_data():
    # Отримуємо дані без поля link_count (статистика)
    cursor.execute('SELECT id, link_name, link_url FROM links')
    links_data = cursor.fetchall()
    links_columns = [description[0] for description in cursor.description]
    return links_data, links_columns


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
    # Якщо потрібна статистика по мовам, можна додати поле language в User таблицю
    # Поки що повертаємо порожній список
    return []


def get_total_links_count():
    cursor.execute("SELECT COUNT(*) FROM links")
    count = cursor.fetchone()[0]
    return count


def get_total_link_clicks():
    cursor.execute("SELECT COALESCE(SUM(link_count), 0) FROM links")
    count = cursor.fetchone()[0]
    return count


def get_top_links(limit: int = 5):
    cursor.execute("SELECT link_name, link_count FROM links ORDER BY link_count DESC LIMIT ?", (limit,))
    return cursor.fetchall()


def get_users_with_ref_link():
    cursor.execute("SELECT COUNT(*) FROM users WHERE ref_link IS NOT NULL")
    count = cursor.fetchone()[0]
    return count


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
        'users_from_links': users_from_links
    }


def create_admins_table():
    # Створюємо таблицю Admin в спільній Prisma БД
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
        
        # Спочатку знаходимо user_id якщо передано username
        if not user_id and username:
            found_user_id = get_user_id_by_username(username)
            if found_user_id:
                user_id = found_user_id
            else:
                return "not_found"  # Користувач не знайдений в базі
        
        # Перевіряємо чи користувач існує в базі даних (в Prisma User таблиці)
        user_internal_id = None
        if user_id:
            cursor.execute("SELECT id FROM User WHERE telegramId = ?", (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                return "not_found"  # Користувач не знайдений в базі
            # Отримуємо внутрішній id користувача з User таблиці
            user_internal_id = user_row[0]
        else:
            return "not_found"
        
        # Перевіряємо чи вже є адміністратором
        existing_admin = None
        if user_id:
            existing_admin = get_admin_by_id(user_id)
        if not existing_admin and username:
            found_id = get_user_id_by_username(username)
            if found_id:
                existing_admin = get_admin_by_id(found_id)

        if existing_admin:
            return "already_admin"  # Вже є адміністратором

        if not username and user_id:
            cursor.execute("SELECT username FROM User WHERE telegramId = ?", (user_id,))
            result = cursor.fetchone()
            if result:
                username = result[0]
        
        # Отримуємо внутрішній id користувача для addedBy
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
    """Видаляє адміна по Telegram ID"""
    try:
        # Знаходимо внутрішній id користувача
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
    """Отримує адміна по Telegram ID (не внутрішньому id)"""
    if not telegram_user_id:
        return None
    # Спочатку знаходимо внутрішній id користувача
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
    """Перевіряє чи користувач суперадмін по Telegram ID"""
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (telegram_user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        return False
    user_internal_id = user_row[0]
    cursor.execute("SELECT isSuperadmin FROM Admin WHERE userId = ?", (user_internal_id,))
    result = cursor.fetchone()
    return result and result[0] == 1


def init_superadmin(telegram_superadmin_id):
    """Ініціалізує суперадміна по Telegram ID"""
    try:
        cursor.execute("SELECT userId FROM Admin WHERE isSuperadmin = 1")
        if cursor.fetchone():
            return False
        
        # Знаходимо внутрішній id користувача
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


