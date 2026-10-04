import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import { prisma } from '@/lib/prisma';
import { recomputeUserRating } from '@/lib/reviews/reviewService';
import { logApiError } from '@/lib/server/logApiError';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authorTelegramId = String(body.authorTelegramId || '').trim();
    const targetTelegramId = String(body.targetTelegramId || '').trim();
    const ratingRaw = Number(body.rating);
    const comment =
      typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null;
    const listingIdRaw = body.listingId != null ? Number(body.listingId) : null;
    const listingId =
      listingIdRaw != null && Number.isFinite(listingIdRaw) && listingIdRaw > 0 ? listingIdRaw : null;

    if (!authorTelegramId || !targetTelegramId) {
      return NextResponse.json({ error: 'Missing authorTelegramId or targetTelegramId' }, { status: 400 });
    }

    if (!Number.isFinite(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    }

    const rating = Math.round(ratingRaw);

    if (authorTelegramId === targetTelegramId) {
      return NextResponse.json({ error: 'Cannot review yourself' }, { status: 400 });
    }

    const author = await findUserByTelegramId(parseTelegramId(authorTelegramId));
    const target = await findUserByTelegramId(parseTelegramId(targetTelegramId));

    if (!author || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const existing = await prisma.review.findFirst({
      where: {
        userId: author.id,
        targetId: target.id,
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Review already exists' }, { status: 409 });
    }

    const review = await prisma.review.create({
      data: {
        userId: author.id,
        targetId: target.id,
        listingId,
        rating,
        comment,
      },
    });

    await recomputeUserRating(target.id);

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logApiError('reviews POST', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
