import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
  ensureSearchSubscriptionTable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/telegram/telegramNotifications', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/utils/userHelpers', () => ({
  getUserLanguage: vi.fn().mockResolvedValue('uk'),
}));

import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram/telegramNotifications';
import { notifySearchSubscribersOfNewMarketplaceListing } from './searchSubscriptionNotifications';

describe('notifySearchSubscribersOfNewMarketplaceListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBAPP_URL = 'https://example.test';
  });

  it('sends only to subscribers whose query matches the listing', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        userId: 2,
        queryKey: 'iphone',
        queryText: 'iPhone',
        telegramId: '111',
      },
      {
        userId: 3,
        queryKey: 'bmw',
        queryText: 'BMW',
        telegramId: '222',
      },
    ]);

    await notifySearchSubscribersOfNewMarketplaceListing({
      listingId: 99,
      userId: 1,
      title: 'iPhone 13 Pro',
      description: 'Смартфон у відмінному стані',
      location: 'Berlin',
    });

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining('iPhone'),
      expect.any(Object)
    );
  });

  it('does not notify the listing author (filtered in SQL)', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);

    await notifySearchSubscribersOfNewMarketplaceListing({
      listingId: 1,
      userId: 1,
      title: 'Test',
      description: 'Test',
      location: 'Berlin',
    });

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});

describe('notifySearchSubscribersForListingId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBAPP_URL = 'https://example.test';
  });

  it('returns not_found when listing missing', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([]);
    const { notifySearchSubscribersForListingId } = await import('./searchSubscriptionNotifications');
    const result = await notifySearchSubscribersForListingId(404);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('returns not_active when listing is pending', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([
      {
        id: 5,
        userId: 1,
        title: 'X',
        description: '',
        location: 'Berlin',
        status: 'pending',
      },
    ]);
    const { notifySearchSubscribersForListingId } = await import('./searchSubscriptionNotifications');
    const result = await notifySearchSubscribersForListingId(5);
    expect(result).toEqual({ ok: false, reason: 'not_active' });
  });

  it('runs full notify path for active listing', async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([
        {
          id: 10,
          userId: 1,
          title: 'Sofa Berlin',
          description: 'Меблі',
          location: 'Berlin',
          status: 'active',
        },
      ])
      .mockResolvedValueOnce([{ queryText: 'sofa' }])
      .mockResolvedValueOnce([
        {
          userId: 2,
          queryKey: 'sofa',
          queryText: 'sofa',
          telegramId: '333',
        },
      ]);

    const { notifySearchSubscribersForListingId } = await import('./searchSubscriptionNotifications');
    const result = await notifySearchSubscribersForListingId(10);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(1);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  });
});
