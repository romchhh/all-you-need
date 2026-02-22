import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { toSQLiteDate, addDays } from '@/utils/dateHelpers';
import { mkdir, readdir, unlink, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
// @ts-ignore - adm-zip не має типів
import AdmZip from 'adm-zip';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 хвилин

// Збільшуємо обмеження розміру тіла запиту для великих ZIP файлів
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

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
  const startTime = Date.now();
  console.log('[Import] ===== Starting import process =====');
  console.log('[Import] Request headers:', {
    'content-type': request.headers.get('content-type'),
    'content-length': request.headers.get('content-length'),
  });
  
  // Перевірка авторизації адміна
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      console.log('[Import] Unauthorized access attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.log('[Import] Admin authenticated');
  } catch (authError) {
    console.error('[Import] Auth check error:', authError);
    return NextResponse.json(
      { error: 'Authentication error', details: authError instanceof Error ? authError.message : 'Unknown' },
      { status: 500 }
    );
  }

  const tempDir = join(process.cwd(), 'temp', 'import');
  const uploadsDir = join(process.cwd(), 'public', 'listings', 'originals');
  let zipExtractedPath: string | null = null;

  try {
    console.log('[Import] Creating directories...');
    // Створюємо тимчасову директорію
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }
    console.log('[Import] Directories created');

    console.log('[Import] Reading form data...');
    let formData: FormData;
    try {
      formData = await request.formData();
      console.log('[Import] FormData read successfully');
    } catch (formDataError) {
      console.error('[Import] Error reading FormData:', formDataError);
      throw new Error(`Помилка читання FormData: ${formDataError instanceof Error ? formDataError.message : 'Unknown error'}`);
    }
    
    const jsonFile = formData.get('json') as File;
    const zipFile = formData.get('zip') as File | null;

    console.log('[Import] Files received:', {
      jsonFile: jsonFile ? `${jsonFile.name} (${(jsonFile.size / 1024).toFixed(2)} KB)` : 'none',
      zipFile: zipFile ? `${zipFile.name} (${(zipFile.size / 1024 / 1024).toFixed(2)} MB)` : 'none'
    });

    if (!jsonFile) {
      console.error('[Import] JSON file not provided');
      return NextResponse.json(
        { error: 'JSON файл не надано' },
        { status: 400 }
      );
    }

    // Перевіряємо розмір ZIP файлу
    const MAX_ZIP_SIZE = 200 * 1024 * 1024; // 200 MB
    if (zipFile && zipFile.size > MAX_ZIP_SIZE) {
      console.error('[Import] ZIP file too large:', (zipFile.size / 1024 / 1024).toFixed(2), 'MB');
      return NextResponse.json(
        { 
          error: 'ZIP файл занадто великий',
          details: `Максимальний розмір: 200 MB, ваш файл: ${(zipFile.size / 1024 / 1024).toFixed(2)} MB`
        },
        { status: 400 }
      );
    }

    // Читаємо JSON файл
    console.log('[Import] Reading JSON file...');
    const jsonText = await jsonFile.text();
    console.log('[Import] JSON file read, length:', jsonText.length);
    
    let listings: ImportListing[];
    try {
      listings = JSON.parse(jsonText);
      console.log('[Import] JSON parsed successfully, listings count:', listings.length);
    } catch (error) {
      console.error('[Import] JSON parse error:', error);
      return NextResponse.json(
        { error: 'Невірний формат JSON файлу', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 }
      );
    }

    if (!Array.isArray(listings)) {
      console.error('[Import] JSON is not an array');
      return NextResponse.json(
        { error: 'JSON повинен містити масив оголошень' },
        { status: 400 }
      );
    }

    // Розархівуємо ZIP якщо він є
    if (zipFile) {
      console.log('[Import] Starting ZIP extraction...');
      zipExtractedPath = join(tempDir, `extracted_${Date.now()}`);
      await mkdir(zipExtractedPath, { recursive: true });
      console.log('[Import] Extraction directory created:', zipExtractedPath);

      try {
        // Зберігаємо ZIP файл тимчасово
        console.log('[Import] Reading ZIP file buffer...');
        let zipBuffer: Buffer;
        try {
          console.log('[Import] Starting to read ZIP arrayBuffer, this may take a while for large files...');
          const arrayBufferStart = Date.now();
          const arrayBuffer = await zipFile.arrayBuffer();
          const arrayBufferDuration = Date.now() - arrayBufferStart;
          console.log(`[Import] ArrayBuffer read in ${arrayBufferDuration}ms`);
          
          console.log('[Import] Converting to Buffer...');
          zipBuffer = Buffer.from(arrayBuffer);
          console.log('[Import] ZIP buffer created, size:', (zipBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        } catch (bufferError) {
          console.error('[Import] Error reading ZIP buffer:', bufferError);
          console.error('[Import] Buffer error details:', {
            name: bufferError instanceof Error ? bufferError.name : 'Unknown',
            message: bufferError instanceof Error ? bufferError.message : 'Unknown',
            stack: bufferError instanceof Error ? bufferError.stack : 'No stack'
          });
          throw new Error(`Помилка читання ZIP файлу: ${bufferError instanceof Error ? bufferError.message : 'Unknown error'}`);
        }
        
        console.log('[Import] Creating AdmZip instance...');
        let zip: AdmZip;
        try {
          zip = new AdmZip(zipBuffer);
          console.log('[Import] AdmZip instance created');
        } catch (zipInitError) {
          console.error('[Import] Error creating AdmZip instance:', zipInitError);
          throw new Error(`Помилка ініціалізації ZIP: ${zipInitError instanceof Error ? zipInitError.message : 'Unknown error'}`);
        }
        
        console.log('[Import] Extracting ZIP files...');
        try {
          zip.extractAllTo(zipExtractedPath, true);
          console.log(`[Import] ZIP extracted successfully to ${zipExtractedPath}`);
          
          // Перевіряємо скільки файлів розархівовано
          const extractedFiles = await readdir(zipExtractedPath, { recursive: true });
          console.log(`[Import] Extracted ${extractedFiles.length} files from ZIP`);
        } catch (extractError) {
          console.error('[Import] Error extracting ZIP:', extractError);
          throw new Error(`Помилка розархівування ZIP: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
        }
      } catch (zipError) {
        console.error('[Import] ZIP processing error:', zipError);
        throw zipError instanceof Error ? zipError : new Error('Unknown ZIP error');
      }
    } else {
      console.log('[Import] No ZIP file provided');
    }

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    /** Хеші першого фото по оголошеннях — щоб пропускати дублі по фото в межах одного імпорту */
    const seenFirstImageHashes = new Set<string>();

    /** Повертає шлях до файлу зображення в ZIP (або null) */
    async function findImageSourcePath(imageName: string): Promise<string | null> {
      if (!zipExtractedPath) return null;
      const possiblePaths = [
        join(zipExtractedPath, imageName),
        join(zipExtractedPath, imageName.toLowerCase()),
        join(zipExtractedPath, imageName.toUpperCase()),
      ];
      for (const path of possiblePaths) {
        if (existsSync(path)) return path;
      }
      async function findRecursive(dir: string, targetName: string): Promise<string | null> {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = await findRecursive(fullPath, targetName);
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
          // ignore
        }
        return null;
      }
      return findRecursive(zipExtractedPath, imageName);
    }

    console.log(`[Import] Starting to process ${listings.length} listings...`);

    // Обробляємо кожне оголошення
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      
      if ((i + 1) % 10 === 0) {
        console.log(`[Import] Processing listing ${i + 1}/${listings.length}...`);
      }
      
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

        // Дубль у БД: той самий користувач + та сама назва
        const existingByTitle = await prisma.$queryRawUnsafe(
          `SELECT id FROM Listing WHERE userId = ? AND TRIM(title) = TRIM(?) LIMIT 1`,
          user.id,
          listing.title.trim()
        ) as Array<{ id: number }>;
        if (existingByTitle.length > 0) {
          results.skipped++;
          console.log(`[Import] Skipping duplicate (same user+title) listing ${i + 1}: "${listing.title.substring(0, 40)}..."`);
          continue;
        }

        // Дубль по фото: в межах цього імпорту вже було оголошення з таким самим першим фото
        if (listing.images && listing.images.length > 0 && zipExtractedPath) {
          const firstImagePath = await findImageSourcePath(listing.images[0]);
          if (firstImagePath && existsSync(firstImagePath)) {
            const buf = await readFile(firstImagePath);
            const hash = createHash('md5').update(buf).digest('hex');
            if (seenFirstImageHashes.has(hash)) {
              results.skipped++;
              console.log(`[Import] Skipping duplicate (same first photo) listing ${i + 1}`);
              continue;
            }
            seenFirstImageHashes.add(hash);
          }
        }

        // Обробляємо зображення
        const imageUrls: string[] = [];
        if (listing.images && listing.images.length > 0) {
          for (const imageName of listing.images) {
            try {
              const sourcePath = zipExtractedPath ? await findImageSourcePath(imageName) : null;

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

        // Визначаємо isFree та price (якщо price null або порожній — вважаємо договірною)
        const isFree = listing.isFree || listing.price === 'Free' || (typeof listing.price === 'string' && listing.price.toLowerCase().includes('безкоштовно'));
        const price = isFree
          ? 'Free'
          : (listing.price == null || listing.price === '' ? 'Договірна' : listing.price);
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

    const totalDuration = Date.now() - startTime;
    console.log('[Import] ===== Process completed =====');
    console.log('[Import] Results:', {
      success: results.success,
      failed: results.failed,
      skipped: results.skipped,
      total: listings.length,
      duration: `${(totalDuration / 1000).toFixed(2)}s`
    });

    return NextResponse.json({
      success: results.success,
      failed: results.failed,
      skipped: results.skipped,
      errors: results.errors.slice(0, 50), // Обмежуємо кількість помилок
    });
  } catch (error) {
    console.error('[Import] Fatal error:', error);
    console.error('[Import] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      {
        error: 'Помилка імпорту',
        details: error instanceof Error ? error.message : 'Невідома помилка',
      },
      { status: 500 }
    );
  } finally {
    // Очищаємо тимчасові файли
    if (zipExtractedPath && existsSync(zipExtractedPath)) {
      try {
        console.log('[Import] Cleaning up temporary files...');
        await rm(zipExtractedPath, { recursive: true, force: true });
        console.log('[Import] Cleanup completed');
      } catch (cleanupError) {
        console.error('[Import] Cleanup error:', cleanupError);
      }
    }
  }
}
