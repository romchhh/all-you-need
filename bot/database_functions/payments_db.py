import sqlite3
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"

def get_connection():
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA foreign_keys = ON;')
    return conn

def create_payments_table():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            payment_id TEXT,
            invoice_id TEXT PRIMARY KEY,
            user_id INTEGER,
            product_id INTEGER,
            months INTEGER,
            amount REAL,
            status TEXT,
            created_at DATETIME,
            updated_at DATETIME
        )
    ''')
    conn.commit()
    conn.close()


def save_payment_info(payment_id: str, invoice_id: str, user_id: int, product_id: int, months: int, amount: float, status: str) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO payments (
                payment_id, invoice_id, user_id, product_id, months, amount, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (payment_id, invoice_id, user_id, product_id, months, amount, status))
        conn.commit()
        conn.close()
        return True
    except sqlite3.Error as e:
        print(f"Помилка при збереженні платежу: {e}")
        return False


def get_payment_info(invoice_id: str) -> tuple:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_id, product_id, months 
            FROM payments 
            WHERE invoice_id = ?
        """, (invoice_id,))
        result = cursor.fetchone()
        conn.close()
        return result
    except sqlite3.Error as e:
        print(f"Помилка при отриманні інформації про платіж: {e}")
        return None


def update_payment_status(invoice_id: str, status: str) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE payments 
            SET status = ?, updated_at = datetime('now')
            WHERE invoice_id = ?
        """, (status, invoice_id))
        conn.commit()
        conn.close()
        return True
    except sqlite3.Error as e:
        print(f"Помилка при оновленні статусу платежу: {e}")
        return False

def get_pending_payments(hours: int = 24):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT invoice_id, user_id, product_id, months, amount
            FROM payments 
            WHERE status = 'pending' 
            AND created_at >= datetime('now', ?)
        """, (f'-{hours} hours',))
        result = cursor.fetchall()
        conn.close()
        return result
    except sqlite3.Error as e:
        print(f"Помилка при отриманні pending платежів: {e}")
        return []
