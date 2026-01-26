import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  findUserByTelegramIdForListing,
  deductListingPackage,
  saveOriginalImages,
  optimizeImages,
  parseExistingImages,
  updateListingToDraft,
  updateListingData,
  needsReactivation,
  submitListingToModeration,
} from '@/utils/listingHelpers';

interface Listing {
  userId: number;
  images: string;
  status: string;
  moderationStatus: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const formData = await request.formData();

    // Отримуємо дані з форми
    const telegramId = formData.get('telegramId') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const price = formData.get('price') as string;
    const currency = (formData.get('currency') as 'UAH' | 'EUR' | 'USD') || 'UAH';
    const isFree = formData.get('isFree') === 'true';
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string | null;
    const condition = formData.get('condition') as string | null;
    const location = formData.get('location') as string;
    const requestedStatus = formData.get('status') as string | null;

    // Знаходимо користувача
    const user = await findUserByTelegramIdForListing(telegramId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Отримуємо оголошення
    const listings = await prisma.$queryRawUnsafe(
      `SELECT userId, images, status, moderationStatus FROM Listing WHERE id = ?`,
      listingId
    ) as Listing[];

    if (listings.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const listing = listings[0];

    // Перевіряємо власника
    if (listing.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Забороняємо позначення як продане для оголошень на модерації
    if (requestedStatus === 'sold' && listing.status === 'pending_moderation') {
      return NextResponse.json(
        { error: 'Cannot mark listing as sold while it is pending moderation' },
        { status: 400 }
      );
    }

    // Забороняємо позначення як продане для відхилених оголошень
    if (requestedStatus === 'sold' && listing.status === 'rejected') {
      return NextResponse.json(
        { error: 'Cannot mark rejected listing as sold' },
        { status: 400 }
      );
    }

    // Якщо встановлюється статус 'sold' або 'deactivated' (або 'hidden' для сумісності) - просто оновлюємо, не відправляємо на модерацію
    // Ця перевірка має бути ПЕРШОЮ, щоб уникнути відправки на модерацію
    if (requestedStatus === 'sold' || requestedStatus === 'deactivated' || requestedStatus === 'hidden') {
      console.log('[Update Listing] Updating status to', requestedStatus, '- no moderation needed (early check)');
      
      // Обробляємо зображення
      const imageFiles = formData.getAll('images') as File[];
      const existingImageUrls = formData.getAll('existingImages') as string[];
      
      // Валідація розміру файлів (5 МБ на файл)
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
      const oversizedFiles = imageFiles.filter(file => file.size > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map(f => f.name).join(', ');
        console.error('[Update Listing] Files exceed 5MB limit:', fileNames);
        return NextResponse.json(
          { 
            error: 'File size exceeds limit', 
            details: `The following files exceed 5MB limit: ${fileNames}. Please compress or resize them.` 
          },
          { status: 400 }
        );
      }
      
      // Отримуємо старі зображення
      let existingImages: string[] = [];
      const hasExistingImagesField = formData.has('existingImages');
      
      if (hasExistingImagesField) {
        const validUrls = existingImageUrls.filter(url => url && url.trim() !== '');
        existingImages = validUrls.map(url => {
          if (url.startsWith('/api/images/')) {
            return url.replace('/api/images/', '');
          }
          if (url.startsWith('/listings/')) {
            return url.substring(1);
          }
          if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
              const urlObj = new URL(url);
              const pathname = urlObj.pathname;
              if (pathname.startsWith('/api/images/')) {
                return pathname.replace('/api/images/', '');
              }
              return pathname.substring(1);
            } catch {
              return url;
            }
          }
          return url;
        });
      } else {
        const dbImages = parseExistingImages(listing.images);
        existingImages = dbImages;
      }
      
      const listingData = {
        title,
        description,
        price,
        currency,
        isFree,
        category,
        subcategory,
        condition,
        location,
      };
      
      const imageUrls = existingImages;
      const hasNewImages = imageFiles.length > 0 && imageFiles[0].size > 0;
      
      // Оновлюємо оголошення з новим статусом
      await updateListingData(listingId, listingData, imageUrls, requestedStatus);
      
      // Обробляємо нові зображення асинхронно (якщо є)
      if (hasNewImages) {
        saveOriginalImages(imageFiles).then(async (newOriginalUrls) => {
          if (newOriginalUrls.length > 0) {
            try {
              const { prisma } = await import('@/lib/prisma');
              const finalImageUrls = [...existingImages, ...newOriginalUrls];
              const finalImagesJson = JSON.stringify(finalImageUrls);
              
              await prisma.$executeRawUnsafe(
                `UPDATE Listing SET images = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                finalImagesJson,
                listingId
              );
              console.log('[Update Listing] New original images saved for listing:', listingId, 'total images:', finalImageUrls.length);
              
              // Оптимізуємо нові зображення в фоні
              optimizeImages(newOriginalUrls).then(async (optimizedUrls) => {
                try {
                  const existingOptimized = await prisma.$queryRawUnsafe(
                    `SELECT optimizedImages FROM Listing WHERE id = ?`,
                    listingId
                  ) as Array<{ optimizedImages: string | null }>;
                  
                  let currentOptimized: string[] = [];
                  try {
                    if (existingOptimized[0]?.optimizedImages) {
                      const parsed = typeof existingOptimized[0].optimizedImages === 'string' 
                        ? JSON.parse(existingOptimized[0].optimizedImages) 
                        : existingOptimized[0].optimizedImages;
                      currentOptimized = Array.isArray(parsed) ? parsed : [];
                    }
                  } catch (e) {
                    console.error('[Update Listing] Error parsing optimizedImages:', e);
                    currentOptimized = [];
                  }
                  const finalOptimized = [...currentOptimized, ...optimizedUrls];
                  
                  await prisma.$executeRawUnsafe(
                    `UPDATE Listing SET optimizedImages = ? WHERE id = ?`,
                    JSON.stringify(finalOptimized),
                    listingId
                  );
                  console.log('[Update Listing] Optimized images updated');
                } catch (error) {
                  console.error('[Update Listing] Error updating optimized images:', error);
                }
              });
            } catch (error) {
              console.error('[Update Listing] Error updating listing with new images:', error);
            }
          }
        }).catch((error) => {
          console.error('[Update Listing] Error saving new images asynchronously:', error);
        });
      }
      
      return NextResponse.json({
        success: true,
        message: `Listing status updated to ${requestedStatus}`,
      });
    }

    // Обробляємо зображення
    const imageFiles = formData.getAll('images') as File[];
    const existingImageUrls = formData.getAll('existingImages') as string[];
    
    // Валідація розміру файлів (5 МБ на файл)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
    const oversizedFiles = imageFiles.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ');
      console.error('[Update Listing] Files exceed 5MB limit:', fileNames);
      return NextResponse.json(
        { 
          error: 'File size exceeds limit', 
          details: `The following files exceed 5MB limit: ${fileNames}. Please compress or resize them.` 
        },
        { status: 400 }
      );
    }
    
    // Отримуємо старі зображення з параметра existingImages
    // ВАЖЛИВО: Якщо користувач видалив всі старі фото, existingImageUrls буде порожнім масивом,
    // і ми повинні використовувати саме порожній масив, а не зображення з БД
    let existingImages: string[] = [];
    
    // Перевіряємо, чи передано поле existingImages (навіть якщо порожнє)
    // У FormData можна перевірити наявність поля через has()
    const hasExistingImagesField = formData.has('existingImages');
    
    if (hasExistingImagesField) {
      // Якщо поле передано (навіть якщо порожнє), використовуємо його
      // Це означає, що користувач явно визначив, які зображення залишити
      // Фільтруємо порожні рядки (якщо було передано порожнє поле для індикації видалення всіх фото)
      const validUrls = existingImageUrls.filter(url => url && url.trim() !== '');
      
      console.log('[Update Listing] Received existingImageUrls from request:', existingImageUrls.length, 'items (valid:', validUrls.length, ')');
      
      // Нормалізуємо шляхи - видаляємо /api/images/ префікс якщо є
      existingImages = validUrls.map(url => {
        // Якщо URL починається з /api/images/, видаляємо цей префікс
        if (url.startsWith('/api/images/')) {
          return url.replace('/api/images/', '');
        }
        // Якщо починається з /listings/, залишаємо як є (просто видаляємо початковий слеш)
        if (url.startsWith('/listings/')) {
          return url.substring(1); // Видаляємо початковий слеш
        }
        // Якщо це повний URL, витягуємо шлях
        if (url.startsWith('http://') || url.startsWith('https://')) {
          try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            // Видаляємо /api/images/ префікс якщо є
            if (pathname.startsWith('/api/images/')) {
              return pathname.replace('/api/images/', '');
            }
            // Видаляємо початковий слеш
            return pathname.substring(1);
          } catch {
            return url;
          }
        }
        // Якщо це просто шлях без префіксів, залишаємо як є
        return url;
      });
      
      console.log('[Update Listing] Normalized existing images:', existingImages);
      console.log('[Update Listing] Using existing images from request (explicit):', existingImages.length, 'items');
    } else {
      // Якщо поле взагалі не передано (для сумісності зі старими версіями),
      // використовуємо зображення з БД
      const dbImages = parseExistingImages(listing.images);
      existingImages = dbImages;
      console.log('[Update Listing] existingImages field not provided, using images from DB:', existingImages.length);
    }
    
    const listingData = {
      title,
      description,
      price,
      currency,
      isFree,
      category,
      subcategory,
      condition,
      location,
    };

    // Якщо є нові зображення для обробки, робимо це асинхронно
    // Спочатку оновлюємо основні дані з існуючими зображеннями, потім обробляємо нові в фоні
    const hasNewImages = imageFiles.length > 0 && imageFiles[0].size > 0;
    
    // Якщо немає нових зображень, використовуємо тільки існуючі
    const imageUrls = existingImages;

    // Перевіряємо чи потрібна реактивація (зміна статусу на 'active' з будь-якого іншого статусу)
    if (needsReactivation(listing.status, requestedStatus || '')) {
      console.log('[Update Listing] Reactivating listing from status:', listing.status, 'to:', requestedStatus);

      // Списуємо пакет
      const hasPackage = await deductListingPackage(user);
      if (!hasPackage) {
        return NextResponse.json(
          { error: 'No available listings. Please purchase a package.', needsPackage: true },
          { status: 400 }
        );
      }

      // Оновлюємо дані оголошення з існуючими зображеннями (швидко)
      // Нові зображення обробимо асинхронно
      const now = new Date();
      const nowStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiresAtStr = new Date(expiresAt.getTime() - expiresAt.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
      
      const imagesJson = JSON.stringify(imageUrls);
      console.log('[Update Listing] Saving images JSON (initial):', imagesJson);
      
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET
          title = ?, description = ?, price = ?, currency = ?, isFree = ?,
          category = ?, subcategory = ?, condition = ?, location = ?,
          images = ?, expiresAt = ?, updatedAt = ?, rejectionReason = NULL
        WHERE id = ?`,
        listingData.title,
        listingData.description,
        listingData.price,
        listingData.currency,
        listingData.isFree ? 1 : 0,
        listingData.category,
        listingData.subcategory || null,
        listingData.condition || null,
        listingData.location,
        imagesJson,
        expiresAtStr,
        nowStr,
        listingId
      );

      console.log('[Update Listing] Listing updated, processing new images asynchronously if any');

      // Обробляємо нові зображення асинхронно (якщо є)
      if (hasNewImages) {
        saveOriginalImages(imageFiles).then(async (newOriginalUrls) => {
          if (newOriginalUrls.length > 0) {
            try {
              const { prisma } = await import('@/lib/prisma');
              const finalImageUrls = [...existingImages, ...newOriginalUrls];
              const finalImagesJson = JSON.stringify(finalImageUrls);
              
              await prisma.$executeRawUnsafe(
                `UPDATE Listing SET images = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                finalImagesJson,
                listingId
              );
              console.log('[Update Listing] New original images saved for listing:', listingId, 'total images:', finalImageUrls.length);
              
              // Оптимізуємо нові зображення в фоні
              optimizeImages(newOriginalUrls).then(async (optimizedUrls) => {
                try {
                  const existingOptimized = await prisma.$queryRawUnsafe(
                    `SELECT optimizedImages FROM Listing WHERE id = ?`,
                    listingId
                  ) as Array<{ optimizedImages: string | null }>;
                  
                  let currentOptimized: string[] = [];
                  try {
                    if (existingOptimized[0]?.optimizedImages) {
                      const parsed = typeof existingOptimized[0].optimizedImages === 'string' 
                        ? JSON.parse(existingOptimized[0].optimizedImages) 
                        : existingOptimized[0].optimizedImages;
                      currentOptimized = Array.isArray(parsed) ? parsed : [];
                    }
                  } catch (e) {
                    console.error('[Update Listing] Error parsing optimizedImages:', e);
                    currentOptimized = [];
                  }
                  const finalOptimized = [...currentOptimized, ...optimizedUrls];
                  
                  await prisma.$executeRawUnsafe(
                    `UPDATE Listing SET optimizedImages = ? WHERE id = ?`,
                    JSON.stringify(finalOptimized),
                    listingId
                  );
                  console.log('[Update Listing] Optimized images updated');
                } catch (error) {
                  console.error('[Update Listing] Error updating optimized images:', error);
                }
              });
            } catch (error) {
              console.error('[Update Listing] Error updating listing with new images:', error);
            }
          }
        }).catch((error) => {
          console.error('[Update Listing] Error saving new images asynchronously:', error);
        });
      }

      return NextResponse.json({
        success: true,
        needsPromotionSelection: true,
        listingId,
        message: 'Listing updated, ready for promotion selection',
      });
    }

    // Перевіряємо поточний статус оголошення
    const currentStatus = listing.status;
    
    // Якщо оголошення активне - обов'язково відправляємо на модерацію після редагування
    // Також відправляємо на модерацію для інших статусів (крім pending_moderation, sold, deactivated)
    // Включно з відхиленими оголошеннями (rejected)
    // ВАЖЛИВО: НЕ відправляємо на модерацію, якщо новий статус 'sold' або 'deactivated'
    const isActiveListing = currentStatus === 'active';
    const isRejectedListing = currentStatus === 'rejected';
    
    // Якщо статус змінюється на 'sold' або 'deactivated' (або 'hidden' для сумісності) - не відправляємо на модерацію
    if (requestedStatus === 'sold' || requestedStatus === 'deactivated' || requestedStatus === 'hidden') {
      console.log('[Update Listing] Status change to', requestedStatus, '- skipping moderation check');
      // Цей випадок вже має бути оброблений раніше, але на всяк випадок перевіряємо тут
      await updateListingData(listingId, listingData, imageUrls, requestedStatus);
      
      // Обробляємо нові зображення асинхронно (якщо є)
      if (hasNewImages) {
        saveOriginalImages(imageFiles).then(async (newOriginalUrls) => {
          if (newOriginalUrls.length > 0) {
            try {
              const { prisma } = await import('@/lib/prisma');
              const finalImageUrls = [...existingImages, ...newOriginalUrls];
              const finalImagesJson = JSON.stringify(finalImageUrls);
              
              await prisma.$executeRawUnsafe(
                `UPDATE Listing SET images = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                finalImagesJson,
                listingId
              );
              console.log('[Update Listing] New original images saved for listing:', listingId, 'total images:', finalImageUrls.length);
              
              // Оптимізуємо нові зображення в фоні
              optimizeImages(newOriginalUrls).then(async (optimizedUrls) => {
                try {
                  const existingOptimized = await prisma.$queryRawUnsafe(
                    `SELECT optimizedImages FROM Listing WHERE id = ?`,
                    listingId
                  ) as Array<{ optimizedImages: string | null }>;
                  
                  let currentOptimized: string[] = [];
                  try {
                    if (existingOptimized[0]?.optimizedImages) {
                      const parsed = typeof existingOptimized[0].optimizedImages === 'string' 
                        ? JSON.parse(existingOptimized[0].optimizedImages) 
                        : existingOptimized[0].optimizedImages;
                      currentOptimized = Array.isArray(parsed) ? parsed : [];
                    }
                  } catch (e) {
                    console.error('[Update Listing] Error parsing optimizedImages:', e);
                    currentOptimized = [];
                  }
                  const finalOptimized = [...currentOptimized, ...optimizedUrls];
                  
                  await prisma.$executeRawUnsafe(
                    `UPDATE Listing SET optimizedImages = ? WHERE id = ?`,
                    JSON.stringify(finalOptimized),
                    listingId
                  );
                  console.log('[Update Listing] Optimized images updated');
                } catch (error) {
                  console.error('[Update Listing] Error updating optimized images:', error);
                }
              });
            } catch (error) {
              console.error('[Update Listing] Error updating listing with new images:', error);
            }
          }
        }).catch((error) => {
          console.error('[Update Listing] Error saving new images asynchronously:', error);
        });
      }
      
      return NextResponse.json({
        success: true,
        message: `Listing status updated to ${requestedStatus}`,
      });
    }
    
    const shouldSendToModeration = isActiveListing || isRejectedListing || 
      (currentStatus !== 'pending_moderation' && currentStatus !== 'sold' && currentStatus !== 'deactivated' && !requestedStatus);
    
    if (shouldSendToModeration) {
      console.log('[Update Listing] Listing edited, updating. Current status:', currentStatus);
      
      // Для відхилених оголошень - пропонуємо рекламу перед відправкою на модерацію (як при створенні)
      // Залишаємо статус 'rejected' до вибору реклами, потім змінимо на pending_moderation
      if (isRejectedListing) {
        console.log('[Update Listing] Rejected listing edited - offering promotion selection before moderation');
        
        const { nowSQLite } = await import('@/utils/dateHelpers');
        const nowStr = nowSQLite();
        
        // Оновлюємо дані оголошення, залишаємо статус 'rejected' (не змінюємо до вибору реклами)
        // Очищаємо причину відхилення
        await prisma.$executeRawUnsafe(
          `UPDATE Listing SET
            title = ?, description = ?, price = ?, currency = ?, isFree = ?,
            category = ?, subcategory = ?, condition = ?, location = ?,
            images = ?, rejectionReason = NULL, updatedAt = ?
          WHERE id = ?`,
          listingData.title,
          listingData.description,
          listingData.price,
          listingData.currency,
          listingData.isFree ? 1 : 0,
          listingData.category,
          listingData.subcategory || null,
          listingData.condition || null,
          listingData.location,
          JSON.stringify(imageUrls),
          nowStr,
          listingId
        );
        
        console.log('[Update Listing] Rejected listing updated (status remains rejected), processing images asynchronously');
        
        // Швидко зберігаємо нові зображення (якщо є)
        if (hasNewImages) {
          saveOriginalImages(imageFiles).then(async (newOriginalUrls) => {
            if (newOriginalUrls.length > 0) {
              try {
                const { prisma } = await import('@/lib/prisma');
                const finalImageUrls = [...existingImages, ...newOriginalUrls];
                const finalImagesJson = JSON.stringify(finalImageUrls);
                
                await prisma.$executeRawUnsafe(
                  `UPDATE Listing SET images = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                  finalImagesJson,
                  listingId
                );
                console.log('[Update Listing] New original images saved for rejected listing:', listingId, 'total images:', finalImageUrls.length);
                
                // Оптимізуємо нові зображення в фоні
                optimizeImages(newOriginalUrls).then(async (optimizedUrls) => {
                  try {
                    const existingOptimized = await prisma.$queryRawUnsafe(
                      `SELECT optimizedImages FROM Listing WHERE id = ?`,
                      listingId
                    ) as Array<{ optimizedImages: string | null }>;
                    
                    const currentOptimized = existingOptimized[0]?.optimizedImages 
                      ? JSON.parse(existingOptimized[0].optimizedImages) 
                      : [];
                    const finalOptimized = [...currentOptimized, ...optimizedUrls];
                    
                    await prisma.$executeRawUnsafe(
                      `UPDATE Listing SET optimizedImages = ? WHERE id = ?`,
                      JSON.stringify(finalOptimized),
                      listingId
                    );
                    console.log('[Update Listing] Optimized images updated for rejected listing');
                  } catch (error) {
                    console.error('[Update Listing] Error updating optimized images for rejected listing:', error);
                  }
                });
              } catch (error) {
                console.error('[Update Listing] Error saving images for rejected listing:', error);
              }
            }
          }).catch((error) => {
            console.error('[Update Listing] Error saving images asynchronously for rejected listing:', error);
          });
        }
        
        // Повертаємо needsPromotionSelection: true - клієнт відкриє модальне вікно вибору реклами
        // Після вибору реклами (або пропуску) оголошення буде відправлено на модерацію
        return NextResponse.json({
          success: true,
          needsPromotionSelection: true,
          listingId,
          message: 'Listing updated, ready for promotion selection',
        });
      }
      
      // Для активних та інших оголошень - відправляємо на модерацію одразу (як раніше)
      console.log('[Update Listing] Active/other listing edited, updating and sending to moderation');
      
      await updateListingData(listingId, listingData, imageUrls, 'pending_moderation');
      
      console.log('[Update Listing] Listing updated, processing images and sending to moderation asynchronously');

      // Швидко зберігаємо нові зображення та відправляємо на модерацію асинхронно
      if (hasNewImages) {
        saveOriginalImages(imageFiles).then(async (newOriginalUrls) => {
          if (newOriginalUrls.length > 0) {
            try {
              const { prisma } = await import('@/lib/prisma');
              const finalImageUrls = [...existingImages, ...newOriginalUrls];
              const finalImagesJson = JSON.stringify(finalImageUrls);
              
              // Оновлюємо зображення
              await prisma.$executeRawUnsafe(
                `UPDATE Listing SET images = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                finalImagesJson,
                listingId
              );
              console.log('[Update Listing] New original images saved for listing:', listingId, 'total images:', finalImageUrls.length);
              
              // Оптимізуємо нові зображення в фоні
              optimizeImages(newOriginalUrls).then(async (optimizedUrls) => {
                try {
                  const existingOptimized = await prisma.$queryRawUnsafe(
                    `SELECT optimizedImages FROM Listing WHERE id = ?`,
                    listingId
                  ) as Array<{ optimizedImages: string | null }>;
                  
                  let currentOptimized: string[] = [];
                  try {
                    if (existingOptimized[0]?.optimizedImages) {
                      const parsed = typeof existingOptimized[0].optimizedImages === 'string' 
                        ? JSON.parse(existingOptimized[0].optimizedImages) 
                        : existingOptimized[0].optimizedImages;
                      currentOptimized = Array.isArray(parsed) ? parsed : [];
                    }
                  } catch (e) {
                    console.error('[Update Listing] Error parsing optimizedImages:', e);
                    currentOptimized = [];
                  }
                  const finalOptimized = [...currentOptimized, ...optimizedUrls];
                  
                  await prisma.$executeRawUnsafe(
                    `UPDATE Listing SET optimizedImages = ? WHERE id = ?`,
                    JSON.stringify(finalOptimized),
                    listingId
                  );
                  console.log('[Update Listing] Optimized images updated');
                } catch (error) {
                  console.error('[Update Listing] Error updating optimized images:', error);
                }
              });
              
              // Відправляємо на модерацію після збереження зображень
              // Передаємо isEdit=true щоб додати пометку про редагування
              try {
                const { submitListingToModeration } = await import('@/utils/listingHelpers');
                await submitListingToModeration(listingId, true);
                console.log('[Update Listing] Listing sent to moderation group after images saved');
              } catch (error) {
                console.error('[Update Listing] Error sending to moderation:', error);
              }
            } catch (error) {
              console.error('[Update Listing] Error saving images and sending to moderation:', error);
            }
          }
        }).catch((error) => {
          console.error('[Update Listing] Error saving images asynchronously:', error);
        });
      } else {
        // Якщо немає нових зображень, відправляємо на модерацію одразу
        try {
          await submitListingToModeration(listingId, true);
          console.log('[Update Listing] Listing sent to moderation after edit (no new images)');
        } catch (error) {
          console.error('[Update Listing] Error sending to moderation:', error);
        }
      }
      
      return NextResponse.json({ 
        success: true,
        needsModeration: true,
        message: 'Listing updated and sent to moderation'
      });
    }

    // Звичайне оновлення без реактивації (для draft або якщо вказано конкретний статус)
    await updateListingData(listingId, listingData, imageUrls, requestedStatus || undefined);

    // Швидко зберігаємо нові зображення асинхронно (якщо є)
    if (hasNewImages) {
      saveOriginalImages(imageFiles).then(async (newOriginalUrls) => {
        if (newOriginalUrls.length > 0) {
          try {
            const { prisma } = await import('@/lib/prisma');
            const finalImageUrls = [...existingImages, ...newOriginalUrls];
            const finalImagesJson = JSON.stringify(finalImageUrls);
            
            await prisma.$executeRawUnsafe(
              `UPDATE Listing SET images = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
              finalImagesJson,
              listingId
            );
            console.log('[Update Listing] New original images saved for listing:', listingId, 'total images:', finalImageUrls.length);
            
            // Оптимізуємо нові зображення в фоні
            optimizeImages(newOriginalUrls).then(async (optimizedUrls) => {
              try {
                const existingOptimized = await prisma.$queryRawUnsafe(
                  `SELECT optimizedImages FROM Listing WHERE id = ?`,
                  listingId
                ) as Array<{ optimizedImages: string | null }>;
                
                const currentOptimized = existingOptimized[0]?.optimizedImages 
                  ? JSON.parse(existingOptimized[0].optimizedImages) 
                  : [];
                const finalOptimized = [...currentOptimized, ...optimizedUrls];
                
                await prisma.$executeRawUnsafe(
                  `UPDATE Listing SET optimizedImages = ? WHERE id = ?`,
                  JSON.stringify(finalOptimized),
                  listingId
                );
                console.log('[Update Listing] Optimized images updated');
              } catch (error) {
                console.error('[Update Listing] Error updating optimized images:', error);
              }
            });
          } catch (error) {
            console.error('[Update Listing] Error updating listing with new images:', error);
          }
        }
      }).catch((error) => {
        console.error('[Update Listing] Error saving images asynchronously:', error);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // М'яка обробка ECONNRESET - якщо з'єднання розірвалось, але оголошення могло оновитися
    const isConnectionReset = (error as any)?.code === 'ECONNRESET' || 
                              (error as any)?.message?.includes('aborted') ||
                              (error as any)?.message?.includes('ECONNRESET');
    
    if (isConnectionReset) {
      console.warn('[Update Listing] Connection reset (ECONNRESET) - listing may have been updated despite connection error');
      // Повертаємо успішну відповідь, оскільки оголошення могло оновитися
      return NextResponse.json({
        success: true,
        message: 'Listing may have been updated. Please check your listings.',
        warning: 'Connection was interrupted, but listing update may have completed.',
      }, { status: 200 });
    }
    
    console.error('[Update Listing] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update listing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
