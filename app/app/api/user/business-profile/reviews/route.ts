import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { prisma } from '@/lib/prisma';
import {
  ensureReviewExtraColumns,
  listOwnerBusinessReviews,
} from '@/lib/reviews/reviewService';
import { logApiError } from '@/lib/server/logApiError';

/** GET — відгуки для власника бізнес-профілю */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const telegramId = String(sp.get('telegramId') || '').trim();
    const filter = sp.get('filter') === 'unreplied' ? 'unreplied' : 'all';

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return NextResponse.json({ error: 'No business profile' }, { status: 404 });
    }

    const data = await listOwnerBusinessReviews(user.id, filter);
    return NextResponse.json(data);
  } catch (error) {
    logApiError('business-profile/reviews GET', error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }
}

/** POST — відповідь власника на відгук */
export async function POST(request: NextRequest) {
  try {
    await ensureReviewExtraColumns();
    const body = await request.json();
    const telegramId = String(body.telegramId || '').trim();
    const reviewId = Number(body.reviewId);
    const reply =
      typeof body.reply === 'string' && body.reply.trim() ? body.reply.trim().slice(0, 2000) : '';

    if (!telegramId || !Number.isFinite(reviewId) || reviewId <= 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    if (!reply) {
      return NextResponse.json({ error: 'Reply required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review || review.targetId !== user.id) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        ownerReply: reply,
        ownerRepliedAt: new Date(),
      } as Parameters<typeof prisma.review.update>[0]['data'],
    });

    return NextResponse.json({
      success: true,
      review: {
        id: updated.id,
        ownerReply: (updated as { ownerReply?: string | null }).ownerReply ?? reply,
        ownerRepliedAt:
          (updated as { ownerRepliedAt?: Date | null }).ownerRepliedAt?.toISOString?.() ??
          new Date().toISOString(),
      },
    });
  } catch (error) {
    logApiError('business-profile/reviews POST', error);
    return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 });
  }
}
