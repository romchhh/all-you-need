import { describe, expect, it } from 'vitest';
import { normalizeQueryKey } from './normalizeQueryKey';

describe('normalizeQueryKey', () => {
  it('lowercases and collapses spaces', () => {
    expect(normalizeQueryKey('  iPhone   13  ')).toBe('iphone 13');
  });

  it('matches search-subscriptions route behavior', () => {
    expect(normalizeQueryKey('BMW X5')).toBe('bmw x5');
  });
});
