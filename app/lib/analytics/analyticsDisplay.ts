/** Підписи для адмін-аналітики (укр.) */

export const EVENT_LABELS: Record<string, string> = {
  category_click: 'Клік по категорії',
  subcategory_click: 'Клік по підкатегорії',
  listing_view: 'Перегляд оголошення',
  contact_seller: 'Написати продавцю',
  favorite_add: 'Додати в обране',
  favorite_remove: 'Прибрати з обраного',
  search_submit: 'Пошуковий запит',
  share_listing: 'Поділитися оголошенням',
  create_listing_start: 'Створення оголошення (старт)',
  create_listing_submit: 'Створення оголошення (відправка)',
  promotion_view: 'Перегляд пропозиції реклами',
  promotion_select: 'Вибір типу реклами',
  nav_tab_click: 'Перехід по вкладках',
  city_select: 'Вибір міста',
  onboarding_action: 'Онбординг',
  profile_view: 'Перегляд профілю',
};

export const EVENT_GROUP_LABELS: Record<string, string> = {
  navigation: 'Навігація',
  engagement: 'Залучення',
  monetization: 'Монетизація',
  search: 'Пошук',
  listing: 'Оголошення',
};

export const EVENT_GROUP_HINTS: Record<string, string> = {
  navigation: 'Вкладки, міста, категорії, профіль',
  engagement: 'Обране, поділитися, онбординг',
  monetization: 'Перегляд і вибір просування',
  search: 'Запити в рядку пошуку',
  listing: 'Перегляди та контакт з продавцем',
};

/** Категорії та підкатегорії (uk) — для топів без i18n на сервері */
export const CATEGORY_LABELS_UK: Record<string, string> = {
  services_work: 'Послуги та робота',
  fashion: 'Мода та стиль',
  beauty_wellness: "Краса та здоров'я",
  furniture: 'Меблі',
  electronics: 'Електроніка',
  appliances: 'Побутова техніка',
  kids: 'Дитячі товари',
  home: 'Для дому',
  auto: 'Авто',
  hobby_sports: 'Хобі / Спорт',
  pets: 'Улюбленці',
  realestate: 'Нерухомість',
  free: 'Безкоштовно / Віддам',
  women_clothing: 'Жіночий одяг',
  women_shoes: 'Жіноче взуття',
  men_clothing: 'Чоловічий одяг',
  men_shoes: 'Чоловіче взуття',
  accessories: 'Аксесуари',
  beauty_health: "Краса / здоров'я",
  smartphones: 'Смартфони',
  computers_laptops: "Комп'ютери / ноутбуки",
  education_tutors: 'Навчання / репетитори',
  services: 'Послуги',
  other: 'Інше',
};

export function eventLabel(name: string): string {
  return EVENT_LABELS[name] || name.replace(/_/g, ' ');
}

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS_UK[id] || id.replace(/_/g, ' ');
}

export function formatCount(n: number): string {
  return n.toLocaleString('uk-UA');
}

export function pct(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 1000) / 10}%`;
}

export const KPI_DEFINITIONS = [
  {
    key: 'totalEvents',
    label: 'Усього подій',
    hint: 'Кожна зафіксована дія в апці: перегляд, клік, пошук, контакт тощо.',
    tone: 'indigo' as const,
  },
  {
    key: 'uniqueUsers',
    label: 'Унікальні користувачі',
    hint: 'Різні Telegram-ID або акаунти, які хоча б разу зробили дію за період.',
    tone: 'violet' as const,
  },
  {
    key: 'listingViews',
    label: 'Перегляди оголошень',
    hint: 'Відкриття картки оголошення (listing_view). Показує інтерес до контенту.',
    tone: 'blue' as const,
  },
  {
    key: 'contacts',
    label: '«Написати продавцю»',
    hint: 'Натискання кнопки контакту — головна конверсія для продавців.',
    tone: 'emerald' as const,
  },
  {
    key: 'conversionRate',
    label: 'Конверсія в контакт',
    hint: 'contact_seller ÷ listing_view × 100%. Скільки переглядів перетворюються на контакт.',
    tone: 'amber' as const,
  },
  {
    key: 'searches',
    label: 'Пошукові запити',
    hint: 'Скільки разів користувачі натиснули «шукати» з текстом у рядку.',
    tone: 'slate' as const,
  },
] as const;
