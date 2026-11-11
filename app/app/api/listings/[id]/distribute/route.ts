import { NextRequest, NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { trackUserActivity } from '@/utils/trackActivity';
import { sendTelegramMessage } from '@/lib/telegram/telegramNotifications';
import { buildListingImageUrl } from '@/lib/listings/imageUrl';
import { ensureShareChatTables } from '@/lib/share/shareChatTables';
import { sqlNow } from '@/lib/dbSql';

export const dynamic = 'force-dynamic';

function absoluteImageUrl(path: string): string {
  const built = buildListingImageUrl(path);
  if (!built) return '';
  if (built.startsWith('http')) return built;
  const base = (process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}${built.startsWith('/') ? built : `/${built}`}` : built;
}

async function sendPhotoCaption(
  chatId: number | string,
  photoUrl: string,
  caption: string
): Promise<boolean> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN || !photoUrl) {
    return sendTelegramMessage(chatId, caption, { disable_web_page_preview: true });
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption.slice(0, 1024),
        parse_mode: 'HTML',
      }),
    });
    if (!response.ok) {
      return sendTelegramMessage(chatId, caption, { disable_web_page_preview: true });
    }
    return true;
  } catch {
    return sendTelegramMessage(chatId, caption, { disable_web_page_preview: true });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await trackUserActivity(request);
    const { id } = await context.params;
    const listingId = parseInt(id, 10);
    if (!Number.isFinite(listingId)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }

    const body = await request.json();
    const telegramId = body.telegramId != null ? String(body.telegramId).trim() : '';
    const chatText = String(body.chatText || '').trim();
    const mode = body.mode === 'groups' ? 'groups' : 'bot';
    const catalogChatIds = Array.isArray(body.catalogChatIds)
      ? body.catalogChatIds.map((v: unknown) => parseInt(String(v), 10)).filter(Number.isFinite)
      : [];
    const customChatIds = Array.isArray(body.customChatIds)
      ? body.customChatIds.map((v: unknown) => parseInt(String(v), 10)).filter(Number.isFinite)
      : [];

    if (!telegramId || !chatText) {
      return NextResponse.json({ error: 'telegramId and chatText required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const rows = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id, userId, title, status, images FROM Listing WHERE id = ?`,
        listingId
      )
    )) as Array<{ id: number; userId: number; title: string; status: string; images: string }>;

    const listing = rows[0];
    if (!listing || listing.userId !== user.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (listing.status !== 'active') {
      return NextResponse.json({ error: 'not_active' }, { status: 400 });
    }

    let images: string[] = [];
    try {
      images = JSON.parse(listing.images || '[]');
    } catch {
      images = [];
    }
    const photoUrl = images[0] ? absoluteImageUrl(images[0]) : '';

    if (mode === 'bot') {
      // Не чіпаємо ShareChat* — лише Telegram DM
      const lang = body.lang === 'ru' ? 'ru' : 'uk';
      const hint =
        lang === 'ru'
          ? '\n\n<i>Перешлите это сообщение в нужные чаты или сохраните как черновик в боте.</i>'
          : '\n\n<i>Перешліть це повідомлення в потрібні чати або збережіть як чернетку в боті.</i>';

      const ok = await sendPhotoCaption(
        telegramId,
        photoUrl,
        `<pre>${chatText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>${hint}`
      );

      if (!ok) {
        return NextResponse.json({ error: 'telegram_failed' }, { status: 502 });
      }

      return NextResponse.json({ success: true, mode: 'bot' });
    }

    await ensureShareChatTables();

    const groupLines: string[] = [];
    if (catalogChatIds.length > 0) {
      const cats = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT id, title, inviteLink FROM ShareChatCatalog WHERE id IN (${catalogChatIds.map(() => '?').join(',')})`,
          ...catalogChatIds
        )
      )) as Array<{ id: number; title: string; inviteLink: string | null }>;
      for (const c of cats) {
        groupLines.push(`• ${c.title}${c.inviteLink ? ` — ${c.inviteLink}` : ''}`);
      }
    }
    if (customChatIds.length > 0) {
      const customs = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT id, title, inviteLink FROM UserShareChat WHERE userId = ? AND id IN (${customChatIds.map(() => '?').join(',')})`,
          user.id,
          ...customChatIds
        )
      )) as Array<{ id: number; title: string; inviteLink: string | null }>;
      for (const c of customs) {
        groupLines.push(`• ${c.title}${c.inviteLink ? ` — ${c.inviteLink}` : ''}`);
      }
    }

    const lang = body.lang === 'ru' ? 'ru' : 'uk';
    const header =
      lang === 'ru'
        ? `📣 <b>Распространение:</b> «${listing.title}»\n\nВыбранные группы:\n${groupLines.join('\n')}\n\n<b>Текст для публикации:</b>`
        : `📣 <b>Поширення:</b> «${listing.title}»\n\nОбрані групи:\n${groupLines.join('\n')}\n\n<b>Текст для публікації:</b>`;

    const ok = await sendPhotoCaption(
      telegramId,
      photoUrl,
      `${header}\n<pre>${chatText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    );

    if (!ok) {
      return NextResponse.json({ error: 'telegram_failed' }, { status: 502 });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO ShareDistributionLog (listingId, userId, chatText, catalogChatIds, customChatIds, createdAt)
         VALUES (?, ?, ?, ?, ?, ${sqlNow()})`,
        listingId,
        user.id,
        chatText,
        JSON.stringify(catalogChatIds),
        JSON.stringify(customChatIds)
      )
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      mode: 'groups',
      groups: groupLines.length,
    });
  } catch (error) {
    console.error('[listings distribute]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
