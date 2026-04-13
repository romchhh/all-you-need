// Нормализация ввода города (RU/EN → каноническое немецкое название)
// Используется и при фильтрации объявлений, и при сохранении локации.

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
  'франкфурт': 'Frankfurt am Main',
  'frankfurt': 'Frankfurt am Main',
};

export function normalizeCityInput(city: string): string {
  const key = city.trim().toLowerCase();
  return CITY_ALIASES[key] || city.trim();
}

/** Ключ міста для підписок і фільтрів: перша частина локації (до коми), канонічна назва. */
export function listingCityKeyFromLocation(location: string): string {
  const raw = (location || '').trim();
  if (!raw) return '';
  const first = raw.includes(',') ? raw.split(',')[0].trim() : raw;
  return normalizeCityInput(first);
}

