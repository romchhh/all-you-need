import { describe, expect, it } from 'vitest';
import { resolveListingContactUsername } from '@/lib/listingContactResolve';

describe('resolveListingContactUsername', () => {
  it('prefers parser author username', () => {
    expect(
      resolveListingContactUsername('aggregator', '123', 'desc', null, 'realauthor')
    ).toBe('realauthor');
  });

  it('strips @ from seller username when not aggregator', () => {
    expect(resolveListingContactUsername('@seller', '999', null, null, null)).toBe('seller');
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
