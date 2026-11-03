import { describe, expect, it } from 'vitest';
import {
  extractBrands,
  extractSizes,
  rankSimilarListings,
  scoreSimilarCandidate,
  buildSimilarSignals,
} from '@/lib/listings/similarListings';

describe('similarListings', () => {
  it('extracts car brand and size', () => {
    expect([...extractBrands('Продаю BMW X5 2018')]).toContain('bmw');
    expect([...extractSizes('Жіночі ботинки Nike розмір 38')]).toContain('38');
  });

  it('ranks same BMW model above other BMWs above other cars', () => {
    const source = {
      id: 1,
      title: 'BMW X5 3.0d xDrive',
      description: 'Автомобіль у хорошому стані',
      category: 'auto',
      subcategory: 'cars',
      price: '18000',
    };
    const candidates = [
      { id: 2, title: 'Audi A6 2019', category: 'auto', subcategory: 'cars', price: '17000' },
      { id: 3, title: 'BMW 320i', category: 'auto', subcategory: 'cars', price: '12000' },
      { id: 4, title: 'BMW X5 40d', category: 'auto', subcategory: 'cars', price: '19000' },
      { id: 5, title: 'Диван Ikea', category: 'home', subcategory: 'furniture', price: '100' },
    ];
    const ranked = rankSimilarListings(source, candidates, 10);
    expect(ranked[0]?.id).toBe(4);
    expect(ranked.map((r) => r.id)).toContain(3);
    expect(ranked[0]?.id).not.toBe(2);
    expect(ranked.map((r) => r.id)).not.toContain(5);
  });

  it('prefers same shoe brand + size', () => {
    const source = {
      id: 10,
      title: 'Жіночі ботинки Nike Air 38',
      description: 'Розмір 38, чорні',
      category: 'fashion',
      subcategory: 'women_shoes',
      price: '60',
    };
    const signals = buildSimilarSignals(source);
    const same = scoreSimilarCandidate(signals, {
      id: 11,
      title: 'Nike ботинки жіночі 38',
      category: 'fashion',
      subcategory: 'women_shoes',
      price: '55',
    });
    const otherBrand = scoreSimilarCandidate(signals, {
      id: 12,
      title: 'Adidas жіночі кросівки 38',
      category: 'fashion',
      subcategory: 'women_shoes',
      price: '55',
    });
    const otherCat = scoreSimilarCandidate(signals, {
      id: 13,
      title: 'Чоловічі Nike 42',
      category: 'fashion',
      subcategory: 'men_shoes',
      price: '55',
    });
    expect(same).toBeGreaterThan(otherBrand);
    expect(otherBrand).toBeGreaterThan(otherCat);
  });
});
