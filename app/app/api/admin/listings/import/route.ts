import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { toSQLiteDate, addDays } from '@/utils/dateHelpers';
import { mkdir, readdir, unlink, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
// @ts-ignore - adm-zip не має типів
import AdmZip from 'adm-zip';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 хвилин

interface ImportListing {
  telegramId: string;
  title: string;
  description: string;
  price: string | null;
  currency: string | null;
  isFree: boolean;
  category: string;
  subcategory: string | null;
  location: string;
  condition: string | null;
  images: string[];
  username?: string;
}

export async function POST(request: NextRequest) {
  // Перевірка авторизації адміна
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const tempDir = join(process.cwd(), 'temp', 'import');
  const uploadsDir = join(process.cwd(), 'public', 'listings', 'originals');
  let zipExtractedPath: string | null = null;

  try {
    // Створюємо тимчасову директорію
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const formData = await request.formData();
    const jsonFile = formData.get('json') as File;
    const zipFile = formData.get('zip') as File | null;

    if (!jsonFile) {
      return NextResponse.json(
        { error: 'JSON файл не надано' },
        { status: 400 }
      );
    }

    // Читаємо JSON файл
    const jsonText = await jsonFile.text();
    let listings: ImportListing[];
    try {
      listings = JSON.parse(jsonText);
    } catch (error) {
      return NextResponse.json(
        { error: 'Невірний формат JSON файлу' },
        { status: 400 }
      );
    }

    if (!Array.isArray(listings)) {
      return NextResponse.json(
        { error: 'JSON повинен містити масив оголошень' },
        { status: 400 }
      );
    }

    // Розархівуємо ZIP якщо він є
    const imageMap = new Map<string, string>(); // filename -> new path
    if (zipFile) {
      zipExtractedPath = join(tempDir, `extracted_${Date.now()}`);
      await mkdir(zipExtractedPath, { recursive: true });

      // Зберігаємо ZIP файл тимчасово
      const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(zipExtractedPath, true);

      console.log(`[Import] Extracted ZIP to ${zipExtractedPath}`);
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Обробляємо кожне оголошення
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      
      try {
        // Валідація обов'язкових полів
        if (!listing.telegramId || !listing.title || !listing.description || !listing.location || !listing.category) {
          throw new Error(`Оголошення ${i + 1}: відсутні обов'язкові поля`);
        }

        // Знаходимо або створюємо користувача
        const telegramIdNum = parseInt(listing.telegramId, 10);
        if (isNaN(telegramIdNum)) {
          throw new Error(`Оголошення ${i + 1}: невірний telegramId`);
        }

        let user = await findUserByTelegramId(telegramIdNum);
        if (!user) {
          // Створюємо користувача якщо його немає
          await prisma.$executeRawUnsafe(
            `INSERT INTO User (telegramId, username, firstName, isActive, createdAt, updatedAt)
             VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
            telegramIdNum,
            listing.username || null,
            listing.username || null
          );
          
          const newUser = await prisma.$queryRawUnsafe(
            `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
            telegramIdNum
          ) as Array<{ id: number }>;
          
          if (newUser.length === 0) {
            throw new Error(`Оголошення ${i + 1}: не вдалося створити користувача`);
          }
          
          user = {
            id: newUser[0].id,
            telegramId: telegramIdNum,
            username: listing.username || null,
            firstName: listing.username || null,
            lastName: null,
            avatar: null,
            balance: 0,
            rating: 5.0,
            reviewsCount: 0,
            listingPackagesBalance: 0,
            hasUsedFreeAd: false,
          };
        }

        // Обробляємо зображення
        const imageUrls: string[] = [];
        if (listing.images && listing.images.length > 0) {
          for (const imageName of listing.images) {
            try {
              let sourcePath: string | null = null;
              
              // Шукаємо файл в розархівованому ZIP
              if (zipExtractedPath) {
                const possiblePaths = [
                  join(zipExtractedPath, imageName),
                  join(zipExtractedPath, imageName.toLowerCase()),
                  join(zipExtractedPath, imageName.toUpperCase()),
                ];

                for (const path of possiblePaths) {
                  if (existsSync(path)) {
                    sourcePath = path;
                    break;
                  }
                }

                // Шукаємо в підпапках (рекурсивно)
                if (!sourcePath) {
                  async function findFileRecursive(dir: string, targetName: string): Promise<string | null> {
                    try {
                      const entries = await readdir(dir, { withFileTypes: true });
                      for (const entry of entries) {
                        const fullPath = join(dir, entry.name);
                        if (entry.isDirectory()) {
                          const found = await findFileRecursive(fullPath, targetName);
                          if (found) return found;
                        } else if (
                          entry.name.toLowerCase() === targetName.toLowerCase() ||
                          entry.name.endsWith(targetName) ||
                          entry.name.includes(targetName)
                        ) {
                          return fullPath;
                        }
                      }
                    } catch {
                      // Ігноруємо помилки
                    }
                    return null;
                  }
                  const found = await findFileRecursive(zipExtractedPath, imageName);
                  if (found) {
                    sourcePath = found;
                  }
                }
              }

              if (!sourcePath || !existsSync(sourcePath)) {
                console.warn(`[Import] Image not found: ${imageName} for listing ${i + 1}`);
                continue;
              }

              // Копіюємо файл в public/listings/originals
              const ext = imageName.split('.').pop() || 'jpg';
              const newFilename = `listing_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
              const destPath = join(uploadsDir, newFilename);

              // Копіюємо файл
              const sourceStream = createReadStream(sourcePath);
              const destStream = createWriteStream(destPath);
              await pipeline(sourceStream, destStream);

              imageUrls.push(`/listings/originals/${newFilename}`);
            } catch (imageError) {
              console.error(`[Import] Error processing image ${imageName}:`, imageError);
              // Продовжуємо навіть якщо зображення не знайдено
            }
          }
        }

        if (imageUrls.length === 0) {
          throw new Error(`Оголошення ${i + 1}: не знайдено жодного зображення`);
        }

        // Визначаємо isFree та price
        const isFree = listing.isFree || listing.price === null || listing.price === 'Free' || listing.price.toLowerCase().includes('безкоштовно');
        const price = isFree ? 'Free' : (listing.price || '0');
        const currency = isFree ? null : (listing.currency || 'EUR');

        // Створюємо оголошення зі статусом "active" (без модерації)
        const now = new Date();
        const createTime = toSQLiteDate(now);
        const expiresTime = toSQLiteDate(addDays(now, 30));

        await prisma.$executeRawUnsafe(
          `INSERT INTO Listing (
            userId, title, description, price, currency, isFree, category, subcategory,
            condition, location, images, status, moderationStatus, expiresAt, createdAt, updatedAt, publishedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'approved', ?, ?, ?, ?)`,
          user.id,
          listing.title,
          listing.description,
          price,
          currency,
          isFree ? 1 : 0,
          listing.category,
          listing.subcategory || null,
          listing.condition || null,
          listing.location,
          JSON.stringify(imageUrls),
          expiresTime,
          createTime,
          createTime,
          createTime // publishedAt = createdAt для активних оголошень
        );

        // Отримуємо ID створеного оголошення
        const result = await prisma.$queryRawUnsafe(
          `SELECT id FROM Listing WHERE userId = ? ORDER BY id DESC LIMIT 1`,
          user.id
        ) as Array<{ id: number }>;

        const listingId = result[0]?.id || 0;
        console.log(`[Import] Created active listing ${listingId} for user ${user.id}`);
        results.success++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
        console.error(`[Import] Error processing listing ${i + 1}:`, errorMessage);
        results.failed++;
        results.errors.push(`Оголошення ${i + 1}: ${errorMessage}`);
      }
    }

    // Очищаємо тимчасові файли
    if (zipExtractedPath && existsSync(zipExtractedPath)) {
      try {
        await rm(zipExtractedPath, { recursive: true, force: true });
      } catch {
        // Ігноруємо помилки очищення
      }
    }

    return NextResponse.json({
      success: results.success,
      failed: results.failed,
      errors: results.errors.slice(0, 50), // Обмежуємо кількість помилок
    });
  } catch (error) {
    console.error('[Import] Fatal error:', error);
    return NextResponse.json(
      {
        error: 'Помилка імпорту',
        details: error instanceof Error ? error.message : 'Невідома помилка',
      },
      { status: 500 }
    );
  }
}
