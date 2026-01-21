import { NextRequest, NextResponse } from 'next/server';
import {
  findUserByTelegramIdForListing,
  deductListingPackage,
  saveOriginalImages,
  optimizeImages,
  createDraftListing,
  submitListingToModeration,
} from '@/utils/listingHelpers';
import { prisma } from '@/lib/prisma';

// Збільшуємо максимальний час виконання до 5 хвилин для обробки великих файлів
export const maxDuration = 300; // 5 хвилин
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let savedImageUrls: string[] = [];
  let user: any = null;
  let packageDeducted = false;
  
  try {
    console.log('[Create Listing API] Starting request processing');
    
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
    const location = formData.get('location') as string;
    const condition = formData.get('condition') as string;
    const allImages = formData.getAll('images') as File[];
    const MAX_PHOTOS = 10;

    // Обмежуємо кількість фото до максимуму
    const images = allImages.slice(0, MAX_PHOTOS);
    
    if (allImages.length > MAX_PHOTOS) {
      console.warn(`[Create Listing] Received ${allImages.length} images, limiting to ${MAX_PHOTOS}`);
    }

    // Перевіряємо загальний розмір файлів
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    const totalSizeMB = totalSize / 1024 / 1024;
    console.log(`[Create Listing API] Total upload size: ${totalSizeMB.toFixed(2)}MB`);
    
    if (totalSizeMB > 40) { // Обмежуємо до 40MB загального розміру
      return NextResponse.json(
        { error: 'Total file size exceeds 40MB. Please reduce image quality or count.' },
        { status: 400 }
      );
    }

    console.log('[Create Listing] Request data:', {
      telegramId,
      title,
      description: description?.substring(0, 50),
      location,
      category,
      imagesCount: images.length,
      originalImagesCount: allImages.length,
    });

    // Валідація
    if (!telegramId || !title || !description || !location || !category) {
      const missingFields = [];
      if (!telegramId) missingFields.push('telegramId');
      if (!title) missingFields.push('title');
      if (!description) missingFields.push('description');
      if (!location) missingFields.push('location');
      if (!category) missingFields.push('category');
      
      console.error('[Create Listing] Missing required fields:', missingFields);
      return NextResponse.json(
        { error: 'Missing required fields', missingFields },
        { status: 400 }
      );
    }

    if (images.length === 0) {
      console.error('[Create Listing] No images provided');
      return NextResponse.json(
        { error: 'At least one image is required' },
        { status: 400 }
      );
    }

    // Валідація розміру файлів (5 МБ на файл)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
    const oversizedFiles = images.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ');
      console.error('[Create Listing] Files exceed 5MB limit:', fileNames);
      return NextResponse.json(
        { 
          error: 'File size exceeds limit', 
          details: `The following files exceed 5MB limit: ${fileNames}. Please compress or resize them.` 
        },
        { status: 400 }
      );
    }

    // Знаходимо користувача
    user = await findUserByTelegramIdForListing(telegramId);
    if (!user) {
      console.error('[Create Listing] User not found:', telegramId);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('[Create Listing] User found:', { userId: user.id, hasUsedFreeAd: user.hasUsedFreeAd, packagesBalance: user.listingPackagesBalance });

    // Перевіряємо та списуємо пакет
    const hasPackage = await deductListingPackage(user);
    if (!hasPackage) {
      console.error('[Create Listing] No available packages:', { userId: user.id });
      return NextResponse.json(
        { error: 'No available listings. Please purchase a package.' },
        { status: 400 }
      );
    }

    packageDeducted = true;
    console.log('[Create Listing] Package deducted successfully');

    // Зберігаємо оригінальні зображення з retry логікою
    try {
      const saveStartTime = Date.now();
      savedImageUrls = await saveOriginalImages(images);
      const saveDuration = Date.now() - saveStartTime;
      console.log(`[Create Listing API] Images saved successfully in ${saveDuration}ms:`, savedImageUrls.length);
    } catch (imageError) {
      console.error('[Create Listing API] Failed to save images:', imageError);
      
      // Повертаємо пакет назад якщо не вдалося зберегти зображення
      if (packageDeducted && user) {
        await prisma.$executeRawUnsafe(
          `UPDATE User SET listingPackagesBalance = listingPackagesBalance + 1 WHERE id = ?`,
          user.id
        );
        console.log('[Create Listing API] Package returned due to image save failure');
      }
      
      return NextResponse.json(
        { error: 'Failed to save images. Please try again with smaller files or fewer images.' },
        { status: 500 }
      );
    }

    // Створюємо оголошення
    let listingId: number;
    try {
      listingId = await createDraftListing(
        user.id,
        { title, description, price, currency, isFree, category, subcategory, condition, location },
        savedImageUrls
      );
      console.log('[Create Listing API] Listing created with ID:', listingId);
    } catch (createError) {
      console.error('[Create Listing API] Failed to create listing:', createError);
      
      // Повертаємо пакет назад
      if (packageDeducted && user) {
        await prisma.$executeRawUnsafe(
          `UPDATE User SET listingPackagesBalance = listingPackagesBalance + 1 WHERE id = ?`,
          user.id
        );
        console.log('[Create Listing API] Package returned due to listing creation failure');
      }
      
      return NextResponse.json(
        { error: 'Failed to create listing. Please try again.' },
        { status: 500 }
      );
    }

    // Запускаємо оптимізацію та відправку на модерацію асинхронно
    // Не чекаємо на завершення, щоб одразу повернути відповідь клієнту
    optimizeImages(savedImageUrls).then(async (optimizedUrls) => {
      if (optimizedUrls.length > 0) {
        try {
          const { prisma } = await import('@/lib/prisma');
          
          // Зберігаємо оптимізовані версії в окремому полі
          // Оригінали залишаються в images для fallback
          await prisma.$executeRawUnsafe(
            `UPDATE Listing SET optimizedImages = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            JSON.stringify(optimizedUrls),
            listingId
          );
          console.log('[Create Listing] Optimized images saved for listing:', listingId, 'count:', optimizedUrls.length);
          
          // Перевіряємо статус оголошення та чи немає очікуваної оплати картою
          // Відправляємо на модерацію тільки якщо:
          // 1. Статус 'pending_moderation'
          // 2. Немає pending PromotionPurchase з paymentMethod = 'direct' (очікування оплати картою)
          // Перевіряємо кілька разів з затримкою, щоб дати час створити запис про оплату картою
          let shouldSendToModeration = false;
          let retryCount = 0;
          const maxRetries = 5; // Перевіряємо 5 разів з інтервалом 1 секунда
          
          while (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Затримка 1 секунда між перевірками
            
            const listingStatus = await prisma.$queryRawUnsafe(
              `SELECT status FROM Listing WHERE id = ?`,
              listingId
            ) as Array<{ status: string }>;
            
            // Перевіряємо, чи немає очікуваної оплати картою для цього оголошення
            const pendingCardPayment = await prisma.$queryRawUnsafe(
              `SELECT id FROM PromotionPurchase WHERE listingId = ? AND status = 'pending' AND paymentMethod = 'direct' LIMIT 1`,
              listingId
            ) as Array<{ id: number }>;
            
            const hasPendingPayment = pendingCardPayment.length > 0;
            
            if (listingStatus.length > 0 && listingStatus[0].status === 'pending_moderation') {
              if (hasPendingPayment) {
                console.log(`[Create Listing] Listing has pending card payment (retry ${retryCount + 1}/${maxRetries}) - skipping moderation submission until payment is confirmed`);
                retryCount++;
                continue; // Продовжуємо перевірку
              } else {
                // Немає pending оплати, можна відправляти на модерацію
                shouldSendToModeration = true;
                console.log(`[Create Listing] No pending payment found (retry ${retryCount + 1}/${maxRetries}), will send to moderation`);
                break;
              }
            } else {
              console.log('[Create Listing] Listing status is not pending_moderation:', listingStatus[0]?.status, '- skipping moderation submission');
              break;
            }
          }
          
          if (shouldSendToModeration) {
            console.log('[Create Listing] Listing status is pending_moderation, sending to moderation group after images processed');
            
            // Відправляємо на модерацію після обробки зображень
            try {
              await submitListingToModeration(listingId);
              console.log('[Create Listing] Listing sent to moderation group successfully after images processing');
            } catch (error) {
              console.error('[Create Listing] Error sending listing to moderation:', error);
              // Продовжуємо виконання навіть якщо відправка не вдалася
            }
          } else if (retryCount >= maxRetries) {
            console.log('[Create Listing] Max retries reached, listing may have pending payment - skipping moderation submission');
          }
        } catch (error) {
          console.error('[Create Listing] Error saving optimized images:', error);
        }
      } else {
        console.warn('[Create Listing] No images were optimized for listing:', listingId);
      }
    }).catch((error) => {
      console.error('[Create Listing] Error optimizing images asynchronously:', error);
    });

    // Одразу повертаємо успішну відповідь
    return NextResponse.json({
      success: true,
      listingId,
      message: 'Listing created successfully. Images are being optimized in the background.',
      needsPromotionSelection: true,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[Create Listing API] Unexpected error:', error);
    
    // Повертаємо пакет назад при будь-якій помилці (якщо він був списаний)
    if (packageDeducted && user) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE User SET listingPackagesBalance = listingPackagesBalance + 1 WHERE id = ?`,
          user.id
        );
        console.log('[Create Listing API] Package returned due to error');
      } catch (refundError) {
        console.error('[Create Listing API] Failed to refund package:', refundError);
      }
    }
    
    // Логуємо детальну інформацію про помилку
    const isConnectionReset = error?.code === 'ECONNRESET' || 
                              error?.message?.includes('aborted') ||
                              error?.message?.includes('ECONNRESET');
    
    if (isConnectionReset) {
      console.error('[Create Listing API] Connection reset - listing may have been created despite error');
      
      return NextResponse.json(
        {
          error: 'Connection was interrupted. Please check your listings to see if it was created.',
          code: 'CONNECTION_RESET'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
