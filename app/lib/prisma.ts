import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  currencyColumnChecked: boolean | undefined;
  currencyColumnExists: boolean | undefined;
  dbOptimized: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Оптимізуємо SQLite для кращої продуктивності та уникнення блокувань
let dbOptimized = globalForPrisma.dbOptimized ?? false;

// Створює додаткові індекси для оптимізації запитів
async function createAdditionalIndexes(): Promise<void> {
  try {
    // Listing індекси
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_publishedAt ON Listing(publishedAt)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_currency ON Listing(currency)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_views ON Listing(views)`)
    );
    
    // Composite індекси для Listing
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_status_createdAt ON Listing(status, createdAt)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_status_views ON Listing(status, views)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_userId_status ON Listing(userId, status)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_userId_category ON Listing(userId, category)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_listing_status_isFree_createdAt ON Listing(status, isFree, createdAt)`)
    );
    
    // ViewHistory індекси
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_viewhistory_viewerTelegramId ON ViewHistory(viewerTelegramId)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_viewhistory_listing_viewer ON ViewHistory(listingId, viewerTelegramId)`)
    );
    
    // Transaction індекси
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_transaction_status ON [Transaction](status)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_transaction_createdAt ON [Transaction](createdAt)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_transaction_type_status ON [Transaction](type, status)`)
    );
    
    // Review індекси
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_review_targetId ON Review(targetId)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_review_listingId ON Review(listingId)`)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_review_createdAt ON Review(createdAt)`)
    );
    
    // Link індекси
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_link_linkName ON Link(linkName)`)
    );
    
    console.log('Additional indexes created successfully');
  } catch (error: any) {
    // Якщо помилка - просто логуємо, не блокуємо
    console.log('Note: Could not create some indexes:', error.message);
  }
}

async function optimizeDatabase(): Promise<void> {
  if (dbOptimized) {
    return;
  }

  try {
    // Увімкнути WAL mode (Write-Ahead Logging) - дозволяє одночасні читання та запис
    await prisma.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`);
    
    // Збільшити timeout для запитів (30 секунд)
    await prisma.$executeRawUnsafe(`PRAGMA busy_timeout = 30000;`);
    
    // Увімкнути foreign keys
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
    
    // Оптимізувати для швидших запитів
    await prisma.$executeRawUnsafe(`PRAGMA synchronous = NORMAL;`);
    
    // Кешувати сторінки в пам'яті (16MB)
    await prisma.$executeRawUnsafe(`PRAGMA cache_size = -16384;`);
    
    // Створюємо додаткові індекси для оптимізації (якщо їх немає)
    await createAdditionalIndexes();
    
    // Оптимізувати запити (PRAGMA optimize повертає результати, тому використовуємо queryRaw)
    try {
      await prisma.$queryRawUnsafe(`PRAGMA optimize;`);
    } catch (error: any) {
      // PRAGMA optimize може не працювати в деяких версіях SQLite, це нормально
      console.log('Note: PRAGMA optimize not available or returned results');
    }
    
    dbOptimized = true;
    globalForPrisma.dbOptimized = true;
    console.log('Database optimized: WAL mode enabled, timeout set to 30s, indexes created');
  } catch (error: any) {
    console.log('Note: Could not optimize database:', error.message);
    // Відмічаємо як оптимізовану, щоб не повторювати
    dbOptimized = true;
    globalForPrisma.dbOptimized = true;
  }
}

// Викликаємо оптимізацію при ініціалізації (асинхронно, не блокуємо)
if (!dbOptimized) {
  // Запускаємо оптимізацію в фоні, не блокуємо ініціалізацію
  setImmediate(() => {
    optimizeDatabase().catch(err => {
      console.log('Error optimizing database:', err);
    });
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
      // Створюємо таблицю тільки якщо її немає (з retry)
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
    } else {
      // Перевіряємо, чи є колонка viewerTelegramId
      try {
        const columns = await executeWithRetry(() =>
          prisma.$queryRawUnsafe(`
            PRAGMA table_info(ViewHistory)
          `) as Promise<Array<{ name: string; type: string }>>
        );
        
        const hasViewerTelegramId = columns.some(col => col.name === 'viewerTelegramId');
        if (!hasViewerTelegramId) {
          await executeWithRetry(() =>
            prisma.$executeRawUnsafe(`
              ALTER TABLE ViewHistory ADD COLUMN viewerTelegramId INTEGER
            `)
          );
        }
      } catch (error: any) {
        // Якщо не вдалося додати колонку - це нормально (може вже існувати)
        if (!error.message?.includes('duplicate column') && !error.message?.includes('already exists')) {
          console.log('Note: Could not add viewerTelegramId column:', error.message);
        }
      }
    }
    
    // Створюємо індекси (з retry, якщо їх немає)
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_viewhistory_listingId ON ViewHistory(listingId)
      `)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_viewhistory_viewerTelegramId ON ViewHistory(viewerTelegramId)
      `)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_viewhistory_viewedAt ON ViewHistory(viewedAt)
      `)
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_viewhistory_listing_viewer ON ViewHistory(listingId, viewerTelegramId)
      `)
    );
    
    viewHistoryTableChecked = true;
  } catch (error: any) {
    // Якщо помилка - просто логуємо, не блокуємо запит
    console.log('Note: Could not ensure ViewHistory table:', error.message);
    viewHistoryTableChecked = true; // Відмічаємо як перевірене, щоб не повторювати
  }
}

