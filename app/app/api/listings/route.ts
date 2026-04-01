import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCityInput } from '@/utils/cityNormalization';
import { trackUserActivity } from '@/utils/trackActivity';
import { executeInClause } from '@/utils/dbHelpers';
import { listingTimeFieldsForApi } from '@/utils/parseDbDate';

// Відключаємо кешування для API route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Функція для конвертації старих значень стану в нові
function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  if (condition === 'new') return 'new';
  // Конвертуємо всі старі значення (like_new, good, fair) в 'used'
  return 'used';
}

// SQLite може повертати COUNT як number, bigint або string
function normalizeFavoritesCount(value: number | bigint | string | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return parseInt(value, 10) || 0;
  return 0;
}

// Функція для нормалізації кирилиці до lowercase
// JavaScript's toLowerCase() правильно працює з кирилицею
function normalizeCyrillicToLower(text: string): string {
  return text.toLowerCase();
}

// Функція для генерації всіх можливих варіантів регістру для пошуку
// Генерує варіанти: оригінальний, всі малі, перша велика решта малі
function generateSearchVariants(searchText: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeCyrillicToLower(searchText);
  
  // Додаємо оригінальний варіант
  variants.add(searchText);
  
  // Додаємо lowercase варіант
  variants.add(normalized);
  
  // Додаємо варіант з першою великою літерою
  if (searchText.length > 0) {
    const firstUpper = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    variants.add(firstUpper);
  }
  
  // Додаємо варіант з усіма великими літерами
  variants.add(searchText.toUpperCase());
  
  return Array.from(variants);
}

// Розширюємо варіанти пошуку з урахуванням синонімів міст.
// Якщо запит — одне слово і воно збігається з відомим містом (РУ/EN),
// додаємо варіанти для канонічної назви (наприклад, "Гамбург"/"Hamburg" → "Hamburg").
function generateSearchVariantsWithCities(searchText: string): string[] {
  const baseVariants = generateSearchVariants(searchText);
  const trimmed = searchText.trim();
  if (!trimmed) return baseVariants;
  
  // Працюємо тільки з одиничними словами, щоб не ламати складні запити
  if (/\s/.test(trimmed)) {
    return baseVariants;
  }

  const normalizedCity = normalizeCityInput(trimmed);
  if (normalizedCity === trimmed) {
    return baseVariants;
  }

  const cityVariants = generateSearchVariants(normalizedCity);
  return Array.from(new Set([...baseVariants, ...cityVariants]));
}

// Глобальна змінна для відстеження ініціалізації таблиці Favorite
let favoriteTableInitPromise: Promise<void> | null = null;

export async function GET(request: NextRequest) {
  try {
    // Відстежуємо активність користувача
    await trackUserActivity(request);
    
    // Перевіряємо колонку currency (з кешуванням)
    const { ensureCurrencyColumn, ensureFavoriteTable } = await import('@/lib/prisma');
    const currencyColumnExists = await ensureCurrencyColumn();
    // Перевіряємо та створюємо таблицю Favorite тільки один раз
    if (!favoriteTableInitPromise) {
      favoriteTableInitPromise = ensureFavoriteTable();
    }
    await favoriteTableInitPromise;

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const isFree = searchParams.get('isFree') === 'true';
    // searchParams.get() автоматично декодує URL-encoded параметри в Next.js
    const search = searchParams.get('search')?.trim() || null;
    const userId = searchParams.get('userId');
    const viewerId = searchParams.get('viewerId'); // ID користувача, який переглядає профіль
    const sortBy = searchParams.get('sortBy') || 'newest';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    // Міста для фільтра локації (каталог): передаються як cities=Berlin,Hamburg
    const citiesParam = searchParams.get('cities')?.trim() || '';
    const citiesRaw = citiesParam
      ? citiesParam.split(',').map(c => c.trim()).filter(Boolean)
      : [];
    const cities = citiesRaw.map(c => normalizeCityInput(c));

    // Якщо це запит для профілю користувача (userId), показуємо всі його оголошення
    // Інакше показуємо тільки активні оголошення для каталогу
    const where: any = {};

    // Фільтр по користувачу
    if (userId) {
      // Знаходимо внутрішній id користувача за telegramId
      const userIdNum = parseInt(userId);
      const users = await prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
        userIdNum
      ) as Array<{ id: number }>;
      if (users[0]) {
        where.userId = users[0].id;
        // Для профілю користувача показуємо всі оголошення (pending, active, sold тощо)
        // Не додаємо фільтр по статусу
      } else {
        // Користувач не знайдений - повертаємо порожній список
        return NextResponse.json({
          listings: [],
          total: 0,
          limit,
          offset,
        });
      }
    } else {
      // Для каталогу показуємо тільки активні оголошення
      where.status = 'active';
    }

    if (category) {
      where.category = category;
    }

    if (subcategory) {
      where.subcategory = subcategory;
    }

    if (isFree) {
      where.isFree = true;
    }

    if (search) {
      // Використовуємо нормалізацію кирилиці для пошуку
      // JavaScript's toLowerCase() правильно працює з кирилицею
      const searchLower = normalizeCyrillicToLower(search.trim());
      where.OR = [
        { title: { contains: searchLower } },
        { description: { contains: searchLower } },
        { location: { contains: searchLower } },
      ];
    }

    let orderBy: any = {};
    switch (sortBy) {
      case 'newest':
        // VIP > TOP > Highlighted > звичайні, всередині кожної групи по даті
        orderBy = [
          { promotionType: 'desc' }, // VIP буде першим (за алфавітом)
          { createdAt: 'desc' }
        ];
        break;
      case 'price_low':
        orderBy = [
          { promotionType: 'desc' },
          { isFree: 'desc' }
        ];
        break;
      case 'price_high':
        orderBy = [
          { promotionType: 'desc' },
          { isFree: 'asc' }
        ];
        break;
      case 'popular':
        orderBy = [
          { promotionType: 'desc' },
          { views: 'desc' }
        ];
        break;
      default:
        orderBy = [
          { promotionType: 'desc' },
          { createdAt: 'desc' }
        ];
    }

    // Використовуємо raw query для обходу проблеми з форматом дат
    let listings: any[] = [];
    let total = 0;

    if (userId) {
      // Визначаємо, чи це власний профіль (viewerId === userId)
      const isOwnProfile = viewerId && parseInt(viewerId) === parseInt(userId);
      
      // Отримуємо параметри фільтрації
      const status = searchParams.get('status');
      const categoryFilter = searchParams.get('category');
      
      // Для користувача використовуємо raw query з даними про продавця
      // Якщо це не власний профіль, виключаємо продані оголошення
      let whereClause = "WHERE CAST(u.telegramId AS INTEGER) = ?";
      const queryParams: any[] = [parseInt(userId)];
      
      if (!isOwnProfile) {
        whereClause += " AND l.status != 'sold' AND l.status != 'hidden' AND l.status != 'deactivated' AND l.status != 'rejected' AND l.status != 'expired'";
      }
      // Додаємо фільтр за статусом, якщо він вказаний
      if (status && status !== 'all') {
        // Підтримка обох варіантів для сумісності; деактивовані = вручну деактивовані + закінчені за терміном (expired)
        if (status === 'deactivated') {
          whereClause += " AND (l.status = 'deactivated' OR l.status = 'hidden' OR l.status = 'expired')";
        } else if (status === 'hidden') {
          whereClause += " AND (l.status = 'deactivated' OR l.status = 'hidden' OR l.status = 'expired')";
        } else {
          whereClause += " AND l.status = ?";
          queryParams.push(status);
        }
      }
      // Додаємо фільтр за категорією, якщо він вказаний
      if (categoryFilter && categoryFilter !== 'all') {
        whereClause += " AND l.category = ?";
        queryParams.push(categoryFilter);
      }
      
      const query = `SELECT 
          l.id,
          l.userId,
          l.title,
          l.description,
          l.price,
          ${currencyColumnExists ? 'l.currency,' : 'NULL as currency,'}
          l.isFree,
          l.category,
          l.subcategory,
          l.condition,
          l.location,
          l.views,
          l.status,
          l.moderationStatus,
          l.rejectionReason,
          l.promotionType,
          l.promotionEnds,
          l.expiresAt,
          l.images,
          l.optimizedImages,
          l.tags,
          l.createdAt,
          l.publishedAt,
          u.username as sellerUsername,
          u.firstName as sellerFirstName,
          u.lastName as sellerLastName,
          u.avatar as sellerAvatar,
          u.phone as sellerPhone,
          CAST(u.telegramId AS INTEGER) as sellerTelegramId,
          COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount
        FROM Listing l
        JOIN User u ON l.userId = u.id
        ${whereClause}
        ORDER BY 
          CASE 
            WHEN l.status = 'active' THEN 1
            WHEN l.status = 'pending_moderation' THEN 2
            WHEN l.status = 'sold' THEN 3
            WHEN l.status = 'expired' THEN 4
            WHEN l.status = 'rejected' THEN 5
            WHEN l.status = 'deactivated' THEN 6
            WHEN l.status = 'hidden' THEN 7
            ELSE 8
          END,
          l.createdAt DESC
        LIMIT ? OFFSET ?`;
      
      queryParams.push(limit, offset);
      
      // Безпечно виконуємо запит з обробкою помилок
      let userListings: any[] = [];
      try {
        userListings = await prisma.$queryRawUnsafe(
          query,
          ...queryParams
        ) as Array<{
        id: number;
        userId: number;
        title: string;
        description: string;
        price: string;
        currency: string | null;
        isFree: number;
        category: string;
        subcategory: string | null;
        condition: string | null;
        location: string;
        views: number;
        status: string;
        images: string;
        tags: string | null;
        createdAt: string;
        sellerUsername: string | null;
        sellerFirstName: string | null;
        sellerLastName: string | null;
        sellerAvatar: string | null;
        sellerPhone: string | null;
        sellerTelegramId: number;
        favoritesCount?: number;
      }>;
      } catch (error: any) {
        // Якщо таблиця Favorite не існує, виконуємо запит без favoritesCount
        if (error.message?.includes('no such table: Favorite') || error.message?.includes('Favorite')) {
          const queryWithoutFavorites = query.replace(', COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount', '');
          userListings = await prisma.$queryRawUnsafe(
            queryWithoutFavorites,
            ...queryParams
          ) as any[];
          // Додаємо favoritesCount = 0 для всіх записів
          userListings = userListings.map((listing: any) => ({ ...listing, favoritesCount: 0 }));
        } else {
          throw error;
        }
      }

      const countQuery = `SELECT COUNT(*) as count
        FROM Listing l
        JOIN User u ON l.userId = u.id
        ${whereClause}`;
      
      // Для count query потрібні тільки параметри без limit та offset
      const countParams = queryParams.slice(0, -2);
      const totalCount = await prisma.$queryRawUnsafe(
        countQuery,
        ...countParams
      ) as Array<{ count: bigint }>;

      // Оголошення з минулим expiresAt — оновлюємо статус в БД на expired і повертаємо як expired
      const now = Date.now();
      const expiredIds: number[] = [];
      for (const listing of userListings) {
        const s = listing.status ?? 'active';
        if (s !== 'active' || !listing.expiresAt) continue;
        try {
          const expTime = new Date(listing.expiresAt).getTime();
          if (!Number.isNaN(expTime) && expTime <= now) expiredIds.push(listing.id);
        } catch (_) {}
      }
      if (expiredIds.length > 0) {
        try {
          await executeInClause(
            `UPDATE Listing SET status = 'expired', updatedAt = datetime('now') WHERE id IN (?)`,
            expiredIds
          );
        } catch (e) {
          console.error('[Listings API] Error updating expired listings:', e);
        }
      }

      // Форматуємо дані для профілю користувача
      listings = userListings.map((listing: any) => {
        const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
        const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];
        const timeFields = listingTimeFieldsForApi(listing);
        let status = listing.status ?? 'active';
        if (status === 'active' && listing.expiresAt) {
          try {
            const expTime = new Date(listing.expiresAt).getTime();
            if (!Number.isNaN(expTime) && expTime <= now) status = 'expired';
          } catch (_) {}
        }
        return {
          id: listing.id,
          title: listing.title,
          price: listing.isFree ? 'Free' : listing.price,
          currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
          image: images[0] || '',
          images: images,
          seller: {
            name: listing.sellerFirstName 
              ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
              : listing.sellerUsername || 'Користувач',
            avatar: listing.sellerAvatar || '👤',
            phone: listing.sellerPhone || '',
            telegramId: listing.sellerTelegramId?.toString() || '',
            username: listing.sellerUsername || null,
          },
          category: listing.category,
          subcategory: listing.subcategory,
          description: listing.description,
          location: listing.location,
          views: listing.views || 0,
          posted: timeFields.posted,
          publishedAt: timeFields.publishedAt,
          createdAt: timeFields.createdAt,
          condition: normalizeCondition(listing.condition),
          tags: tags,
          isFree: listing.isFree === 1 || listing.isFree === true,
          status,
          moderationStatus: listing.moderationStatus || null,
          rejectionReason: listing.rejectionReason || null,
          promotionType: listing.promotionType || null,
          promotionEnds: listing.promotionEnds || null,
          expiresAt: listing.expiresAt || null,
          favoritesCount: normalizeFavoritesCount(listing.favoritesCount),
        };
      });
      total = Number(totalCount[0]?.count || 0);
    } else {
      // Для загальних запитів використовуємо raw query для обходу проблем з Prisma та SQLite
      let whereClause = "WHERE l.status = 'active'";
      const params: any[] = [];
      
      if (category) {
        whereClause += " AND l.category = ?";
        params.push(category);
      }
      
      if (subcategory) {
        whereClause += " AND l.subcategory = ?";
        params.push(subcategory);
      }
      
      if (isFree) {
        whereClause += " AND l.isFree = 1";
      }

      // Фільтр по містах: location містить хоча б одне з обраних міст (на всіх оголошеннях, до LIMIT)
      if (cities.length > 0) {
        const placeholders = cities.map(() => 'l.location LIKE ?').join(' OR ');
        whereClause += ` AND (${placeholders})`;
        cities.forEach(city => params.push(`%${city}%`));
      }
      
      if (search) {
        const searchTrimmed = search.trim();
        // Генеруємо всі можливі варіанти регістру для пошуку
        // + додаємо варіанти для синонімів міст (Гамбург/Hamburg, Munich/München тощо)
        // Це необхідно, оскільки SQLite не підтримує case-insensitive порівняння для кирилиці
        const searchVariants = generateSearchVariantsWithCities(searchTrimmed);
        
        // Для коротких пошукових запитів (до 30 символів) використовуємо SQL LIKE
        // Для довших використовуємо фільтрацію в JavaScript після отримання даних
        if (searchTrimmed.length <= 30) {
          // Створюємо умову з усіма варіантами для кожного поля
          const titleConditions = searchVariants.map(() => 'l.title LIKE ?').join(' OR ');
          const descConditions = searchVariants.map(() => 'l.description LIKE ?').join(' OR ');
          const locationConditions = searchVariants.map(() => 'l.location LIKE ?').join(' OR ');
          
          whereClause += ` AND (
            (${titleConditions}) OR
            (${descConditions}) OR
            (${locationConditions})
          )`;
          
          // Додаємо параметри для кожного варіанту та кожного поля
          searchVariants.forEach(variant => {
            params.push(`%${variant}%`); // title
          });
          searchVariants.forEach(variant => {
            params.push(`%${variant}%`); // description
          });
          searchVariants.forEach(variant => {
            params.push(`%${variant}%`); // location
          });
        } else {
          // Для довших запитів зберігаємо пошуковий запит для фільтрації в JavaScript
          // Використовуємо тільки lowercase варіант для базового фільтру
          const searchLower = normalizeCyrillicToLower(searchTrimmed);
          whereClause += ` AND (
            (l.title LIKE ? OR l.title LIKE ?) OR
            (l.description LIKE ? OR l.description LIKE ?) OR
            (l.location LIKE ? OR l.location LIKE ?)
          )`;
          params.push(
            `%${searchTrimmed}%`, `%${searchLower}%`,
            `%${searchTrimmed}%`, `%${searchLower}%`,
            `%${searchTrimmed}%`, `%${searchLower}%`
          );
        }
      }
      
      // Додаємо фільтр для активних рекламних оголошень (promotionEnds > NOW)
      // Якщо реклама закінчилась, оголошення все одно показується (якщо воно активне)
      // whereClause += " AND (l.promotionEnds IS NULL OR datetime(l.promotionEnds) > datetime('now'))";
      
      // Фільтруємо тільки активні оголошення (не закінчені)
      whereClause += " AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))";
      
      
      // Правильне сортування з урахуванням реклами
      // VIP - завжди в топі (приоритет 1)
      // TOP категории - в топі тільки в своїй категорії (приоритет 2), на головній як звичайне (приоритет 4)
      // Выделение цветом - завжди як звичайне (приоритет 4), тільки візуально відрізняється
      // Перевіряємо, чи є фільтр по категорії для визначення приоритету TOP
      const hasCategoryFilter = !!(category || subcategory);
      let orderByClause = `ORDER BY 
        CASE 
          WHEN (l.promotionType = 'vip' OR l.promotionType LIKE '%vip%') AND datetime(l.promotionEnds) > datetime('now') THEN 1
          ${hasCategoryFilter 
            ? "WHEN (l.promotionType = 'top_category' OR l.promotionType LIKE '%top_category%') AND datetime(l.promotionEnds) > datetime('now') THEN 2"
            : "WHEN (l.promotionType = 'top_category' OR l.promotionType LIKE '%top_category%') AND datetime(l.promotionEnds) > datetime('now') THEN 4"
          }
          ELSE 4
        END,`;
      
      switch (sortBy) {
        case 'newest':
          orderByClause += " l.createdAt DESC";
          break;
        case 'price_low':
          orderByClause += " l.isFree DESC, l.createdAt DESC";
          break;
        case 'price_high':
          orderByClause += " l.isFree ASC, l.createdAt DESC";
          break;
        case 'popular':
          orderByClause += " l.views DESC, l.createdAt DESC";
          break;
        default:
          orderByClause += " l.createdAt DESC";
      }
      
      const listingsQuery = `
             SELECT 
               l.id,
               l.userId,
               l.title,
               l.description,
               l.price,
               ${currencyColumnExists ? 'l.currency,' : 'NULL as currency,'}
               l.isFree,
               l.category,
               l.subcategory,
               l.condition,
               l.location,
               l.views,
               l.status,
               l.moderationStatus,
               l.rejectionReason,
               l.promotionType,
               l.promotionEnds,
               l.expiresAt,
               l.images,
               l.tags,
               l.createdAt,
               l.publishedAt,
               u.username as sellerUsername,
               u.firstName as sellerFirstName,
               u.lastName as sellerLastName,
               u.avatar as sellerAvatar,
               u.phone as sellerPhone,
               CAST(u.telegramId AS INTEGER) as sellerTelegramId,
               COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount
             FROM Listing l
             JOIN User u ON l.userId = u.id
             ${whereClause}
             ${orderByClause}
             LIMIT ? OFFSET ?
           `;
      
      const countQuery = `
        SELECT COUNT(*) as count
        FROM Listing l
        JOIN User u ON l.userId = u.id
        ${whereClause}
      `;
      
      // Безпечно виконуємо запит з обробкою помилок
      let listingsData: any[] = [];
      let totalCountData: Array<{ count: bigint }> = [];
      
      try {
        // Формуємо масив параметрів для основного запиту
        const listingsParams = [...params, limit, offset];
        const countParams = [...params];
        
        const [data, count] = await Promise.all([
          prisma.$queryRawUnsafe(
            listingsQuery,
            ...listingsParams
          ) as any,
          prisma.$queryRawUnsafe(
            countQuery,
            ...countParams
          ) as Promise<Array<{ count: bigint }>>
        ]);
        
        listingsData = data;
        totalCountData = count;
      } catch (error: any) {
        // Якщо таблиця Favorite не існує, виконуємо запит без favoritesCount
        if (error.message?.includes('no such table: Favorite') || error.message?.includes('Favorite')) {
          const queryWithoutFavorites = listingsQuery.replace(', COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount', '');
          const [data, count] = await Promise.all([
            prisma.$queryRawUnsafe(
              queryWithoutFavorites,
              ...params,
              limit,
              offset
            ) as any,
            prisma.$queryRawUnsafe(
              countQuery,
              ...params
            ) as Promise<Array<{ count: bigint }>>
          ]);
          
          // Додаємо favoritesCount = 0 для всіх записів
          listingsData = data.map((listing: any) => ({ ...listing, favoritesCount: 0 }));
          totalCountData = count;
        } else {
          throw error;
        }
      }

      listings = listingsData;
      total = Number(totalCountData[0]?.count || 0);
      
      // Для довших пошукових запитів (>30 символів) додатково фільтруємо в JavaScript
      // оскільки SQLite не підтримує правильну нормалізацію кирилиці
      if (search && search.trim().length > 30) {
        const searchTrimmed = search.trim();
        const searchLower = normalizeCyrillicToLower(searchTrimmed);
        const searchVariants = generateSearchVariants(searchTrimmed);
        
        listings = listings.filter((listing: any) => {
          const title = listing.title || '';
          const description = listing.description || '';
          const location = listing.location || '';
          
          const titleLower = normalizeCyrillicToLower(title);
          const descLower = normalizeCyrillicToLower(description);
          const locationLower = normalizeCyrillicToLower(location);
          
          // Перевіряємо, чи містить хоча б одне поле пошуковий запит
          return searchVariants.some(variant => {
            const variantLower = normalizeCyrillicToLower(variant);
            return titleLower.includes(variantLower) ||
                   descLower.includes(variantLower) ||
                   locationLower.includes(variantLower);
          });
        });
        
        // Оновлюємо загальну кількість після фільтрації
        total = listings.length;
      }
    }

    // Сортуємо по ціні вручну (якщо потрібно) - тільки для загальних запитів
    let sortedListings = listings;
    if (!userId && (sortBy === 'price_low' || sortBy === 'price_high')) {
      sortedListings = listings.sort((a: any, b: any) => {
        // Безкоштовні завжди перші при сортуванні від дешевих
        if (sortBy === 'price_low') {
          if (a.isFree && !b.isFree) return -1;
          if (!a.isFree && b.isFree) return 1;
        } else {
          if (a.isFree && !b.isFree) return 1;
          if (!a.isFree && b.isFree) return -1;
        }

        // Парсимо ціну
        const priceA = parseFloat(a.price.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        const priceB = parseFloat(b.price.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

        return sortBy === 'price_low' ? priceA - priceB : priceB - priceA;
      });
    }

    // Обмежуємо результат (тільки для загальних запитів)
    if (!userId) {
      sortedListings = sortedListings.slice(0, limit);
    }

    // Форматуємо дані для фронтенду
    const formattedListings = sortedListings.map((listing: any) => {
      // Обробляємо різні формати даних (з Prisma або raw query)
      const originalImages = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const optimizedImages = listing.optimizedImages 
        ? (typeof listing.optimizedImages === 'string' ? JSON.parse(listing.optimizedImages) : listing.optimizedImages)
        : null;
      // Використовуємо оптимізовані версії якщо є, інакше оригінали
      const images = optimizedImages && optimizedImages.length > 0 ? optimizedImages : originalImages;
      const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];
      const timeFields = listingTimeFieldsForApi(listing);

      // Отримуємо дані користувача
      let sellerName = 'Користувач';
      let sellerAvatar = '👤';
      let sellerTelegramId = '';
      let sellerUsername: string | null = null;
      let sellerPhone: string | null = null;

      if (listing.user) {
        // Дані з Prisma include (не використовується для SQLite)
        sellerName = listing.user.firstName 
          ? `${listing.user.firstName} ${listing.user.lastName || ''}`.trim()
          : listing.user.username || 'Користувач';
        sellerAvatar = listing.user.avatar || '👤';
        sellerTelegramId = listing.user.telegramId?.toString() || '';
        sellerUsername = listing.user.username || null;
        sellerPhone = (listing.user as any).phone || null;
      } else if ((listing as any).sellerFirstName || (listing as any).sellerUsername) {
        // Дані з raw query (використовується для всіх запитів)
        const rawListing = listing as any;
        sellerName = rawListing.sellerFirstName 
          ? `${rawListing.sellerFirstName} ${rawListing.sellerLastName || ''}`.trim()
          : rawListing.sellerUsername || 'Користувач';
        sellerAvatar = rawListing.sellerAvatar || '👤';
        sellerTelegramId = rawListing.sellerTelegramId?.toString() || '';
        sellerUsername = rawListing.sellerUsername || null;
        sellerPhone = rawListing.sellerPhone || null;
        sellerPhone = rawListing.sellerPhone || null;
      }

             return {
               id: listing.id,
               title: listing.title,
               price: listing.isFree ? 'Free' : listing.price,
               currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
               image: images[0] || '',
               images: images,
               seller: {
                 name: sellerName,
                 avatar: sellerAvatar,
                 phone: sellerPhone || '',
                 telegramId: sellerTelegramId,
                 username: sellerUsername,
               },
               category: listing.category,
               subcategory: listing.subcategory,
               description: listing.description,
               location: listing.location,
               views: listing.views || 0,
               posted: timeFields.posted,
               publishedAt: timeFields.publishedAt,
               createdAt: timeFields.createdAt,
               condition: normalizeCondition(listing.condition),
               tags: tags,
               isFree: listing.isFree === 1 || listing.isFree === true,
               status: listing.status ?? 'active',
               moderationStatus: listing.moderationStatus || null,
               rejectionReason: listing.rejectionReason || null,
               promotionType: listing.promotionType || null,
               promotionEnds: listing.promotionEnds || null,
               expiresAt: listing.expiresAt || null,
               favoritesCount: normalizeFavoritesCount((listing as any).favoritesCount),
             };
    });

    // Відключаємо кешування для завжди актуальних даних
    const response = NextResponse.json({
      listings: formattedListings,
      total,
      limit,
      offset,
    });
    
    // Додаємо заголовки для відключення кешування
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');
    
    return response;
  } catch (error) {
    console.error('Error fetching listings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', { errorMessage, errorStack });
    return NextResponse.json(
      { 
        error: 'Failed to fetch listings',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
