import { Category } from '@/types';

// Функція для отримання категорій з перекладами
export const getCategories = (t: (key: string) => string): Category[] => [
  {
    id: 'fashion',
    name: t('categories.fashion'),
    icon: '👕',
    subcategories: [
      { id: 'women_clothing', name: t('categories.subcategories.women_clothing') },
      { id: 'women_shoes', name: t('categories.subcategories.women_shoes') },
      { id: 'men_clothing', name: t('categories.subcategories.men_clothing') },
      { id: 'men_shoes', name: t('categories.subcategories.men_shoes') },
      { id: 'accessories', name: t('categories.subcategories.accessories') },
      { id: 'hats', name: t('categories.subcategories.hats') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'furniture',
    name: t('categories.furniture'),
    icon: '🛋️',
    subcategories: [
      { id: 'sofas_chairs', name: t('categories.subcategories.sofas_chairs') },
      { id: 'wardrobes_chests', name: t('categories.subcategories.wardrobes_chests') },
      { id: 'tables_chairs', name: t('categories.subcategories.tables_chairs') },
      { id: 'beds_mattresses', name: t('categories.subcategories.beds_mattresses') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'electronics',
    name: t('categories.electronics'),
    icon: '📱',
    subcategories: [
      { id: 'smartphones', name: t('categories.subcategories.smartphones') },
      { id: 'computers_laptops', name: t('categories.subcategories.computers_laptops') },
      { id: 'tv_audio', name: t('categories.subcategories.tv_audio') },
      { id: 'games_consoles', name: t('categories.subcategories.games_consoles') },
      { id: 'accessories', name: t('categories.subcategories.accessories') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'appliances',
    name: t('categories.appliances'),
    icon: '🔌',
    subcategories: [
      { id: 'large_appliances', name: t('categories.subcategories.large_appliances') },
      { id: 'small_appliances', name: t('categories.subcategories.small_appliances') },
      { id: 'kitchen_appliances', name: t('categories.subcategories.kitchen_appliances') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'kids',
    name: t('categories.kids'),
    icon: '🧸',
    subcategories: [
      { id: 'toys', name: t('categories.subcategories.toys') },
      { id: 'strollers_car_seats', name: t('categories.subcategories.strollers_car_seats') },
      { id: 'clothing', name: t('categories.subcategories.clothing') },
      { id: 'beds_furniture', name: t('categories.subcategories.beds_furniture') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'home',
    name: t('categories.home'),
    icon: '🏡',
    subcategories: [
      { id: 'dishes', name: t('categories.subcategories.dishes') },
      { id: 'textiles', name: t('categories.subcategories.textiles') },
      { id: 'lighting', name: t('categories.subcategories.lighting') },
      { id: 'decor', name: t('categories.subcategories.decor') },
      { id: 'tools', name: t('categories.subcategories.tools') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'beauty_wellness',
    name: t('categories.beauty_wellness'),
    icon: '💄',
    subcategories: [
      { id: 'cosmetics', name: t('categories.subcategories.cosmetics') },
      { id: 'perfumery', name: t('categories.subcategories.perfumery') },
      { id: 'personal_care', name: t('categories.subcategories.personal_care') },
      { id: 'health_products', name: t('categories.subcategories.health_products') },
      { id: 'hygiene', name: t('categories.subcategories.hygiene') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'auto',
    name: t('categories.auto'),
    icon: '🚗',
    subcategories: [
      { id: 'cars', name: t('categories.subcategories.cars') },
      { id: 'tires_wheels', name: t('categories.subcategories.tires_wheels') },
      { id: 'parts', name: t('categories.subcategories.parts') },
      { id: 'accessories', name: t('categories.subcategories.accessories') },
      { id: 'child_seats', name: t('categories.subcategories.child_seats') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'hobby_sports',
    name: t('categories.hobby_sports'),
    icon: '⚽',
    subcategories: [
      { id: 'sports_equipment', name: t('categories.subcategories.sports_equipment') },
      { id: 'bikes_scooters', name: t('categories.subcategories.bikes_scooters') },
      { id: 'music_instruments', name: t('categories.subcategories.music_instruments') },
      { id: 'tourism', name: t('categories.subcategories.tourism') },
      { id: 'collections_hobby', name: t('categories.subcategories.collections_hobby') },
      { id: 'books_learning', name: t('categories.subcategories.books_learning') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'realestate',
    name: t('categories.realestate'),
    icon: '🏠',
    subcategories: [
      { id: 'rent_apartments', name: t('categories.subcategories.rent_apartments') },
      { id: 'sell_apartments', name: t('categories.subcategories.sell_apartments') },
      { id: 'rooms', name: t('categories.subcategories.rooms') },
      { id: 'houses', name: t('categories.subcategories.houses') },
      { id: 'commercial', name: t('categories.subcategories.commercial') },
      { id: 'garages_parking', name: t('categories.subcategories.garages_parking') },
      { id: 'other', name: t('categories.subcategories.other') }
    ]
  },
  {
    id: 'services_work',
    name: t('categories.services_work'),
    icon: '💼',
    subcategories: [
      { id: 'services', name: t('categories.subcategories.services') },
      { id: 'repair_installation', name: t('categories.subcategories.repair_installation') },
      { id: 'cleaning', name: t('categories.subcategories.cleaning') },
      { id: 'transportation', name: t('categories.subcategories.transportation') },
      { id: 'beauty_health', name: t('categories.subcategories.beauty_health') },
      { id: 'it_design_websites', name: t('categories.subcategories.it_design_websites') },
      { id: 'photo_video', name: t('categories.subcategories.photo_video') },
      { id: 'education_tutors', name: t('categories.subcategories.education_tutors') },
      { id: 'translations', name: t('categories.subcategories.translations') },
      { id: 'auto_services', name: t('categories.subcategories.auto_services') },
      { id: 'consultations', name: t('categories.subcategories.consultations') },
      { id: 'other_services', name: t('categories.subcategories.other_services') },
      { id: 'vacancies', name: t('categories.subcategories.vacancies') },
      { id: 'part_time', name: t('categories.subcategories.part_time') },
      { id: 'looking_for_work', name: t('categories.subcategories.looking_for_work') },
      { id: 'other_work', name: t('categories.subcategories.other_work') }
    ]
  },
  {
    id: 'free',
    name: t('categories.free'),
    icon: '🎁'
  }
];

// Для зворотної сумісності (якщо десь використовується старий імпорт)
// Використовується тільки як fallback, краще використовувати getCategories
export const categories: Category[] = getCategories((key: string) => {
  // Fallback на українську мову
  const ukTranslations: Record<string, string> = {
    'categories.fashion': 'Мода та стиль',
    'categories.beauty_wellness': 'Краса та здоров\'я',
    'categories.furniture': 'Меблі',
    'categories.electronics': 'Електроніка',
    'categories.appliances': 'Побутова техніка',
    'categories.kids': 'Дитячі товари',
    'categories.home': 'Для дому',
    'categories.auto': 'Авто',
    'categories.hobby_sports': 'Хобі / Спорт',
    'categories.realestate': 'Нерухомість',
    'categories.services_work': 'Послуги та робота',
    'categories.free': 'Безкоштовно / Віддам',
    // Додати всі підкатегорії...
  };
  return ukTranslations[key] || key;
});
