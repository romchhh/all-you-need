import { Category } from '@/types';

export const categories: Category[] = [
  {
    id: 'fashion',
    name: 'Мода та стиль',
    icon: '👕',
    subcategories: [
      { id: 'women_clothing', name: 'Жіночий одяг' },
      { id: 'women_shoes', name: 'Жіноче взуття' },
      { id: 'men_clothing', name: 'Чоловічий одяг' },
      { id: 'men_shoes', name: 'Чоловіче взуття' },
      { id: 'accessories', name: 'Аксесуари' },
      { id: 'hats', name: 'Головні убори' },
      { id: 'beauty_health', name: 'Краса / здоров\'я' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'furniture',
    name: 'Меблі',
    icon: '🛋️',
    subcategories: [
      { id: 'sofas_chairs', name: 'Дивани / крісла' },
      { id: 'wardrobes_chests', name: 'Шафи / комоди' },
      { id: 'tables_chairs', name: 'Столи / стільці' },
      { id: 'beds_mattresses', name: 'Ліжка / матраци' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'electronics',
    name: 'Електроніка',
    icon: '📱',
    subcategories: [
      { id: 'smartphones', name: 'Смартфони' },
      { id: 'computers_laptops', name: 'Комп\'ютери / ноутбуки' },
      { id: 'tv_audio', name: 'ТВ / аудіо' },
      { id: 'games_consoles', name: 'Ігри / приставки' },
      { id: 'accessories', name: 'Аксесуари' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'appliances',
    name: 'Побутова техніка',
    icon: '🔌',
    subcategories: [
      { id: 'large_appliances', name: 'Велика техніка (холодильники, пральні машини)' },
      { id: 'small_appliances', name: 'Дрібна техніка' },
      { id: 'kitchen_appliances', name: 'Кухонна техніка' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'kids',
    name: 'Дитячі товари',
    icon: '🧸',
    subcategories: [
      { id: 'toys', name: 'Іграшки' },
      { id: 'strollers_car_seats', name: 'Коляски / автокрісла' },
      { id: 'clothing', name: 'Одяг' },
      { id: 'beds_furniture', name: 'Ліжечка / меблі' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'home',
    name: 'Для дому',
    icon: '🏡',
    subcategories: [
      { id: 'dishes', name: 'Посуд' },
      { id: 'textiles', name: 'Текстиль' },
      { id: 'lighting', name: 'Освітлення' },
      { id: 'decor', name: 'Декор' },
      { id: 'tools', name: 'Інструменти' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'auto',
    name: 'Авто',
    icon: '🚗',
    subcategories: [
      { id: 'cars', name: 'Автомобілі' },
      { id: 'tires_wheels', name: 'Шини / диски' },
      { id: 'parts', name: 'Запчастини' },
      { id: 'accessories', name: 'Аксесуари' },
      { id: 'child_seats', name: 'Дитячі крісла' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'hobby_sports',
    name: 'Хобі / Спорт',
    icon: '⚽',
    subcategories: [
      { id: 'sports_equipment', name: 'Спортинвентар' },
      { id: 'bikes_scooters', name: 'Велосипеди / самокати' },
      { id: 'music_instruments', name: 'Музичні інструменти' },
      { id: 'tourism', name: 'Туризм' },
      { id: 'collections_hobby', name: 'Колекції / хобі' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'realestate',
    name: 'Нерухомість',
    icon: '🏠',
    subcategories: [
      { id: 'rent_apartments', name: 'Оренда квартир' },
      { id: 'sell_apartments', name: 'Продаж квартир' },
      { id: 'rooms', name: 'Кімнати' },
      { id: 'houses', name: 'Будинки' },
      { id: 'commercial', name: 'Комерційна нерухомість' },
      { id: 'garages_parking', name: 'Гаражі, парковки' },
      { id: 'other', name: 'Інше' }
    ]
  },
  {
    id: 'services_work',
    name: 'Послуги та робота',
    icon: '💼',
    subcategories: [
      { id: 'services', name: 'Послуги' },
      { id: 'repair_installation', name: 'Ремонт і монтаж' },
      { id: 'cleaning', name: 'Прибирання' },
      { id: 'transportation', name: 'Перевезення' },
      { id: 'beauty_health', name: 'Краса і здоров\'я' },
      { id: 'it_design_websites', name: 'IT / дизайн / сайти' },
      { id: 'photo_video', name: 'Фото / відео' },
      { id: 'education_tutors', name: 'Навчання / репетитори' },
      { id: 'translations', name: 'Переклади' },
      { id: 'auto_services', name: 'Автоуслуги' },
      { id: 'consultations', name: 'Консультації' },
      { id: 'other_services', name: 'Інше' },
      { id: 'vacancies', name: 'Вакансії' },
      { id: 'part_time', name: 'Підробіток' },
      { id: 'looking_for_work', name: 'Шукаю роботу' },
      { id: 'other_work', name: 'Інше' }
    ]
  },
  {
    id: 'free',
    name: 'Безкоштовно / Віддам',
    icon: '🎁'
  }
];
