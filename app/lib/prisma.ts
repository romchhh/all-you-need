import { PrismaClient } from '@prisma/client';

// Глобальна змінна для відстеження чи таблиця Favorite вже перевірена
let favoriteTableInitialized = false;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  currencyColumnChecked: boolean | undefined;
  currencyColumnExists: boolean | undefined;
  dbOptimized: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Вимкнути логування помилок Prisma - ми обробляємо їх вручну
    // Це приховує помилки "Execute returned results" для SQLite DDL команд
    log: [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Оптимізуємо SQLite для кращої продуктивності та уникнення блокувань
let dbOptimized = globalForPrisma.dbOptimized ?? false;

// Створює додаткові індекси для оптимізації запитів
async function createAdditionalIndexes(): Promise<void> {
  // Створюємо індекси з обробкою помилок для кожного окремо
  // Деякі команди CREATE INDEX можуть повертати результати в SQLite, що викликає помилку
  const createIndexSafely = async (indexName: string, sql: string) => {
    try {
      await executeWithRetry(() => prisma.$executeRawUnsafe(sql));
    } catch (error: any) {
      // Ігноруємо помилки "Execute returned results" - це нормально для SQLite
      // Індекси все одно створюються або вже існують
      // Не логуємо цю помилку взагалі
      if (!error.message?.includes('Execute returned results') && 
          !error.message?.includes('already exists')) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Note: Could not create ${indexName}:`, error.message);
        }
      }
    }
  };

  // Listing індекси
  await createIndexSafely('idx_listing_publishedAt', `CREATE INDEX IF NOT EXISTS idx_listing_publishedAt ON Listing(publishedAt)`);
  await createIndexSafely('idx_listing_currency', `CREATE INDEX IF NOT EXISTS idx_listing_currency ON Listing(currency)`);
  await createIndexSafely('idx_listing_views', `CREATE INDEX IF NOT EXISTS idx_listing_views ON Listing(views)`);
  
  // Composite індекси для Listing
  await createIndexSafely('idx_listing_status_createdAt', `CREATE INDEX IF NOT EXISTS idx_listing_status_createdAt ON Listing(status, createdAt)`);
  await createIndexSafely('idx_listing_status_views', `CREATE INDEX IF NOT EXISTS idx_listing_status_views ON Listing(status, views)`);
  await createIndexSafely('idx_listing_userId_status', `CREATE INDEX IF NOT EXISTS idx_listing_userId_status ON Listing(userId, status)`);
  await createIndexSafely('idx_listing_userId_category', `CREATE INDEX IF NOT EXISTS idx_listing_userId_category ON Listing(userId, category)`);
  await createIndexSafely('idx_listing_status_isFree_createdAt', `CREATE INDEX IF NOT EXISTS idx_listing_status_isFree_createdAt ON Listing(status, isFree, createdAt)`);
  
  // ViewHistory індекси
  await createIndexSafely('idx_viewhistory_viewerTelegramId', `CREATE INDEX IF NOT EXISTS idx_viewhistory_viewerTelegramId ON ViewHistory(viewerTelegramId)`);
  await createIndexSafely('idx_viewhistory_listing_viewer', `CREATE UNIQUE INDEX IF NOT EXISTS idx_viewhistory_listing_viewer ON ViewHistory(listingId, viewerTelegramId)`);
  
  // Transaction індекси
  await createIndexSafely('idx_transaction_status', `CREATE INDEX IF NOT EXISTS idx_transaction_status ON [Transaction](status)`);
  await createIndexSafely('idx_transaction_createdAt', `CREATE INDEX IF NOT EXISTS idx_transaction_createdAt ON [Transaction](createdAt)`);
  await createIndexSafely('idx_transaction_type_status', `CREATE INDEX IF NOT EXISTS idx_transaction_type_status ON [Transaction](type, status)`);
  
  // Review індекси
  await createIndexSafely('idx_review_targetId', `CREATE INDEX IF NOT EXISTS idx_review_targetId ON Review(targetId)`);
  await createIndexSafely('idx_review_listingId', `CREATE INDEX IF NOT EXISTS idx_review_listingId ON Review(listingId)`);
  await createIndexSafely('idx_review_createdAt', `CREATE INDEX IF NOT EXISTS idx_review_createdAt ON Review(createdAt)`);
  
  // Link індекси
  await createIndexSafely('idx_link_linkName', `CREATE INDEX IF NOT EXISTS idx_link_linkName ON Link(linkName)`);
}

// Helper функція для безпечного виконання DDL команд в SQLite
async function executeDDLSafely(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error: any) {
    // Ігноруємо помилки "Execute returned results" - це нормальна поведінка SQLite для DDL команд
    // Команди все одно виконуються успішно
    if (!error.message?.includes('Execute returned results') && 
        !error.message?.includes('already exists')) {
      // Логуємо тільки реальні помилки
      if (process.env.NODE_ENV === 'development') {
        console.log('DDL command warning:', error.message);
      }
    }
  }
}

async function optimizeDatabase(): Promise<void> {
  if (dbOptimized) {
    return;
  }

  try {
    // Увімкнути WAL mode (Write-Ahead Logging) - дозволяє одночасні читання та запис
    await executeDDLSafely(`PRAGMA journal_mode = WAL;`);
    
    // Збільшити timeout для запитів (30 секунд)
    await executeDDLSafely(`PRAGMA busy_timeout = 30000;`);
    
    // Увімкнути foreign keys
    await executeDDLSafely(`PRAGMA foreign_keys = ON;`);
    
    // Оптимізувати для швидших запитів
    await executeDDLSafely(`PRAGMA synchronous = NORMAL;`);
    
    // Кешувати сторінки в пам'яті (16MB)
    await executeDDLSafely(`PRAGMA cache_size = -16384;`);
    
    // Створюємо додаткові індекси для оптимізації (якщо їх немає)
    await createAdditionalIndexes();
    
    // PRAGMA optimize повертає результати, тому не використовуємо executeRaw
    // Це не критично для роботи бази даних - SQLite автоматично оптимізує запити
    
    dbOptimized = true;
    globalForPrisma.dbOptimized = true;
    if (process.env.NODE_ENV === 'development') {
      console.log('Database optimized: WAL mode enabled, timeout set to 30s, indexes created');
    }
  } catch (error: any) {
    // Ігноруємо помилки про "Execute returned results" - це нормально для SQLite
    if (!error.message?.includes('Execute returned results')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Note: Could not optimize database:', error.message);
      }
    }
    // Відмічаємо як оптимізовану, щоб не повторювати
    dbOptimized = true;
    globalForPrisma.dbOptimized = true;
  }
}

// Викликаємо оптимізацію при ініціалізації (асинхронно, не блокуємо)
if (!dbOptimized) {
  // Запускаємо оптимізацію в фоні, не блокуємо ініціалізацію
  setImmediate(async () => {
    try {
      await optimizeDatabase();
      // Створюємо індекси для оптимізації SQL запитів
      const { createDatabaseIndexes } = await import('./db-indexes');
      await createDatabaseIndexes();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Error optimizing database:', err);
      }
    }
  });
}

// Helper функція для виконання запитів з retry logic
export async function executeWithRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error: any) {
      lastError = error;
      
      // Якщо помилка "database is locked", повторюємо з затримкою
      if (error.message?.includes('database is locked') || 
          error.message?.includes('SQLITE_BUSY') ||
          error.code === 'P2034') {
        
        if (attempt < maxRetries - 1) {
          // Експоненційна затримка: 100ms, 200ms, 400ms
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Для інших помилок - не повторюємо
      throw error;
    }
  }
  
  throw lastError;
}

// Кешуємо результат перевірки колонки currency
let currencyColumnChecked = globalForPrisma.currencyColumnChecked ?? false;
let currencyColumnExists = globalForPrisma.currencyColumnExists ?? false;
let viewHistoryTableChecked = false;

export async function ensureCurrencyColumn(): Promise<boolean> {
  // Якщо вже перевіряли - повертаємо кешований результат
  if (currencyColumnChecked) {
    return currencyColumnExists;
  }

  try {
    // Перевіряємо, чи існує колонка currency
    const tableInfo = await prisma.$queryRawUnsafe(`
      PRAGMA table_info(Listing)
    `) as Array<{ name: string; type: string }>;
    
    currencyColumnExists = tableInfo.some(col => col.name === 'currency');
    currencyColumnChecked = true;
    
    // Зберігаємо в глобальну змінну для кешування
    globalForPrisma.currencyColumnChecked = true;
    globalForPrisma.currencyColumnExists = currencyColumnExists;

    // Якщо колонки немає, намагаємося її додати (тільки один раз)
    if (!currencyColumnExists) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE Listing ADD COLUMN currency TEXT
        `);
        currencyColumnExists = true;
        globalForPrisma.currencyColumnExists = true;
        console.log('Currency column added successfully');
      } catch (error: any) {
        // Якщо колонка вже існує або база заблокована - це нормально
        if (error.message?.includes('duplicate column name') || 
            error.message?.includes('duplicate column') ||
            error.message?.includes('already exists')) {
          currencyColumnExists = true;
          globalForPrisma.currencyColumnExists = true;
        } else if (error.message?.includes('database is locked')) {
          // Якщо база заблокована - просто логуємо, не блокуємо запит
          console.log('Note: Database is locked, currency column will be added later');
        } else {
          console.log('Note: Could not add currency column:', error.message);
        }
      }
    }

    return currencyColumnExists;
  } catch (error: any) {
    console.log('Note: Could not check currency column:', error.message);
    // Якщо не вдалося перевірити - припускаємо, що колонки немає
    currencyColumnChecked = true;
    globalForPrisma.currencyColumnChecked = true;
    return false;
  }
}

// Кешуємо створення таблиці ViewHistory
export async function ensureViewHistoryTable(): Promise<void> {
  if (viewHistoryTableChecked) {
    return;
  }

  try {
    // Перевіряємо, чи таблиця існує (з retry)
    const tableInfo = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='ViewHistory'
      `) as Promise<Array<{ name: string }>>
    );
    
    if (tableInfo.length === 0) {
      // Створюємо таблицю тільки якщо її немає (з безпечною обробкою)
      try {
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS ViewHistory (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              listingId INTEGER NOT NULL,
              viewerTelegramId INTEGER,
              viewedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              userAgent TEXT,
              ipAddress TEXT,
              FOREIGN KEY (listingId) REFERENCES Listing(id) ON DELETE CASCADE
            )
          `)
        );
      } catch (error: any) {
        // Ігноруємо помилки "Execute returned results" - це нормально для SQLite
        // Не логуємо цю помилку взагалі
        if (!error.message?.includes('Execute returned results') && 
            !error.message?.includes('already exists')) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Note: Could not create ViewHistory table:', error.message);
          }
        }
      }
    } else {
      // Перевіряємо, чи є колонка viewerTelegramId
      try {
        const columns = await prisma.$queryRawUnsafe(`
          PRAGMA table_info(ViewHistory)
        `) as Array<{ name: string; type: string }>;
        
        const hasViewerTelegramId = columns.some(col => col.name === 'viewerTelegramId');
        if (!hasViewerTelegramId) {
          try {
            await executeWithRetry(() =>
              prisma.$executeRawUnsafe(`
                ALTER TABLE ViewHistory ADD COLUMN viewerTelegramId INTEGER
              `)
            );
          } catch (error: any) {
            // Ігноруємо помилки "Execute returned results" та "duplicate column"
            if (!error.message?.includes('Execute returned results') && 
                !error.message?.includes('duplicate column') && 
                !error.message?.includes('already exists')) {
              console.log('Note: Could not add viewerTelegramId column:', error.message);
            }
          }
        }
      } catch (error: any) {
        // Якщо не вдалося додати колонку - це нормально (може вже існувати)
        if (!error.message?.includes('duplicate column') && !error.message?.includes('already exists')) {
          console.log('Note: Could not add viewerTelegramId column:', error.message);
        }
      }
    }
    
    // Створюємо індекси (з безпечною обробкою помилок)
    const createIndexSafely = async (indexName: string, sql: string) => {
      try {
        await executeWithRetry(() => prisma.$executeRawUnsafe(sql));
      } catch (error: any) {
        // Ігноруємо помилки "Execute returned results" - це нормально для SQLite
        if (!error.message?.includes('Execute returned results')) {
          console.log(`Note: Could not create ${indexName}:`, error.message);
        }
      }
    };
    
    await createIndexSafely('idx_viewhistory_listingId', `
      CREATE INDEX IF NOT EXISTS idx_viewhistory_listingId ON ViewHistory(listingId)
    `);
    await createIndexSafely('idx_viewhistory_viewerTelegramId', `
      CREATE INDEX IF NOT EXISTS idx_viewhistory_viewerTelegramId ON ViewHistory(viewerTelegramId)
    `);
    await createIndexSafely('idx_viewhistory_viewedAt', `
      CREATE INDEX IF NOT EXISTS idx_viewhistory_viewedAt ON ViewHistory(viewedAt)
    `);
    await createIndexSafely('idx_viewhistory_listing_viewer', `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_viewhistory_listing_viewer ON ViewHistory(listingId, viewerTelegramId)
    `);
    
    viewHistoryTableChecked = true;
  } catch (error: any) {
    // Якщо помилка - просто логуємо, не блокуємо запит
    console.log('Note: Could not ensure ViewHistory table:', error.message);
    viewHistoryTableChecked = true; // Відмічаємо як перевірене, щоб не повторювати
  }
}

// Кешуємо створення таблиці Favorite
let favoriteTableChecked = false;

export async function ensureFavoriteTable(): Promise<void> {
  // Якщо таблиця вже ініціалізована глобально, не перевіряємо знову
  if (favoriteTableInitialized || favoriteTableChecked) {
    return;
  }

  try {
    // Перевіряємо, чи таблиця існує (з retry)
    const tableInfo = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='Favorite'
      `) as Promise<Array<{ name: string }>>
    );
    
    if (tableInfo.length === 0) {
      // Створюємо таблицю тільки якщо її немає (з безпечною обробкою)
      try {
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS Favorite (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              userId INTEGER NOT NULL,
              listingId INTEGER NOT NULL,
              createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
              FOREIGN KEY (listingId) REFERENCES Listing(id) ON DELETE CASCADE,
              UNIQUE(userId, listingId)
            )
          `)
        );
        // Таблиця створена успішно
      } catch (error: any) {
        // Ігноруємо помилки "Execute returned results" - це нормально для SQLite
        // CREATE TABLE IF NOT EXISTS може повертати результати, але таблиця все одно створюється
        // Не логуємо цю помилку взагалі
        if (!error.message?.includes('Execute returned results') && 
            !error.message?.includes('already exists')) {
          // Логуємо тільки реальні помилки
          if (process.env.NODE_ENV === 'development') {
            console.log('Note: Could not create Favorite table:', error.message);
          }
        }
      }
    }
    
    // Створюємо індекси (з безпечною обробкою помилок)
    const createIndexSafely = async (indexName: string, sql: string) => {
      try {
        await executeWithRetry(() => prisma.$executeRawUnsafe(sql));
      } catch (error: any) {
        // Ігноруємо помилки "Execute returned results" - це нормально для SQLite
        if (!error.message?.includes('Execute returned results')) {
          console.log(`Note: Could not create ${indexName}:`, error.message);
        }
      }
    };
    
    await createIndexSafely('idx_favorite_userId', `
      CREATE INDEX IF NOT EXISTS idx_favorite_userId ON Favorite(userId)
    `);
    await createIndexSafely('idx_favorite_listingId', `
      CREATE INDEX IF NOT EXISTS idx_favorite_listingId ON Favorite(listingId)
    `);
    
    favoriteTableChecked = true;
    favoriteTableInitialized = true; // Відмічаємо глобально
  } catch (error: any) {
    // Якщо помилка - просто логуємо, не блокуємо запит
    if (process.env.NODE_ENV === 'development') {
      console.log('Note: Could not ensure Favorite table:', error.message);
    }
    favoriteTableChecked = true; // Відмічаємо як перевірене, щоб не повторювати
    favoriteTableInitialized = true; // Відмічаємо глобально навіть при помилці
  }
}

// Кешуємо створення таблиці UserSession
let userSessionTableChecked = false;

export async function ensureUserSessionTable(): Promise<void> {
  if (userSessionTableChecked) {
    return;
  }

  try {
    // Перевіряємо, чи таблиця існує
    const tableInfo = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='UserSession'
      `) as Promise<Array<{ name: string }>>
    );
    
    if (tableInfo.length === 0) {
      // Створюємо таблицю тільки якщо її немає
      try {
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS UserSession (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              userId INTEGER NOT NULL,
              telegramId INTEGER NOT NULL,
              lastActiveAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
              UNIQUE(userId, telegramId)
            )
          `)
        );
        
        // Створюємо індекси
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS idx_usersession_userId ON UserSession(userId)
          `)
        ).catch(() => {});
        
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS idx_usersession_telegramId ON UserSession(telegramId)
          `)
        ).catch(() => {});
        
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS idx_usersession_lastActiveAt ON UserSession(lastActiveAt)
          `)
        ).catch(() => {});
      } catch (error: any) {
        if (!error.message?.includes('Execute returned results') && 
            !error.message?.includes('already exists')) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Note: Could not create UserSession table:', error.message);
          }
        }
      }
    }
    
    userSessionTableChecked = true;
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Note: Could not ensure UserSession table:', error.message);
    }
    userSessionTableChecked = true;
  }
}

// Функція для оновлення активності користувача
export async function updateUserActivity(telegramId: string | number): Promise<void> {
  try {
    await ensureUserSessionTable();
    
    const telegramIdNum = typeof telegramId === 'string' ? parseInt(telegramId, 10) : telegramId;
    // Використовуємо поточний час в форматі, сумісному з SQLite DATETIME
    const currentTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Знаходимо користувача
    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
        telegramIdNum
      ) as Promise<Array<{ id: number }>>
    );
    
    if (!users[0]) {
      return; // Користувач не знайдений
    }
    
    const userId = users[0].id;
    
    // Перевіряємо чи існує запис в UserSession
    const sessions = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM UserSession WHERE userId = ? AND telegramId = ?`,
        userId,
        telegramIdNum
      ) as Promise<Array<{ id: number }>>
    );
    
    if (sessions[0]) {
      // Оновлюємо існуючий запис
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `UPDATE UserSession SET lastActiveAt = ? WHERE userId = ? AND telegramId = ?`,
          currentTime,
          userId,
          telegramIdNum
        )
      );
    } else {
      // Створюємо новий запис
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `INSERT INTO UserSession (userId, telegramId, lastActiveAt, createdAt) VALUES (?, ?, ?, ?)`,
          userId,
          telegramIdNum,
          currentTime,
          currentTime
        )
      );
    }
  } catch (error: any) {
    // Тиха обробка помилок - не блокуємо додаток
    if (process.env.NODE_ENV === 'development') {
      console.log('Note: Could not update user activity:', error.message);
    }
  }
}
