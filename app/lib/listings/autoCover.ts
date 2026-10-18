/**
 * Авто-обкладинки для оголошень без фото:
 * колір — стабільно від listing id; іконка — від category/subcategory id.
 */

export type CoverSchemeColors = {
  bg: string;
  bgAccent: string;
  fg: string;
  muted: string;
};

export type CoverScheme = {
  id: string;
  light: CoverSchemeColors;
  dark: CoverSchemeColors;
};

/** Фірмові схеми (sage / forest / olive) — без типових AI-фіолетових/кремових палітр. */
export const LISTING_COVER_SCHEMES: CoverScheme[] = [
  {
    id: 'sage',
    light: { bg: '#E8F0E0', bgAccent: '#D4E4C8', fg: '#2D3E28', muted: '#5A6B52' },
    dark: { bg: '#243020', bgAccent: '#2F3F28', fg: '#E8F0E0', muted: '#A8B89A' },
  },
  {
    id: 'forest',
    light: { bg: '#D8E6CC', bgAccent: '#C5D9B4', fg: '#152A12', muted: '#3F5331' },
    dark: { bg: '#1A2416', bgAccent: '#2A3522', fg: '#C8E6A0', muted: '#8FA878' },
  },
  {
    id: 'olive',
    light: { bg: '#E4EAD8', bgAccent: '#D2DBC4', fg: '#2A3520', muted: '#556348' },
    dark: { bg: '#22281C', bgAccent: '#2E3624', fg: '#E2EBD4', muted: '#9AA888' },
  },
  {
    id: 'moss',
    light: { bg: '#DEE8D6', bgAccent: '#CBD9C0', fg: '#1E2C1A', muted: '#4A5C42' },
    dark: { bg: '#1C2618', bgAccent: '#2A3424', fg: '#D4E6C0', muted: '#8FA07C' },
  },
  {
    id: 'pine',
    light: { bg: '#D2DFC8', bgAccent: '#BFD0B0', fg: '#143018', muted: '#3A5238' },
    dark: { bg: '#162018', bgAccent: '#223024', fg: '#B8D49A', muted: '#7A9A68' },
  },
  {
    id: 'fern',
    light: { bg: '#EAF2E4', bgAccent: '#D8E6CE', fg: '#253528', muted: '#5C6E54' },
    dark: { bg: '#202820', bgAccent: '#2C3826', fg: '#DCECD0', muted: '#A0B494' },
  },
  {
    id: 'cedar',
    light: { bg: '#E6EDE0', bgAccent: '#D4DEC8', fg: '#2C3A26', muted: '#627056' },
    dark: { bg: '#1E261A', bgAccent: '#2A3424', fg: '#D0E0C0', muted: '#96A888' },
  },
  {
    id: 'leaf',
    light: { bg: '#DCE8D4', bgAccent: '#C8D8BC', fg: '#1A2816', muted: '#465A40' },
    dark: { bg: '#182018', bgAccent: '#242C20', fg: '#C4DEA8', muted: '#849C70' },
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
