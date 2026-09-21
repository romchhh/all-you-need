/** Популярні бізнес-запити на екрані пошуку. */
export const POPULAR_BUSINESS_SEARCH_QUERY_KEYS = [
  'repair',
  'beauty',
  'cleaning',
  'auto',
  'restaurant',
  'it',
  'photo',
  'moving',
] as const;

export const SPHERE_POPULAR_BUSINESS_QUERY_KEYS: Record<string, readonly string[]> = {
  beauty_care: ['manicure', 'hair', 'cosmetology', 'massage', 'brows', 'makeup'],
  health_sport: ['massage', 'fitness', 'yoga', 'trainer', 'rehab', 'sport'],
  auto_transport: ['service', 'detailing', 'tires', 'electric', 'tow', 'rent'],
  repair_construction: ['renovation', 'electrician', 'plumber', 'painter', 'windows', 'furniture'],
  home_services: ['cleaning', 'moving', 'repair', 'assembly', 'garden', 'hausmeister'],
  food_gastro: ['restaurant', 'cafe', 'bakery', 'catering', 'delivery', 'grocery'],
  retail: ['clothing', 'electronics', 'flowers', 'kids', 'cosmetics', 'shoes'],
  education: ['language', 'tutor', 'driving', 'kids', 'courses', 'online'],
  real_estate: ['rent', 'sale', 'agent', 'apartment', 'commercial', 'management'],
  finance_insurance: ['accounting', 'credit', 'insurance', 'investment', 'tax', 'consulting'],
  legal_docs: ['lawyer', 'notary', 'translation', 'visa', 'documents', 'consulting'],
  it_marketing: ['website', 'smm', 'design', 'seo', 'advertising', 'development'],
  photo_events: ['photo', 'video', 'wedding', 'dj', 'decor', 'host'],
  tourism: ['travel', 'excursion', 'transfer', 'guide', 'hotel', 'tickets'],
  other: ['service', 'consulting', 'help', 'support', 'studio', 'shop'],
};
