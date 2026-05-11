import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendListingExpiredNotification, sendListingAutoRenewedNotification } from '@/utils/telegramNotifications';
import { executeInClause } from '@/utils/dbHelpers';
import { ensureListingApiRawColumns } from '@/lib/prisma';

// Цей API endpoint викликається cron job'ом для деактивації закінчених оголошень
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureListingApiRawColumns();

    const now = new Date().toISOString();

    // 1) Автопродовження: активні, термін минув, autoRenew = 1
    const toRenew = (await prisma.$queryRawUnsafe(
      `SELECT l.id, l.title, l.userId, l.expiresAt
       FROM Listing l
       WHERE l.status = 'active'
         AND l.expiresAt IS NOT NULL
         AND datetime(l.expiresAt) <= datetime(?)
         AND COALESCE(l.autoRenew, 0) = 1`,
      now
    )) as Array<{ id: number; title: string; userId: number; expiresAt: string }>;

    let renewed = 0;
    for (const listing of toRenew) {
      const newExpires = new Date();
      newExpires.setDate(newExpires.getDate() + 30);
      const newExpiresIso = newExpires.toISOString();

      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET expiresAt = ?, updatedAt = datetime('now') WHERE id = ?`,
        newExpiresIso,
        listing.id
      );

      try {
        const users = (await prisma.$queryRawUnsafe(
          `SELECT CAST(telegramId AS INTEGER) as telegramId FROM User WHERE id = ?`,
          listing.userId
        )) as Array<{ telegramId: number }>;

        if (users[0]) {
          await sendListingAutoRenewedNotification(
            users[0].telegramId,
            listing.title,
            listing.id,
            newExpires
          );
        }
      } catch (e) {
        console.error(`[expire-listings] notify auto-renew ${listing.id}:`, e);
      }
      renewed += 1;
    }

    // 2) Решта прострочених — у статус expired + старе повідомлення
    const expiredListings = (await prisma.$queryRawUnsafe(
      `SELECT l.id, l.title, l.userId FROM Listing l
       WHERE l.status = 'active'
         AND datetime(l.expiresAt) <= datetime(?)
         AND l.expiresAt IS NOT NULL`,
      now
    )) as Array<{ id: number; title: string; userId: number }>;

    if (expiredListings.length === 0) {
      return NextResponse.json({
        success: true,
        message: renewed > 0 ? 'Only auto-renewals processed' : 'No expired listings found',
        renewed,
        deactivated: 0,
      });
    }

    const listingIds = expiredListings.map((l) => l.id);
    await executeInClause(
      `UPDATE Listing
       SET status = 'expired',
           updatedAt = datetime('now')
       WHERE id IN (?)`,
      listingIds
    );

    const notificationPromises = expiredListings.map(async (listing) => {
      try {
        const users = (await prisma.$queryRawUnsafe(
          `SELECT CAST(telegramId AS INTEGER) as telegramId FROM User WHERE id = ?`,
          listing.userId
        )) as Array<{ telegramId: number }>;

        if (users[0]) {
          await sendListingExpiredNotification(users[0].telegramId, listing.title, listing.id);
        }
      } catch (error) {
        console.error(`Error notifying user for listing ${listing.id}:`, error);
      }
    });

    await Promise.allSettled(notificationPromises);

    console.log(`[expire-listings] renewed: ${renewed}, deactivated: ${expiredListings.length}`);

    return NextResponse.json({
      success: true,
      message: `Renewed ${renewed}, deactivated ${expiredListings.length} expired listings`,
      renewed,
      deactivated: expiredListings.length,
      listings: expiredListings.map((l) => ({ id: l.id, title: l.title })),
    });
  } catch (error) {
    console.error('Error deactivating expired listings:', error);
    return NextResponse.json({ error: 'Failed to deactivate expired listings' }, { status: 500 });
  }
}

// GET endpoint для перевірки стану (без деактивації)
export async function GET(request: NextRequest) {
  try {
    const now = new Date().toISOString();

    const expiredListings = (await prisma.$queryRawUnsafe(
      `SELECT id, title, expiresAt FROM Listing
       WHERE status = 'active'
         AND datetime(expiresAt) <= datetime(?)
         AND expiresAt IS NOT NULL`,
      now
    )) as Array<{ id: number; title: string; expiresAt: string }>;

    return NextResponse.json({
      expiredCount: expiredListings.length,
      listings: expiredListings,
    });
  } catch (error) {
    console.error('Error checking expired listings:', error);
    return NextResponse.json({ error: 'Failed to check expired listings' }, { status: 500 });
  }
}
