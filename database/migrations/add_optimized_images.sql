-- Додаємо поле для оптимізованих зображень
-- Оригінали зберігаються в images, оптимізовані версії в optimizedImages

ALTER TABLE Listing ADD COLUMN optimizedImages TEXT;

-- Коментар: optimizedImages містить JSON array оптимізованих версій зображень (WebP, 1200x1200)
-- Якщо optimizedImages NULL або порожній, використовуємо оригінали з images
