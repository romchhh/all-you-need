import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { expireDueBusinessSubscriptions } from '@/lib/businessProfileHelpers';

export async function POST(request: NextRequest) {
  return handleExpire(request);
}

export async function GET(request: NextRequest) {
  return handleExpire(request);
}

async function handleExpire(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expired = await expireDueBusinessSubscriptions();
    return NextResponse.json({ success: true, expired });
  } catch (error) {
    console.error('[cron expire-business-subscriptions]', error);
    return NextResponse.json({ error: 'Failed to expire business subscriptions' }, { status: 500 });
  }
}
