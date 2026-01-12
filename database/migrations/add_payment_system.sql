-- Додаємо нові поля до User
ALTER TABLE User ADD COLUMN listingPackagesBalance INTEGER DEFAULT 1;
ALTER TABLE User ADD COLUMN hasUsedFreeAd INTEGER DEFAULT 0;

-- Додаємо нові поля до Listing
ALTER TABLE Listing ADD COLUMN moderationStatus TEXT DEFAULT 'approved';
ALTER TABLE Listing ADD COLUMN rejectionReason TEXT;
ALTER TABLE Listing ADD COLUMN moderatedAt TEXT;
ALTER TABLE Listing ADD COLUMN moderatedBy INTEGER;

-- Оновлюємо існуючі оголошення
UPDATE Listing SET moderationStatus = 'approved' WHERE moderationStatus IS NULL;

-- Створюємо таблицю SystemSettings
CREATE TABLE IF NOT EXISTS SystemSettings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedBy INTEGER
);

CREATE INDEX IF NOT EXISTS SystemSettings_key_idx ON SystemSettings(key);

-- Створюємо таблицю ListingPackagePurchase
CREATE TABLE IF NOT EXISTS ListingPackagePurchase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  packageType TEXT NOT NULL,
  listingsCount INTEGER NOT NULL,
  price REAL NOT NULL,
  paymentMethod TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt TEXT,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ListingPackagePurchase_userId_idx ON ListingPackagePurchase(userId);
CREATE INDEX IF NOT EXISTS ListingPackagePurchase_status_idx ON ListingPackagePurchase(status);
CREATE INDEX IF NOT EXISTS ListingPackagePurchase_createdAt_idx ON ListingPackagePurchase(createdAt);

-- Створюємо таблицю PromotionPurchase
CREATE TABLE IF NOT EXISTS PromotionPurchase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  listingId INTEGER,
  promotionType TEXT NOT NULL,
  price REAL NOT NULL,
  duration INTEGER NOT NULL DEFAULT 7,
  paymentMethod TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  startsAt TEXT,
  endsAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS PromotionPurchase_userId_idx ON PromotionPurchase(userId);
CREATE INDEX IF NOT EXISTS PromotionPurchase_listingId_idx ON PromotionPurchase(listingId);
CREATE INDEX IF NOT EXISTS PromotionPurchase_status_idx ON PromotionPurchase(status);
CREATE INDEX IF NOT EXISTS PromotionPurchase_promotionType_idx ON PromotionPurchase(promotionType);
CREATE INDEX IF NOT EXISTS PromotionPurchase_createdAt_idx ON PromotionPurchase(createdAt);

-- Додаємо індекс для moderationStatus
CREATE INDEX IF NOT EXISTS Listing_moderationStatus_idx ON Listing(moderationStatus);
CREATE INDEX IF NOT EXISTS Listing_moderationStatus_createdAt_idx ON Listing(moderationStatus, createdAt);

-- Вставляємо дефолтне налаштування
INSERT OR IGNORE INTO SystemSettings (key, value, description)
VALUES ('paidListingsEnabled', 'false', 'Enable or disable paid listings system');
