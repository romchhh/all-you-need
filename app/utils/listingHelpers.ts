import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { toSQLiteDate, addDays, nowSQLite } from './dateHelpers';
import { getSystemSetting } from './dbHelpers';

interface User {
  id: number;
  listingPackagesBalance: number;
  hasUsedFreeAd: number;
}

interface ListingFormData {
  title: string;
  description: string;
  price: string;
  currency: 'UAH' | 'EUR' | 'USD';
  isFree: boolean;
  category: string;
  subcategory: string | null;
  condition: string | null;
  location: string;
}

/**
 * Знаходить користувача за Telegram ID
 */
export async function findUserByTelegramIdForListing(telegramId: string): Promise<User | null> {
  const users = await prisma.$queryRawUnsafe(
    `SELECT id, listingPackagesBalance, hasUsedFreeAd FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
    parseInt(telegramId)
  ) as User[];

  return users[0] || null;
}

/**
 * Перевіряє та списує пакет оголошення
 */
export async function deductListingPackage(user: User): Promise<boolean> {
  const paidListingsEnabled = await getSystemSetting('paidListingsEnabled', false);
  
  console.log('[deductListingPackage] Settings:', { 
    paidListingsEnabled, 
    userId: user.id,
    hasUsedFreeAd: user.hasUsedFreeAd,
    packagesBalance: user.listingPackagesBalance 
  });
  
  if (!paidListingsEnabled) {
    console.log('[deductListingPackage] Paid listings disabled, allowing free listing');
    return true; // Безкоштовні оголошення дозволені
  }

  const hasUsedFreeAd = Boolean(user.hasUsedFreeAd);
  const currentPackagesBalance = user.listingPackagesBalance || 0;

  // Перше безкоштовне оголошення
  if (!hasUsedFreeAd) {
    console.log('[deductListingPackage] First free listing, marking as used');
    await prisma.$executeRawUnsafe(
      `UPDATE User SET hasUsedFreeAd = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      user.id
    );
    return true;
  }

  // Перевіряємо баланс пакетів
  if (currentPackagesBalance <= 0) {
    console.error('[deductListingPackage] No packages available:', { userId: user.id, currentPackagesBalance });
    return false; // Немає доступних пакетів
  }

  // Списуємо пакет
  console.log('[deductListingPackage] Deducting package, current balance:', currentPackagesBalance);
  const nowStr = nowSQLite();
  await prisma.$executeRawUnsafe(
    `UPDATE User SET listingPackagesBalance = ?, updatedAt = ? WHERE id = ?`,
    currentPackagesBalance - 1,
    nowStr,
    user.id
  );

  return true;
}

/**
 * Швидко зберігає оригінальні зображення БЕЗ обробки
 * З покращеною обробкою помилок та retry логікою
 * Зберігає файли по 2 одночасно для зменшення навантаження
 */
export async function saveOriginalImages(
  imageFiles: File[]
): Promise<string[]> {
  if (!imageFiles.length || imageFiles[0].size === 0) {
    return [];
  }

  const uploadsDir = join(process.cwd(), 'public', 'listings', 'originals');
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 секунда
  const BATCH_SIZE = 2; // Зберігаємо по 2 файли одночасно
  
  // Фільтруємо файли за розміром
  const validFiles = imageFiles.filter(file => file.size > 0 && file.size <= MAX_FILE_SIZE);
  
  if (validFiles.length === 0) {
    console.warn('[saveOriginalImages] No valid files to save');
    return [];
  }

  // Функція для повторної спроби збереження файлу
  const saveFileWithRetry = async (file: File, index: number): Promise<string | null> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ext = file.type.split('/')[1] || 'jpg';
        const filename = `listing_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filepath = join(uploadsDir, filename);
        
        // Конвертуємо File в Buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        // Зберігаємо з timeout для запобігання зависанню
        await Promise.race([
          writeFile(filepath, buffer, { 
            flag: 'w',
            mode: 0o666
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('File write timeout')), 30000) // 30 секунд
          )
        ]);
        
        console.log(`[saveOriginalImages] Saved file ${index + 1}/${validFiles.length}: ${filename}`);
        return `/listings/originals/${filename}`;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[saveOriginalImages] Attempt ${attempt}/${MAX_RETRIES} failed for file ${file.name}:`, error);
        
        if (attempt < MAX_RETRIES) {
          // Чекаємо перед повторною спробою
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
      }
    }
    
    // Якщо всі спроби невдалі
    console.error(`[saveOriginalImages] Failed to save file ${file.name} after ${MAX_RETRIES} attempts:`, lastError);
    return null;
  };

  // Зберігаємо файли батчами по 2 для зменшення навантаження
  const startTime = Date.now();
  const imageUrls: string[] = [];
  
  for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
    const batch = validFiles.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((file, batchIndex) => 
      saveFileWithRetry(file, i + batchIndex)
    );
    
    const batchResults = await Promise.all(batchPromises);
    const successfulUrls = batchResults.filter((url): url is string => url !== null);
    imageUrls.push(...successfulUrls);
    
    console.log(`[saveOriginalImages] Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${successfulUrls.length}/${batch.length} files saved`);
  }
  
  const totalDuration = Date.now() - startTime;
  
  if (imageUrls.length > 0) {
    console.log(`[saveOriginalImages] Saved ${imageUrls.length}/${validFiles.length} images in ${totalDuration}ms`);
  }
  
  if (imageUrls.length === 0) {
    throw new Error('Failed to save any images. Please try again with smaller files.');
  }
  
  return imageUrls;
}

/**
 * Оптимізує вже збережені оригінальні зображення (асинхронно в фоні)
 * Створює оптимізовані версії для показу в каталозі
 */
export async function optimizeImages(
  originalImageUrls: string[]
): Promise<string[]> {
  if (!originalImageUrls.length) {
    return [];
  }

  const optimizedDir = join(process.cwd(), 'public', 'listings', 'optimized');
  if (!existsSync(optimizedDir)) {
    await mkdir(optimizedDir, { recursive: true });
  }

  const optimizationPromises = originalImageUrls.map(async (url) => {
    try {
      // Отримуємо шлях до оригіналу
      const originalPath = join(process.cwd(), 'public', url);
      
      if (!existsSync(originalPath)) {
        console.warn(`[optimizeImages] Original file not found: ${originalPath}`);
        return url; // Повертаємо оригінальний URL якщо файл не знайдено
      }

      // Читаємо оригінал
      const buffer = await import('fs/promises').then(fs => fs.readFile(originalPath));
      
      // Оптимізуємо: WebP, 1200x1200, якість 75
      const optimizedBuffer = await sharp(buffer)
        .rotate() // Автоматично виправляє орієнтацію
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 4 })
        .toBuffer();

      const filename = `opt_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const filepath = join(optimizedDir, filename);
      
      await writeFile(filepath, optimizedBuffer);
      return `/listings/optimized/${filename}`;
    } catch (error) {
      console.error(`[optimizeImages] Error optimizing ${url}:`, error);
      return url; // Повертаємо оригінальний URL при помилці
    }
  });

  const optimizedUrls = await Promise.all(optimizationPromises);
  console.log(`[optimizeImages] Optimized ${optimizedUrls.length} images`);
  return optimizedUrls;
}

/**
 * DEPRECATED: Стара функція - використовуйте saveOriginalImages + optimizeImages
 * Обробляє та завантажує зображення
 * Оптимізовано для швидкої паралельної обробки
 */
export async function processAndUploadImages(
  imageFiles: File[],
  existingImages?: string[]
): Promise<string[]> {
  if (!imageFiles.length || imageFiles[0].size === 0) {
    return existingImages || [];
  }

  const uploadsDir = join(process.cwd(), 'public', 'listings');
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
  
  // Фільтруємо файли за розміром перед обробкою
  const validFiles = imageFiles.filter(file => file.size > 0 && file.size <= MAX_FILE_SIZE);
  
  if (validFiles.length === 0) {
    console.warn('[processAndUploadImages] No valid files to process');
    return existingImages || [];
  }

  // Обробляємо всі фото паралельно для швидкості
  const imageProcessingPromises = validFiles.map(async (file) => {
    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Оптимізована обробка: менший розмір, нижча якість, мінімальний effort для максимальної швидкості
      const optimizedBuffer = await sharp(buffer)
        .rotate() // Автоматично виправляє орієнтацію
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true }) // Зменшено з 1000 до 800 для швидкості
        .webp({ quality: 70, effort: 1 }) // Мінімальний effort (1 замість 3) для швидкості, якість 70 замість 75
        .toBuffer();

      const filename = generateImageFilename();
      const filepath = join(uploadsDir, filename);
      
      await writeFile(filepath, optimizedBuffer);
      return `/listings/${filename}`;
    } catch (error) {
      console.error(`[processAndUploadImages] Error processing file ${file.name}:`, error);
      return null; // Повертаємо null при помилці, фільтруємо пізніше
    }
  });

  // Чекаємо на завершення всіх обробок паралельно
  const imageUrls = (await Promise.all(imageProcessingPromises)).filter((url): url is string => url !== null);
  
  // Якщо всі файли не вдалося обробити, повертаємо існуючі зображення
  if (imageUrls.length === 0 && existingImages) {
    console.warn('[processAndUploadImages] No valid images processed, returning existing images');
    return existingImages;
  }

  return imageUrls;
}

/**
 * Генерує унікальне ім'я файлу зображення
 */
function generateImageFilename(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `listing_${timestamp}_${random}.webp`;
}

/**
 * Парсить існуючі зображення з JSON
 */
export function parseExistingImages(images: string | string[]): string[] {
  if (Array.isArray(images)) {
    return images;
  }
  
  try {
    return typeof images === 'string' ? JSON.parse(images) : [];
  } catch {
    return [];
  }
}

/**
 * Створює нове оголошення зі статусом pending_moderation
 */
export async function createDraftListing(
  userId: number,
  data: ListingFormData,
  imageUrls: string[]
): Promise<number> {
  const now = new Date();
  const createTime = toSQLiteDate(now);
  const expiresTime = toSQLiteDate(addDays(now, 30));
  
  // Використовуємо executeRawUnsafe без executeWithRetry для швидкості
  // executeWithRetry додає затримки, що сповільнює створення
  await prisma.$executeRawUnsafe(
    `INSERT INTO Listing (
      userId, title, description, price, currency, isFree, category, subcategory,
      condition, location, images, status, moderationStatus, expiresAt, createdAt, updatedAt, publishedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_moderation', 'pending', ?, ?, ?, NULL)`,
    userId,
    data.title,
    data.description,
    data.price,
    data.currency,
    data.isFree ? 1 : 0,
    data.category,
    data.subcategory || null,
    data.condition || null,
    data.location,
    JSON.stringify(imageUrls),
    expiresTime,
    createTime,
    createTime
  );

  // Отримуємо ID створеного оголошення
  const result = await prisma.$queryRawUnsafe(
    `SELECT id FROM Listing WHERE userId = ? ORDER BY id DESC LIMIT 1`,
    userId
  ) as Array<{ id: number }>;

  return result[0]?.id || 0;
}

/**
 * Оновлює оголошення до статусу pending_moderation (для реактивації)
 */
export async function updateListingToDraft(
  listingId: number,
  data: ListingFormData,
  imageUrls: string[]
): Promise<void> {
  const now = new Date();
  const nowStr = toSQLiteDate(now);
  const expiresAt = toSQLiteDate(addDays(now, 30));
  
  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `UPDATE Listing SET
        title = ?, description = ?, price = ?, currency = ?, isFree = ?,
        category = ?, subcategory = ?, condition = ?, location = ?,
        status = 'pending_moderation', moderationStatus = 'pending',
        images = ?, expiresAt = ?, updatedAt = ?, rejectionReason = NULL
      WHERE id = ?`,
      data.title,
      data.description,
      data.price,
      data.currency,
      data.isFree ? 1 : 0,
      data.category,
      data.subcategory || null,
      data.condition || null,
      data.location,
      JSON.stringify(imageUrls),
      expiresAt,
      nowStr,
      listingId
    )
  );
}

/**
 * Звичайне оновлення оголошення (з можливістю зміни статусу)
 */
export async function updateListingData(
  listingId: number,
  data: ListingFormData,
  imageUrls: string[],
  status?: string | null
): Promise<void> {
  const updateTime = nowSQLite();
  
  // Якщо статус передано, оновлюємо його
  if (status) {
    // Якщо статус змінюється на 'active', також оновлюємо publishedAt та moderationStatus
    if (status === 'active') {
      // Спочатку отримуємо поточні значення publishedAt та expiresAt
      const currentListing = await prisma.$queryRawUnsafe(
        `SELECT publishedAt, expiresAt FROM Listing WHERE id = ?`,
        listingId
      ) as Array<{ publishedAt: string | null; expiresAt: string | null }>;
      
      const currentPublishedAt = currentListing[0]?.publishedAt;
      const currentExpiresAt = currentListing[0]?.expiresAt;
      
      // Встановлюємо publishedAt якщо він не встановлений
      const publishedAt = currentPublishedAt || updateTime;
      
      // Встановлюємо expiresAt якщо він не встановлений
      const expiresAt = currentExpiresAt || toSQLiteDate(addDays(new Date(), 30));
      
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `UPDATE Listing SET
            title = ?, description = ?, price = ?, currency = ?, isFree = ?,
            category = ?, subcategory = ?, condition = ?, location = ?,
            images = ?, status = ?, moderationStatus = NULL, updatedAt = ?,
            publishedAt = ?, expiresAt = ?
          WHERE id = ?`,
          data.title,
          data.description,
          data.price,
          data.currency,
          data.isFree ? 1 : 0,
          data.category,
          data.subcategory || null,
          data.condition || null,
          data.location,
          JSON.stringify(imageUrls),
          status,
          updateTime,
          publishedAt,
          expiresAt,
          listingId
        )
      );
      
      // Перевіряємо чи оновлення пройшло успішно
      const updatedListing = await prisma.$queryRawUnsafe(
        `SELECT status FROM Listing WHERE id = ?`,
        listingId
      ) as Array<{ status: string }>;
      
      if (updatedListing.length === 0 || updatedListing[0].status !== status) {
        throw new Error(`Failed to update listing status to ${status}`);
      }
    } else {
      // Для інших статусів просто оновлюємо статус
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `UPDATE Listing SET
            title = ?, description = ?, price = ?, currency = ?, isFree = ?,
            category = ?, subcategory = ?, condition = ?, location = ?,
            images = ?, status = ?, updatedAt = ?
          WHERE id = ?`,
          data.title,
          data.description,
          data.price,
          data.currency,
          data.isFree ? 1 : 0,
          data.category,
          data.subcategory || null,
          data.condition || null,
          data.location,
          JSON.stringify(imageUrls),
          status,
          updateTime,
          listingId
        )
      );
      
      // Перевіряємо чи оновлення пройшло успішно
      const updatedListing = await prisma.$queryRawUnsafe(
        `SELECT status FROM Listing WHERE id = ?`,
        listingId
      ) as Array<{ status: string }>;
      
      if (updatedListing.length === 0 || updatedListing[0].status !== status) {
        throw new Error(`Failed to update listing status to ${status}`);
      }
    }
  } else {
    // Якщо статус не передано, оновлюємо тільки дані без зміни статусу
    const imagesJson = JSON.stringify(imageUrls);
    console.log('[updateListingData] Updating listing without status change, images count:', imageUrls.length);
    
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `UPDATE Listing SET
          title = ?, description = ?, price = ?, currency = ?, isFree = ?,
          category = ?, subcategory = ?, condition = ?, location = ?,
          images = ?, updatedAt = ?
        WHERE id = ?`,
        data.title,
        data.description,
        data.price,
        data.currency,
        data.isFree ? 1 : 0,
        data.category,
        data.subcategory || null,
        data.condition || null,
        data.location,
        imagesJson,
        updateTime,
        listingId
      )
    );
    
    // Проверяем что изображения действительно сохранились
    const verifyResult = await prisma.$queryRawUnsafe(
      `SELECT images FROM Listing WHERE id = ?`,
      listingId
    ) as Array<{ images: string }>;
    
    if (verifyResult.length > 0) {
      const savedImages = verifyResult[0].images;
      const parsedSaved = typeof savedImages === 'string' ? JSON.parse(savedImages) : savedImages;
      console.log('[updateListingData] Verified saved images count:', Array.isArray(parsedSaved) ? parsedSaved.length : 'not array');
      
      if (Array.isArray(parsedSaved) && parsedSaved.length !== imageUrls.length) {
        console.error('[updateListingData] WARNING: Image count mismatch! Expected:', imageUrls.length, 'Got:', parsedSaved.length);
      }
    }
  }
}

/**
 * Відправляє оголошення на модерацію
 */
export async function submitListingToModeration(
  listingId: number, 
  isEdit?: boolean
): Promise<void> {
  console.log('[submitListingToModeration] Starting for listing:', listingId, 'isEdit:', isEdit);
  
  // Спочатку перевіряємо, чи є зображення (критично важливо для модерації)
  const listingResult = await prisma.$queryRawUnsafe(
    `SELECT images FROM Listing WHERE id = ?`,
    listingId
  ) as Array<{ images: string }>;
  
  if (listingResult.length === 0) {
    throw new Error(`Listing ${listingId} not found`);
  }
  
  const images = listingResult[0].images;
  let imageArray: string[] = [];
  
  try {
    imageArray = typeof images === 'string' ? JSON.parse(images) : images;
    if (!Array.isArray(imageArray)) {
      imageArray = [];
    }
  } catch (e) {
    console.warn('[submitListingToModeration] Failed to parse images:', e);
    imageArray = [];
  }
  
  if (imageArray.length === 0) {
    console.error('[submitListingToModeration] Listing has no images - cannot send to moderation:', listingId);
    throw new Error('Listing must have images before sending to moderation. Images are critical for content moderation.');
  }
  
  console.log('[submitListingToModeration] Listing has', imageArray.length, 'images - proceeding with moderation');
  
  // Оновлюємо статус, щоб отримати актуальні дані при відправці
  const nowStr = nowSQLite();
  
  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `UPDATE Listing SET status = 'pending_moderation', moderationStatus = 'pending', updatedAt = ? WHERE id = ?`,
      nowStr,
      listingId
    )
  );
  
  console.log('[submitListingToModeration] Status updated to pending_moderation');
  
  // Надсилаємо в групу модерації після оновлення статусу (щоб отримати актуальні дані)
  const { sendListingToModerationGroup } = await import('./sendToModerationGroup');
  const sent = await sendListingToModerationGroup(listingId, 'marketplace', undefined, isEdit).catch(err => {
    console.error('[submitListingToModeration] Failed to send listing to moderation group:', {
      listingId,
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return false;
  });
  
  if (!sent) {
    console.warn('[submitListingToModeration] Failed to send to moderation group, but status was updated');
  } else {
    console.log('[submitListingToModeration] Successfully sent to moderation group');
  }
}

/**
 * Перевіряє чи потребує оголошення реактивації
 * Реактивація потрібна коли статус змінюється на 'active' з будь-якого іншого статусу (крім вже 'active')
 */
export function needsReactivation(currentStatus: string, requestedStatus: string): boolean {
  // Якщо статус вже 'active', реактивація не потрібна
  if (currentStatus === 'active') {
    return false;
  }
  
  // Якщо запитуваний статус 'active', потрібна реактивація (з флоу реклами)
  return requestedStatus === 'active';
}
