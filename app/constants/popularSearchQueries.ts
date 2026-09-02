/** Глобальні популярні запити (коли категорія не обрана). */
export const POPULAR_SEARCH_QUERY_KEYS = [
  'iphone',
  'sofa',
  'bicycle',
  'rent',
  'job',
  'stroller',
  'laptop',
  'cleaning',
] as const;

/**
 * Тематичні популярні запити для кожної категорії на сторінці пошуку.
 * Ключі → bazaar.search.queriesByCategory.{categoryId}.{key}
 */
export const CATEGORY_POPULAR_QUERY_KEYS: Record<string, readonly string[]> = {
  services_work: ['cleaning', 'repair', 'vacancy', 'beauty', 'moving', 'tutor'],
  fashion: ['dress', 'sneakers', 'jacket', 'jeans', 'bag', 'boots'],
  furniture: ['sofa', 'bed', 'wardrobe', 'table', 'chair', 'mattress'],
  electronics: ['iphone', 'laptop', 'tv', 'playstation', 'headphones', 'tablet'],
  appliances: ['washing', 'fridge', 'vacuum', 'microwave', 'dishwasher', 'coffee'],
  kids: ['stroller', 'toys', 'carseat', 'crib', 'clothes', 'bike'],
  home: ['dishes', 'lamp', 'decor', 'tools', 'textile', 'plants'],
  beauty_wellness: ['cosmetics', 'perfume', 'skincare', 'hairdryer', 'cream', 'makeup'],
  auto: ['tires', 'parts', 'childseat', 'winter', 'oil', 'rims'],
  hobby_sports: ['bicycle', 'scooter', 'guitar', 'dumbbells', 'tent', 'skis'],
  pets: ['dog', 'cat', 'food', 'carrier', 'aquarium', 'walking'],
  realestate: ['rent', 'room', 'apartment', 'house', 'garage', 'wg'],
  free: ['giveaway', 'furniture', 'clothes', 'appliances', 'kids', 'books'],
};
