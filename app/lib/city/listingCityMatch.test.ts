import { describe, expect, it } from 'vitest';
import { cityFilterPatterns } from '@/lib/city/listingCityMatch';
import { listingCityKeyFromLocation, normalizeCityInput } from '@/lib/city/cityNormalization';

describe('cityFilterPatterns', () => {
  it('includes canonical and raw LIKE patterns', () => {
    const patterns = cityFilterPatterns('wedel');
    expect(patterns).toContain('%Wedel%');
    expect(patterns.some((p) => p.includes('wedel') || p.includes('Wedel'))).toBe(true);
  });
});

describe('listingCityKeyFromLocation', () => {
  it('uses first segment before comma and normalizes aliases', () => {
    expect(listingCityKeyFromLocation('Hamburg, Germany')).toBe(normalizeCityInput('Hamburg'));
    expect(listingCityKeyFromLocation('  Wedel  ')).toBe(normalizeCityInput('Wedel'));
  });
});
