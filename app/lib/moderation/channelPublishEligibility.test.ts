import { describe, expect, it } from 'vitest';
import {
  channelPublishMode,
  isHamburgLocation,
} from '@/lib/moderation/channelPublishEligibility';

describe('channelPublishMode', () => {
  it('routes services to services channels', () => {
    expect(channelPublishMode('services_work', 'cleaning')).toBe('services');
    expect(channelPublishMode('services_work', 'beauty_health')).toBe('services');
    expect(channelPublishMode('services_work', null)).toBe('services');
  });

  it('routes jobs and realestate to trade channels', () => {
    expect(channelPublishMode('services_work', 'vacancies')).toBe('trade');
    expect(channelPublishMode('services_work', 'looking_for_work')).toBe('trade');
    expect(channelPublishMode('realestate', 'rent_apartments')).toBe('trade');
  });

  it('skips goods', () => {
    expect(channelPublishMode('electronics', 'smartphones')).toBeNull();
    expect(channelPublishMode('fashion', 'women_clothing')).toBeNull();
  });
});

describe('isHamburgLocation', () => {
  it('detects hamburg', () => {
    expect(isHamburgLocation('Hamburg')).toBe(true);
    expect(isHamburgLocation('Hamburg, Germany')).toBe(true);
    expect(isHamburgLocation('гамбург')).toBe(true);
  });

  it('rejects germany-wide and other cities', () => {
    expect(isHamburgLocation('Germany')).toBe(false);
    expect(isHamburgLocation('Berlin')).toBe(false);
  });
});
