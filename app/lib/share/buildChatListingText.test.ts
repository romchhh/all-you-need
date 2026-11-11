import { describe, expect, it } from 'vitest';
import { buildDefaultChatListingText } from './buildChatListingText';

describe('buildDefaultChatListingText', () => {
  it('includes title price and listing id link', () => {
    const text = buildDefaultChatListingText(
      {
        id: 42,
        title: 'BMW 3',
        description: 'Test car',
        price: '14900',
        currency: 'EUR',
        location: 'Hamburg',
        negotiableLabel: 'Договірна',
        freeLabel: 'Free',
      },
      'uk'
    );
    expect(text).toContain('BMW 3');
    expect(text).toContain('14900');
    expect(text).toContain('listing_42');
  });
});
