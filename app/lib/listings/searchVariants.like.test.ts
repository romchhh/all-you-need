import { describe, expect, it } from 'vitest';
import { sqlLikeContainsPattern } from '@/lib/listings/searchVariants';

describe('sqlLikeContainsPattern', () => {
  it('wraps term with % and strips wildcards', () => {
    expect(sqlLikeContainsPattern('iphone')).toBe('%iphone%');
    expect(sqlLikeContainsPattern('100%')).toBe('%100%');
    expect(sqlLikeContainsPattern('_test')).toBe('%test%');
    expect(sqlLikeContainsPattern('  a_b%c  ')).toBe('%abc%');
  });
});
