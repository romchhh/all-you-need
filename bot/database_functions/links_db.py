import sqlite3
from database_functions.db_config import DATABASE_PATH

# Функція для отримання оптимізованого з'єднання
def get_optimized_connection():
    """Створює оптимізоване з'єднання з БД"""
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False, timeout=30.0)
    # Увімкнути WAL mode для одночасних читання та запису
    conn.execute('PRAGMA journal_mode = WAL;')
    # Збільшити timeout для запитів (30 секунд)
    conn.execute('PRAGMA busy_timeout = 30000;')
    # Увімкнути foreign keys
    conn.execute('PRAGMA foreign_keys = ON;')
    # Оптимізувати для швидших запитів
    conn.execute('PRAGMA synchronous = NORMAL;')
    # Кешувати сторінки в пам'яті (16MB)
    conn.execute('PRAGMA cache_size = -16384;')
    return conn

# Використовуємо спільну БД
conn = get_optimized_connection()
cursor = conn.cursor()


def create_table_links():
    # Створюємо таблицю Link в спільній Prisma БД
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Link (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linkName TEXT,
            linkUrl TEXT,
            linkCount INTEGER DEFAULT 0
        )
    ''')
    conn.commit()


def add_link(link_name: str, link_url: str = None):
    cursor.execute('INSERT INTO Link (linkName, linkUrl, linkCount) VALUES (?, ?, ?)', 
                  (link_name, link_url, 0))
    conn.commit()
    return cursor.lastrowid


def get_all_links():
    cursor.execute('SELECT * FROM Link')
    return cursor.fetchall()


def increment_link_count(link_id: int):
    cursor.execute('UPDATE Link SET linkCount = linkCount + 1 WHERE id = ?', (link_id,))
    conn.commit()


def get_link_stats():
    cursor.execute('SELECT linkName, linkCount FROM Link')
    return cursor.fetchall()


def get_link_detailed_stats():
    cursor.execute('SELECT id, linkName, linkCount FROM Link')
    return cursor.fetchall()


def get_link_by_id(link_id: int):
    cursor.execute('SELECT linkName, linkUrl FROM Link WHERE id = ?', (link_id,))
    return cursor.fetchone()


def update_link_name(link_id: int, new_name: str):
    cursor.execute('UPDATE Link SET linkName = ? WHERE id = ?', (new_name, link_id))
    conn.commit()


def delete_link(link_id: int):
    cursor.execute('DELETE FROM Link WHERE id = ?', (link_id,))
    conn.commit()

def get_users_by_language():
    # Якщо потрібна статистика по мовам, можна додати поле language в User таблицю
    return []