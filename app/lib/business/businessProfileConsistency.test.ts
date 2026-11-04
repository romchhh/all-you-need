import { describe, expect, it } from 'vitest';
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
