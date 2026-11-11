import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/search/searchSubscriptionNotifications', () => ({
  notifySearchSubscribersForListingId: vi.fn(),
}));

import { notifySearchSubscribersForListingId } from '@/lib/search/searchSubscriptionNotifications';

describe('POST /api/cron/notify-search-subscribers', () => {
  const prevSecret = process.env.CRON_SECRET;
  const prevBotKey = process.env.BOT_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-test-secret';
    delete process.env.BOT_API_KEY;
  });

  afterEach(() => {
    process.env.CRON_SECRET = prevSecret;
    if (prevBotKey !== undefined) process.env.BOT_API_KEY = prevBotKey;
    else delete process.env.BOT_API_KEY;
  });

  function post(body: unknown, auth?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth) headers.authorization = auth;
    return POST(
      new Request('http://localhost/api/cron/notify-search-subscribers', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }) as never
    );
  }

  it('returns 401 without Bearer token', async () => {
    const res = await post({ listingId: 1 });
    expect(res.status).toBe(401);
    expect(notifySearchSubscribersForListingId).not.toHaveBeenCalled();
  });

  it('returns 401 with wrong token', async () => {
    const res = await post({ listingId: 1 }, 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('returns 400 when listingId missing', async () => {
    const res = await post({}, 'Bearer cron-test-secret');
    expect(res.status).toBe(400);
  });

  it('notifies subscribers for valid listingId', async () => {
    vi.mocked(notifySearchSubscribersForListingId).mockResolvedValue({
      ok: true,
      matched: 3,
    });
    const res = await post({ listingId: 42 }, 'Bearer cron-test-secret');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, matched: 3 });
    expect(notifySearchSubscribersForListingId).toHaveBeenCalledWith(42);
  });

  it('accepts BOT_API_KEY when CRON_SECRET unset', async () => {
    delete process.env.CRON_SECRET;
    process.env.BOT_API_KEY = 'bot-key-only';
    vi.mocked(notifySearchSubscribersForListingId).mockResolvedValue({ ok: true, matched: 0 });
    const res = await post({ listingId: 7 }, 'Bearer bot-key-only');
    expect(res.status).toBe(200);
    expect(notifySearchSubscribersForListingId).toHaveBeenCalledWith(7);
  });
});
