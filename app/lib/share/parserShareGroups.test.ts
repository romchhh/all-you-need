import { describe, expect, it } from 'vitest';
import { foldCityKey } from '@/lib/city/cityNormalization';
import { getParserShareGroups, listParserShareGroupsForListing } from '@/lib/share/parserShareGroups';

describe('parserShareGroups', () => {
  it('loads enabled parser groups from JSON', () => {
    const groups = getParserShareGroups();
    expect(groups.length).toBeGreaterThan(40);
    expect(groups.some((g) => g.parserKey === 'secondhand_hh')).toBe(true);
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
