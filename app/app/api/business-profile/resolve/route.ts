import { NextRequest, NextResponse } from 'next/server';
import { ensureBusinessProfileConsistencyByTelegramId } from '@/lib/business/businessProfileConsistency';
import { logApiError } from '@/lib/server/logApiError';

export const dynamic = 'force-dynamic';

/** Легкий resolve для SellerProfileRouter: business vs personal без повної вітрини. */
export async function GET(request: NextRequest) {
  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId')?.trim();
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const state = await ensureBusinessProfileConsistencyByTelegramId(telegramId);

    if (!state.userId) {
      return NextResponse.json({ mode: 'personal', isActive: false, isPublic: false });
    }

    return NextResponse.json({
      mode: state.isPublic ? 'business' : 'personal',
      isActive: state.isActive,
      isPublic: state.isPublic,
      hasBusinessProfile: Boolean(state.profile),
    });
  } catch (error) {
    logApiError('business-profile/resolve GET', error);
    return NextResponse.json({ mode: 'personal', isActive: false, isPublic: false });
  }
}
