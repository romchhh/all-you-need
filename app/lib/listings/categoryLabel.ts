import type { Category } from '@/types';

/**
 * Підпис категорії для картки / деталей оголошення.
 * Старі оголошення: fashion + beauty_health (підкатегорію винесено в окремий розділ).
 */
export function getListingCategoryLabel(
  categories: Category[],
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
  t: (key: string) => string
): string | null {
  if (!categoryId) return null;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;
  if (!subcategoryId) return category.name;

  const sub = category.subcategories?.find((s) => s.id === subcategoryId);
  if (sub) return `${category.name} • ${sub.name}`;

  if (categoryId === 'fashion' && subcategoryId === 'beauty_health') {
    return `${category.name} • ${t('categories.subcategories.beauty_health')}`;
  }

  return category.name;
}
