import path from 'path';
import fs from 'fs';

/**
 * Helper для прямого доступу до SQLite через better-sqlite3
 * Використовується для обходу проблем з кирилицею в Prisma
 */
let sqlite3: any = null;
let db: any = null;

async function initSqlite3() {
  if (sqlite3 && db) {
    return db;
  }

  try {
    // Спробуємо імпортувати better-sqlite3
    sqlite3 = await import('better-sqlite3');
    
    // Отримуємо шлях до бази з DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not found');
    }
    
    // DATABASE_URL має формат "file:../database/ayn_marketplace.db"
    const dbPath = dbUrl.replace('file:', '').replace(/^\.\.\//, '');
    
    // Визначаємо абсолютний шлях
    const absolutePath = path.resolve(process.cwd(), dbPath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Database file not found: ${absolutePath}`);
    }
    
    db = new sqlite3.default(absolutePath);
    
    // Налаштування для правильної роботи з UTF-8
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 30000');
    db.pragma('foreign_keys = ON');
    
    return db;
  } catch (error: any) {
    // Якщо better-sqlite3 не встановлений, повертаємо null
    if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
      console.warn('[SQLite Direct] better-sqlite3 not installed');
      return null;
    }
    throw error;
  }
}

/**
 * Отримує всі оголошення з TelegramListing через прямий доступ до SQLite
 */
export async function getTelegramListingsDirect(limit: number = 1000): Promise<any[]> {
  const database = await initSqlite3();
  
  if (!database) {
    throw new Error('better-sqlite3 not available. Please install: npm install better-sqlite3 @types/better-sqlite3');
  }
  
  try {
    // Отримуємо ID всіх оголошень
    const idsStmt = database.prepare(`
      SELECT id FROM TelegramListing 
      WHERE price IS NOT NULL AND price >= 0 
      ORDER BY createdAt DESC 
      LIMIT ?
    `);
    const ids = idsStmt.all(limit).map((row: any) => row.id);
    
    if (ids.length === 0) {
      return [];
    }
    
    // Отримуємо дані оголошень
    const placeholders = ids.map(() => '?').join(',');
    const listingsStmt = database.prepare(`
      SELECT 
        id, userId, title, description, price, currency, category, subcategory, 
        condition, location, status, images, createdAt, updatedAt, publishedAt, 
        publicationTariff, paymentStatus
      FROM TelegramListing 
      WHERE id IN (${placeholders})
      ORDER BY createdAt DESC
    `);
    
    const listings = listingsStmt.all(...ids);
    
    // Отримуємо дані користувачів
    const userIds = [...new Set(listings.map((l: any) => l.userId))];
    let usersMap = new Map();
    
    if (userIds.length > 0) {
      const userPlaceholders = userIds.map(() => '?').join(',');
      const usersStmt = database.prepare(`
        SELECT id, telegramId, username, firstName, lastName, avatar 
        FROM User 
        WHERE id IN (${userPlaceholders})
      `);
      
      const users = usersStmt.all(...userIds);
      users.forEach((u: any) => {
        usersMap.set(u.id, u);
      });
    }
    
    // Об'єднуємо дані
    return listings.map((tl: any) => {
      const user = usersMap.get(tl.userId);
      return {
        id: tl.id,
        userId: tl.userId,
        title: String(tl.title || ''),
        description: String(tl.description || ''),
        price: Number(tl.price) || 0,
        currency: String(tl.currency || 'EUR'),
        category: String(tl.category || ''),
        subcategory: tl.subcategory ? String(tl.subcategory) : null,
        condition: tl.condition ? String(tl.condition) : null,
        location: tl.location ? String(tl.location) : null,
        status: String(tl.status || 'pending'),
        images: String(tl.images || '[]'),
        createdAt: tl.createdAt,
        updatedAt: tl.updatedAt || tl.createdAt,
        publishedAt: tl.publishedAt || null,
        publicationTariff: tl.publicationTariff ? String(tl.publicationTariff) : null,
        paymentStatus: String(tl.paymentStatus || 'pending'),
        sellerUsername: user?.username || null,
        sellerFirstName: user?.firstName || null,
        sellerLastName: user?.lastName || null,
        sellerAvatar: user?.avatar || null,
        sellerTelegramId: user?.telegramId ? String(user.telegramId) : '',
      };
    });
  } catch (error: any) {
    console.error('[SQLite Direct] Error fetching telegram listings:', error);
    throw error;
  }
}
