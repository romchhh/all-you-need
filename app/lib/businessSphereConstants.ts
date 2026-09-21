import {
  BUSINESS_DIRECTION_LABELS,
  BUSINESS_SPHERE_LABELS,
  resolveBusinessLabel,
  type BusinessLang,
} from '@/lib/businessSphereLabels';

export const MAX_BUSINESS_DIRECTIONS = 5;

export const CUSTOM_DIRECTION_PREFIX = 'custom:';

export const BUSINESS_SPHERE_IDS = [
  'beauty_care',
  'health_sport',
  'auto_transport',
  'repair_construction',
  'home_services',
  'food_gastro',
  'retail',
  'education',
  'real_estate',
  'finance_insurance',
  'legal_docs',
  'it_marketing',
  'photo_events',
  'tourism',
  'other',
] as const;

export type BusinessSphereId = (typeof BUSINESS_SPHERE_IDS)[number];

export const BUSINESS_DIRECTIONS_BY_SPHERE: Record<BusinessSphereId, readonly string[]> = {
  beauty_care: [
    'hairdresser',
    'barbershop',
    'manicure',
    'pedicure',
    'brows',
    'lashes',
    'cosmetology',
    'makeup',
    'tattoo_piercing',
  ],
  health_sport: ['massage', 'fitness', 'personal_trainer', 'yoga', 'rehabilitation', 'sports_school'],
  auto_transport: [
    'car_dealer',
    'car_service',
    'detailing',
    'tire_service',
    'auto_electrician',
    'tow_truck',
    'shipping',
    'car_rental',
  ],
  repair_construction: [
    'apartment_renovation',
    'construction',
    'electrician',
    'plumber',
    'painter',
    'tiler',
    'windows_doors',
    'custom_furniture',
  ],
  home_services: ['cleaning', 'moving', 'furniture_assembly', 'appliance_repair', 'gardening', 'hausmeister'],
  food_gastro: [
    'restaurant',
    'cafe',
    'bakery',
    'confectionery',
    'catering',
    'food_delivery',
    'grocery',
  ],
  retail: [
    'clothing',
    'shoes',
    'cosmetics_shop',
    'electronics_shop',
    'furniture_shop',
    'home_goods',
    'kids_goods',
    'flowers',
    'pet_supplies',
  ],
  education: [
    'language_school',
    'tutoring',
    'driving_school',
    'kids_center',
    'courses',
    'vocational_training',
  ],
  real_estate: ['real_estate_agency', 'realtor', 'rental', 'property_management'],
  finance_insurance: ['accounting', 'taxes', 'insurance', 'financial_services'],
  legal_docs: ['legal_services', 'translations', 'documents', 'immigration_services'],
  it_marketing: [
    'web_development',
    'it_services',
    'smm',
    'advertising',
    'graphic_design',
    'branding',
    'seo',
  ],
  photo_events: ['photographer', 'videographer', 'dj', 'host', 'decor', 'event_planning'],
  tourism: ['travel_agency', 'excursions', 'transfers', 'tourism_services'],
  other: [],
};

export function isValidBusinessSphere(id: string): id is BusinessSphereId {
  return (BUSINESS_SPHERE_IDS as readonly string[]).includes(id);
}

export function getDirectionsForSphere(sphere: string): readonly string[] {
  if (!isValidBusinessSphere(sphere)) return [];
  return BUSINESS_DIRECTIONS_BY_SPHERE[sphere];
}

export function isCustomDirection(id: string): boolean {
  return id.startsWith(CUSTOM_DIRECTION_PREFIX);
}

export function toCustomDirection(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${CUSTOM_DIRECTION_PREFIX}${trimmed}` : '';
}

export function getCustomDirectionText(id: string): string {
  return isCustomDirection(id) ? id.slice(CUSTOM_DIRECTION_PREFIX.length) : id;
}

export function parseBusinessDirections(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const value = raw.trim();
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, MAX_BUSINESS_DIRECTIONS);
      }
    } catch {
      return [];
    }
  }
  return [value].slice(0, MAX_BUSINESS_DIRECTIONS);
}

export function serializeBusinessDirections(directions: string[]): string | null {
  const normalized = directions.map((d) => d.trim()).filter(Boolean).slice(0, MAX_BUSINESS_DIRECTIONS);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function normalizeBusinessDirections(sphere: string, directions: string[]): string[] {
  const allowed = new Set(getDirectionsForSphere(sphere));
  const result: string[] = [];

  for (const direction of directions) {
    if (result.length >= MAX_BUSINESS_DIRECTIONS) break;
    const trimmed = direction.trim();
    if (!trimmed) continue;
    if (isCustomDirection(trimmed)) {
      const text = getCustomDirectionText(trimmed);
      if (text.length >= 2 && text.length <= 60) result.push(toCustomDirection(text));
      continue;
    }
    if (allowed.has(trimmed) && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }

  return result;
}

export function getBusinessSphereLabel(sphereId: string, lang: BusinessLang = 'uk'): string {
  if (isValidBusinessSphere(sphereId)) {
    return resolveBusinessLabel(BUSINESS_SPHERE_LABELS, sphereId, lang);
  }
  return sphereId;
}

export function getBusinessDirectionLabel(directionId: string, lang: BusinessLang = 'uk'): string {
  if (isCustomDirection(directionId)) {
    return getCustomDirectionText(directionId);
  }
  return resolveBusinessLabel(BUSINESS_DIRECTION_LABELS, directionId, lang);
}

export function validateBusinessSphereAndDirections(
  sphere: string,
  directionsRaw: string | null | undefined,
  options?: { required?: boolean }
): string | null {
  const required = options?.required ?? true;
  if (!sphere.trim()) return 'sphere_required';
  if (!isValidBusinessSphere(sphere.trim())) return 'sphere_invalid';
  const directions = normalizeBusinessDirections(sphere.trim(), parseBusinessDirections(directionsRaw));
  if (required && directions.length === 0) return 'directions_required';
  if (directions.length > MAX_BUSINESS_DIRECTIONS) return 'directions_max';
  return null;
}

export function businessActivityToLegacyFields(sphere: string, directions: string[]) {
  const normalizedSphere = sphere.trim();
  const normalizedDirections = normalizeBusinessDirections(normalizedSphere, directions);
  return {
    category: normalizedSphere,
    subcategory: serializeBusinessDirections(normalizedDirections),
  };
}

export function legacyFieldsToBusinessActivity(
  category?: string | null,
  subcategory?: string | null
): { sphere: string; directions: string[] } {
  const sphere = category?.trim() || '';
  return {
    sphere,
    directions: sphere ? normalizeBusinessDirections(sphere, parseBusinessDirections(subcategory)) : [],
  };
}
