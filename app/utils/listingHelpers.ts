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
 * Обробляє та завантажує зображення
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

  const imageUrls: string[] = [];
  
  for (const file of imageFiles) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const optimizedBuffer = await sharp(buffer)
      .rotate() // Автоматично виправляє орієнтацію
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();

    const filename = generateImageFilename();
    const filepath = join(uploadsDir, filename);
    
    await writeFile(filepath, optimizedBuffer);
    imageUrls.push(`/listings/${filename}`);
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
 * Створює нове оголошення зі статусом draft
 */
export async function createDraftListing(
  userId: number,
  data: ListingFormData,
  imageUrls: string[]
): Promise<number> {
  const now = new Date();
  const createTime = toSQLiteDate(now);
  const expiresTime = toSQLiteDate(addDays(now, 30));
  
  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `INSERT INTO Listing (
        userId, title, description, price, currency, isFree, category, subcategory,
        condition, location, images, status, moderationStatus, expiresAt, createdAt, updatedAt, publishedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?, ?, NULL)`,
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
    )
  );

  // Отримуємо ID створеного оголошення
  const result = await prisma.$queryRawUnsafe(
    `SELECT id FROM Listing WHERE userId = ? ORDER BY id DESC LIMIT 1`,
    userId
  ) as Array<{ id: number }>;

  return result[0]?.id || 0;
}

/**
 * Оновлює оголошення до статусу draft (для реактивації)
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
        status = 'draft', moderationStatus = 'pending',
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
        JSON.stringify(imageUrls),
        updateTime,
        listingId
      )
    );
  }
}

/**
 * Відправляє оголошення на модерацію
 */
export async function submitListingToModeration(listingId: number): Promise<void> {
  console.log('[submitListingToModeration] Starting for listing:', listingId);
  
  // Надсилаємо в групу модерації
  const { sendListingToModerationGroup } = await import('./sendToModerationGroup');
  const sent = await sendListingToModerationGroup(listingId, 'marketplace').catch(err => {
    console.error('[submitListingToModeration] Failed to send listing to moderation group:', {
      listingId,
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return false;
  });
  
  if (!sent) {
    console.warn('[submitListingToModeration] Failed to send to moderation group, but continuing with status update');
  } else {
    console.log('[submitListingToModeration] Successfully sent to moderation group');
  }
  
  const nowStr = nowSQLite();
  
  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `UPDATE Listing SET status = 'pending_moderation', moderationStatus = 'pending', updatedAt = ? WHERE id = ?`,
      nowStr,
      listingId
    )
  );
  
  console.log('[submitListingToModeration] Status updated to pending_moderation');
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
