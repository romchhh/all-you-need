import { describe, expect, it } from 'vitest';
import {
  resolveListingContactAction,
  resolveListingContactUsername,
} from '@/lib/listingContactResolve';

describe('resolveListingContactUsername', () => {
  it('prefers parser author username', () => {
    expect(
      resolveListingContactUsername('aggregator', '123', 'desc', null, 'realauthor')
    ).toBe('realauthor');
  });

  it('strips @ from seller username when not aggregator', () => {
    expect(resolveListingContactUsername('@seller', '999', null, null, null)).toBe('seller');
  });

  it('opens original post for parser aggregator without author', () => {
    const action = resolveListingContactAction({
      description: '',
      seller: { name: 'Bot', avatar: '', phone: '', telegramId: '8590825131', username: 'parser_bot' },
      fromParser: true,
      originalPostUrl: 'https://t.me/channel/123',
    });
    expect(action).toEqual({ kind: 'open_url', url: 'https://t.me/channel/123' });
  });

  it('falls back to business seller username', () => {
    const businessSeller = {
      businessName: 'Biz',
      logo: null,
      category: '',
      city: '',
      activeListingsCount: 0,
      followersCount: 0,
      memberSince: '',
      plan: null,
      sellerTelegramId: '1',
      sellerUsername: '@biz',
      telegram: null,
    };
    expect(resolveListingContactUsername(null, null, null, businessSeller)).toBe('biz');
  });
});
