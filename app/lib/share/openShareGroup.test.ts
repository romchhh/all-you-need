import { describe, expect, it } from 'vitest';
import { extractPublicTelegramUsername } from './openShareGroup';

describe('extractPublicTelegramUsername', () => {
  it('parses public t.me usernames', () => {
    expect(extractPublicTelegramUsername('https://t.me/baraholkaberlin')).toBe('baraholkaberlin');
    expect(extractPublicTelegramUsername('t.me/kaufberli')).toBe('kaufberli');
  });

  it('rejects invite links', () => {
    expect(extractPublicTelegramUsername('https://t.me/+AbCdEf')).toBeNull();
    expect(extractPublicTelegramUsername('https://t.me/joinchat/AAAA')).toBeNull();
  });
});
