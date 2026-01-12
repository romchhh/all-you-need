-- Міграція: додати invoiceId до PromotionPurchase
-- Дата: 2026-01-12

-- Додаємо колонку invoiceId для зберігання ID інвойсу від Monobank
ALTER TABLE PromotionPurchase ADD COLUMN invoiceId TEXT;

-- Створюємо індекс для швидкого пошуку за invoiceId
CREATE INDEX IF NOT EXISTS idx_promotion_purchase_invoice_id ON PromotionPurchase(invoiceId);
