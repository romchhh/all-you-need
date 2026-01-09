import { prisma } from './prisma';
import { executeWithRetry } from './prisma';

/**
 * Створює індекси для оптимізації SQL запитів
 * Викликається один раз при старті сервера
 */
// Helper функція для безпечного виконання DDL команд
async function executeDDLSafely(sql: string): Promise<void> {
  try {
    await executeWithRetry(() => prisma.$executeRawUnsafe(sql));
  } catch (error: any) {
    // Ігноруємо помилки "Execute returned results" - це нормальна поведінка SQLite для DDL команд
    // Команди все одно виконуються успішно
    if (!error.message?.includes('Execute returned results') && 
        !error.message?.includes('already exists')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('DDL command warning:', error.message);
      }
    }
  }
}

export async function createDatabaseIndexes(): Promise<void> {
  try {
    // Індекс для пошуку користувачів за telegramId
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_user_telegramId ON User(telegramId)
    `);

    // Індекс для пошуку оголошень за userId
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_listing_userId ON Listing(userId)
    `);

    // Індекс для пошуку оголошень за статусом
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_listing_status ON Listing(status)
    `);

    // Індекс для пошуку оголошень за категорією
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_listing_category ON Listing(category)
    `);

    // Індекс для сортування за датою створення
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_listing_createdAt ON Listing(createdAt DESC)
    `);

    // Індекс для пошуку favorites за userId
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_favorite_userId ON Favorite(userId)
    `);

    // Індекс для пошуку favorites за listingId
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_favorite_listingId ON Favorite(listingId)
    `);

    // Композитний індекс для пошуку активних оголошень за категорією та датою
    await executeDDLSafely(`
      CREATE INDEX IF NOT EXISTS idx_listing_status_category_createdAt 
      ON Listing(status, category, createdAt DESC)
    `);

    if (process.env.NODE_ENV === 'development') {
      console.log('Database indexes created successfully');
    }
  } catch (error: any) {
    // Ігноруємо помилки "Execute returned results" - це нормально для SQLite
    if (!error.message?.includes('Execute returned results')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Note: Error creating database indexes:', error.message);
      }
    }
  }
}
