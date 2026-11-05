import { describe, expect, it } from 'vitest';
import {
  appendListingTextSearch,
  listingMatchesSearchQuery,
  sqlLikeContainsPattern,
} from '@/lib/listings/searchVariants';

describe('sqlLikeContainsPattern', () => {
  it('wraps term with % and strips wildcards', () => {
    expect(sqlLikeContainsPattern('iphone')).toBe('%iphone%');
    expect(sqlLikeContainsPattern('100%')).toBe('%100%');
    expect(sqlLikeContainsPattern('_test')).toBe('%test%');
    expect(sqlLikeContainsPattern('  a_b%c  ')).toBe('%abc%');
  });
});

describe('listingMatchesSearchQuery', () => {
  it('ignores parser author lines', () => {
    expect(
      listingMatchesSearchQuery(
        {
          title: 'Продам авто',
          description: 'Продам авто\n👤 Автор: @bmw',
          location: 'Berlin',
        },
        'bmw'
      )
    ).toBe(false);
  });

  it('matches title even when the author line is someone else', () => {
    expect(
      listingMatchesSearchQuery(
        {
          title: 'BMW X5',
          description: '👤 Автор: @other',
          location: 'Berlin',
        },
        'bmw'
      )
    ).toBe(true);
  });

  it('matches every word, not only a contiguous phrase', () => {
    expect(
      listingMatchesSearchQuery(
        { title: 'Розробка чат ботів', description: '', location: 'Kyiv' },
        'ботів чат'
      )
    ).toBe(true);
  });

  it('matches city aliases with and without umlauts', () => {
    expect(
      listingMatchesSearchQuery(
        { title: 'Квартира', description: '', location: 'München' },
        'мюнхен'
      )
    ).toBe(true);
    expect(
      listingMatchesSearchQuery(
        { title: 'Квартира', description: '', location: 'Munchen' },
        'мюнхен'
      )
    ).toBe(true);
  });
});

describe('appendListingTextSearch', () => {
  it('binds three placeholders per variant and skips author-only regexp', () => {
    const params: unknown[] = [];
    const where = appendListingTextSearch("WHERE l.status = 'active'", params, 'bmw', 'l');
    const placeholders = where.match(/\?/g) ?? [];
    expect(placeholders.length).toBe(params.length);
    expect(placeholders.length % 3).toBe(0);
    expect(where).not.toMatch(/regexp_replace/i);
    expect(params).toContain('%bmw%');
  });
});
