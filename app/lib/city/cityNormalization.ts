// Нормализация ввода города (RU/EN → каноническое немецкое название)
// Используется и при фильтрации объявлений, и при сохранении локации.

import { germanCities } from '@/constants/german-cities';

export const CITY_ALIASES: Record<string, string> = {
  // Гамбург
  'гамбург': 'Hamburg',
  'hamburg': 'Hamburg',
  // Мюнхен
  'мюнхен': 'München',
  'munich': 'München',
  // Берлин
  'берлин': 'Berlin',
  'berlin': 'Berlin',
  // Кёльн
  'кёльн': 'Köln',
  'кельн': 'Köln',
  'koln': 'Köln',
  'cologne': 'Köln',
  // Дюссельдорф
  'дюссельдорф': 'Düsseldorf',
  'dusseldorf': 'Düsseldorf',
  'düsseldorf': 'Düsseldorf',
  'dusseldrof': 'Düsseldorf',
  'duseldorf': 'Düsseldorf',
  // Штутгарт
  'штутгарт': 'Stuttgart',
  'stuttgart': 'Stuttgart',
  'stutgart': 'Stuttgart',
  // Ганновер
  'ганновер': 'Hannover',
  'hannover': 'Hannover',
  'hanover': 'Hannover',
  // Бремен
  'бремен': 'Bremen',
  'bremen': 'Bremen',
  // Лейпциг
  'лейпциг': 'Leipzig',
  'leipzig': 'Leipzig',
  // Дрезден
  'дрезден': 'Dresden',
  'dresden': 'Dresden',
  // Дортмунд
  'дортмунд': 'Dortmund',
  'dortmund': 'Dortmund',
  // Эссен
  'эссен': 'Essen',
  'essen': 'Essen',
  // Дуйсбург
  'дуйсбург': 'Duisburg',
  'duisburg': 'Duisburg',
  // Бонн
  'бонн': 'Bonn',
  'bonn': 'Bonn',
  // Карлсруэ
  'карлсруэ': 'Karlsruhe',
  'karlsruhe': 'Karlsruhe',
  // Мангейм / Маннхайм
  'маннгейм': 'Mannheim',
  'манхайм': 'Mannheim',
  'mannheim': 'Mannheim',
  // Нюрнберг
  'нюрнберг': 'Nürnberg',
  'nuremberg': 'Nürnberg',
  'nürnberg': 'Nürnberg',
  // Франкфурт (обобщенный ввод)
  'франкфурт': 'Frankfurt',
  'frankfurt': 'Frankfurt',
  'frankfurt am main': 'Frankfurt',
  'wedel': 'Wedel',
};

/** Нижній регістр без умлаутів: München → munchen, Köln → koln. */
export function foldCityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const CANONICAL_BY_FOLD = new Map<string, string>();
for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
  CANONICAL_BY_FOLD.set(foldCityKey(alias), canonical);
  CANONICAL_BY_FOLD.set(foldCityKey(canonical), canonical);
}
for (const city of germanCities) {
  const folded = foldCityKey(city);
  if (!CANONICAL_BY_FOLD.has(folded)) {
    CANONICAL_BY_FOLD.set(folded, city);
  }
}

export function normalizeCityInput(city: string): string {
  const trimmed = city.trim();
  if (!trimmed) return '';
  const key = trimmed.toLowerCase();
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  return CANONICAL_BY_FOLD.get(foldCityKey(trimmed)) || trimmed;
}

/** Чи це те саме місто (Munchen / München / Munich). */
export function citiesMatch(a: string, b: string): boolean {
  const left = normalizeCityInput(a);
  const right = normalizeCityInput(b);
  if (!left || !right) return false;
  return foldCityKey(left) === foldCityKey(right);
}

/** Ключ міста для підписок і фільтрів: перша частина локації (до коми), канонічна назва. */
export function listingCityKeyFromLocation(location: string): string {
  const raw = (location || '').trim();
  if (!raw) return '';
  const first = raw.includes(',') ? raw.split(',')[0].trim() : raw;
  return normalizeCityInput(first);
}

/** Підпис міста в UI (placeholder, чіпи) — канонічна назва. */
export function formatCityFilterLabel(city: string): string {
  return normalizeCityInput(city) || city.trim();
}

