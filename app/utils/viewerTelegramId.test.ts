import { describe, expect, it } from 'vitest';
import { resolveViewerTelegramId } from '@/utils/viewerTelegramId';

describe('resolveViewerTelegramId', () => {
  it('prefers profile id', () => {
    expect(resolveViewerTelegramId('111', 222)).toBe('111');
  });

  it('falls back to webApp user id', () => {
    expect(resolveViewerTelegramId(null, 222)).toBe('222');
    expect(resolveViewerTelegramId('', 333)).toBe('333');
  });

  it('returns null when nothing available', () => {
    expect(resolveViewerTelegramId(null, null)).toBeNull();
  });
});
