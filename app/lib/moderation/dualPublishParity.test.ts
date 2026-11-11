/**
 * TS/Python узгодженість маршрутизації дублювання в канали (див. bot/utils/bot_category_map.py).
 */
import { describe, expect, it } from 'vitest';
import { channelPublishMode } from '@/lib/moderation/channelPublishEligibility';

/** Віддзеркалені кейси з bot/utils/test_bot_category_map.py */
const PYTHON_PARITY: Array<[string, string | null, string | null]> = [
  ['services_work', 'cleaning', 'services'],
  ['services_work', 'vacancies', 'trade'],
  ['realestate', 'rooms', 'trade'],
  ['electronics', 'smartphones', null],
  ['fashion', 'women_clothing', null],
  ['services_work', 'beauty_health', 'services'],
  ['realestate', 'rent_apartments', 'trade'],
  ['services_work', null, 'services'],
];

describe('dual publish channelPublishMode (TS/Python parity)', () => {
  it.each(PYTHON_PARITY)('category=%s sub=%s → %s', (cat, sub, expected) => {
    expect(channelPublishMode(cat, sub)).toBe(expected);
  });

  it('routes explicit event category to trade', () => {
    expect(channelPublishMode('event', null)).toBe('trade');
    expect(channelPublishMode('events', 'party')).toBe('trade');
  });
});
