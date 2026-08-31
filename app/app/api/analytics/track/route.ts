import { NextRequest, NextResponse } from 'next/server';
import { insertAnalyticsEvent } from '@/lib/analytics/analyticsStore';
import { isAnalyticsEventEnabled } from '@/lib/testing/analyticsConfig';
import type { AnalyticsEventName } from '@/constants/analyticsEvents';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    }

    const eventName = String(body.eventName || '').trim();
    if (!eventName) {
      return NextResponse.json({ error: 'eventName is required' }, { status: 400 });
    }

    const enabled = await isAnalyticsEventEnabled(eventName as AnalyticsEventName);
    if (!enabled) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await insertAnalyticsEvent({
      eventName,
      eventGroup: body.eventGroup ? String(body.eventGroup) : undefined,
      telegramId: body.telegramId != null ? String(body.telegramId) : null,
      userId: typeof body.userId === 'number' ? body.userId : null,
      entityType: body.entityType ? String(body.entityType) : null,
      entityId: body.entityId ? String(body.entityId) : null,
      metadata:
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as Record<string, unknown>)
          : null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Analytics track error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
