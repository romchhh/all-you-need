import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId } from '@/utils/userHelpers';
import {
  expireBusinessProfileIfNeeded,
  getPublicBusinessProfileByTelegramId,
  isBusinessProfileActive,
  formatBusinessMemberSince,
} from '@/lib/businessProfileHelpers';
import { prisma } from '@/lib/prisma';
import { sendBusinessNewFollowerNotification } from '@/lib/telegram/telegramNotifications';
import { parsePortfolioItems } from '@/lib/businessProfileSettings';
import { fetchFormattedActiveListingsByIds } from '@/lib/business/businessSearchListings';
import { logApiError } from '@/lib/server/logApiError';

export async function GET(request: NextRequest) {
  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId');
    const lang = (request.nextUrl.searchParams.get('lang') || 'uk') as 'uk' | 'ru';
    const viewerTelegramId = request.nextUrl.searchParams.get('viewerTelegramId');

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const data = await getPublicBusinessProfileByTelegramId(telegramId);
    if (!data) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    const { profile, user, listingIds } = data;
    let listings: Awaited<ReturnType<typeof fetchFormattedActiveListingsByIds>> = [];
    try {
      listings = await fetchFormattedActiveListingsByIds(listingIds);
    } catch (listingErr) {
      logApiError('business-profile/public listings', listingErr);
    }
    const activeListingsCount = listings.length;
    const vitrineListingIds = listings.map((listing) => listing.id);

    let isFollowing = false;
    const isOwn = Boolean(viewerTelegramId && String(viewerTelegramId) === String(telegramId));
    let viewerHasReviewed = false;
    if (viewerTelegramId && !isOwn) {
      try {
        const viewer = await findUserByTelegramId(viewerTelegramId);
        if (viewer) {
          const follow = await prisma.businessFollow.findUnique({
            where: {
              businessProfileId_followerUserId: {
                businessProfileId: profile.id,
                followerUserId: viewer.id,
              },
            },
          });
          isFollowing = Boolean(follow);
          const priorReview = await prisma.review.findFirst({
            where: { userId: viewer.id, targetId: user.id },
          });
          viewerHasReviewed = Boolean(priorReview);
        }
      } catch {
        // invalid viewer id — treat as guest
      }
    }

    let reviews: Array<{
      id: number;
      rating: number;
      comment: string | null;
      createdAt: string;
      authorName: string;
      authorAvatar: string | null;
    }> = [];

    try {
      const reviewRows = await prisma.review.findMany({
        where: { targetId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              username: true,
              avatar: true,
            },
          },
        },
      });

      reviews = reviewRows.map((row) => {
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
        };
      });
    } catch (reviewErr) {
      console.error('[BusinessProfile public GET] reviews', reviewErr);
    }

    let portfolioItems: Array<{ url: string; description?: string }> = [];
    try {
      portfolioItems = parsePortfolioItems(profile.portfolioImages);
    } catch {
      portfolioItems = [];
    }
    const portfolioImages = portfolioItems.map((item) => item.url);

    return NextResponse.json({
      isActive: isBusinessProfileActive(profile),
      isOwn,
      isFollowing,
      viewerHasReviewed,
      vitrineListingIds,
      listings,
      profile: {
        id: profile.id,
        businessName: profile.businessName,
        logo: profile.logo,
        coverImage: profile.coverImage,
        category: profile.category,
        subcategory: profile.subcategory,
        description: profile.description,
        city: profile.city,
        address: profile.address,
        serviceArea: profile.serviceArea,
        serviceRadiusKm: profile.serviceRadiusKm,
        telegram: profile.telegram,
        phone: profile.phone,
        instagram: profile.instagram,
        website: profile.website,
        workingHours: profile.workingHours,
        followersCount: profile.followersCount,
        activeListingsCount,
        memberSince: formatBusinessMemberSince(user.createdAt, lang),
        sellerTelegramId: telegramId,
        sellerUsername: user.username,
        rating: Number(user.rating) || 0,
        reviewsCount: Number(user.reviewsCount) || 0,
        portfolioImages,
        portfolioItems,
      },
      reviews,
    });
  } catch (error) {
    logApiError('business-profile/public GET', error);
    return NextResponse.json({ error: 'Failed to fetch business profile' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId: businessTelegramId, followerTelegramId } = body;
    const action = body.action === 'unfollow' ? 'unfollow' : 'follow';

    if (!businessTelegramId || !followerTelegramId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const businessUser = await findUserByTelegramId(businessTelegramId);
    const followerUser = await findUserByTelegramId(followerTelegramId);

    if (!businessUser || !followerUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (businessUser.id === followerUser.id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    await expireBusinessProfileIfNeeded(businessUser.id);
    const profile = await prisma.businessProfile.findUnique({ where: { userId: businessUser.id } });

    if (!profile || !isBusinessProfileActive(profile)) {
      return NextResponse.json({ error: 'Business profile not active' }, { status: 404 });
    }

    const existing = await prisma.businessFollow.findUnique({
      where: {
        businessProfileId_followerUserId: {
          businessProfileId: profile.id,
          followerUserId: followerUser.id,
        },
      },
    });

    if (action === 'unfollow') {
      if (!existing) {
        return NextResponse.json({
          success: true,
          isFollowing: false,
          followersCount: profile.followersCount,
        });
      }

      await prisma.businessFollow.delete({ where: { id: existing.id } });
      const updated = await prisma.businessProfile.update({
        where: { id: profile.id },
        data: { followersCount: Math.max(0, profile.followersCount - 1) },
      });

      return NextResponse.json({
        success: true,
        isFollowing: false,
        followersCount: updated.followersCount,
      });
    }

    if (existing) {
      return NextResponse.json({
        success: true,
        isFollowing: true,
        followersCount: profile.followersCount,
      });
    }

    await prisma.businessFollow.create({
      data: {
        businessProfileId: profile.id,
        followerUserId: followerUser.id,
      },
    });

    const updated = await prisma.businessProfile.update({
      where: { id: profile.id },
      data: { followersCount: { increment: 1 } },
    });

    const followerName =
      [followerUser.firstName, followerUser.lastName].filter(Boolean).join(' ').trim() ||
      followerUser.username ||
      String(followerUser.telegramId);

    void sendBusinessNewFollowerNotification({
      ownerTelegramId: businessUser.telegramId,
      businessName: profile.businessName,
      followerName,
      followerUsername: followerUser.username,
      followersCount: updated.followersCount,
    }).catch((err) => {
      console.error('[BusinessProfile follow notify]', err);
    });

    return NextResponse.json({
      success: true,
      isFollowing: true,
      followersCount: updated.followersCount,
    });
  } catch (error) {
    console.error('[BusinessProfile follow POST]', error);
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}
