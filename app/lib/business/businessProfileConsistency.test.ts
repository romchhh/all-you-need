import { describe, expect, it } from 'vitest';
import {
  isBusinessProfilePubliclyVisible,
  isProPeriodCurrent,
  isPublishedFlag,
} from '@/lib/businessCabinetState';
import { resolveListingProfileSyncAction } from '@/lib/business/businessProfileConsistency';

describe('resolveListingProfileSyncAction', () => {
  it('syncs vitrine when the business page is published', () => {
    expect(resolveListingProfileSyncAction(true)).toBe('sync_vitrine');
  });

  it('demotes listings when the page is paused', () => {
    expect(resolveListingProfileSyncAction(false)).toBe('demote_all_personal');
  });
});

describe('free business stays public after PRO ends', () => {
  const ended = new Date(Date.now() - 86_400_000).toISOString();

  it('does not treat a published free profile as hidden', () => {
    expect(
      isBusinessProfilePubliclyVisible({
        subscriptionStatus: 'active',
        plan: 'business',
        subscriptionEndsAt: ended,
        isPublished: true,
      })
    ).toBe(true);
  });

  it('turns analytics off when the PRO date is in the past', () => {
    expect(
      isProPeriodCurrent({
        plan: 'business_pro',
        subscriptionStatus: 'active',
        subscriptionEndsAt: ended,
      })
    ).toBe(false);
    expect(
      isProPeriodCurrent({
        plan: 'business',
        subscriptionStatus: 'active',
        subscriptionEndsAt: ended,
      })
    ).toBe(false);
  });
});

describe('isPublishedFlag', () => {
  it('accepts boolean and legacy string/number flags', () => {
    expect(isPublishedFlag(true)).toBe(true);
    expect(isPublishedFlag(1)).toBe(true);
    expect(isPublishedFlag('true')).toBe(true);
    expect(isPublishedFlag('t')).toBe(true);
    expect(isPublishedFlag(false)).toBe(false);
    expect(isPublishedFlag(0)).toBe(false);
    expect(isPublishedFlag('false')).toBe(false);
  });
});
