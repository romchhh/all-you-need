-- Міграція: додати invoiceId до ListingPackagePurchase
-- Дата: 2026-01-12

-- Додаємо колонку invoiceId для зберігання ID інвойсу від Monobank
ALTER TABLE ListingPackagePurchase ADD COLUMN invoiceId TEXT;

-- Створюємо індекс для швидкого пошуку за invoiceId
CREATE INDEX IF NOT EXISTS idx_package_purchase_invoice_id ON ListingPackagePurchase(invoiceId);
