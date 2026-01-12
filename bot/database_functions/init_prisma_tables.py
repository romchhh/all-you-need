import sqlite3
from database_functions.db_config import DATABASE_PATH

def get_optimized_connection():
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False, timeout=30.0)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA foreign_keys = ON;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA cache_size = -16384;')
    return conn

def init_prisma_tables():
    conn = get_optimized_connection()
    cursor = conn.cursor()
    
    try:
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
        
        try:
            cursor.execute("PRAGMA table_info(User)")
            columns = cursor.fetchall()
            telegramId_col = next((col for col in columns if col[1] == 'telegramId'), None)
            if telegramId_col:
                pass
        except:
            pass
        
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
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Payment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                invoiceId TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL,
                amountEur REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'EUR',
                status TEXT NOT NULL DEFAULT 'created',
                pageUrl TEXT,
                webhookData TEXT,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completedAt DATETIME,
                FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_Payment_userId ON Payment(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_Payment_invoiceId ON Payment(invoiceId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_Payment_status ON Payment(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_Payment_createdAt ON Payment(createdAt)')
        
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
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS Link (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                linkName TEXT NOT NULL,
                linkUrl TEXT,
                linkCount INTEGER DEFAULT 0
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS TelegramListing (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                price REAL NOT NULL,
                currency TEXT DEFAULT 'EUR',
                category TEXT NOT NULL,
                subcategory TEXT,
                condition TEXT NOT NULL,
                location TEXT,
                images TEXT NOT NULL,
                status TEXT DEFAULT 'pending_moderation',
                moderationStatus TEXT DEFAULT 'pending',
                rejectionReason TEXT,
                publishedAt DATETIME,
                moderatedAt DATETIME,
                moderatedBy INTEGER,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
                FOREIGN KEY (moderatedBy) REFERENCES Admin(userId)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_telegramId ON User(telegramId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_isActive ON User(isActive)')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId ON Listing(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_category ON Listing(category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_subcategory ON Listing(subcategory)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status ON Listing(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_isFree ON Listing(isFree)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_createdAt ON Listing(createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_publishedAt ON Listing(publishedAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_currency ON Listing(currency)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_views ON Listing(views)')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status_createdAt ON Listing(status, createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status_views ON Listing(status, views)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId_status ON Listing(userId, status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_userId_category ON Listing(userId, category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_status_isFree_createdAt ON Listing(status, isFree, createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listing_category_subcategory_status ON Listing(category, subcategory, status)')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorite_userId ON Favorite(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorite_listingId ON Favorite(listingId)')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_userId ON [Transaction](userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_status ON [Transaction](status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_createdAt ON [Transaction](createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transaction_type_status ON [Transaction](type, status)')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_targetId ON Review(targetId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_listingId ON Review(listingId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_createdAt ON Review(createdAt)')
        
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
        
        # TelegramListing індекси
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_telegram_listing_userId ON TelegramListing(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_telegram_listing_status ON TelegramListing(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_telegram_listing_moderationStatus ON TelegramListing(moderationStatus)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_telegram_listing_createdAt ON TelegramListing(createdAt)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_telegram_listing_category ON TelegramListing(category)')
        
        conn.commit()
        print("Prisma таблиці успішно ініціалізовані")
    except Exception as e:
        print(f"Помилка при ініціалізації Prisma таблиць: {e}")
        conn.rollback()
    finally:
        conn.close()

