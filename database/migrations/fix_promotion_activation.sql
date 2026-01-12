-- Виправлення оголошень з оплаченою рекламою але без активованого promotionType
-- Проблема: після оплати через Monobank PromotionPurchase створюється зі статусом 'pending',
-- але promotionType та promotionEnds не записуються в таблицю Listing

-- Виправляємо оголошення які мають активну промо але promotionType не встановлений
UPDATE Listing 
SET promotionType = (
  SELECT promotionType 
  FROM PromotionPurchase 
  WHERE listingId = Listing.id AND status = 'active' 
  LIMIT 1
),
promotionEnds = datetime('now', '+7 days'),
updatedAt = datetime('now')
WHERE id IN (
  SELECT listingId 
  FROM PromotionPurchase 
  WHERE status = 'active' 
    AND listingId IN (SELECT id FROM Listing WHERE promotionType IS NULL OR promotionType = '')
);
