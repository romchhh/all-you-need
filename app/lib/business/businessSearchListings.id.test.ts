import { describe, expect, it } from 'vitest';
import { normalizeListingIds, toFinitePositiveId } from '@/lib/business/businessSearchListings';

describe('toFinitePositiveId / normalizeListingIds', () => {
  it('accepts number, numeric string, and bigint from PG', () => {
    expect(toFinitePositiveId(42)).toBe(42);
    expect(toFinitePositiveId('42')).toBe(42);
    expect(toFinitePositiveId(BigInt(42))).toBe(42);
  });

  it('rejects invalid values that Number.isFinite alone would mishandle', () => {
    expect(Number.isFinite(BigInt(42) as unknown as number)).toBe(false);
    expect(Number.isFinite('42')).toBe(false);
    expect(toFinitePositiveId(0)).toBeNull();
    expect(toFinitePositiveId(-1)).toBeNull();
    expect(toFinitePositiveId(null)).toBeNull();
    expect(toFinitePositiveId(undefined)).toBeNull();
    expect(toFinitePositiveId('')).toBeNull();
  });

  it('dedupes mixed id types', () => {
    expect(normalizeListingIds([1, '1', BigInt(1), 2, 'x', 0])).toEqual([1, 2]);
  });
});
