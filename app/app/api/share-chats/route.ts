import { NextRequest, NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { trackUserActivity } from '@/utils/trackActivity';
import { listingCityKeyFromLocation, foldCityKey } from '@/lib/city/cityNormalization';
import { listShareChatsForListing } from '@/lib/share/shareChatQuery';
import { ensureShareChatTables } from '@/lib/share/shareChatTables';
import { isPostgres, sqlNow } from '@/lib/dbSql';

export const dynamic = 'force-dynamic';

/** PG Boolean vs SQLite INTEGER для UserShareChat.isSaved */
function savedFlag(on: boolean): boolean | number {
  return isPostgres() ? on : on ? 1 : 0;
}

function normalizeInvite(link: string): string {
  return link.trim().replace(/\/+$/, '').toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    await trackUserActivity(request);
    await ensureShareChatTables();

    const sp = request.nextUrl.searchParams;
    const telegramId = sp.get('telegramId');
    const listingId = parseInt(sp.get('listingId') || '', 10);
    const lang = sp.get('lang');
    const category = sp.get('category');
    const city = sp.get('city');

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(String(telegramId).trim());
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    let listingCity = city || '';
    let listingCategory = category || '';

    if (listingId && Number.isFinite(listingId)) {
      const rows = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT location, category FROM Listing WHERE id = ? AND userId = ?`,
          listingId,
          user.id
        )
      )) as Array<{ location: string; category: string }>;
      if (rows[0]) {
        listingCity = listingCity || listingCityKeyFromLocation(rows[0].location || '');
        listingCategory = listingCategory || rows[0].category || '';
      }
    }

    const listingCityFold = listingCity ? foldCityKey(listingCity) : '';

    const chats = await listShareChatsForListing({
      userId: user.id,
      listingCityFold,
      listingCategory,
      languageFilter: lang,
      categoryFilter: category,
      cityFilter: city === '__all__' ? '__all__' : city,
    });

    return NextResponse.json({
      chats,
      defaults: {
        city: listingCity || null,
        category: listingCategory || null,
        cityFold: listingCityFold || null,
      },
    });
  } catch (error) {
    console.error('[share-chats GET]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await trackUserActivity(request);
    await ensureShareChatTables();

    const body = await request.json();
    const action = String(body.action || '');
    const telegramId = body.telegramId != null ? String(body.telegramId).trim() : '';

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    if (action === 'toggle_saved') {
      const catalogChatId = parseInt(String(body.catalogChatId), 10);
      const parserKey = body.parserKey != null ? String(body.parserKey).trim() : '';
      const inviteLinkIn = body.inviteLink != null ? String(body.inviteLink).trim() : '';
      const titleIn = body.title != null ? String(body.title).trim() : '';
      const onFlag = savedFlag(true);
      const offFlag = savedFlag(false);

      // Парсер / довільне посилання → UserShareChat source=custom
      if (parserKey || (inviteLinkIn && !Number.isFinite(catalogChatId))) {
        const inviteLink = inviteLinkIn;
        if (!inviteLink || inviteLink.length < 8) {
          return NextResponse.json({ error: 'inviteLink required' }, { status: 400 });
        }
        const inviteNorm = normalizeInvite(inviteLink);

        const customRows = (await executeWithRetry(() =>
          prisma.$queryRawUnsafe(
            `SELECT id, isSaved, inviteLink FROM UserShareChat
             WHERE userId = ? AND source = 'custom'`,
            user.id
          )
        )) as Array<{ id: number; isSaved: boolean | number | string; inviteLink: string | null }>;

        const existing = customRows.find((row) => {
          const link = String(row.inviteLink || '');
          return link === inviteLink || normalizeInvite(link) === inviteNorm;
        });

        if (existing) {
          const currentlyOn =
            existing.isSaved === true || existing.isSaved === 1 || existing.isSaved === '1';
          const nextOn = !currentlyOn;
          await executeWithRetry(() =>
            prisma.$executeRawUnsafe(
              `UPDATE UserShareChat SET isSaved = ? WHERE id = ?`,
              nextOn ? onFlag : offFlag,
              existing.id
            )
          );
          return NextResponse.json({ success: true, isSaved: nextOn });
        }

        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(
            `INSERT INTO UserShareChat (
              userId, catalogChatId, title, subtitle, inviteLink, language, memberCount, isSaved, source, createdAt
            ) VALUES (?, NULL, ?, ?, ?, ?, 0, ?, 'custom', ${sqlNow()})`,
            user.id,
            titleIn || parserKey || 'Chat',
            parserKey ? `parser:${parserKey}` : null,
            inviteLink,
            body.language === 'uk' ? 'uk' : 'ru',
            onFlag
          )
        );
        return NextResponse.json({ success: true, isSaved: true });
      }

      if (!Number.isFinite(catalogChatId)) {
        return NextResponse.json({ error: 'catalogChatId required' }, { status: 400 });
      }

      const existing = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT id, isSaved FROM UserShareChat WHERE userId = ? AND catalogChatId = ? LIMIT 1`,
          user.id,
          catalogChatId
        )
      )) as Array<{ id: number; isSaved: boolean | number | string }>;

      if (existing[0]) {
        const currentlyOn =
          existing[0].isSaved === true ||
          existing[0].isSaved === 1 ||
          existing[0].isSaved === '1';
        const nextOn = !currentlyOn;
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(
            `UPDATE UserShareChat SET isSaved = ? WHERE id = ?`,
            nextOn ? onFlag : offFlag,
            existing[0].id
          )
        );
        return NextResponse.json({ success: true, isSaved: nextOn });
      }

      const cat = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT title, subtitle, language, memberCount, inviteLink FROM ShareChatCatalog WHERE id = ?`,
          catalogChatId
        )
      )) as Array<{
        title: string;
        subtitle: string | null;
        language: string;
        memberCount: number;
        inviteLink: string | null;
      }>;

      if (!cat[0]) {
        return NextResponse.json({ error: 'chat_not_found' }, { status: 404 });
      }

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `INSERT INTO UserShareChat (
            userId, catalogChatId, title, subtitle, inviteLink, language, memberCount, isSaved, source, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'catalog', ${sqlNow()})`,
          user.id,
          catalogChatId,
          cat[0].title,
          cat[0].subtitle,
          cat[0].inviteLink,
          cat[0].language,
          cat[0].memberCount,
          onFlag
        )
      );

      return NextResponse.json({ success: true, isSaved: true });
    }

    if (action === 'add_custom') {
      const title = String(body.title || '').trim();
      const inviteLink = String(body.inviteLink || '').trim();
      const language = body.language === 'uk' ? 'uk' : 'ru';

      if (title.length < 2 || inviteLink.length < 8) {
        return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
      }

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `INSERT INTO UserShareChat (
            userId, catalogChatId, title, subtitle, inviteLink, language, memberCount, isSaved, source, createdAt
          ) VALUES (?, NULL, ?, NULL, ?, ?, 0, ?, 'custom', ${sqlNow()})`,
          user.id,
          title,
          inviteLink,
          language,
          savedFlag(true)
        )
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error) {
    console.error('[share-chats POST]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
