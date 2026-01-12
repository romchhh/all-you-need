-- Виправлення формату дат оголошень для сумісності з SQLite datetime('now')
-- Проблема: дати збережені в часовому поясі Берліна, а SQLite datetime('now') використовує UTC
-- Рішення: конвертуємо всі дати в UTC формат

-- Для оголошення ID 45, яке не відображається в каталозі
-- Встановлюємо expiresAt на 30 днів від зараз в UTC
UPDATE Listing 
SET expiresAt = datetime('now', '+30 days'),
    updatedAt = datetime('now')
WHERE id = 45;

-- Виправляємо всі активні оголошення з датами закінчення
UPDATE Listing 
SET expiresAt = datetime('now', '+30 days'),
    updatedAt = datetime('now')
WHERE status = 'active' 
  AND (expiresAt IS NULL OR datetime(expiresAt) <= datetime('now'));

-- Виправляємо дати промо-реклами які закінчились
UPDATE PromotionPurchase 
SET endsAt = datetime('now', '+7 days')
WHERE status = 'active' 
  AND (endsAt IS NULL OR datetime(endsAt) <= datetime('now'));
