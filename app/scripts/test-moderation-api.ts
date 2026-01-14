/**
 * Тестовий скрипт для перевірки API модерації
 * Запуск: npx tsx scripts/test-moderation-api.ts
 * 
 * ПЕРЕД ЗАПУСКОМ:
 * 1. Переконайтеся, що сервер запущений (npm run dev)
 * 2. Переконайтеся, що ви залогінені як адмін
 * 3. Встановіть змінні оточення для DATABASE_URL та інших
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testEndpoint(
  name: string,
  url: string,
  options?: RequestInit
): Promise<TestResult> {
  try {
    console.log(`\n🧪 Тестування: ${name}`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        name,
        success: false,
        error: `HTTP ${response.status}: ${data.error || 'Unknown error'}`,
        data,
      };
    }

    return {
      name,
      success: true,
      data,
    };
  } catch (error: any) {
    return {
      name,
      success: false,
      error: error.message || 'Network error',
    };
  }
}

async function runTests() {
  console.log('🚀 Початок тестування API модерації\n');
  console.log('='.repeat(60));

  const results: TestResult[] = [];

  // Тест 1: GET /api/admin/moderation/marketplace
  results.push(
    await testEndpoint(
      'GET Marketplace Listings',
      `${BASE_URL}/api/admin/moderation/marketplace?status=pending`
    )
  );

  // Тест 2: GET /api/admin/moderation/telegram
  results.push(
    await testEndpoint(
      'GET Telegram Listings',
      `${BASE_URL}/api/admin/moderation/telegram?status=pending`
    )
  );

  // Тест 3: GET /api/admin/moderation (старий endpoint)
  results.push(
    await testEndpoint(
      'GET All Listings (deprecated)',
      `${BASE_URL}/api/admin/moderation?status=pending`
    )
  );

  // Тест 4: Перевірка пагінації
  results.push(
    await testEndpoint(
      'GET Marketplace with pagination',
      `${BASE_URL}/api/admin/moderation/marketplace?status=pending&limit=10&offset=0`
    )
  );

  // Тест 5: Перевірка структури відповіді
  if (results[0].success && results[0].data) {
    const marketplaceData = results[0].data;
    const hasListings = Array.isArray(marketplaceData.listings);
    const hasTotal = typeof marketplaceData.total === 'number';
    const hasHasMore = typeof marketplaceData.hasMore === 'boolean';

    results.push({
      name: 'Marketplace Response Structure',
      success: hasListings && hasTotal && hasHasMore,
      error: !hasListings
        ? 'Missing listings array'
        : !hasTotal
        ? 'Missing total count'
        : !hasHasMore
        ? 'Missing hasMore flag'
        : undefined,
      data: {
        hasListings,
        hasTotal,
        hasHasMore,
        listingsCount: hasListings ? marketplaceData.listings.length : 0,
      },
    });

    // Перевірка структури оголошення
    if (hasListings && marketplaceData.listings.length > 0) {
      const listing = marketplaceData.listings[0];
      const requiredFields = [
        'id',
        'title',
        'description',
        'price',
        'category',
        'user',
      ];
      const missingFields = requiredFields.filter(
        (field) => !(field in listing)
      );

      results.push({
        name: 'Marketplace Listing Structure',
        success: missingFields.length === 0,
        error:
          missingFields.length > 0
            ? `Missing fields: ${missingFields.join(', ')}`
            : undefined,
        data: {
          hasAllFields: missingFields.length === 0,
          missingFields,
        },
      });
    }
  }

  // Тест 6: Перевірка Telegram структури
  if (results[1].success && results[1].data) {
    const telegramData = results[1].data;
    const hasListings = Array.isArray(telegramData.listings);
    const hasTotal = typeof telegramData.total === 'number';

    results.push({
      name: 'Telegram Response Structure',
      success: hasListings && hasTotal,
      error: !hasListings
        ? 'Missing listings array'
        : !hasTotal
        ? 'Missing total count'
        : undefined,
      data: {
        hasListings,
        hasTotal,
        listingsCount: hasListings ? telegramData.listings.length : 0,
      },
    });
  }

  // Виведення результатів
  console.log('\n' + '='.repeat(60));
  console.log('📊 Результати тестування:\n');

  let passed = 0;
  let failed = 0;

  results.forEach((result) => {
    if (result.success) {
      console.log(`✅ ${result.name}`);
      passed++;
      if (result.data && typeof result.data === 'object') {
        if (result.data.listingsCount !== undefined) {
          console.log(`   Знайдено оголошень: ${result.data.listingsCount}`);
        }
        if (result.data.total !== undefined) {
          console.log(`   Всього: ${result.data.total}`);
        }
      }
    } else {
      console.log(`❌ ${result.name}`);
      console.log(`   Помилка: ${result.error}`);
      failed++;
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`📈 Підсумок: ${passed} пройдено, ${failed} не пройдено`);

  if (failed === 0) {
    console.log('🎉 Всі тести пройдено успішно!');
    process.exit(0);
  } else {
    console.log('⚠️  Деякі тести не пройдено');
    process.exit(1);
  }
}

// Запуск тестів
runTests().catch((error) => {
  console.error('💥 Критична помилка:', error);
  process.exit(1);
});
