-- Додаємо поле expiresAt до Listing
ALTER TABLE Listing ADD COLUMN expiresAt TEXT;

-- Встановлюємо expiresAt для існуючих активних оголошень (30 днів від створення)
UPDATE Listing 
SET expiresAt = datetime(createdAt, '+30 days')
WHERE status = 'active' AND expiresAt IS NULL;

-- Встановлюємо expiresAt для оголошень на модерації
UPDATE Listing 
SET expiresAt = datetime(createdAt, '+30 days')
WHERE status = 'pending_moderation' AND expiresAt IS NULL;

-- Створюємо індекс для швидкого пошуку закінчених оголошень
CREATE INDEX IF NOT EXISTS Listing_expiresAt_idx ON Listing(expiresAt);
CREATE INDEX IF NOT EXISTS Listing_status_expiresAt_idx ON Listing(status, expiresAt);
