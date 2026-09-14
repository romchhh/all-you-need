import sqlite3
from datetime import datetime
from database_functions.db_connection import get_connection, is_postgres

conn = get_connection()
cursor = conn.cursor()


def _rollback_on_error() -> None:
    if not is_postgres():
        return
    try:
        conn.rollback()
    except Exception:
        pass


def _users_legacy_next_id() -> int:
    cursor.execute('SELECT COALESCE(MAX(id), 0) + 1 FROM users_legacy')
    row = cursor.fetchone()
    return int(row[0]) if row and row[0] is not None else 1


def _normalize_db_bool(value) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    try:
        return int(value) != 0
    except (TypeError, ValueError):
        return bool(value)


def ensure_bot_user_record(
    user_id,
    user_name: str | None = None,
    user_first_name: str | None = None,
    user_last_name: str | None = None,
) -> bool:
    """Створює мінімальний запис User, якщо його ще немає (реєстрація в боті)."""
    try:
        uid = int(user_id)
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (uid,))
        if cursor.fetchone():
            return True

        current_date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            '''
            INSERT INTO User (
                telegramId, username, firstName, lastName, balance, rating,
                reviewsCount, isActive, agreementAccepted, createdAt, updatedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                uid,
                user_name,
                user_first_name,
                user_last_name,
                0.0,
                5.0,
                0,
                True,
                False,
                current_date_str,
                current_date_str,
            ),
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"ensure_bot_user_record failed for user {user_id}: {e}")
        _rollback_on_error()
        return False


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
    try:
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (int(user_id),))
        existing_user = cursor.fetchone()
        
        current_date = datetime.now()
        current_date_str = current_date.strftime('%Y-%m-%d %H:%M:%S')
        
        if existing_user is None:
            cursor.execute('''
                INSERT INTO User (telegramId, username, firstName, lastName, avatar, balance, rating, reviewsCount, isActive, agreementAccepted, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                int(user_id), 
                user_name, 
                user_first_name, 
                user_last_name,
                avatar_path,
                0.0,  # balance
                5.0,  # rating
                0,    # reviewsCount
                True,    # isActive
                False,
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
            
            cursor.execute('SELECT id FROM users_legacy WHERE user_id = ?', (str(user_id),))
            legacy_row = cursor.fetchone()
            if legacy_row:
                cursor.execute(
                    '''
                    UPDATE users_legacy
                    SET user_name = ?, user_first_name = ?, user_last_name = ?,
                        last_activity = ?,
                        ref_link = COALESCE(?, ref_link)
                    WHERE user_id = ?
                    ''',
                    (
                        user_name or '',
                        user_first_name or '',
                        user_last_name or '',
                        current_date.strftime('%Y-%m-%d %H:%M:%S'),
                        ref_link,
                        str(user_id),
                    ),
                )
            else:
                legacy_id = _users_legacy_next_id()
                cursor.execute(
                    '''
                    INSERT INTO users_legacy (id, user_id, user_name, user_first_name, user_last_name, language, join_date, last_activity, ref_link)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        legacy_id,
                        str(user_id),
                        user_name,
                        user_first_name,
                        user_last_name,
                        user_language,
                        current_date.strftime('%Y-%m-%d %H:%M:%S'),
                        current_date.strftime('%Y-%m-%d %H:%M:%S'),
                        ref_link,
                    ),
                )
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
    except Exception as e:
        print(f"add_user failed for {user_id}: {e}")
        _rollback_on_error()
        raise

def check_user(user_id: str):
    cursor.execute('SELECT id FROM User WHERE telegramId = ?', (int(user_id),))
    user = cursor.fetchone()
    if user:
        return True
    return False


def is_user_active(user_id):
    """Повертає True якщо користувач існує і не заблокований (isActive)."""
    cursor.execute('SELECT isActive FROM User WHERE telegramId = ?', (int(user_id),))
    row = cursor.fetchone()
    if not row:
        return False
    val = row[0]
    if val is None:
        return True
    if isinstance(val, bool):
        return val
    try:
        return int(val) != 0
    except (TypeError, ValueError):
        return bool(val)


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
        _rollback_on_error()
    
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
        _rollback_on_error()


def get_user_id_by_username(username: str):
    cursor.execute("SELECT telegramId FROM User WHERE username = ?", (username,))
    result = cursor.fetchone()
    return result[0] if result else None


def get_username_by_user_id(user_id: str):
    cursor.execute("SELECT username FROM User WHERE telegramId = ?", (int(user_id),))
    result = cursor.fetchone()
    return result[0] if result else None


def update_user_username(user_id: str, username: str | None):
    """Оновлює username користувача в User та users_legacy (при зміні нікнейму в Telegram)."""
    current_date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    username_val = username if username else None
    try:
        cursor.execute(
            "UPDATE User SET username = ?, updatedAt = ? WHERE telegramId = ?",
            (username_val, current_date_str, int(user_id))
        )
        conn.commit()
        cursor.execute(
            "UPDATE users_legacy SET user_name = ? WHERE user_id = ?",
            (username_val or '', str(user_id))
        )
        conn.commit()
    except Exception as e:
        print(f"Error updating username for user {user_id}: {e}")


def get_user_avatar(user_id: str):
    cursor.execute("SELECT avatar FROM User WHERE telegramId = ?", (int(user_id),))
    result = cursor.fetchone()
    return result[0] if result else None


def get_user_agreement_status(user_id: str) -> bool:
    try:
        cursor.execute(
            "SELECT agreementAccepted FROM User WHERE telegramId = ?",
            (int(user_id),),
        )
        result = cursor.fetchone()
        if result is not None:
            return _normalize_db_bool(result[0])
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE User ADD COLUMN agreementAccepted INTEGER DEFAULT 0")
            conn.commit()
            print("Added agreementAccepted column to User table")
        except Exception as e:
            print(f"Error adding agreementAccepted column: {e}")
            _rollback_on_error()
    except Exception as e:
        print(f"Error getting agreement status for user {user_id}: {e}")
        _rollback_on_error()
    return False


def set_user_agreement_status(user_id: str, accepted: bool) -> bool:
    try:
        uid = int(user_id)
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (uid,))
        result = cursor.fetchone()
        if result is None:
            print(f"User {user_id} not found when setting agreement status")
            return False

        accepted_val = True if accepted else False
        current_date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            '''
            UPDATE User
            SET agreementAccepted = ?, updatedAt = ?
            WHERE telegramId = ?
            ''',
            (accepted_val, current_date_str, uid),
        )
        conn.commit()
        print(f"User {user_id} agreement status set to {accepted}")
        return True
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE User ADD COLUMN agreementAccepted INTEGER DEFAULT 0")
            conn.commit()
            return set_user_agreement_status(user_id, accepted)
        except Exception as e:
            print(f"Error adding agreementAccepted column: {e}")
            _rollback_on_error()
            return False
    except Exception as e:
        print(f"Error setting agreement status for user {user_id}: {e}")
        _rollback_on_error()
        return False


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
    """Мова інтерфейсу бота з users_legacy (User.language у Prisma немає)."""
    try:
        cursor.execute('SELECT language FROM users_legacy WHERE user_id = ?', (str(user_id),))
        result = cursor.fetchone()
        if result and result[0] in ('uk', 'ru'):
            return result[0]
    except Exception as e:
        print(f"Error getting language from users_legacy table: {e}")
        _rollback_on_error()

    return 'uk'


def set_user_language(user_id: int, language: str):
    """Встановлює мову користувача в users_legacy."""
    if language not in ['uk', 'ru']:
        print(f"Invalid language: {language}")
        return

    try:
        cursor.execute('SELECT id FROM users_legacy WHERE user_id = ?', (str(user_id),))
        result = cursor.fetchone()

        if result:
            cursor.execute(
                '''
                UPDATE users_legacy
                SET language = ?
                WHERE user_id = ?
            ''',
                (language, str(user_id)),
            )
        else:
            legacy_id = _users_legacy_next_id()
            now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(
                '''
                INSERT INTO users_legacy (id, user_id, language, join_date, last_activity)
                VALUES (?, ?, ?, ?, ?)
            ''',
                (
                    legacy_id,
                    str(user_id),
                    language,
                    now_str,
                    now_str,
                ),
            )

        conn.commit()
        print(f"Language {language} set for user {user_id}")
    except Exception as e:
        print(f"Error setting language for user {user_id}: {e}")
        _rollback_on_error()


def get_user_balance(telegram_id: int) -> float:
    """Отримує баланс користувача за telegram_id"""
    cursor.execute("SELECT balance FROM User WHERE telegramId = ?", (telegram_id,))
    result = cursor.fetchone()
    if result:
        return float(result[0]) if result[0] is not None else 0.0
    return 0.0


def deduct_user_balance(telegram_id: int, amount: float) -> bool:
    """Списує кошти з балансу користувача. Повертає True якщо успішно, False якщо недостатньо коштів"""
    cursor.execute("SELECT balance FROM User WHERE telegramId = ?", (telegram_id,))
    result = cursor.fetchone()
    
    if not result:
        return False
    
    current_balance = float(result[0]) if result[0] is not None else 0.0
    
    if current_balance < amount:
        return False
    
    new_balance = current_balance - amount
    cursor.execute("""
        UPDATE User 
        SET balance = ?, updatedAt = ?
        WHERE telegramId = ?
    """, (new_balance, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), telegram_id))
    conn.commit()
    
    return True