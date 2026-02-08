import sqlite3
from datetime import datetime
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


def create_table_links():
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Link (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linkName TEXT,
            linkUrl TEXT,
            linkCount INTEGER DEFAULT 0
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS LinkVisit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_type TEXT NOT NULL,
            source_id INTEGER NOT NULL,
            visitor_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_link_visit_source ON LinkVisit(source_type, source_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_link_visit_visitor ON LinkVisit(visitor_user_id)')
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


def record_link_visit(source_type: str, source_id: int, visitor_user_id: int):
    """Записує візит: source_type='link' для linktowatch, 'ref' для реферальних посилань"""
    try:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            'INSERT INTO LinkVisit (source_type, source_id, visitor_user_id, created_at) VALUES (?, ?, ?, ?)',
            (source_type, source_id, str(visitor_user_id), now)
        )
        conn.commit()
    except Exception as e:
        print(f"Error recording link visit: {e}")


def get_visits_by_link(link_id: int, limit: int = 50):
    """Повертає список візитів по посиланню (linktowatch)"""
    cursor.execute('''
        SELECT visitor_user_id, created_at FROM LinkVisit 
        WHERE source_type = 'link' AND source_id = ?
        ORDER BY created_at DESC LIMIT ?
    ''', (link_id, limit))
    return cursor.fetchall()


def get_ref_visits_count(referrer_id: int) -> int:
    """Кількість кліків по реферальному посиланню"""
    cursor.execute(
        "SELECT COUNT(*) FROM LinkVisit WHERE source_type = 'ref' AND source_id = ?",
        (referrer_id,)
    )
    return cursor.fetchone()[0] or 0


def get_all_ref_stats():
    """Статистика по реферальних посиланнях: referrer_id, clicks, converted (в Referral)"""
    from database_functions.referral_db import get_connection
    ref_c = get_connection()
    ref_cur = ref_c.cursor()
    ref_cur.execute('''
        SELECT referrer_telegram_id, COUNT(*) as converted 
        FROM Referral GROUP BY referrer_telegram_id
    ''')
    ref_data = {str(row[0]): row[1] for row in ref_cur.fetchall()}
    ref_c.close()

    cursor.execute('''
        SELECT source_id, COUNT(*) as clicks FROM LinkVisit 
        WHERE source_type = 'ref' GROUP BY source_id
    ''')
    return [(row[0], row[1], ref_data.get(str(row[0]), 0)) for row in cursor.fetchall()]


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
    return []