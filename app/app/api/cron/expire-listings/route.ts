import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendListingExpiredNotification, sendListingAutoRenewedNotification } from '@/lib/telegram/telegramNotifications';
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

    // 2) Решта прострочених: platform/parser → sold; user → expired + notify
    const expiredListings = (await prisma.$queryRawUnsafe(
      `SELECT l.id, l.title, l.userId,
              CAST(u.telegramId AS INTEGER) as telegramId,
              u.username,
              EXISTS(SELECT 1 FROM parsed_items pi WHERE pi.marketplace_listing_id = l.id) as fromParser
       FROM Listing l
       JOIN User u ON u.id = l.userId
       WHERE l.status = 'active'
         AND datetime(l.expiresAt) <= datetime(?)
         AND l.expiresAt IS NOT NULL`,
      now
    )) as Array<{
      id: number;
      title: string;
      userId: number;
      telegramId: number | null;
      username: string | null;
      fromParser: number;
    }>;

    if (expiredListings.length === 0) {
      return NextResponse.json({
        success: true,
        message: renewed > 0 ? 'Only auto-renewals processed' : 'No expired listings found',
        renewed,
        deactivated: 0,
        sold: 0,
      });
    }

    const parserBotIds = new Set(
      [
        process.env.PARSER_BOT_TELEGRAM_ID,
        process.env.PARSER_SERVICES_BOT_TELEGRAM_ID,
        process.env.PARSER_FALLBACK_BOT_TELEGRAM_ID,
        '8590825131',
      ]
        .map((v) => parseInt(String(v || ''), 10))
        .filter((n) => n > 0)
    );

    const soldListings: typeof expiredListings = [];
    const userExpiredListings: typeof expiredListings = [];
    for (const row of expiredListings) {
      const isParser =
        Number(row.fromParser) === 1 ||
        (row.telegramId != null && parserBotIds.has(Number(row.telegramId))) ||
        ['parser_bot', 'tradeground_seller', 'tradeground_seller2'].includes(
          (row.username || '').toLowerCase()
        );
      if (isParser) soldListings.push(row);
      else userExpiredListings.push(row);
    }

    if (soldListings.length) {
      await executeInClause(
        `UPDATE Listing SET status = 'sold', updatedAt = datetime('now') WHERE id IN (?)`,
        soldListings.map((l) => l.id)
      );
    }
    if (userExpiredListings.length) {
      await executeInClause(
        `UPDATE Listing SET status = 'expired', updatedAt = datetime('now') WHERE id IN (?)`,
        userExpiredListings.map((l) => l.id)
      );
    }

    const notificationPromises = userExpiredListings.map(async (listing) => {
      try {
        if (listing.telegramId) {
          await sendListingExpiredNotification(listing.telegramId, listing.title, listing.id);
        }
      } catch (error) {
        console.error(`Error notifying user for listing ${listing.id}:`, error);
      }
    });

    await Promise.allSettled(notificationPromises);

    console.log(
      `[expire-listings] renewed: ${renewed}, sold: ${soldListings.length}, expired: ${userExpiredListings.length}`
    );

    return NextResponse.json({
      success: true,
      message: `Renewed ${renewed}, sold ${soldListings.length}, expired ${userExpiredListings.length}`,
      renewed,
      sold: soldListings.length,
      deactivated: userExpiredListings.length,
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
