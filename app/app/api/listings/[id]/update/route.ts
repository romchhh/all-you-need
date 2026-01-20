import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  findUserByTelegramIdForListing,
  deductListingPackage,
  processAndUploadImages,
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
    
    // Отримуємо старі зображення або з параметра existingImages, або з БД
    let existingImages: string[] = [];
    
    // Сначала получаем изображения из БД для сравнения
    const dbImages = parseExistingImages(listing.images);
    console.log('[Update Listing] Images from DB:', dbImages);
    
    if (existingImageUrls.length > 0) {
      // Якщо передано existingImages, використовуємо їх (в правильному порядку)
      console.log('[Update Listing] Received existingImageUrls from request:', existingImageUrls);
      
      // Нормалізуємо шляхи - видаляємо /api/images/ префікс якщо є
      existingImages = existingImageUrls.map(url => {
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
      console.log('[Update Listing] Using existing images from request:', existingImages.length);
    } else {
      // Інакше використовуємо зображення з БД
      existingImages = dbImages;
      console.log('[Update Listing] Using existing images from DB:', existingImages.length);
    }
    
    // Обробляємо нові файли
    const newImageUrls = await processAndUploadImages(imageFiles);
    console.log('[Update Listing] Processed new images:', newImageUrls.length);
    console.log('[Update Listing] New image URLs:', newImageUrls);
    
    // Об'єднуємо старі та нові зображення (важливо: спочатку старі в правильному порядку, потім нові)
    const imageUrls = [...existingImages, ...newImageUrls];
    console.log('[Update Listing] Final image URLs count:', imageUrls.length);
    console.log('[Update Listing] Final image URLs (all):', imageUrls);
    console.log('[Update Listing] Will save to DB as JSON:', JSON.stringify(imageUrls));

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

      // Оновлюємо дані оголошення, але НЕ змінюємо статус - залишаємо поточний статус
      // Статус буде змінено тільки після вибору реклами (або пропуску) на pending_moderation
      const now = new Date();
      const nowStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiresAtStr = new Date(expiresAt.getTime() - expiresAt.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
      
      const imagesJson = JSON.stringify(imageUrls);
      console.log('[Update Listing] Saving images JSON:', imagesJson);
      
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

      // Проверяем что изображения действительно сохранились
      const verifyResult = await prisma.$queryRawUnsafe(
        `SELECT images FROM Listing WHERE id = ?`,
        listingId
      ) as Array<{ images: string }>;
      
      if (verifyResult.length > 0) {
        const savedImages = verifyResult[0].images;
        console.log('[Update Listing] Verified saved images:', savedImages);
        const parsedSaved = typeof savedImages === 'string' ? JSON.parse(savedImages) : savedImages;
        console.log('[Update Listing] Parsed saved images count:', Array.isArray(parsedSaved) ? parsedSaved.length : 'not array');
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
    // Також відправляємо на модерацію для інших статусів (крім draft та pending_moderation)
    const isActiveListing = currentStatus === 'active';
    const shouldSendToModeration = isActiveListing || 
      (currentStatus !== 'draft' && currentStatus !== 'pending_moderation' && !requestedStatus);
    
    if (shouldSendToModeration) {
      console.log('[Update Listing] Listing edited, sending to moderation. Current status:', currentStatus);
      
      // Оновлюємо дані оголошення зі статусом pending_moderation
      await updateListingData(listingId, listingData, imageUrls, 'pending_moderation');
      
      // Відправляємо на модерацію після оновлення БД (щоб отримати актуальні дані)
      // Передаємо isEdit=true щоб додати пометку про редагування
      try {
        await submitListingToModeration(listingId, true);
        console.log('[Update Listing] Active listing sent to moderation after edit');
      } catch (error) {
        console.error('[Update Listing] Error sending to moderation:', error);
        // Продовжуємо виконання, навіть якщо відправка не вдалася
      }
      
      return NextResponse.json({ 
        success: true,
        needsModeration: true,
        message: 'Listing updated and sent to moderation'
      });
    }

    // Звичайне оновлення без реактивації (для draft або якщо вказано конкретний статус)
    await updateListingData(listingId, listingData, imageUrls, requestedStatus || undefined);

    // Проверяем что изображения действительно обновились
    const verifyResult = await prisma.$queryRawUnsafe(
      `SELECT images FROM Listing WHERE id = ?`,
      listingId
    ) as Array<{ images: string }>;
    
    if (verifyResult.length > 0) {
      const savedImages = verifyResult[0].images;
      const parsedSaved = typeof savedImages === 'string' ? JSON.parse(savedImages) : savedImages;
      console.log('[Update Listing] Final verification - saved images count:', Array.isArray(parsedSaved) ? parsedSaved.length : 'not array');
      
      if (Array.isArray(parsedSaved) && parsedSaved.length !== imageUrls.length) {
        console.error('[Update Listing] WARNING: Image count mismatch after update! Expected:', imageUrls.length, 'Got:', parsedSaved.length);
      }
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
