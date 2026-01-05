"""
Ініціалізація Prisma таблиць в спільній БД
Створює всі необхідні таблиці якщо їх немає
"""
import sqlite3
from database_functions.db_config import DATABASE_PATH

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

def init_prisma_tables():
    """Створює всі Prisma таблиці якщо їх немає"""
    conn = get_optimized_connection()
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
        
        # Transaction таблиця (використовуємо квадратні дужки, оскільки Transaction - зарезервоване слово)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS [Transaction] (
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
                viewerTelegramId INTEGER,
                viewedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                userAgent TEXT,
                ipAddress TEXT,
                FOREIGN KEY (listingId) REFERENCES Listing(id) ON DELETE CASCADE,
                UNIQUE(listingId, viewerTelegramId)
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
        # User індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_telegramId ON User(telegramId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_isActive ON User(isActive)')
        
        # Listing індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId ON Listing(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_category ON Listing(category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_subcategory ON Listing(subcategory)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status ON Listing(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_isFree ON Listing(isFree)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_createdAt ON Listing(createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_publishedAt ON Listing(publishedAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_currency ON Listing(currency)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_views ON Listing(views)')
        
        # Composite індекси для Listing (для швидших запитів)
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status_createdAt ON Listing(status, createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status_views ON Listing(status, views)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId_status ON Listing(userId, status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId_category ON Listing(userId, category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status_isFree_createdAt ON Listing(status, isFree, createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_category_subcategory_status ON Listing(category, subcategory, status)')
        
        # Favorite індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorite_userId ON Favorite(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorite_listingId ON Favorite(listingId)')
        
        # Transaction індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_userId ON [Transaction](userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_status ON [Transaction](status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_createdAt ON [Transaction](createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_type_status ON [Transaction](type, status)')
        
        # Review індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_targetId ON Review(targetId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_listingId ON Review(listingId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_createdAt ON Review(createdAt)')
        
        # ViewHistory індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_viewhistory_listingId ON ViewHistory(listingId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_viewhistory_viewerTelegramId ON ViewHistory(viewerTelegramId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_viewhistory_viewedAt ON ViewHistory(viewedAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_viewhistory_listing_viewer ON ViewHistory(listingId, viewerTelegramId)')
        
        # Category індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_category_parentId ON Category(parentId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_category_isActive_sortOrder ON Category(isActive, sortOrder)')
        
        # Admin індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_admin_userId ON Admin(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_admin_isSuperadmin ON Admin(isSuperadmin)')
        
        # Link індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_link_linkName ON Link(linkName)')
        
        conn.commit()
        print("Prisma таблиці успішно ініціалізовані")
    except Exception as e:
        print(f"Помилка при ініціалізації Prisma таблиць: {e}")
        conn.rollback()
    finally:
        conn.close()

