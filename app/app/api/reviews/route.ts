import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { prisma } from '@/lib/prisma';
import {
  afterReviewCreated,
  ensureReviewExtraColumns,
  recomputeUserRating,
} from '@/lib/reviews/reviewService';
import { viewerHadTradeGroundContact } from '@/lib/reviews/reviewInvite';
import { logApiError } from '@/lib/server/logApiError';

export async function POST(request: NextRequest) {
  try {
    await ensureReviewExtraColumns();

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

    const author = await findUserByTelegramId(authorTelegramId);
    const target = await findUserByTelegramId(targetTelegramId);

    if (!author || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!author.agreementAccepted) {
      return NextResponse.json(
        { error: 'Registration required', code: 'NOT_REGISTERED' },
        { status: 403 }
      );
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

    const hadContact = await viewerHadTradeGroundContact(author.id, target.id);

    const review = await prisma.review.create({
      data: {
        userId: author.id,
        targetId: target.id,
        listingId,
        rating,
        comment,
        hadTradeGroundContact: hadContact,
      } as Parameters<typeof prisma.review.create>[0]['data'],
    });

    await recomputeUserRating(target.id);

    const authorName =
      [author.firstName, author.lastName].filter(Boolean).join(' ').trim() ||
      (author.username ? `@${author.username}` : 'User');

    void afterReviewCreated({
      reviewId: review.id,
      authorUserId: author.id,
      targetUserId: target.id,
      rating,
      authorName,
    });

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        hadTradeGroundContact: hadContact,
        authorName,
      },
    });
  } catch (error) {
    logApiError('reviews POST', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
