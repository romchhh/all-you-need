/** Категорії/підкатегорії маркетплейсу, які дублюємо в Telegram-канали. */

const JOB_SUBCATEGORIES = new Set([
  'vacancies',
  'part_time',
  'looking_for_work',
  'other_work',
]);

const SERVICE_SUBCATEGORIES = new Set([
  'services',
  'repair_installation',
  'cleaning',
  'transportation',
  'beauty_health',
  'beauty_services',
  'it_design_websites',
  'it_services',
  'photo_video',
  'education_tutors',
  'translations',
  'auto_services',
  'consultations',
  'online_services',
  'other_services',
]);

export type ChannelPublishMode = 'services' | 'trade' | null;

/**
 * services → TRADE_SERVICES_* (послуги)
 * trade → TRADE_* (нерухомість / робота / подія)
 */
export function channelPublishMode(
  category?: string | null,
  subcategory?: string | null
): ChannelPublishMode {
  const cat = (category || '').trim().toLowerCase();
  const sub = (subcategory || '').trim().toLowerCase();

  if (cat === 'realestate') return 'trade';
  if (cat === 'event' || cat === 'events') return 'trade';
  if (cat === 'services_work') {
    if (JOB_SUBCATEGORIES.has(sub)) return 'trade';
    if (!sub || SERVICE_SUBCATEGORIES.has(sub)) return 'services';
    return 'services';
  }
  return null;
}

export function isHamburgLocation(location?: string | null): boolean {
  const raw = (location || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw === 'germany' || raw === 'deutschland' || raw === 'nrw') return false;
  const first = raw.split(',')[0]?.trim() || raw;
  return (
    first === 'hamburg' ||
    first.includes('hamburg') ||
    first.includes('гамбург') ||
    first.includes('гамбур')
  );
}
