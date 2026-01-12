import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';
import { nowSQLite, addDays, toSQLiteDate } from '@/utils/dateHelpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const listingId = parseInt(id, 10);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { error: 'Invalid listing ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    const validStatuses = ['pending', 'approved', 'active', 'sold', 'expired', 'hidden'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Оновлюємо статус
    const nowStr = nowSQLite();
    
    // Якщо статус змінюється на 'active', також оновлюємо publishedAt та moderationStatus
    if (status === 'active') {
      // Спочатку отримуємо поточні значення publishedAt та expiresAt
      const currentListing = await prisma.$queryRawUnsafe(
        `SELECT publishedAt, expiresAt FROM Listing WHERE id = ?`,
        listingId
      ) as Array<{ publishedAt: string | null; expiresAt: string | null }>;
      
      if (currentListing.length === 0) {
        return NextResponse.json(
          { error: 'Listing not found' },
          { status: 404 }
        );
      }
      
      const currentPublishedAt = currentListing[0]?.publishedAt;
      const currentExpiresAt = currentListing[0]?.expiresAt;
      
      // Встановлюємо publishedAt якщо він не встановлений
      const publishedAt = currentPublishedAt || nowStr;
      
      // Встановлюємо expiresAt якщо він не встановлений
      const expiresAt = currentExpiresAt || toSQLiteDate(addDays(new Date(), 30));
      
      const result = await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `UPDATE Listing 
           SET status = ?, 
               moderationStatus = NULL,
               updatedAt = ?,
               publishedAt = ?,
               expiresAt = ?
           WHERE id = ?`,
          status,
          nowStr,
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
        return NextResponse.json(
          { error: 'Failed to update listing status' },
          { status: 500 }
        );
      }
    } else {
      // Для інших статусів просто оновлюємо статус
      const result = await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `UPDATE Listing 
           SET status = ?, 
               updatedAt = ? 
           WHERE id = ?`,
          status,
          nowStr,
          listingId
        )
      );
      
      // Перевіряємо чи оновлення пройшло успішно
      const updatedListing = await prisma.$queryRawUnsafe(
        `SELECT status FROM Listing WHERE id = ?`,
        listingId
      ) as Array<{ status: string }>;
      
      if (updatedListing.length === 0 || updatedListing[0].status !== status) {
        return NextResponse.json(
          { error: 'Failed to update listing status' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error updating listing status:', error);
    return NextResponse.json(
      { error: 'Failed to update listing status' },
      { status: 500 }
    );
  }
}
