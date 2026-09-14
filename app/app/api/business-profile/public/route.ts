import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import {
  expireBusinessProfileIfNeeded,
  getPublicBusinessProfileByTelegramId,
  isBusinessProfileActive,
  formatBusinessMemberSince,
} from '@/lib/businessProfileHelpers';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId');
    const lang = (request.nextUrl.searchParams.get('lang') || 'uk') as 'uk' | 'ru';

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const data = await getPublicBusinessProfileByTelegramId(telegramId);
    if (!data) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    const { profile, user, activeListingsCount, reviews } = data;

    return NextResponse.json({
      isActive: isBusinessProfileActive(profile),
      profile: {
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
        plan: profile.plan,
        followersCount: profile.followersCount,
        activeListingsCount,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
        memberSince: formatBusinessMemberSince(user.createdAt, lang),
        sellerTelegramId: telegramId,
        sellerUsername: user.username,
      },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('[BusinessProfile public GET]', error);
    return NextResponse.json({ error: 'Failed to fetch business profile' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId: businessTelegramId, followerTelegramId } = body;

    if (!businessTelegramId || !followerTelegramId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const businessUser = await findUserByTelegramId(parseTelegramId(businessTelegramId));
    const followerUser = await findUserByTelegramId(parseTelegramId(followerTelegramId));

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

    if (existing) {
      return NextResponse.json({ success: true, followersCount: profile.followersCount });
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

    return NextResponse.json({ success: true, followersCount: updated.followersCount });
  } catch (error) {
    console.error('[BusinessProfile follow POST]', error);
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}
