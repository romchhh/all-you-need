import { prisma } from '@/lib/prisma';
import { notifyBusinessOwnerNewReview } from '@/lib/reviews/reviewNotify';

export async function recomputeUserRating(targetUserId: number): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { targetId: targetUserId },
    _avg: { rating: true },
    _count: { id: true },
  });

  const reviewsCount = agg._count.id;
  const rating =
    reviewsCount > 0 && agg._avg.rating != null
      ? Math.round(Number(agg._avg.rating) * 10) / 10
      : 0;

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      reviewsCount,
      rating,
    },
  });
}

export async function ensureReviewExtraColumns(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "hadTradeGroundContact" BOOLEAN NOT NULL DEFAULT false`
    );
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "ownerReply" TEXT`);
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "ownerRepliedAt" TIMESTAMP(3)`
    );
  } catch {
    /* ignore */
  }
}

export async function ensureBusinessReviewInviteTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BusinessReviewInvite" (
        "id" SERIAL NOT NULL,
        "viewerUserId" INTEGER NOT NULL,
        "businessUserId" INTEGER NOT NULL,
        "businessProfileId" INTEGER,
        "businessName" TEXT,
        "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "inviteDueAt" TIMESTAMP(3) NOT NULL,
        "inviteSentAt" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BusinessReviewInvite_pkey" PRIMARY KEY ("id")
      )
    `);
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "BusinessReviewInvite_viewerUserId_businessUserId_key" ON "BusinessReviewInvite"("viewerUserId", "businessUserId")`
    );
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "BusinessReviewInvite_status_inviteDueAt_idx" ON "BusinessReviewInvite"("status", "inviteDueAt")`
    );
  } catch {
    /* ignore */
  }
}

export type OwnerReviewRow = {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
  authorAvatar: string | null;
  hadTradeGroundContact: boolean;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
};

export async function listOwnerBusinessReviews(
  targetUserId: number,
  filter: 'all' | 'unreplied' = 'all'
): Promise<{ total: number; unrepliedCount: number; reviews: OwnerReviewRow[] }> {
  await ensureReviewExtraColumns();

  const where =
    filter === 'unreplied'
      ? { targetId: targetUserId, ownerReply: null }
      : { targetId: targetUserId };

  const [total, unrepliedCount, rows] = await Promise.all([
    prisma.review.count({ where: { targetId: targetUserId } }),
    prisma.review.count({
      where: { targetId: targetUserId, ownerReply: null },
    }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: { firstName: true, lastName: true, username: true, avatar: true },
        },
      },
    }),
  ]);

  const reviews: OwnerReviewRow[] = rows.map((row) => {
    const authorName =
      [row.user.firstName, row.user.lastName].filter(Boolean).join(' ').trim() ||
      (row.user.username ? `@${row.user.username}` : '');
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      authorName,
      authorAvatar: row.user.avatar,
      hadTradeGroundContact: Boolean((row as { hadTradeGroundContact?: boolean }).hadTradeGroundContact),
      ownerReply: (row as { ownerReply?: string | null }).ownerReply ?? null,
      ownerRepliedAt: (row as { ownerRepliedAt?: Date | null }).ownerRepliedAt
        ? (row as { ownerRepliedAt: Date }).ownerRepliedAt.toISOString()
        : null,
    };
  });

  return { total, unrepliedCount, reviews };
}

/** Після створення відгуку — сповістити власника і закрити invite. */
export async function afterReviewCreated(params: {
  reviewId: number;
  authorUserId: number;
  targetUserId: number;
  rating: number;
  authorName: string;
}): Promise<void> {
  try {
    await ensureBusinessReviewInviteTable();
    await prisma.businessReviewInvite.updateMany({
      where: {
        viewerUserId: params.authorUserId,
        businessUserId: params.targetUserId,
        status: { in: ['pending', 'sent'] },
      },
      data: { status: 'completed', updatedAt: new Date() },
    });
  } catch (e) {
    console.error('[afterReviewCreated] invite', e);
  }

  try {
    const [owner, profile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: params.targetUserId },
        select: { telegramId: true },
      }),
      prisma.businessProfile.findUnique({
        where: { userId: params.targetUserId },
        select: { businessName: true },
      }),
    ]);
    if (!owner?.telegramId) return;
    await notifyBusinessOwnerNewReview({
      ownerTelegramId: owner.telegramId,
      businessName: profile?.businessName?.trim() || 'Business',
      authorName: params.authorName,
      rating: params.rating,
      sellerTelegramId: String(owner.telegramId),
    });
  } catch (e) {
    console.error('[afterReviewCreated] notify', e);
  }
}
