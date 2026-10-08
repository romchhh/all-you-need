import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_MAX,
  parsePortfolioImages,
  parsePortfolioItems,
  serializePortfolioImages,
  serializePortfolioItems,
} from '@/lib/businessProfileSettings';

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

describe('parsePortfolioItems', () => {
  it('parses objects with optional description', () => {
    expect(
      parsePortfolioItems(
        JSON.stringify([{ url: 'a.jpg', description: '  Work  ' }, { path: 'b.png' }, 'c.jpg'])
      )
    ).toEqual([
      { url: 'a.jpg', description: 'Work' },
      { url: 'b.png' },
      { url: 'c.jpg' },
    ]);
  });

  it('dedupes urls and caps at PORTFOLIO_MAX', () => {
    const paths = Array.from({ length: PORTFOLIO_MAX + 5 }, (_, i) => `p${i}.jpg`);
    const items = parsePortfolioItems(JSON.stringify(['x.jpg', 'x.jpg', ...paths]));
    expect(items[0]?.url).toBe('x.jpg');
    expect(items.length).toBe(PORTFOLIO_MAX);
  });
});

describe('serializePortfolioImages', () => {
  it('dedupes, trims, and caps at PORTFOLIO_MAX', () => {
    const paths = Array.from({ length: PORTFOLIO_MAX + 5 }, (_, i) => `p${i}.jpg`);
    const parsed = JSON.parse(serializePortfolioImages([' x ', 'x', ...paths])) as string[];
    expect(parsed[0]).toBe('x');
    expect(parsed.length).toBe(PORTFOLIO_MAX);
  });
});

describe('serializePortfolioItems', () => {
  it('stores plain string array when no descriptions', () => {
    expect(serializePortfolioItems(['a.jpg', 'b.jpg'])).toBe('["a.jpg","b.jpg"]');
  });

  it('stores objects when descriptions present', () => {
    const raw = serializePortfolioItems([
      { url: 'a.jpg', description: 'One' },
      { url: 'b.jpg' },
    ]);
    expect(JSON.parse(raw)).toEqual([
      { url: 'a.jpg', description: 'One' },
      { url: 'b.jpg' },
    ]);
  });
});
