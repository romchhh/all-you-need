"""
Ініціалізація Prisma таблиць в спільній БД
Створює всі необхідні таблиці якщо їх немає
"""
import sqlite3
from database_functions.db_config import DATABASE_PATH

def init_prisma_tables():
    """Створює всі Prisma таблиці якщо їх немає"""
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        # User таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS User (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegramId INTEGER UNIQUE NOT NULL,
                username TEXT,
                firstName TEXT,
                lastName TEXT,
                phone TEXT,
                avatar TEXT,
                balance REAL DEFAULT 0,
                rating REAL DEFAULT 5.0,
                reviewsCount INTEGER DEFAULT 0,
                isActive INTEGER DEFAULT 1,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Перевіряємо та мігруємо telegramId на INTEGER (SQLite INTEGER підтримує до 8 байт)
        # Але для безпеки перевіряємо чи потрібна міграція
        try:
            cursor.execute("PRAGMA table_info(User)")
            columns = cursor.fetchall()
            telegramId_col = next((col for col in columns if col[1] == 'telegramId'), None)
            if telegramId_col:
                # Перевіряємо чи колонка має правильний тип
                # В SQLite INTEGER може зберігати до 8 байт, тому це має працювати
                # Але якщо є проблеми, можемо спробувати ALTER TABLE
                pass
        except:
            pass
        
        # Listing таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Listing (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                price TEXT NOT NULL,
                isFree INTEGER DEFAULT 0,
                category TEXT NOT NULL,
                subcategory TEXT,
                condition TEXT,
                location TEXT NOT NULL,
                views INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                promotionType TEXT,
                promotionEnds DATETIME,
                images TEXT NOT NULL,
                tags TEXT,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                publishedAt DATETIME,
                FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
            )
        ''')
        
        # Favorite таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Favorite (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                listingId INTEGER NOT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
                FOREIGN KEY (listingId) REFERENCES Listing(id) ON DELETE CASCADE,
                UNIQUE(userId, listingId)
            )
        ''')
        
        # Transaction таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Transaction (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'EUR',
                paymentMethod TEXT,
                status TEXT DEFAULT 'pending',
                description TEXT,
                metadata TEXT,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completedAt DATETIME,
                FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
            )
        ''')
        
        # Review таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Review (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                targetId INTEGER NOT NULL,
                listingId INTEGER,
                rating INTEGER NOT NULL,
                comment TEXT,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
            )
        ''')
        
        # ViewHistory таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ViewHistory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listingId INTEGER NOT NULL,
                viewedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                userAgent TEXT,
                ipAddress TEXT,
                FOREIGN KEY (listingId) REFERENCES Listing(id) ON DELETE CASCADE
            )
        ''')
        
        # Category таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Category (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                icon TEXT NOT NULL,
                parentId INTEGER,
                sortOrder INTEGER DEFAULT 0,
                isActive INTEGER DEFAULT 1,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parentId) REFERENCES Category(id)
            )
        ''')
        
        # Admin таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER UNIQUE NOT NULL,
                username TEXT,
                addedBy INTEGER,
                addedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                isSuperadmin INTEGER DEFAULT 0,
                FOREIGN KEY (userId) REFERENCES User(id)
            )
        ''')
        
        # Link таблиця
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Link (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                linkName TEXT NOT NULL,
                linkUrl TEXT,
                linkCount INTEGER DEFAULT 0
            )
        ''')
        
        # Створюємо індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_telegramId ON User(telegramId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_isActive ON User(isActive)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId ON Listing(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_category ON Listing(category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_subcategory ON Listing(subcategory)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status ON Listing(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_isFree ON Listing(isFree)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorite_userId ON Favorite(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorite_listingId ON Favorite(listingId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_userId ON Transaction(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_category_parentId ON Category(parentId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_admin_userId ON Admin(userId)')
        
        conn.commit()
        print("Prisma таблиці успішно ініціалізовані")
    except Exception as e:
        print(f"Помилка при ініціалізації Prisma таблиць: {e}")
        conn.rollback()
    finally:
        conn.close()

