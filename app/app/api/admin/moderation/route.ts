import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { getListingWithUser, approveListing, rejectListing } from '@/utils/moderationHelpers';

// Отримати оголошення на модерації
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('[Moderation API] Fetching listings with status:', status);

    // Отримуємо оголошення з маркетплейсу
    const marketplaceListings = await prisma.$queryRawUnsafe(
      `SELECT 
        l.id, l.userId, l.title, l.description, l.price, l.currency,
        l.category, l.location, l.images, l.createdAt, l.moderationStatus,
        u.id as user_id, 
        CAST(u.telegramId AS TEXT) as user_telegramId,
        u.username as user_username,
        u.firstName as user_firstName,
        u.lastName as user_lastName,
        'marketplace' as source
      FROM Listing l
      JOIN User u ON l.userId = u.id
      WHERE l.moderationStatus = ?
      ORDER BY l.createdAt DESC`,
      status
    ) as any[];

    // Отримуємо оголошення з Telegram бота
    const telegramListings = await prisma.$queryRawUnsafe(
      `SELECT 
        tl.id, tl.userId, tl.title, tl.description, tl.price, tl.currency,
        tl.category, tl.location, tl.images, tl.createdAt, tl.moderationStatus,
        u.id as user_id, 
        CAST(u.telegramId AS TEXT) as user_telegramId,
        u.username as user_username,
        u.firstName as user_firstName,
        u.lastName as user_lastName,
        'telegram' as source
      FROM TelegramListing tl
      JOIN User u ON tl.userId = u.id
      WHERE tl.moderationStatus = ?
      ORDER BY tl.createdAt DESC`,
      status
    ) as any[];

    // Об'єднуємо та сортуємо за датою
    const allListings = [...marketplaceListings, ...telegramListings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);

    const total = marketplaceListings.length + telegramListings.length;

    console.log('[Moderation API] Found listings:', allListings.length, 'Total:', total);

    // Форматуємо дані - конвертуємо BigInt в number/string
    const formattedListings = allListings.map((l: any) => ({
      id: l.id,
      userId: l.userId,
      title: l.title,
      description: l.description,
      price: l.price,
      currency: l.currency,
      category: l.category,
      location: l.location || null,
      images: l.images,
      createdAt: l.createdAt,
      source: l.source, // 'marketplace' або 'telegram'
      user: {
        id: l.user_id,
        telegramId: typeof l.user_telegramId === 'bigint' 
          ? l.user_telegramId.toString() 
          : l.user_telegramId,
        username: l.user_username,
        firstName: l.user_firstName,
        lastName: l.user_lastName,
      },
    }));

    return NextResponse.json({
      listings: formattedListings,
      total,
      hasMore: offset + formattedListings.length < total,
    });
  } catch (error) {
    console.error('Error fetching moderation listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

// Схвалити/відхилити оголошення
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, action, reason, source } = body;

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


    // Отримуємо оголошення (з маркетплейсу або з Telegram)
    let listing;
    if (source === 'telegram') {
      // Отримуємо TelegramListing
      const result = await prisma.$queryRawUnsafe(
        `SELECT tl.*, 
                CAST(u.telegramId AS TEXT) as telegramId, 
                u.hasUsedFreeAd, 
                u.listingPackagesBalance, 
                u.balance
         FROM TelegramListing tl
         JOIN User u ON tl.userId = u.id
         WHERE tl.id = ?`,
        listingId
      ) as any[];

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'Listing not found' },
          { status: 404 }
        );
      }
      listing = { ...result[0], source: 'telegram' };
    } else {
      // Отримуємо звичайне Listing
      listing = await getListingWithUser(listingId);
      if (listing) {
        listing.source = 'marketplace';
      }
    }

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (action === 'approve') {
      if (listing.source === 'telegram') {
        // Публікуємо в канал
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
              // Використовуємо ID каналу (без -100)
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
        }
      } else {
        await approveListing(listing);
        // Повідомлення користувачу вже надсилається в approveListing
      }
      return NextResponse.json({
        success: true,
        message: 'Listing approved',
      });
    } else {
      if (listing.source === 'telegram') {
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
      } else {
        const refundInfo = await rejectListing(listing, reason);
        return NextResponse.json({
          success: true,
          message: 'Listing rejected and funds refunded',
          refundInfo,
        });
      }
    }
  } catch (error) {
    console.error('Error moderating listing:', error);
    return NextResponse.json(
      { error: 'Failed to moderate listing' },
      { status: 500 }
    );
  }
}
