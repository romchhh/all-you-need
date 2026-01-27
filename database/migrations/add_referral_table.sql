-- Створення таблиці Referral для реферальної програми
CREATE TABLE IF NOT EXISTS Referral (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrerTelegramId INTEGER NOT NULL,
    referredTelegramId INTEGER NOT NULL UNIQUE,
    rewardPaid INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    rewardPaidAt TEXT
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_referral_referrer_telegram_id ON Referral(referrerTelegramId);
CREATE INDEX IF NOT EXISTS idx_referral_referred_telegram_id ON Referral(referredTelegramId);
CREATE INDEX IF NOT EXISTS idx_referral_reward_paid ON Referral(rewardPaid);
