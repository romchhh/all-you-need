import type { Category } from '@/types';
import {
  resolveListingCategoryFilter,
  stashPendingListingCategory,
  toBazaarHomeCategoryFilter,
  type ListingCategoryFilter,
} from '@/utils/listingCategoryFilter';

/** URL базару з фільтром категорії (як вибір категорії на головній). */
export function buildBazaarCategoryUrl(
  lang: string,
  filter: ListingCategoryFilter
): string {
  if (typeof window === 'undefined') {
    const params = new URLSearchParams();
    params.set('category', filter.categoryId);
    if (filter.subcategoryId) params.set('subcategory', filter.subcategoryId);
    const q = params.toString();
    return `/${lang}/bazaar${q ? `?${q}` : ''}`;
  }

  const params = new URLSearchParams(window.location.search);
  params.set('category', filter.categoryId);
  if (filter.subcategoryId) {
    params.set('subcategory', filter.subcategoryId);
  } else {
    params.delete('subcategory');
  }
  params.delete('listing');
  params.delete('user');
  const q = params.toString();
  return `/${lang}/bazaar${q ? `?${q}` : ''}`;
}

/** Перехід на головну (базар) з категорією товару — той самий екран, що й клік по категорії на головній. */
export function navigateToListingCategory(
  router: { push: (url: string) => void },
  lang: string,
  categories: Category[],
  rawCategory: string,
  rawSubcategory: string | null
): boolean {
  const resolved = resolveListingCategoryFilter(categories, rawCategory, rawSubcategory);
  if (!resolved) return false;
  navigateToListingCategoryResolved(router, lang, resolved);
  return true;
}

export function navigateToListingCategoryResolved(
  router: { push: (url: string) => void },
  lang: string,
  resolved: ListingCategoryFilter
): void {
  const catalogFilter = toBazaarHomeCategoryFilter(resolved);
  stashPendingListingCategory(catalogFilter.categoryId, catalogFilter.subcategoryId);
  router.push(buildBazaarCategoryUrl(lang, catalogFilter));
}
