import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendListingExpiringWarning } from '@/utils/telegramNotifications';
import { addDays, daysBetween } from '@/utils/dateHelpers';

// Цей API endpoint викликається cron job'ом для попередження про закінчення оголошень
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

    const fiveDaysStr = addDays(new Date(), 5).toISOString();
    const sixDaysStr = addDays(new Date(), 6).toISOString();

    // Знаходимо оголошення що закінчуються за 5 днів
    const expiringListings = await prisma.$queryRawUnsafe(
      `SELECT l.id, l.title, l.userId, l.expiresAt,
              u.telegramId
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.status = 'active' 
       AND datetime(l.expiresAt) <= datetime(?)
       AND datetime(l.expiresAt) > datetime(?)
       AND l.expiresAt IS NOT NULL`,
      fiveDaysStr,
      sixDaysStr
    ) as Array<{ 
      id: number; 
      title: string; 
      userId: number; 
      expiresAt: string;
      telegramId: bigint;
    }>;

    if (expiringListings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expiring listings found',
        notified: 0,
      });
    }

    // Надсилаємо попередження користувачам паралельно
    const notificationPromises = expiringListings.map(async (listing) => {
      try {
        const expiresAt = new Date(listing.expiresAt);
        const daysLeft = daysBetween(expiresAt, new Date());
        
        await sendListingExpiringWarning(
          Number(listing.telegramId),
          listing.title,
          daysLeft
        );
        
        return { success: true, listingId: listing.id };
      } catch (error) {
        console.error(`Error notifying user for listing ${listing.id}:`, error);
        return { success: false, listingId: listing.id };
      }
    });

    const results = await Promise.allSettled(notificationPromises);
    const notified = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    console.log(`Sent expiring warnings for ${notified}/${expiringListings.length} listings`);

    return NextResponse.json({
      success: true,
      message: `Sent warnings for ${notified} expiring listings`,
      notified,
      total: expiringListings.length,
    });
  } catch (error) {
    console.error('Error sending expiring warnings:', error);
    return NextResponse.json(
      { error: 'Failed to send warnings' },
      { status: 500 }
    );
  }
}

// GET endpoint для перевірки оголошень що закінчуються
export async function GET() {
  try {
    const fiveDaysStr = addDays(new Date(), 5).toISOString();
    const sixDaysStr = addDays(new Date(), 6).toISOString();

    const expiringListings = await prisma.$queryRawUnsafe(
      `SELECT l.id, l.title, l.expiresAt
       FROM Listing l
       WHERE l.status = 'active' 
       AND datetime(l.expiresAt) <= datetime(?)
       AND datetime(l.expiresAt) > datetime(?)
       AND l.expiresAt IS NOT NULL`,
      fiveDaysStr,
      sixDaysStr
    ) as Array<{ id: number; title: string; expiresAt: string }>;

    return NextResponse.json({
      expiringCount: expiringListings.length,
      listings: expiringListings,
    });
  } catch (error) {
    console.error('Error checking expiring listings:', error);
    return NextResponse.json(
      { error: 'Failed to check expiring listings' },
      { status: 500 }
    );
  }
}
