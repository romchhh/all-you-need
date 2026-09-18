import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import { deactivateBusinessProfile, pauseBusinessProfile } from '@/lib/businessProfileHelpers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const telegramId = String(body.telegramId || '');
    const hard = body.hard === true;
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(parseTelegramId(telegramId));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    if (hard) {
      await deactivateBusinessProfile(user.id, profile.id);
    } else {
      await pauseBusinessProfile(user.id, profile.id);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BusinessProfile deactivate POST]', error);
    return NextResponse.json({ error: 'Failed to deactivate business profile' }, { status: 500 });
  }
}
