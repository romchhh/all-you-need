import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { prisma } from '@/lib/prisma';
import { scheduleBusinessReviewInvite } from '@/lib/reviews/reviewInvite';
import { logApiError } from '@/lib/server/logApiError';

/**
 * Фіксує «Написати компанії» для follow-up відгуку через 3 дні.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const viewerTelegramId = String(body.viewerTelegramId || '').trim();
    const sellerTelegramId = String(body.sellerTelegramId || '').trim();
    const channel = String(body.channel || 'telegram').trim();

    if (!viewerTelegramId || !sellerTelegramId) {
      return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
    }

    // Лише «Написати» (telegram) планує invite
    if (channel !== 'telegram') {
      return NextResponse.json({ success: true, scheduled: false });
    }

    if (viewerTelegramId === sellerTelegramId) {
      return NextResponse.json({ success: true, scheduled: false });
    }

    const viewer = await findUserByTelegramId(viewerTelegramId);
    const seller = await findUserByTelegramId(sellerTelegramId);
    if (!viewer || !seller) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!viewer.agreementAccepted) {
      return NextResponse.json({ success: true, scheduled: false, reason: 'not_registered' });
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { userId: seller.id },
      select: { id: true, businessName: true },
    });
    if (!profile) {
      return NextResponse.json({ success: true, scheduled: false, reason: 'no_business' });
    }

    await scheduleBusinessReviewInvite({
      viewerUserId: viewer.id,
      businessUserId: seller.id,
      businessProfileId: profile.id,
      businessName: profile.businessName,
    });

    return NextResponse.json({ success: true, scheduled: true });
  } catch (error) {
    logApiError('business-profile/contact POST', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
