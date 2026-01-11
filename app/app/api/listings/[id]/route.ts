import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { trackUserActivity } from '@/utils/trackActivity';

// Функція для конвертації старих значень стану в нові
function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  if (condition === 'new') return 'new';
  // Конвертуємо всі старі значення (like_new, good, fair) в 'used'
  return 'used';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Відстежуємо активність користувача
    await trackUserActivity(request);
    
    const { id } = await params;
    const listingId = parseInt(id);
    const searchParams = request.nextUrl.searchParams;
    const viewerId = searchParams.get('viewerId'); // Telegram ID користувача, який переглядає

    // Перевіряємо колонку currency (з кешуванням)
    const { ensureCurrencyColumn } = await import('@/lib/prisma');
    const currencyColumnExists = await ensureCurrencyColumn();

    // Використовуємо raw SQL для уникнення проблем з форматом дати
    const listings = await prisma.$queryRawUnsafe(
      `SELECT 
        l.id,
        l.userId,
        l.title,
        l.description,
        l.price,
        ${currencyColumnExists ? 'l.currency,' : 'NULL as currency,'}
        l.isFree,
        l.category,
        l.subcategory,
        l.condition,
        l.location,
        l.views,
        l.status,
        l.images,
        l.tags,
        l.createdAt,
        u.id as userId,
        CAST(u.telegramId AS INTEGER) as telegramId,
        u.username,
        u.firstName,
        u.lastName,
        u.avatar,
        u.phone
      FROM Listing l
      JOIN User u ON l.userId = u.id
      WHERE l.id = ?`,
      listingId
    ) as Array<{
      id: number;
      userId: number;
      title: string;
      description: string;
      price: string;
      currency: string | null;
      isFree: number;
      category: string;
      subcategory: string | null;
      condition: string | null;
      location: string;
      views: number;
      status: string;
      images: string;
      tags: string | null;
      createdAt: string;
      telegramId: number;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
      phone: string | null;
    }>;

    if (!listings || listings.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listing = listings[0];

    // Рахуємо тільки унікальні перегляди
    if (viewerId) {
      try {
        // Перевіряємо/створюємо таблицю ViewHistory (з кешуванням)
        const { ensureViewHistoryTable } = await import('@/lib/prisma');
        await ensureViewHistoryTable();
        
        // Перевіряємо, чи цей користувач вже переглядав це оголошення (з retry)
        const viewerTelegramId = parseInt(viewerId);
        const { executeWithRetry } = await import('@/lib/prisma');
        
        const existingView = await executeWithRetry(() =>
          prisma.$queryRawUnsafe(
            `SELECT id FROM ViewHistory WHERE listingId = ? AND viewerTelegramId = ? LIMIT 1`,
            listingId,
            viewerTelegramId
          ) as Promise<Array<{ id: number }>>
        );
        
        // Якщо користувач ще не переглядав - додаємо перегляд (з retry)
        if (!existingView || existingView.length === 0) {
          // Додаємо запис в історію переглядів
          await executeWithRetry(() =>
            prisma.$executeRawUnsafe(
              `INSERT INTO ViewHistory (listingId, viewerTelegramId, viewedAt) VALUES (?, ?, ?)`,
              listingId,
              viewerTelegramId,
              new Date().toISOString()
            )
          );
          
          // Збільшуємо кількість переглядів
          await executeWithRetry(() =>
            prisma.$executeRawUnsafe(
              `UPDATE Listing SET views = views + 1 WHERE id = ?`,
              listingId
            )
          );
        }
      } catch (error: any) {
        // Якщо помилка - все одно повертаємо оголошення
        console.error('Error recording view:', error?.message || error);
      }
    }

    // Отримуємо актуальне значення views
    const updatedListing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { views: true },
    });
    const currentViews = updatedListing?.views || listing.views;

    // Форматуємо дані
    const createdAt = new Date(listing.createdAt);
      const formattedListing = {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
        image: JSON.parse(listing.images)[0] || '',
        images: JSON.parse(listing.images),
        seller: {
          name: listing.firstName 
            ? `${listing.firstName} ${listing.lastName || ''}`.trim()
            : listing.username || 'Користувач',
          avatar: listing.avatar || '👤',
          phone: listing.phone || '',
          telegramId: listing.telegramId?.toString() || '',
          username: listing.username || null,
        },
        category: listing.category,
        subcategory: listing.subcategory,
        description: listing.description,
        location: listing.location,
        views: currentViews, // Використовуємо актуальне значення
        posted: formatPostedTime(createdAt),
        createdAt: listing.createdAt,
        condition: normalizeCondition(listing.condition),
        tags: listing.tags ? JSON.parse(listing.tags) : [],
        isFree: listing.isFree === 1,
        status: listing.status || 'active',
      };

    return NextResponse.json(formattedListing);
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}

function formatPostedTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${minutes} хв тому`;
  if (hours < 24) return `${hours} год тому`;
  if (days === 1) return '1 день тому';
  if (days < 7) return `${days} днів тому`;
  return `${Math.floor(days / 7)} тижнів тому`;
}

