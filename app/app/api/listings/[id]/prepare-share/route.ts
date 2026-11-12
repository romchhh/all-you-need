import { NextRequest, NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { trackUserActivity } from '@/utils/trackActivity';
import { buildListingImageUrl } from '@/lib/listings/imageUrl';

export const dynamic = 'force-dynamic';

function absoluteImageUrl(path: string): string {
  const built = buildListingImageUrl(path);
  if (!built) return '';
  if (built.startsWith('http')) return built;
  const base = (process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}${built.startsWith('/') ? built : `/${built}`}` : built;
}

/**
 * Готує PreparedInlineMessage для WebApp.shareMessage (Bot API 8.0+).
 * Користувач у нативному діалозі обирає чат і натискає «Надіслати».
 */
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

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return NextResponse.json({ error: 'bot_token_missing' }, { status: 503 });
    }

    let images: string[] = [];
    try {
      images = JSON.parse(listing.images || '[]');
    } catch {
      images = [];
    }
    const photoUrl = images[0] ? absoluteImageUrl(images[0]) : '';
    const caption = chatText.slice(0, 1024);
    const resultId = `dist_${listingId}_${Date.now()}`;

    const result = photoUrl
      ? {
          type: 'photo',
          id: resultId,
          photo_url: photoUrl,
          thumbnail_url: photoUrl,
          caption,
        }
      : {
          type: 'article',
          id: resultId,
          title: listing.title.slice(0, 64) || 'Listing',
          description: caption.slice(0, 120),
          input_message_content: {
            message_text: chatText.slice(0, 4096),
          },
        };

    const tgUserId = parseInt(telegramId, 10);
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/savePreparedInlineMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: tgUserId,
          result,
          allow_user_chats: true,
          allow_group_chats: true,
          allow_channel_chats: true,
          allow_bot_chats: false,
        }),
      }
    );

    const data = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { id?: string; expiration_date?: number };
    };

    if (!response.ok || !data.ok || !data.result?.id) {
      console.error('[prepare-share]', data);
      return NextResponse.json(
        { error: 'prepare_failed', detail: data.description || 'telegram_error' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      preparedMessageId: data.result.id,
      expirationDate: data.result.expiration_date ?? null,
    });
  } catch (error) {
    console.error('[listings prepare-share]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
