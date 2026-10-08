import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId } from '@/utils/userHelpers';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const telegramIdRaw = body.telegramId;
    const autoRenew = body.autoRenew;

    if (!telegramIdRaw || typeof autoRenew !== 'boolean') {
      return NextResponse.json({ error: 'telegramId and autoRenew are required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(telegramIdRaw);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    if (profile.plan !== 'business_pro') {
      return NextResponse.json({ error: 'Auto-renew applies only to Business PRO' }, { status: 400 });
    }

    try {
      await prisma.businessProfile.update({
        where: { id: profile.id },
        data: { subscriptionAutoRenew: autoRenew, updatedAt: new Date() },
      });
    } catch (err) {
      console.error('[Business auto-renew] update failed', err);
      return NextResponse.json(
        { error: 'Auto-renew setting is not available yet. Run database migration.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, subscriptionAutoRenew: autoRenew });
  } catch (error) {
    console.error('[Business auto-renew]', error);
    return NextResponse.json({ error: 'Failed to update auto-renew' }, { status: 500 });
  }
}
