-- Міграція для створення таблиці TelegramListing
-- Оголошення, створені через Telegram бота для публікації в канал

CREATE TABLE IF NOT EXISTS TelegramListing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'EUR',
    category TEXT NOT NULL,
    subcategory TEXT,
    condition TEXT NOT NULL, -- 'new' або 'used'
    location TEXT,
    images TEXT NOT NULL, -- JSON array of file_id
    status TEXT DEFAULT 'pending_moderation', -- pending_moderation, approved, rejected, published
    moderationStatus TEXT DEFAULT 'pending', -- pending, approved, rejected
    rejectionReason TEXT,
    publishedAt DATETIME,
    moderatedAt DATETIME,
    moderatedBy INTEGER, -- ID адміна
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (moderatedBy) REFERENCES Admin(userId)
);

CREATE INDEX IF NOT EXISTS idx_telegram_listing_userId ON TelegramListing(userId);
CREATE INDEX IF NOT EXISTS idx_telegram_listing_status ON TelegramListing(status);
CREATE INDEX IF NOT EXISTS idx_telegram_listing_moderationStatus ON TelegramListing(moderationStatus);
CREATE INDEX IF NOT EXISTS idx_telegram_listing_createdAt ON TelegramListing(createdAt);
CREATE INDEX IF NOT EXISTS idx_telegram_listing_category ON TelegramListing(category);
