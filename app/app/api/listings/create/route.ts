import { NextRequest, NextResponse } from 'next/server';
import {
  findUserByTelegramIdForListing,
  deductListingPackage,
  processAndUploadImages,
  createDraftListing,
} from '@/utils/listingHelpers';

export async function POST(request: NextRequest) {
  try {
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
    const images = formData.getAll('images') as File[];

    console.log('[Create Listing] Request data:', {
      telegramId,
      title,
      description: description?.substring(0, 50),
      location,
      category,
      imagesCount: images.length,
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

    // Знаходимо користувача
    const user = await findUserByTelegramIdForListing(telegramId);
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

    console.log('[Create Listing] Package deducted successfully');

    // Обробляємо зображення
    const imageUrls = await processAndUploadImages(images);

    // Створюємо оголошення зі статусом draft
    const listingId = await createDraftListing(
      user.id,
      { title, description, price, currency, isFree, category, subcategory, condition, location },
      imageUrls
    );

    return NextResponse.json({
      success: true,
      message: 'Listing created successfully',
      listingId,
      needsPromotionSelection: true,
    });
  } catch (error) {
    console.error('[Create Listing] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create listing', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
