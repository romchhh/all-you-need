import sqlite3
from datetime import datetime
from typing import Optional, Dict, Any
from database_functions.db_config import DATABASE_PATH

def get_connection():
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False, timeout=30.0)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA foreign_keys = ON;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA cache_size = -16384;')
    return conn

conn = get_connection()
cursor = conn.cursor()


def create_referral_table():
    """Створює таблицю для зберігання реферальних зв'язків"""
    # Перевіряємо чи таблиця існує
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Referral'")
    table_exists = cursor.fetchone()
    
    if not table_exists:
        # Створюємо таблицю з TEXT для Telegram ID (щоб підтримувати великі числа)
        cursor.execute('''
            CREATE TABLE Referral (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_telegram_id TEXT NOT NULL,
                referred_telegram_id TEXT NOT NULL UNIQUE,
                reward_paid INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                reward_paid_at TEXT
            )
        ''')
        conn.commit()
        
        # Створюємо індекси
        cursor.execute('''
            CREATE INDEX idx_referral_referrer_telegram_id ON Referral(referrer_telegram_id)
        ''')
        cursor.execute('''
            CREATE INDEX idx_referral_referred_telegram_id ON Referral(referred_telegram_id)
        ''')
        cursor.execute('''
            CREATE INDEX idx_referral_reward_paid ON Referral(reward_paid)
        ''')
        conn.commit()
    else:
        # Перевіряємо тип колонок
        cursor.execute("PRAGMA table_info(Referral)")
        columns = cursor.fetchall()
        column_types = {col[1]: col[2] for col in columns}
        
        # Якщо колонки INTEGER, мігруємо через створення нової таблиці
        needs_migration = (
            'referrer_telegram_id' in column_types and 'INTEGER' in column_types['referrer_telegram_id'].upper()
        ) or (
            'referred_telegram_id' in column_types and 'INTEGER' in column_types['referred_telegram_id'].upper()
        )
        
        if needs_migration:
            try:
                # Створюємо нову таблицю з правильними типами
                cursor.execute('''
                    CREATE TABLE Referral_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        referrer_telegram_id TEXT NOT NULL,
                        referred_telegram_id TEXT NOT NULL UNIQUE,
                        reward_paid INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        reward_paid_at TEXT
                    )
                ''')
                
                # Копіюємо дані з конвертацією
                cursor.execute('''
                    INSERT INTO Referral_new (id, referrer_telegram_id, referred_telegram_id, reward_paid, created_at, reward_paid_at)
                    SELECT id, CAST(referrer_telegram_id AS TEXT), CAST(referred_telegram_id AS TEXT), reward_paid, created_at, reward_paid_at
                    FROM Referral
                ''')
                
                # Видаляємо стару таблицю і перейменовуємо нову
                cursor.execute('DROP TABLE Referral')
                cursor.execute('ALTER TABLE Referral_new RENAME TO Referral')
                conn.commit()
                
                print("Referral table migrated successfully")
            except Exception as e:
                print(f"Migration error: {e}")
                conn.rollback()
        
        # Переконуємося що індекси існують
        try:
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_referral_referrer_telegram_id ON Referral(referrer_telegram_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_referral_referred_telegram_id ON Referral(referred_telegram_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_referral_reward_paid ON Referral(reward_paid)')
            conn.commit()
        except Exception as e:
            print(f"Index creation error: {e}")


def add_referral(referrer_telegram_id: int, referred_telegram_id: int) -> bool:
    """Додає реферальний зв'язок. Повертає True якщо успішно, False якщо користувач вже має реферала"""
    try:
        create_referral_table()
        
        # Перевіряємо чи вже існує запис для цього користувача
        cursor.execute('''
            SELECT id FROM Referral WHERE referred_telegram_id = ?
        ''', (str(referred_telegram_id),))
        
        if cursor.fetchone():
            return False  # Користувач вже має реферала
        
        # Додаємо новий реферальний зв'язок (конвертуємо в строку для TEXT колонки)
        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO Referral (referrer_telegram_id, referred_telegram_id, created_at)
            VALUES (?, ?, ?)
        ''', (str(referrer_telegram_id), str(referred_telegram_id), current_date))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    except Exception as e:
        print(f"Error adding referral: {e}")
        return False


def get_referrer_telegram_id(referred_telegram_id: int) -> Optional[int]:
    """Отримує telegram_id запрошувача для запрошеного користувача"""
    try:
        cursor.execute('''
            SELECT referrer_telegram_id FROM Referral 
            WHERE referred_telegram_id = ? AND reward_paid = 0
        ''', (str(referred_telegram_id),))
        result = cursor.fetchone()
        return int(result[0]) if result and result[0] else None
    except Exception as e:
        print(f"Error getting referrer: {e}")
        return None


def mark_referral_reward_paid(referred_telegram_id: int) -> bool:
    """Позначає що винагорода за реферала вже виплачена"""
    try:
        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            UPDATE Referral 
            SET reward_paid = 1, reward_paid_at = ?
            WHERE referred_telegram_id = ?
        ''', (current_date, str(referred_telegram_id)))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error marking referral reward paid: {e}")
        return False


def get_referral_stats(telegram_id: int) -> Dict[str, Any]:
    """Отримує статистику рефералів для користувача"""
    try:
        # Загальна кількість запрошених
        cursor.execute('''
            SELECT COUNT(*) FROM Referral 
            WHERE referrer_telegram_id = ?
        ''', (str(telegram_id),))
        total_referrals = cursor.fetchone()[0] or 0
        
        # Кількість запрошених, які вже отримали винагороду
        cursor.execute('''
            SELECT COUNT(*) FROM Referral 
            WHERE referrer_telegram_id = ? AND reward_paid = 1
        ''', (str(telegram_id),))
        paid_referrals = cursor.fetchone()[0] or 0
        
        # Загальна винагорода (1€ за кожного запрошеного, який подав оголошення)
        total_reward = paid_referrals * 1.0
        
        return {
            'total_referrals': total_referrals,
            'paid_referrals': paid_referrals,
            'total_reward': total_reward
        }
    except Exception as e:
        print(f"Error getting referral stats: {e}")
        return {
            'total_referrals': 0,
            'paid_referrals': 0,
            'total_reward': 0.0
        }


def add_user_balance(telegram_id: int, amount: float) -> bool:
    """Додає кошти на баланс користувача"""
    try:
        cursor.execute("SELECT balance FROM User WHERE telegramId = ?", (telegram_id,))
        result = cursor.fetchone()
        
        if not result:
            return False
        
        current_balance = float(result[0]) if result[0] is not None else 0.0
        new_balance = current_balance + amount
        
        cursor.execute("""
            UPDATE User 
            SET balance = ?, updatedAt = ?
            WHERE telegramId = ?
        """, (new_balance, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), telegram_id))
        conn.commit()
        
        return True
    except Exception as e:
        print(f"Error adding user balance: {e}")
        return False
