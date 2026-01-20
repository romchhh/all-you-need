import { NextRequest, NextResponse } from 'next/server';

// Кеш для списка городов (обновляется раз в день)
let cachedCities: string[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа

/**
 * Загружает список немецких городов из GitHub репозитория pensnarik/german-cities
 */
async function fetchGermanCitiesFromGitHub(): Promise<string[]> {
  try {
    // Используем GitHub репозиторий pensnarik/german-cities
    // Файл называется germany.json
    const urls = [
      'https://raw.githubusercontent.com/pensnarik/german-cities/master/germany.json',
      'https://raw.githubusercontent.com/pensnarik/german-cities/main/germany.json',
      'https://raw.githubusercontent.com/pensnarik/german-cities/master/germany-cities.json',
    ];

    let lastError: Error | null = null;
    
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
          next: { revalidate: 86400 } // Revalidate раз в день
        });

        if (!response.ok) {
          continue; // Пробуем следующий URL
        }

        const data = await response.json();
        
        // Извлекаем названия городов из массива объектов
        if (Array.isArray(data)) {
          const cityNames = data
            .map((city: any) => {
              // Поддерживаем разные форматы данных
              if (typeof city === 'string') return city;
              return city.name || city.city || city.Name || city.City || city.locality || '';
            })
            .filter((name: string) => name && typeof name === 'string' && name.trim())
            .map((name: string) => name.trim());
          
          // Удаляем дубликаты (case-insensitive)
          const uniqueCities = Array.from(
            new Map(cityNames.map(city => [city.toLowerCase(), city])).values()
          );
          
          console.log(`[German Cities API] Successfully loaded ${uniqueCities.length} cities from ${url}`);
          return uniqueCities.sort((a: string, b: string) => a.localeCompare(b, 'de'));
        }
      } catch (error) {
        lastError = error as Error;
        continue; // Пробуем следующий URL
      }
    }

    // Если все URL не сработали, используем OpenPLZ API
    if (lastError) {
      console.error('[German Cities API] All GitHub URLs failed, trying OpenPLZ:', lastError);
    }
    return fetchGermanCitiesFromOpenPLZ();
  } catch (error) {
    console.error('[German Cities API] Error fetching from GitHub:', error);
    
    // Fallback: пробуем OpenPLZ API
    return fetchGermanCitiesFromOpenPLZ();
  }
}

/**
 * Fallback: загружает города из OpenPLZ API
 */
async function fetchGermanCitiesFromOpenPLZ(): Promise<string[]> {
  try {
    console.log('[German Cities API] Fetching cities from OpenPLZ API...');
    const cities = new Set<string>();
    let offset = 0;
    const limit = 100;
    let totalFetched = 0;

    // Получаем города порциями (OpenPLZ имеет лимиты)
    // Увеличиваем лимит, чтобы получить больше городов
    while (offset < 10000 && totalFetched < 5000) { // Получаем до 5000 городов
      const response = await fetch(
        `https://openplzapi.org/de/Localities?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.warn(`[German Cities API] OpenPLZ request failed at offset ${offset}: ${response.statusText}`);
        break;
      }

      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      data.forEach((locality: any) => {
        if (locality.name && typeof locality.name === 'string') {
          cities.add(locality.name.trim());
        }
      });

      totalFetched += data.length;

      if (data.length < limit) {
        break; // Больше нет данных
      }

      offset += limit;
      
      // Небольшая задержка между запросами, чтобы не перегружать API
      if (offset < 10000) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const citiesArray = Array.from(cities).sort((a, b) => a.localeCompare(b, 'de'));
    console.log(`[German Cities API] Loaded ${citiesArray.length} cities from OpenPLZ`);
    return citiesArray;
  } catch (error) {
    console.error('[German Cities API] Error fetching from OpenPLZ:', error);
    return [];
  }
}

/**
 * GET /api/german-cities
 * Возвращает список немецких городов
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Проверяем кеш
    const now = Date.now();
    if (cachedCities && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('[German Cities API] Using cached cities');
      return filterCities(cachedCities, query, limit);
    }

    // Загружаем города
    console.log('[German Cities API] Fetching cities from GitHub...');
    const cities = await fetchGermanCitiesFromGitHub();
    
    if (cities.length === 0) {
      // Если загрузка не удалась, возвращаем пустой массив
      return NextResponse.json({ cities: [], total: 0 });
    }

    // Обновляем кеш
    cachedCities = cities;
    cacheTimestamp = now;

    return filterCities(cities, query, limit);
  } catch (error) {
    console.error('[German Cities API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cities', cities: [], total: 0 },
      { status: 500 }
    );
  }
}

/**
 * Фильтрует города по запросу
 */
function filterCities(cities: string[], query: string, limit: number) {
  const normalizedQuery = query.toLowerCase().trim();
  
  let filtered = cities;
  
  if (normalizedQuery) {
    filtered = cities.filter(city => 
      city.toLowerCase().includes(normalizedQuery)
    );
  }

  const limited = filtered.slice(0, limit);

  return NextResponse.json({
    cities: limited,
    total: filtered.length,
    hasMore: filtered.length > limit
  });
}
