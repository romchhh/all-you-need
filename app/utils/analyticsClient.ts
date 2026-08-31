'use client';

import type { AnalyticsEventGroup, AnalyticsEventName } from '@/constants/analyticsEvents';

type TrackAnalyticsPayload = {
  eventName: AnalyticsEventName | string;
  eventGroup?: AnalyticsEventGroup | string;
  telegramId?: string | number | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function trackAnalytics(payload: TrackAnalyticsPayload): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    ...payload,
    metadata: {
      ...(payload.metadata ?? {}),
      path: window.location.pathname,
      referrer: document.referrer || null,
    },
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/track', blob);
      return;
    }
  } catch {
    // fallback below
  }

  void fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}
