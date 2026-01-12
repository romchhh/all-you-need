import sqlite3
from datetime import datetime
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


def create_table():
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users_legacy (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC,
            user_name TEXT,
            user_first_name TEXT,
            user_last_name TEXT,
            user_phone TEXT,
            language TEXT,
            join_date TEXT,
            last_activity TEXT,
            ref_link INTEGER
        )
    ''')
    conn.commit()
    
    
def add_user(user_id: str, user_name: str, user_first_name: str, user_last_name: str, language: str = None, ref_link: int = None, avatar_path: str = None):
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (int(user_id),))
    existing_user = cursor.fetchone()
    
    current_date = datetime.now()
    current_date_str = current_date.strftime('%Y-%m-%d %H:%M:%S')
    
    if existing_user is None:
        cursor.execute('''
            INSERT INTO User (telegramId, username, firstName, lastName, avatar, balance, rating, reviewsCount, isActive, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            int(user_id), 
            user_name, 
            user_first_name, 
            user_last_name,
            avatar_path,
            0.0,  # balance
            5.0,  # rating
            0,    # reviewsCount
            1,    # isActive
            current_date_str,
            current_date_str
        ))
        conn.commit()
        
        user_language = 'uk'  # За замовчуванням
        if language:
            if language.startswith('ru'):
                user_language = 'ru'
            elif language.startswith('uk'):
                user_language = 'uk'
        
        cursor.execute('''
            INSERT INTO users_legacy (user_id, user_name, user_first_name, user_last_name, language, join_date, last_activity, ref_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, user_name, user_first_name, user_last_name, user_language, current_date.strftime('%Y-%m-%d %H:%M:%S'), current_date.strftime('%Y-%m-%d %H:%M:%S'), ref_link))
        conn.commit()
    else:
        update_query = '''
            UPDATE User 
            SET username = ?, firstName = ?, lastName = ?, updatedAt = ?
        '''
        update_params = [
            user_name,
            user_first_name,
            user_last_name,
            current_date_str,
        ]
        
        if avatar_path:
            update_query = '''
                UPDATE User 
                SET username = ?, firstName = ?, lastName = ?, avatar = ?, updatedAt = ?
            '''
            update_params.insert(-1, avatar_path)
        
        update_params.append(int(user_id))
        update_query += ' WHERE telegramId = ?'
        
        cursor.execute(update_query, tuple(update_params))
        conn.commit()
        

def check_user(user_id: str):
    cursor.execute('SELECT id FROM User WHERE telegramId = ?', (int(user_id),))
    user = cursor.fetchone()
    if user:
        return True
    return False    


def update_user_activity(user_id: str):
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        cursor.execute('''
            UPDATE users_legacy 
            SET last_activity = ? 
            WHERE user_id = ?
        ''', (current_time, user_id))
        conn.commit()
    except Exception as e:
        print(f"Error updating legacy activity: {e}")
    
    try:
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (int(user_id),))
        user_row = cursor.fetchone()
        
        if user_row:
            user_db_id = user_row[0]
            cursor.execute("SELECT id FROM UserSession WHERE userId = ? AND telegramId = ?", (user_db_id, int(user_id)))
            session_row = cursor.fetchone()
            
            if session_row:
                cursor.execute('''
                    UPDATE UserSession 
                    SET lastActiveAt = ? 
                    WHERE userId = ? AND telegramId = ?
                ''', (current_time, user_db_id, int(user_id)))
            else:
                cursor.execute('''
                    INSERT INTO UserSession (userId, telegramId, lastActiveAt, createdAt)
                    VALUES (?, ?, ?, ?)
                ''', (user_db_id, int(user_id), current_time, current_time))
            conn.commit()
    except Exception as e:
        print(f"Error updating UserSession activity: {e}")


def get_user_id_by_username(username: str):
    cursor.execute("SELECT telegramId FROM User WHERE username = ?", (username,))
    result = cursor.fetchone()
    return result[0] if result else None


def get_username_by_user_id(user_id: str):
    cursor.execute("SELECT username FROM User WHERE telegramId = ?", (int(user_id),))
    result = cursor.fetchone()
    return result[0] if result else None


def get_user_avatar(user_id: str):
    cursor.execute("SELECT avatar FROM User WHERE telegramId = ?", (int(user_id),))
    result = cursor.fetchone()
    return result[0] if result else None


def get_user_agreement_status(user_id: str) -> bool:
    try:
        cursor.execute("SELECT agreementAccepted FROM User WHERE telegramId = ?", (int(user_id),))
        result = cursor.fetchone()
        if result is not None:
            return bool(result[0])
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE User ADD COLUMN agreementAccepted INTEGER DEFAULT 0")
            conn.commit()
            print("Added agreementAccepted column to User table")
        except Exception as e:
            print(f"Error adding agreementAccepted column: {e}")
    return False


def set_user_agreement_status(user_id: str, accepted: bool):
    try:
        cursor.execute("SELECT agreementAccepted FROM User WHERE telegramId = ?", (int(user_id),))
        result = cursor.fetchone()
        if result is None:
            print(f"User {user_id} not found when setting agreement status")
            return
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE User ADD COLUMN agreementAccepted INTEGER DEFAULT 0")
            conn.commit()
            print("Added agreementAccepted column to User table")
        except Exception as e:
            print(f"Error adding agreementAccepted column: {e}")
            return
    
    cursor.execute(
        "UPDATE User SET agreementAccepted = ? WHERE telegramId = ?",
        (1 if accepted else 0, int(user_id))
    )
    conn.commit()
    print(f"User {user_id} agreement status set to {accepted}")


def get_user_phone(user_id: str) -> str | None:
    cursor.execute("SELECT phone FROM User WHERE telegramId = ?", (int(user_id),))
    result = cursor.fetchone()
    return result[0] if result and result[0] else None


def set_user_phone(user_id: str, phone: str):
    cursor.execute("SELECT id FROM User WHERE telegramId = ?", (int(user_id),))
    result = cursor.fetchone()
    if result is None:
        print(f"User {user_id} not found when setting phone")
        return
    
    cursor.execute(
        "UPDATE User SET phone = ? WHERE telegramId = ?",
        (phone, int(user_id))
    )
    conn.commit()
    print(f"Phone {phone} set for user {user_id}")


def get_user_language(user_id: int) -> str:
    cursor.execute('SELECT language FROM users_legacy WHERE user_id = ?', (str(user_id),))
    result = cursor.fetchone()
    if result and result[0]:
        lang = result[0]
        if lang in ['uk', 'ru']:
            return lang
    
    try:
        cursor.execute('''
            SELECT language FROM User 
            WHERE CAST(telegramId AS INTEGER) = ?
        ''', (user_id,))
        user_result = cursor.fetchone()
        if user_result and user_result[0]:
            lang = user_result[0]
            if lang in ['uk', 'ru']:
                set_user_language(user_id, lang)
                return lang
    except Exception as e:
        pass
    
    return 'uk'


def set_user_language(user_id: int, language: str):
    if language not in ['uk', 'ru']:
        print(f"Invalid language: {language}")
        return

    cursor.execute('SELECT id FROM users_legacy WHERE user_id = ?', (str(user_id),))
    result = cursor.fetchone()
    
    if result:
        cursor.execute('''
            UPDATE users_legacy 
            SET language = ? 
            WHERE user_id = ?
        ''', (language, str(user_id)))
    else:
        cursor.execute('''
            INSERT INTO users_legacy (user_id, language, join_date, last_activity)
            VALUES (?, ?, ?, ?)
        ''', (str(user_id), language, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
    
    conn.commit()
    print(f"Language {language} set for user {user_id}")