import { describe, expect, it } from 'vitest';
import { foldCityKey } from '@/lib/city/cityNormalization';
import { getParserShareGroups, listParserShareGroupsForListing } from '@/lib/share/parserShareGroups';

describe('parserShareGroups', () => {
  it('loads enabled parser groups from JSON', () => {
    const groups = getParserShareGroups();
    expect(groups.length).toBeGreaterThan(40);
    expect(groups.some((g) => g.parserKey === 'secondhand_hh')).toBe(true);
  });

  it('keeps service groups out of a goods category', () => {
    const list = listParserShareGroupsForListing({
      listingCityFold: '',
      listingCategory: 'auto',
      categoryFilter: 'auto',
      cityFilter: '__all__',
    });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((g) => g.kind === 'goods')).toBe(true);
  });

  it('returns only service groups for services', () => {
    const list = listParserShareGroupsForListing({
      listingCityFold: '',
      listingCategory: 'services_work',
      categoryFilter: 'services_work',
      cityFilter: '__all__',
    });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((g) => g.kind === 'services')).toBe(true);
  });

  it('prioritizes listing city Hamburg', () => {
    const list = listParserShareGroupsForListing({
      listingCityFold: foldCityKey('Hamburg'),
      listingCategory: 'electronics',
      categoryFilter: 'all',
      cityFilter: null,
    });
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].city).toBe('Hamburg');
  });
});
