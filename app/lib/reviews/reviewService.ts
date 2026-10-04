import { prisma } from '@/lib/prisma';

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
