import { describe, expect, it } from 'vitest';
import { cityFilterPatterns } from '@/lib/city/listingCityMatch';
import { citiesMatch, listingCityKeyFromLocation, normalizeCityInput } from '@/lib/city/cityNormalization';

describe('cityFilterPatterns', () => {
  it('includes canonical and raw LIKE patterns', () => {
    const patterns = cityFilterPatterns('wedel');
    expect(patterns).toContain('%Wedel%');
    expect(patterns.some((p) => p.includes('wedel') || p.includes('Wedel'))).toBe(true);
  });

  it('includes umlaut, ascii and alias spellings for München', () => {
    const patterns = cityFilterPatterns('Munchen');
    expect(patterns).toContain('%München%');
    expect(patterns).toContain('%Munchen%');
    expect(patterns.some((p) => p.toLowerCase().includes('munich'))).toBe(true);
  });
});

describe('normalizeCityInput', () => {
  it('maps ascii and english names onto the canonical city', () => {
    expect(normalizeCityInput('Munchen')).toBe('München');
    expect(normalizeCityInput('Koln')).toBe('Köln');
    expect(normalizeCityInput('munich')).toBe('München');
    expect(citiesMatch('Munchen', 'München')).toBe(true);
  });
});

describe('listingCityKeyFromLocation', () => {
  it('uses first segment before comma and normalizes aliases', () => {
    expect(listingCityKeyFromLocation('Hamburg, Germany')).toBe(normalizeCityInput('Hamburg'));
    expect(listingCityKeyFromLocation('  Wedel  ')).toBe(normalizeCityInput('Wedel'));
  });
});
