import { normalizeCityInput } from '@/lib/city/cityNormalization';

export function normalizeCyrillicToLower(text: string): string {
  return text.toLowerCase();
}

export function generateSearchVariants(searchText: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeCyrillicToLower(searchText);

  variants.add(searchText);
  variants.add(normalized);

  if (searchText.length > 0) {
    const firstUpper = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    variants.add(firstUpper);
  }

  variants.add(searchText.toUpperCase());

  return Array.from(variants);
}

export function generateSearchVariantsWithCities(searchText: string): string[] {
  const baseVariants = generateSearchVariants(searchText);
  const trimmed = searchText.trim();
  if (!trimmed) return baseVariants;

  if (/\s/.test(trimmed)) {
    return baseVariants;
  }

  const normalizedCity = normalizeCityInput(trimmed);
  if (normalizedCity === trimmed) {
    return baseVariants;
  }

  const cityVariants = generateSearchVariants(normalizedCity);
  return Array.from(new Set([...baseVariants, ...cityVariants]));
}
