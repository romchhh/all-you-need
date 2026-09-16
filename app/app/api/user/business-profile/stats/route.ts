import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import {
  EMPTY_BUSINESS_PROFILE_STATS,
  expireBusinessProfileIfNeeded,
  getBusinessProfileStatsForUserId,
  isBusinessProfileActive,
} from '@/lib/businessProfileHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId');
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(parseTelegramId(telegramId));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await expireBusinessProfileIfNeeded(user.id);
    const profile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }
    if (!isBusinessProfileActive(profile)) {
      return NextResponse.json({ error: 'Business profile not active' }, { status: 404 });
    }

    const stats = await getBusinessProfileStatsForUserId(user.id);
    return NextResponse.json(stats ?? EMPTY_BUSINESS_PROFILE_STATS);
  } catch (error) {
    console.error('[BusinessProfile stats GET]', error);
    return NextResponse.json({ error: 'Failed to fetch business stats' }, { status: 500 });
  }
}
