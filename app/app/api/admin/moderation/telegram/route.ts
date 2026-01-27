import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthenticated } from '@/utils/adminAuth';

// Отримати оголошення з Telegram бота на модерації
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    console.log('[Moderation API - Telegram] Fetching listings with status:', status);

    // Отримуємо оголошення з Telegram бота через Prisma
    let telegramDb: any[] = [];
    let total = 0;
    
    try {
      // Спробуємо використати Prisma ORM напряму
      if ('telegramListing' in prisma && typeof (prisma as any).telegramListing?.findMany === 'function') {
        const telegramDbResult = await (prisma as any).telegramListing.findMany({
          where: { moderationStatus: status },
          include: {
            user: {
              select: {
                id: true,
                telegramId: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        });

        const totalResult = await (prisma as any).telegramListing.count({
          where: { moderationStatus: status },
        });

        telegramDb = telegramDbResult;
        total = totalResult;
      } else {
        throw new Error('TelegramListing model not available');
      }
    } catch (ormError: any) {
      // Якщо модель TelegramListing не доступна, використовуємо прямий SQL fallback
      if (ormError.message?.includes('telegramListing') || ormError.code === 'P2001' || ormError.name === 'PrismaClientInitializationError' || ormError.message?.includes('not available')) {
        console.warn('[Moderation API - Telegram] TelegramListing model not available, using SQL fallback with JOIN');
        
        try {
          // Використовуємо один SQL запит з JOIN для отримання всіх даних одразу
          // Використовуємо інтерполяцію для статусу, щоб уникнути проблем з параметрами
          const statusEscaped = status.replace(/'/g, "''"); // Екрануємо одинарні лапки
          
          const countQuery = `
            SELECT COUNT(*) as count
            FROM TelegramListing
            WHERE moderationStatus = '${statusEscaped}'
          `;
          
          const countResult = await prisma.$queryRawUnsafe(countQuery) as any[];
          total = Number(countResult[0]?.count || 0);
          
          const sqlQuery = `
            SELECT 
              tl.id,
              tl.userId,
              tl.title,
              tl.description,
              tl.price,
              COALESCE(tl.currency, 'EUR') as currency,
              tl.category,
              tl.subcategory,
              tl.condition,
              tl.location,
              tl.status,
              tl.moderationStatus,
              tl.images,
              tl.createdAt,
              COALESCE(tl.updatedAt, tl.createdAt) as updatedAt,
              tl.publicationTariff,
              COALESCE(tl.paymentStatus, 'pending') as paymentStatus,
              u.id as userId,
              u.username,
              u.firstName,
              u.lastName,
              CAST(u.telegramId AS TEXT) as telegramId
            FROM TelegramListing tl
            JOIN User u ON tl.userId = u.id
            WHERE tl.moderationStatus = '${statusEscaped}'
            ORDER BY tl.createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
          `;
          
          const results = await prisma.$queryRawUnsafe(sqlQuery) as any[];
          
          telegramDb = results.map((row: any) => ({
            id: row.id,
            userId: row.userId,
            title: row.title || '',
            description: row.description || '',
            price: row.price || 0,
            currency: row.currency || 'EUR',
            category: row.category || '',
            subcategory: row.subcategory || null,
            condition: row.condition || null,
            location: row.location || null,
            status: row.status || 'pending',
            moderationStatus: row.moderationStatus || status,
            images: row.images || '[]',
            createdAt: row.createdAt,
            updatedAt: row.updatedAt || row.createdAt,
            publicationTariff: row.publicationTariff || null,
            paymentStatus: row.paymentStatus || 'pending',
            user: {
              id: row.userId || null,
              telegramId: row.telegramId || null,
              username: row.username || null,
              firstName: row.firstName || null,
              lastName: row.lastName || null,
            },
          }));
        } catch (queryErr: any) {
          console.error('[Moderation API - Telegram] SQL fallback error:', queryErr);
          telegramDb = [];
          total = 0;
        }
      } else {
        // Якщо помилка не пов'язана з моделлю, пробрасуємо її далі
        throw ormError;
      }
    }

    const telegramListings = telegramDb.map((tl: any) => ({
      id: tl.id,
      userId: tl.userId,
      title: tl.title,
      description: tl.description,
      price: tl.price,
      currency: tl.currency,
      category: tl.category,
      location: tl.location,
      images: tl.images,
      createdAt: tl.createdAt,
      moderationStatus: tl.moderationStatus,
      publicationTariff: tl.publicationTariff || null,
      paymentStatus: tl.paymentStatus || 'pending',
      user: {
        id: tl.user.id,
        telegramId: typeof tl.user.telegramId === 'bigint' 
          ? tl.user.telegramId.toString() 
          : (tl.user.telegramId?.toString() || null),
        username: tl.user.username,
        firstName: tl.user.firstName,
        lastName: tl.user.lastName,
      },
    }));

    console.log('[Moderation API - Telegram] Found listings:', telegramListings.length, 'Total:', total);

    return NextResponse.json({
      listings: telegramListings,
      total,
      hasMore: offset + telegramListings.length < total,
    });
  } catch (error) {
    console.error('Error fetching telegram moderation listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

// Схвалити/відхилити оголошення з Telegram бота
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, action, reason } = body;

    if (!listingId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Отримуємо TelegramListing через Prisma або прямий SQL
    let tl: any = null;
    try {
      // Спробуємо використати Prisma ORM напряму
      tl = await (prisma as any).telegramListing.findUnique({
        where: { id: listingId },
        include: {
          user: {
            select: {
              telegramId: true,
              hasUsedFreeAd: true,
              listingPackagesBalance: true,
              balance: true,
            },
          },
        },
      });
    } catch (ormError: any) {
      // Fallback на прямий SQL
      if (ormError.message?.includes('telegramListing') || ormError.code === 'P2001' || ormError.name === 'PrismaClientInitializationError') {
        try {
          // Отримуємо дані окремо, щоб уникнути проблем з кодуванням
          const listingResult = await prisma.$queryRawUnsafe(
            `SELECT id, userId, title, description, price, currency, category, subcategory, condition, location, images, status, moderationStatus, rejectionReason, publishedAt, moderatedAt, moderatedBy, createdAt, updatedAt, COALESCE(publicationTariff, NULL) as publicationTariff, COALESCE(paymentStatus, 'pending') as paymentStatus FROM TelegramListing WHERE id = ?`,
            listingId
          ) as any[];
          
          if (listingResult.length === 0) {
            return NextResponse.json(
              { error: 'Listing not found' },
              { status: 404 }
            );
          }
          
          const listingData = listingResult[0];
          
          // Отримуємо дані користувача окремо
          const userResult = await prisma.$queryRawUnsafe(
            `SELECT CAST(telegramId AS TEXT) as telegramId, hasUsedFreeAd, listingPackagesBalance, balance FROM User WHERE id = ?`,
            listingData.userId
          ) as any[];
          
          const userData = userResult[0] || {};
          
          tl = {
            id: listingData.id,
            userId: listingData.userId,
            title: listingData.title,
            description: listingData.description,
            price: listingData.price,
            currency: listingData.currency,
            category: listingData.category,
            subcategory: listingData.subcategory,
            condition: listingData.condition,
            location: listingData.location,
            images: listingData.images,
            status: listingData.status,
            moderationStatus: listingData.moderationStatus,
            rejectionReason: listingData.rejectionReason,
            publishedAt: listingData.publishedAt,
            moderatedAt: listingData.moderatedAt,
            moderatedBy: listingData.moderatedBy,
            createdAt: listingData.createdAt,
            updatedAt: listingData.updatedAt,
            publicationTariff: listingData.publicationTariff || null,
            paymentStatus: listingData.paymentStatus || 'pending',
            user: {
              telegramId: userData.telegramId || null,
              hasUsedFreeAd: userData.hasUsedFreeAd || false,
              listingPackagesBalance: userData.listingPackagesBalance || 0,
              balance: userData.balance || 0,
            },
          };
        } catch (queryErr: any) {
          console.error('[Moderation API - Telegram] Error fetching listing for moderation:', queryErr);
          return NextResponse.json(
            { error: 'Failed to fetch listing' },
            { status: 500 }
          );
        }
      } else {
        throw ormError;
      }
    }

    if (!tl) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listing = {
      ...tl,
      telegramId: typeof tl.user.telegramId === 'bigint' 
        ? tl.user.telegramId.toString() 
        : (tl.user.telegramId?.toString() || null),
      hasUsedFreeAd: tl.user.hasUsedFreeAd,
      listingPackagesBalance: tl.user.listingPackagesBalance,
      balance: tl.user.balance,
    };

    if (action === 'approve') {
      // Перевіряємо оплату перед публікацією
      if (listing.paymentStatus !== 'paid') {
        return NextResponse.json(
          { error: 'Оголошення не оплачене. Публікація неможлива без оплати тарифу.' },
          { status: 400 }
        );
      }
      
      // Публікуємо в канал з урахуванням тарифу
      const { publishListingToChannel } = await import('@/utils/publishToChannel');
      const channelMessageId = await publishListingToChannel(listing.id, {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        currency: listing.currency || 'EUR',
        category: listing.category,
        subcategory: listing.subcategory,
        condition: listing.condition,
        location: listing.location,
        images: listing.images,
        publicationTariff: listing.publicationTariff || 'standard',
      });

      // Схвалюємо TelegramListing
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const nowStr = new Date().toISOString();
      
      // Перевіряємо чи є колонка channelMessageId
      const tableInfo = await prisma.$queryRawUnsafe(
        `PRAGMA table_info(TelegramListing)`
      ) as any[];
      const hasChannelMessageId = tableInfo.some((col: any) => col.name === 'channelMessageId');
      
      if (!hasChannelMessageId) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE TelegramListing ADD COLUMN channelMessageId INTEGER`
        );
      }
      
      if (channelMessageId) {
        await prisma.$executeRawUnsafe(
          `UPDATE TelegramListing 
           SET status = 'approved',
               moderationStatus = 'approved',
               publishedAt = ?,
               moderatedAt = ?,
               updatedAt = ?,
               channelMessageId = ?
           WHERE id = ?`,
          nowStr,
          nowStr,
          nowStr,
          channelMessageId,
          listing.id
        );
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE TelegramListing 
           SET status = 'approved',
               moderationStatus = 'approved',
               publishedAt = ?,
               moderatedAt = ?,
               updatedAt = ?
           WHERE id = ?`,
          nowStr,
          nowStr,
          nowStr,
          listing.id
        );
      }
      
      // Надсилаємо повідомлення користувачу з посиланням на канал
      if (listing.telegramId) {
        const { sendTelegramMessage } = await import('@/utils/telegramNotifications');
        const TRADE_CHANNEL_ID = process.env.TRADE_CHANNEL_ID;
        const TRADE_CHANNEL_USERNAME = process.env.TRADE_CHANNEL_USERNAME || '';
        
        let channelLink = '';
        if (channelMessageId && TRADE_CHANNEL_ID) {
          if (TRADE_CHANNEL_USERNAME) {
            channelLink = `https://t.me/${TRADE_CHANNEL_USERNAME}/${channelMessageId}`;
          } else {
            const channelId = TRADE_CHANNEL_ID.replace(/^-100/, '');
            channelLink = `https://t.me/c/${channelId}/${channelMessageId}`;
          }
        }
        
        const message = `✅ <b>Оголошення схвалено!</b>

Ваше оголошення "<b>${listing.title}</b>" пройшло модерацію та опубліковане в каналі.

Дякуємо за використання нашого сервісу!`;
        
        const replyMarkup = channelLink ? {
          inline_keyboard: [[
            {
              text: '🔗 Переглянути оголошення',
              url: channelLink,
            }
          ]]
        } : undefined;
        
        await sendTelegramMessage(listing.telegramId, message, {
          reply_markup: replyMarkup,
        }).catch(err => {
          console.error('Failed to send approval notification:', err);
        });

        // Перевіряємо реферальну винагороду (асинхронно, не блокуємо відповідь)
        fetch('/api/referral/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId: listing.telegramId.toString() }),
        }).catch((error) => {
          console.error('[Telegram Moderation] Error checking referral reward:', error);
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Telegram listing approved',
      });
    } else {
      // Відхиляємо TelegramListing
      const nowStr = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `UPDATE TelegramListing 
         SET status = 'rejected',
             moderationStatus = 'rejected',
             rejectionReason = ?,
             moderatedAt = ?,
             updatedAt = ?
         WHERE id = ?`,
        reason,
        nowStr,
        nowStr,
        listing.id
      );
      
      // Надсилаємо повідомлення користувачу
      if (listing.telegramId) {
        const { sendTelegramMessage } = await import('@/utils/telegramNotifications');
        const message = `❌ <b>Оголошення відхилено</b>

Ваше оголошення "<b>${listing.title}</b>" не пройшло модерацію.

📝 <b>Причина відхилення:</b>
${reason}

Ви можете створити нове оголошення з урахуванням зауважень модератора.`;
        
        await sendTelegramMessage(listing.telegramId, message).catch(err => {
          console.error('Failed to send rejection notification:', err);
        });
      }
      
      return NextResponse.json({
        success: true,
        message: 'Telegram listing rejected',
      });
    }
  } catch (error) {
    console.error('Error moderating telegram listing:', error);
    return NextResponse.json(
      { error: 'Failed to moderate listing' },
      { status: 500 }
    );
  }
}
