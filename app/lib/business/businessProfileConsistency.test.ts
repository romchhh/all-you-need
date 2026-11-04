import { describe, expect, it } from 'vitest';
import { isPublishedFlag } from '@/lib/businessCabinetState';
import { resolveListingProfileSyncAction } from '@/lib/business/businessProfileConsistency';

describe('resolveListingProfileSyncAction', () => {
  it('syncs vitrine when subscription active and published', () => {
    expect(resolveListingProfileSyncAction(true, true)).toBe('sync_vitrine');
  });

  it('demotes listings when paused (active but not published)', () => {
    expect(resolveListingProfileSyncAction(true, false)).toBe('demote_all_personal');
  });

  it('demotes listings when subscription inactive', () => {
    expect(resolveListingProfileSyncAction(false, false)).toBe('demote_all_personal');
    expect(resolveListingProfileSyncAction(false, true)).toBe('demote_all_personal');
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
