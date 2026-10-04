import { describe, expect, it } from 'vitest';
import { parsePortfolioImages, serializePortfolioImages } from '@/lib/businessProfileSettings';

describe('parsePortfolioImages', () => {
  it('returns empty for null/empty', () => {
    expect(parsePortfolioImages(null)).toEqual([]);
    expect(parsePortfolioImages('')).toEqual([]);
    expect(parsePortfolioImages('   ')).toEqual([]);
  });

  it('parses JSON array of paths', () => {
    expect(parsePortfolioImages('["a.jpg","b.png"]')).toEqual(['a.jpg', 'b.png']);
  });

  it('filters non-strings and blanks', () => {
    expect(parsePortfolioImages('[1,"ok",""]')).toEqual(['ok']);
  });

  it('returns empty on invalid JSON', () => {
    expect(parsePortfolioImages('not-json')).toEqual([]);
  });
});

describe('serializePortfolioImages', () => {
  it('dedupes, trims, and caps at 30', () => {
    const paths = Array.from({ length: 35 }, (_, i) => `p${i}.jpg`);
    const parsed = JSON.parse(serializePortfolioImages([' x ', 'x', ...paths])) as string[];
    expect(parsed[0]).toBe('x');
    expect(parsed.length).toBe(30);
  });
});
