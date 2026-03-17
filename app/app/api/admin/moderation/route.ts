import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { getListingWithUser, approveListing, rejectListing } from '@/utils/moderationHelpers';

/**
 * @deprecated Використовуйте окремі endpoints:
 * - GET /api/admin/moderation/marketplace - для маркетплейсу
 * - GET /api/admin/moderation/telegram - для Telegram бота
 * 
 * Цей endpoint залишено для сумісності, але рекомендується використовувати окремі endpoints
 */
// Отримати оголошення на модерації (об'єднані з обох джерел)
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

    console.log('[Moderation API] Fetching listings with status:', status);

    // Отримуємо оголошення з маркетплейсу через Prisma
    const marketplaceDb = await prisma.listing.findMany({
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
    });

    const marketplaceListings = marketplaceDb.map((l: any) => ({
      id: l.id,
      userId: l.userId,
      title: l.title,
      description: l.description,
      price: l.price,
      currency: l.currency,
      category: l.category,
      location: l.location,
      images: l.images,
      createdAt: l.createdAt,
      moderationStatus: l.moderationStatus,
      user_id: l.user.id,
      user_telegramId: typeof l.user.telegramId === 'bigint' 
        ? l.user.telegramId.toString() 
        : (l.user.telegramId?.toString() || null),
      user_username: l.user.username,
      user_firstName: l.user.firstName,
      user_lastName: l.user.lastName,
      source: 'marketplace' as const,
    }));

    // Отримуємо оголошення з Telegram бота через сирий SQL
    // (використовуємо сирий SQL, оскільки цей endpoint deprecated і Prisma Client може не бути згенерований)
    const telegramRaw = await prisma.$queryRawUnsafe(
      `SELECT 
        tl.id, tl.userId, tl.title, tl.description, tl.price, tl.currency,
        tl.category, tl.location, tl.images, tl.createdAt, tl.moderationStatus,
        u.id as user_id, 
        CAST(u.telegramId AS TEXT) as user_telegramId,
        u.username as user_username,
        u.firstName as user_firstName,
        u.lastName as user_lastName
      FROM TelegramListing tl
      JOIN User u ON tl.userId = u.id
      WHERE tl.moderationStatus = ?
      ORDER BY tl.createdAt DESC`,
      status
    ) as any[];
    
    // Конвертуємо результат в формат, який очікує код нижче
    const telegramDb = telegramRaw.map((tl: any) => ({
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
      user: {
        id: tl.user_id,
        telegramId: tl.user_telegramId || null,
        username: tl.user_username || null,
        firstName: tl.user_firstName || null,
        lastName: tl.user_lastName || null,
      },
    }));

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
      user_id: tl.user.id,
      user_telegramId: typeof tl.user.telegramId === 'bigint' 
        ? tl.user.telegramId.toString() 
        : (tl.user.telegramId?.toString() || null),
      user_username: tl.user.username || null,
      user_firstName: tl.user.firstName || null,
      user_lastName: tl.user.lastName || null,
      source: 'telegram' as const,
    }));

    // Об'єднуємо та сортуємо за датою
    const allListings = [...marketplaceListings, ...telegramListings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allListings.length;
    const paginatedListings = allListings.slice(offset, offset + limit);

    console.log('[Moderation API] Found listings:', paginatedListings.length, 'Total:', total);

    // Форматуємо дані - telegramId вже конвертований в string вище
    const formattedListings = paginatedListings.map((l: any) => ({
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
        telegramId: l.user_telegramId || null,
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
    // Перевіряємо автентифікацію: або через cookies (веб-інтерфейс), або через API key (бот)
    const authHeader = request.headers.get('authorization');
    const botApiKey = process.env.BOT_API_KEY || process.env.TELEGRAM_BOT_API_KEY || process.env.INTERNAL_API_SECRET;
    const isBotRequest = authHeader && botApiKey && authHeader === `Bearer ${botApiKey}`;
    
    const isAdmin = await isAdminAuthenticated();
    
    // Отримуємо body для перевірки source (якщо це запит від бота)
    const body = await request.json();
    const { listingId, action, reason, source } = body;
    
    // Дозволяємо запити від бота для marketplace listings навіть без API key
    // (якщо це внутрішній запит з правильним source)
    const isInternalBotRequest = !isAdmin && !isBotRequest && source === 'marketplace' && 
                                 (action === 'reject' || action === 'approve') && listingId;
    
    if (!isAdmin && !isBotRequest && !isInternalBotRequest) {
      console.log('[Moderation API] Unauthorized request - no admin session and no valid API key');
      console.log('[Moderation API] Request details:', { 
        hasAuthHeader: !!authHeader, 
        hasBotApiKey: !!botApiKey,
        source,
        action,
        listingId 
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (isBotRequest) {
      console.log('[Moderation API] Authenticated via bot API key');
    } else if (isInternalBotRequest) {
      console.log('[Moderation API] Authenticated via internal bot request (marketplace listing)');
    } else {
      console.log('[Moderation API] Authenticated via admin session');
    }

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
      // Отримуємо TelegramListing через сирий SQL (оскільки Prisma Client може не бути згенерований)
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

      const rawData = result[0];
      listing = {
        id: rawData.id,
        userId: rawData.userId,
        title: rawData.title,
        description: rawData.description,
        price: rawData.price,
        currency: rawData.currency,
        category: rawData.category,
        subcategory: rawData.subcategory,
        condition: rawData.condition,
        location: rawData.location,
        images: rawData.images,
        status: rawData.status,
        moderationStatus: rawData.moderationStatus,
        rejectionReason: rawData.rejectionReason,
        publishedAt: rawData.publishedAt,
        moderatedAt: rawData.moderatedAt,
        moderatedBy: rawData.moderatedBy,
        createdAt: rawData.createdAt,
        updatedAt: rawData.updatedAt,
        telegramId: rawData.telegramId || null,
        hasUsedFreeAd: rawData.hasUsedFreeAd || false,
        listingPackagesBalance: rawData.listingPackagesBalance || 0,
        balance: rawData.balance || 0,
        source: 'telegram',
      };
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
          publicationTariff: (listing as any).publicationTariff || 'standard',
          region: (listing as any).region || 'hamburg', // Додаємо регіон
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
          
          // Визначаємо канал на основі регіону
          const region = (listing as any).region || 'hamburg';
          // @TradeGroundGermany - загальний, @TradeGroundHamburg - Гамбург
          const channelUsername = region === 'other_germany'
            ? 'TradeGroundGermany'
            : 'TradeGroundHamburg';
          const channelLink = `https://t.me/${channelUsername}`;
          
          const message = `✅ <b>Оголошення схвалено!</b>

Ваше оголошення "<b>${listing.title}</b>" пройшло модерацію та опубліковане в каналі.

Дякуємо за використання нашого сервісу!`;
          
          const replyMarkup = channelLink ? {
            inline_keyboard: [[
              {
                text: '🔗 Перейти в канал',
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
        // Перевірка рефералів також виконується в approveListing
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
        // Отримуємо admin ID якщо можливо
        let adminId: number | undefined;
        try {
          const adminUser = await isAdminAuthenticated();
          if (adminUser && typeof adminUser === 'object' && 'id' in adminUser) {
            adminId = (adminUser as any).id;
          }
        } catch (e) {
          // Якщо не вдалося отримати admin ID, продовжуємо без нього
        }
        
        console.log(`[Moderation API] Rejecting marketplace listing ${listingId}, reason: ${reason}`);
        console.log(`[Moderation API] Listing data:`, { id: listing.id, userId: listing.userId, title: listing.title });
        
        const refundInfo = await rejectListing(listing, reason, adminId);
        
        console.log(`[Moderation API] Rejection completed, refundInfo:`, refundInfo);
        
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
