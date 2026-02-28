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


def get_link_payments_total(link_id: int) -> tuple[float, float, float, int, int]:
    """
    Повертає оплати тільки від користувачів, чий перший перехід у бот був саме за цим посиланням
    (first-touch: один користувач атрибутується одному link_id).
    (bot_eur, marketplace_eur, total_eur, bot_payers_count, marketplace_payers_count).
    """
    conn_local = get_optimized_connection()
    cur = conn_local.cursor()
    try:
        # Тільки ті, у кого перший візит по будь-якому посиланню був саме цей link_id
        cur.execute('''
            SELECT DISTINCT lv.visitor_user_id
            FROM LinkVisit lv
            WHERE lv.source_type = 'link' AND lv.source_id = ?
            AND lv.created_at = (
                SELECT MIN(lv2.created_at) FROM LinkVisit lv2
                WHERE lv2.source_type = 'link' AND lv2.visitor_user_id = lv.visitor_user_id
            )
        ''', (link_id,))
        visitor_ids = [row[0] for row in cur.fetchall()]
        if not visitor_ids:
            return 0.0, 0.0, 0.0, 0, 0

        # User.id цих же користувачів (перший перехід = цей link_id)
        cur.execute('''
            SELECT DISTINCT u.id
            FROM User u
            WHERE CAST(u.telegramId AS TEXT) IN (
                SELECT DISTINCT lv.visitor_user_id
                FROM LinkVisit lv
                WHERE lv.source_type = 'link' AND lv.source_id = ?
                AND lv.created_at = (
                    SELECT MIN(lv2.created_at) FROM LinkVisit lv2
                    WHERE lv2.source_type = 'link' AND lv2.visitor_user_id = lv.visitor_user_id
                )
            )
        ''', (link_id,))
        user_ids = [row[0] for row in cur.fetchall()]

        placeholders_visitors = ','.join('?' * len(visitor_ids))
        visitor_ints = [int(v) for v in visitor_ids]

        # Оплати в боті — тільки від користувачів з visitor_ids для цього link_id
        bot_eur = 0.0
        bot_payers = 0
        try:
            cur.execute(f'''
                SELECT COALESCE(SUM(amount), 0) FROM payments
                WHERE user_id IN ({placeholders_visitors}) AND status = 'success'
            ''', visitor_ints)
            row = cur.fetchone()
            bot_eur = float(row[0] or 0.0)
            cur.execute(f'''
                SELECT COUNT(DISTINCT user_id) FROM payments
                WHERE user_id IN ({placeholders_visitors}) AND status = 'success'
            ''', visitor_ints)
            bot_payers = (cur.fetchone()[0] or 0)
        except Exception:
            pass

        marketplace_eur = 0.0
        marketplace_payers = 0
        if user_ids:
            placeholders_users = ','.join('?' * len(user_ids))
            cur.execute(f'''
                SELECT COALESCE(SUM(amount), 0) FROM [Transaction]
                WHERE userId IN ({placeholders_users}) AND type = 'payment' AND status = 'completed'
            ''', user_ids)
            marketplace_eur = float(cur.fetchone()[0] or 0.0)
            cur.execute(f'''
                SELECT COUNT(DISTINCT userId) FROM [Transaction]
                WHERE userId IN ({placeholders_users}) AND type = 'payment' AND status = 'completed'
            ''', user_ids)
            marketplace_payers = cur.fetchone()[0] or 0

        total_eur = bot_eur + marketplace_eur
        return bot_eur, marketplace_eur, total_eur, bot_payers, marketplace_payers
    except Exception as e:
        print(f"Error get_link_payments_total: {e}")
        return 0.0, 0.0, 0.0, 0, 0
    finally:
        conn_local.close()


def update_link_name(link_id: int, new_name: str):
    cursor.execute('UPDATE Link SET linkName = ? WHERE id = ?', (new_name, link_id))
    conn.commit()


def delete_link(link_id: int):
    cursor.execute('DELETE FROM Link WHERE id = ?', (link_id,))
    conn.commit()

def get_users_by_language():
    return []