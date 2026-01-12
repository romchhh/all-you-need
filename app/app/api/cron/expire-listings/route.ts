import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendListingExpiredNotification } from '@/utils/telegramNotifications';
import { executeInClause } from '@/utils/dbHelpers';

// Цей API endpoint викликається cron job'ом для деактивації закінчених оголошень
export async function POST(request: NextRequest) {
  try {
    // Перевіряємо секретний ключ для захисту endpoint'а
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();

    // Знаходимо всі активні оголошення, у яких закінчився термін дії
    const expiredListings = await prisma.$queryRawUnsafe(
      `SELECT id, title, userId FROM Listing 
       WHERE status = 'active' 
       AND datetime(expiresAt) <= datetime(?)
       AND expiresAt IS NOT NULL`,
      now
    ) as Array<{ id: number; title: string; userId: number }>;

    if (expiredListings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired listings found',
        deactivated: 0,
      });
    }

    // Деактивуємо закінчені оголошення - безпечно через helper
    const listingIds = expiredListings.map(l => l.id);
    await executeInClause(
      `UPDATE Listing 
       SET status = 'expired', 
           updatedAt = datetime('now')
       WHERE id IN (?)`,
      listingIds
    );

    // Надсилаємо повідомлення користувачам про деактивацію
    const notificationPromises = expiredListings.map(async (listing) => {
      try {
        const users = await prisma.$queryRawUnsafe(
          `SELECT CAST(telegramId AS INTEGER) as telegramId FROM User WHERE id = ?`,
          listing.userId
        ) as Array<{ telegramId: number }>;
        
        if (users[0]) {
          await sendListingExpiredNotification(
            users[0].telegramId,
            listing.title,
            listing.id
          );
        }
      } catch (error) {
        console.error(`Error notifying user for listing ${listing.id}:`, error);
      }
    });

    // Відправляємо всі повідомлення паралельно
    await Promise.allSettled(notificationPromises);

    console.log(`Deactivated ${expiredListings.length} expired listings`);

    return NextResponse.json({
      success: true,
      message: `Deactivated ${expiredListings.length} expired listings`,
      deactivated: expiredListings.length,
      listings: expiredListings.map(l => ({
        id: l.id,
        title: l.title,
      })),
    });
  } catch (error) {
    console.error('Error deactivating expired listings:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate expired listings' },
      { status: 500 }
    );
  }
}

// GET endpoint для перевірки стану (без деактивації)
export async function GET(request: NextRequest) {
  try {
    const now = new Date().toISOString();

    // Знаходимо всі активні оголошення, у яких закінчився термін дії
    const expiredListings = await prisma.$queryRawUnsafe(
      `SELECT id, title, expiresAt FROM Listing 
       WHERE status = 'active' 
       AND datetime(expiresAt) <= datetime(?)
       AND expiresAt IS NOT NULL`,
      now
    ) as Array<{ id: number; title: string; expiresAt: string }>;

    return NextResponse.json({
      expiredCount: expiredListings.length,
      listings: expiredListings,
    });
  } catch (error) {
    console.error('Error checking expired listings:', error);
    return NextResponse.json(
      { error: 'Failed to check expired listings' },
      { status: 500 }
    );
  }
}
