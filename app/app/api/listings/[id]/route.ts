import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);

    // Використовуємо raw SQL для уникнення проблем з форматом дати
    const listings = await prisma.$queryRawUnsafe(
      `SELECT 
        l.id,
        l.userId,
        l.title,
        l.description,
        l.price,
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

    // Збільшуємо кількість переглядів використовуючи raw SQL для надійності
    const updateResult = await prisma.$executeRawUnsafe(
      `UPDATE Listing SET views = views + 1 WHERE id = ?`,
      listingId
    );
    console.log(`Updated views for listing ${listingId}, affected rows: ${updateResult}`);

    // Записуємо в історію переглядів (якщо таблиця існує)
    try {
      // Спочатку перевіряємо чи існує таблиця, якщо ні - створюємо
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ViewHistory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          listingId INTEGER NOT NULL,
          viewedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          userAgent TEXT,
          ipAddress TEXT,
          FOREIGN KEY (listingId) REFERENCES Listing(id) ON DELETE CASCADE
        )
      `);
      
      // Створюємо індекси якщо їх немає
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_viewhistory_listingId ON ViewHistory(listingId)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_viewhistory_viewedAt ON ViewHistory(viewedAt)
      `);
      
      // Тепер вставляємо запис
      await prisma.$executeRawUnsafe(
        `INSERT INTO ViewHistory (listingId, viewedAt) VALUES (?, ?)`,
        listingId,
        new Date().toISOString()
      );
    } catch (error: any) {
      // Ігноруємо помилки створення історії переглядів
      console.log('ViewHistory creation skipped:', error?.message || error);
    }

    // Отримуємо оновлене значення views після інкременту
    const updatedListing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { views: true },
    });
    console.log(`Listing ${listingId} views after update: ${updatedListing?.views}`);

    // Форматуємо дані
    const createdAt = new Date(listing.createdAt);
      const formattedListing = {
        id: listing.id,
        title: listing.title,
        price: listing.price,
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
        views: updatedListing?.views || listing.views + 1, // Використовуємо оновлене значення
        posted: formatPostedTime(createdAt),
        condition: listing.condition as any,
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

