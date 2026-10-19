/**
 * Авто-обкладинки для оголошень без фото:
 * колір — стабільно від listing id; іконка — від category/subcategory id.
 */

export type CoverSchemeColors = {
  bg: string;
  bgAccent: string;
  bgDeep: string;
  fg: string;
  muted: string;
};

export type CoverScheme = {
  id: string;
  /** Базовий кут градієнта; фінальний кут ще зміщується від listing id. */
  angle: number;
  light: CoverSchemeColors;
  dark: CoverSchemeColors;
};

/**
 * Фірмові схеми з помітною різницею відтінків:
 * sage / lime (#C8E6A0) / forest (#3F5331) / olive / mint / cool teal /
 * muted telegram-blue — без AI-фіолетових і «кремово-теракотових» палітр.
 */
export const LISTING_COVER_SCHEMES: CoverScheme[] = [
  {
    id: 'sage-mist',
    angle: 148,
    light: { bg: '#E8F0E0', bgAccent: '#F3F7EE', bgDeep: '#D4E4C8', fg: '#2D3E28', muted: '#5A6B52' },
    dark: { bg: '#243020', bgAccent: '#2F3F28', bgDeep: '#1A2418', fg: '#E8F0E0', muted: '#A8B89A' },
  },
  {
    id: 'lime-glow',
    angle: 162,
    light: { bg: '#E4F2C8', bgAccent: '#F0F8DC', bgDeep: '#C8E6A0', fg: '#1A2810', muted: '#3F5331' },
    dark: { bg: '#2A3A1C', bgAccent: '#3A4E28', bgDeep: '#1C2814', fg: '#C8E6A0', muted: '#9ABA70' },
  },
  {
    id: 'brand-forest',
    angle: 200,
    light: { bg: '#C5D4B8', bgAccent: '#D8E4CC', bgDeep: '#A8BC98', fg: '#152A12', muted: '#3F5331' },
    dark: { bg: '#3F5331', bgAccent: '#4A6140', bgDeep: '#2A3824', fg: '#EAF4DC', muted: '#C8E6A0' },
  },
  {
    id: 'deep-pine',
    angle: 185,
    light: { bg: '#B8CFA8', bgAccent: '#D0E0C4', bgDeep: '#96B484', fg: '#0F1C0C', muted: '#2A4020' },
    dark: { bg: '#1A2C18', bgAccent: '#284024', bgDeep: '#101C10', fg: '#B8D49A', muted: '#7A9A68' },
  },
  {
    id: 'olive-khaki',
    angle: 135,
    light: { bg: '#E2E6D0', bgAccent: '#EEF0E4', bgDeep: '#C8CDB0', fg: '#2A3020', muted: '#5A6048' },
    dark: { bg: '#2A2E20', bgAccent: '#3A4030', bgDeep: '#1C2018', fg: '#E2E8D0', muted: '#A8B090' },
  },
  {
    id: 'mint-fresh',
    angle: 120,
    light: { bg: '#D8F0E4', bgAccent: '#ECF8F2', bgDeep: '#B4E0D0', fg: '#143028', muted: '#3A5A4C' },
    dark: { bg: '#1A3028', bgAccent: '#28483C', bgDeep: '#102018', fg: '#B8E8D4', muted: '#78B09A' },
  },
  {
    id: 'apple-soft',
    angle: 210,
    light: { bg: '#D6E8B8', bgAccent: '#E8F4D0', bgDeep: '#B8D890', fg: '#1C2C10', muted: '#3F5331' },
    dark: { bg: '#283818', bgAccent: '#3A5024', bgDeep: '#182410', fg: '#D0ECA0', muted: '#8ABA60' },
  },
  {
    id: 'moss-gold',
    angle: 95,
    light: { bg: '#E8ECC8', bgAccent: '#F4F6E0', bgDeep: '#D0D8A0', fg: '#2C3418', muted: '#586038' },
    dark: { bg: '#2C3218', bgAccent: '#3E4624', bgDeep: '#1C2010', fg: '#E4ECB8', muted: '#A8B070' },
  },
  {
    id: 'cool-teal',
    angle: 175,
    light: { bg: '#D0E8E4', bgAccent: '#E8F4F2', bgDeep: '#B0D4D0', fg: '#143028', muted: '#3A5A54' },
    dark: { bg: '#1A2E2C', bgAccent: '#284440', bgDeep: '#101E1C', fg: '#B8E0D8', muted: '#70A89C' },
  },
  {
    id: 'telegram-mist',
    angle: 220,
    light: { bg: '#D6EAF6', bgAccent: '#EAF4FA', bgDeep: '#B4D8EC', fg: '#143048', muted: '#3A5A70' },
    dark: { bg: '#1A2C3A', bgAccent: '#243E52', bgDeep: '#101C28', fg: '#B8DCF0', muted: '#6A9AB8' },
  },
  {
    id: 'sky-sage',
    angle: 155,
    light: { bg: '#DCECE8', bgAccent: '#EEF6F2', bgDeep: '#C0DCD4', fg: '#1C3430', muted: '#4A6860' },
    dark: { bg: '#203430', bgAccent: '#2E4840', bgDeep: '#142420', fg: '#D0E8E0', muted: '#88B0A4' },
  },
  {
    id: 'charcoal-lime',
    angle: 190,
    light: { bg: '#D8DED0', bgAccent: '#E8ECE4', bgDeep: '#B8C4B0', fg: '#1A2416', muted: '#3F5331' },
    dark: { bg: '#1C2218', bgAccent: '#2A3424', bgDeep: '#101410', fg: '#C8E6A0', muted: '#8AAA70' },
  },
  {
    id: 'fern-bright',
    angle: 110,
    light: { bg: '#C8E8C0', bgAccent: '#E0F4DA', bgDeep: '#A4D898', fg: '#143018', muted: '#2E4A28' },
    dark: { bg: '#1E3A1C', bgAccent: '#2E5228', bgDeep: '#122814', fg: '#B8E8A8', muted: '#70B060' },
  },
  {
    id: 'cedar-warm',
    angle: 140,
    light: { bg: '#E6E4D4', bgAccent: '#F2F0E8', bgDeep: '#D0CCB4', fg: '#2C2A20', muted: '#5A5648' },
    dark: { bg: '#2A2820', bgAccent: '#3A3830', bgDeep: '#1C1A16', fg: '#E8E4D4', muted: '#A8A490' },
  },
  {
    id: 'meadow',
    angle: 168,
    light: { bg: '#D0E8C8', bgAccent: '#E4F4DE', bgDeep: '#B0D8A4', fg: '#183018', muted: '#3F5331' },
    dark: { bg: '#223822', bgAccent: '#324E30', bgDeep: '#142414', fg: '#C4E8B8', muted: '#7ABA70' },
  },
  {
    id: 'ink-green',
    angle: 205,
    light: { bg: '#C0D0B8', bgAccent: '#D8E4D0', bgDeep: '#9CB490', fg: '#101C0C', muted: '#2A4020' },
    dark: { bg: '#141C12', bgAccent: '#24301E', bgDeep: '#0A100A', fg: '#C8E6A0', muted: '#7A9A60' },
  },
];

/** Шляхи іконок категорій (світла тема використовує dark/ варіант у UI). */
export const CATEGORY_ICON_PATHS: Record<string, string> = {
  fashion: '/images/categories_icons/fashion.svg',
  beauty_wellness: '/images/categories_icons/Group.svg',
  furniture: '/images/categories_icons/furniture.svg',
  electronics: '/images/categories_icons/electronics.svg',
  appliances: '/images/categories_icons/Group 2.svg',
  kids: '/images/categories_icons/kids.svg',
  home: '/images/categories_icons/home.svg',
  auto: '/images/categories_icons/auto.svg',
  hobby_sports: '/images/categories_icons/hobby_sports.svg',
  pets: '/images/categories_icons/pets.svg',
  realestate: '/images/categories_icons/realestate.svg',
  services_work: '/images/categories_icons/services_work.svg',
  free: '/images/categories_icons/free.svg',
  food_gastro: '/images/categories_icons/home.svg',
  all_categories: '/images/categories_icons/all_categories.svg',
};

const UNIVERSAL_ICON_ID = 'all_categories';

/**
 * Підкатегорія → іконка категорії (окремих SVG для sub немає).
 * Визначається лише за id, не за текстом назви.
 */
const SUBCATEGORY_TO_ICON_CATEGORY: Record<string, string> = {
  beauty_health: 'beauty_wellness',
  beauty_services: 'beauty_wellness',
  auto_services: 'auto',
  repair_installation: 'home',
  cleaning: 'home',
  transportation: 'auto',
  photo_video: 'electronics',
  it_design_websites: 'electronics',
  education_tutors: 'services_work',
  translations: 'services_work',
  consultations: 'services_work',
  other_services: 'services_work',
  services: 'services_work',
  vacancies: 'services_work',
  part_time: 'services_work',
  looking_for_work: 'services_work',
  other_work: 'services_work',
  smartphones: 'electronics',
  computers_laptops: 'electronics',
  tv_audio: 'electronics',
  games_consoles: 'electronics',
  large_appliances: 'appliances',
  small_appliances: 'appliances',
  kitchen_appliances: 'appliances',
  sofas_chairs: 'furniture',
  wardrobes_chests: 'furniture',
  tables_chairs: 'furniture',
  beds_mattresses: 'furniture',
  women_clothing: 'fashion',
  women_shoes: 'fashion',
  men_clothing: 'fashion',
  men_shoes: 'fashion',
  accessories: 'fashion',
  hats: 'fashion',
};

export function isServicesWorkCategory(category?: string | null): boolean {
  return (category || '').trim().toLowerCase() === 'services_work';
}

/** Послуги / робота можна публікувати без фото (авто-обкладинка в UI). */
export function listingAllowsEmptyPhotos(category?: string | null): boolean {
  return isServicesWorkCategory(category);
}

export function hashListingId(id: string | number | null | undefined): number {
  const s = String(id ?? '0');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function coverSchemeForListingId(
  id: string | number | null | undefined
): CoverScheme {
  const idx = hashListingId(id) % LISTING_COVER_SCHEMES.length;
  return LISTING_COVER_SCHEMES[idx];
}

/** Кут градієнта: база схеми + зміщення від id (±0…48°), щоб сусідні картки не «збігалися». */
export function coverGradientAngle(
  id: string | number | null | undefined,
  scheme: CoverScheme
): number {
  const shift = (hashListingId(id) >>> 8) % 49;
  return (scheme.angle + shift) % 360;
}

export function coverBackgroundStyle(
  id: string | number | null | undefined,
  isLight: boolean
): { background: string; color: string } {
  const scheme = coverSchemeForListingId(id);
  const colors = isLight ? scheme.light : scheme.dark;
  const angle = coverGradientAngle(id, scheme);
  return {
    background: `linear-gradient(${angle}deg, ${colors.bgAccent} 0%, ${colors.bg} 42%, ${colors.bgDeep} 100%)`,
    color: colors.fg,
  };
}

export function resolveCoverIconCategoryId(
  category?: string | null,
  subcategory?: string | null
): string {
  const sub = (subcategory || '').trim().toLowerCase();
  if (sub && SUBCATEGORY_TO_ICON_CATEGORY[sub]) {
    return SUBCATEGORY_TO_ICON_CATEGORY[sub];
  }
  if (sub && CATEGORY_ICON_PATHS[sub]) {
    return sub;
  }
  const cat = (category || '').trim().toLowerCase();
  if (cat && CATEGORY_ICON_PATHS[cat]) {
    return cat;
  }
  return UNIVERSAL_ICON_ID;
}

export function coverIconPath(
  iconCategoryId: string,
  forLightTheme: boolean
): string {
  const base = CATEGORY_ICON_PATHS[iconCategoryId] || CATEGORY_ICON_PATHS[UNIVERSAL_ICON_ID];
  if (forLightTheme) {
    return base.replace(
      '/images/categories_icons/',
      '/images/categories_icons/dark/'
    );
  }
  return base;
}

export function listingHasDisplayPhoto(listing: {
  image?: string | null;
  images?: string[] | null;
}): boolean {
  const raw = listing.image || listing.images?.[0] || '';
  return Boolean(String(raw).trim());
}

/** Lucide icon names for service keyword matches (title/description). */
export type CoverLucideIconName =
  | 'Hand'
  | 'Eye'
  | 'Scissors'
  | 'HeartPulse'
  | 'Paintbrush'
  | 'SprayCan'
  | 'Languages'
  | 'Laptop'
  | 'Wrench'
  | 'Truck'
  | 'GraduationCap'
  | 'HeartHandshake'
  | 'Briefcase'
  | 'Sparkles'
  | 'Camera'
  | 'Car'
  | 'Home'
  | 'Baby'
  | 'Shirt'
  | 'Sofa'
  | 'Smartphone'
  | 'PawPrint';

type ServiceIconRule = { icon: CoverLucideIconName; patterns: RegExp[] };

/** Порядок важливий: перший збіг виграє (специфічніші правила вище). */
const SERVICE_ICON_RULES: ServiceIconRule[] = [
  {
    icon: 'Hand',
    patterns: [
      /маникюр|манікюр|педикюр|ногт|нігт|гель[\s-]?лак|nail/i,
    ],
  },
  {
    icon: 'Eye',
    patterns: [
      /ресниц|вії|вій\b|ламинир|ламінув|наращиван.*ресн|наращуван.*вій|lash/i,
    ],
  },
  {
    icon: 'Scissors',
    patterns: [
      /кератин|ботокс\s*волос|стрижк|перук|парикмах|волос|hair|ботокс.*вол/i,
    ],
  },
  {
    icon: 'HeartPulse',
    patterns: [/массаж|масаж|массажист|масажист|massage/i],
  },
  {
    icon: 'Paintbrush',
    patterns: [/макияж|макіяж|визажист|візажист|makeup|make[\s-]?up/i],
  },
  {
    icon: 'SprayCan',
    patterns: [/уборк|прибиран|клининг|клінінг|cleaning|haushalt/i],
  },
  {
    icon: 'Languages',
    patterns: [/переводчик|перекладач|перевод[ыі]|переклад[ии]|dolmetsch|translator/i],
  },
  {
    icon: 'Laptop',
    patterns: [
      /сайт|разработк|розробк|smm|web[\s-]?design|программист|програміст|frontend|backend/i,
    ],
  },
  {
    icon: 'Wrench',
    patterns: [/ремонт|монтаж|сантехн|электрик|електрик|мастер\s*на\s*час|майстер\s*на\s*час/i],
  },
  {
    icon: 'Truck',
    patterns: [
      /перевозк|перевезен|грузоперевоз|вантажоперевез|транспорт|умз[уу]г|umzug|lieferung/i,
    ],
  },
  {
    icon: 'GraduationCap',
    patterns: [/репетитор|обучен|навчан|урок|tutor|nachhilfe|школ/i],
  },
  {
    icon: 'HeartHandshake',
    patterns: [/сиделк|догляд|уход\s*за\s*пожил|pflege|betreu/i],
  },
  {
    icon: 'Camera',
    patterns: [/фото|видео|відео|съ[её]мк|зйомк|photographer|video/i],
  },
  {
    icon: 'Car',
    patterns: [/автосервис|автосервіс|шиномонтаж|СТО\b|тюнинг|авто\s*мастер/i],
  },
  {
    icon: 'Briefcase',
    patterns: [/ваканс|ищу\s*работ|шукаю\s*робот|подработ|підробіт|job\b|stelle/i],
  },
];

const CATEGORY_FALLBACK_LUCIDE: Record<string, CoverLucideIconName> = {
  fashion: 'Shirt',
  furniture: 'Sofa',
  electronics: 'Smartphone',
  appliances: 'Home',
  kids: 'Baby',
  home: 'Home',
  auto: 'Car',
  pets: 'PawPrint',
  realestate: 'Home',
  beauty_wellness: 'Sparkles',
  services_work: 'Briefcase',
  free: 'Sparkles',
  hobby_sports: 'Sparkles',
};

/**
 * Іконка обкладинки за ключовими словами title/description (послуги),
 * інакше — дефолт за категорією. Повертає Lucide-ім'я або null (лишити SVG категорії).
 */
export function resolveCoverLucideIcon(opts: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): CoverLucideIconName | null {
  // Лише title + короткий snippet — повний description гальмує стрічку карток
  const desc = (opts.description || '').trim().slice(0, 120);
  const blob = `${opts.title || ''}\n${desc}`;
  for (const rule of SERVICE_ICON_RULES) {
    if (rule.patterns.some((re) => re.test(blob))) {
      return rule.icon;
    }
  }
  const catId = resolveCoverIconCategoryId(opts.category, opts.subcategory);
  return CATEGORY_FALLBACK_LUCIDE[catId] || null;
}

const TITLE_NOISE_PREFIX =
  /^(?:продам|продаю|продажа|продаж|отдам|віддам|ищу|шукаю|куплю|предлагаю|пропоную|вакансия|вакансія|срочно|терміново|🚨+|✨+|🔥+)\s*[:\-–—,]?\s*/i;

/** Ціна, URL, контакт — не показуємо як «назву» на обкладинці. */
const COVER_TITLE_JUNK =
  /^(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|@[\w.]+$|\+?\d[\d\s\-()]{6,}|\d+[.,]?\d*\s*(?:€|eur|euro|грн|uah|\$|usd)\b|(?:€|eur|euro|грн|uah|\$)\s*\d)/i;

function cleanCoverSnippet(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(TITLE_NOISE_PREFIX, '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:www\.|t\.me\/|telegram\.me\/)\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\W]+/, '')
    .trim();
}

function isJunkCoverText(s: string): boolean {
  if (!s || s.length < 3) return true;
  if (COVER_TITLE_JUNK.test(s)) return true;
  // майже лише цифри/валюта/символи
  const letters = s.replace(/[^\p{L}]/gu, '');
  return letters.length < 3;
}

function firstMeaningfulSnippet(text: string): string {
  const parts = text.split(/[.!?\n|;]+/).map((p) => cleanCoverSnippet(p)).filter(Boolean);
  for (const part of parts) {
    if (!isJunkCoverText(part) && part.length >= 4) {
      return part;
    }
  }
  return '';
}

function truncateCoverTitle(base: string, maxLen: number): string {
  if (base.length <= maxLen) return base || '—';
  const sliced = base.slice(0, maxLen + 1);
  const cut = sliced.lastIndexOf(' ');
  const wordSafe = cut > maxLen * 0.45 ? sliced.slice(0, cut) : base.slice(0, maxLen);
  return `${wordSafe.replace(/[,\-–—:;]+$/, '').trim()}…`;
}

/**
 * Короткий заголовок для обкладинки: завжди віддає перевагу title;
 * description — лише якщо title порожній/загальний і рядок не ціна/лінк.
 */
export function shortenCoverTitle(
  title: string,
  description?: string | null,
  maxLen = 52
): string {
  let base = cleanCoverSnippet(title || '');

  const tooGeneric =
    !base ||
    isJunkCoverText(base) ||
    /^(объявление|оголошення|услуга|послуга|товар|товар дня)$/i.test(base);

  if (tooGeneric) {
    const fromDesc = firstMeaningfulSnippet(description || '');
    if (fromDesc) base = fromDesc;
  }

  // Довгий title не замінюємо описом (там часто ціна / посилання)
  if (!base || isJunkCoverText(base)) {
    base = cleanCoverSnippet(title || '') || '—';
  }

  return truncateCoverTitle(base, maxLen);
}
