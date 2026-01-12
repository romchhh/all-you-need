-- Міграція: прибрати moderationStatus = 'approved' і використовувати тільки status = 'active'
-- Дата: 2026-01-12

-- Всі оголошення з moderationStatus = 'approved' тепер мають status = 'active' і moderationStatus = NULL
UPDATE Listing 
SET moderationStatus = NULL
WHERE moderationStatus = 'approved' AND status = 'active';

-- Якщо є оголошення зі статусом 'approved' але не 'active', робимо їх активними
UPDATE Listing 
SET status = 'active', moderationStatus = NULL
WHERE moderationStatus = 'approved' AND status != 'active';
