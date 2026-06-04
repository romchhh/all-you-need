import type { Category } from '@/types';

export type ListingCategoryFilter = {
  categoryId: string;
  subcategoryId: string | null;
};

function findParentBySubcategoryId(
  categories: Category[],
  subcategoryId: string
): ListingCategoryFilter | null {
  for (const cat of categories) {
    if (cat.subcategories?.some((s) => s.id === subcategoryId)) {
      return { categoryId: cat.id, subcategoryId };
    }
  }
  return null;
}

/**
 * Нормалізує category/subcategory з оголошення для фільтра каталогу.
 * У старих записів у полі category інколи потрапляє id підкатегорії (наприклад "other").
 */
export function resolveListingCategoryFilter(
  categories: Category[],
  rawCategory: string | null | undefined,
  rawSubcategory: string | null | undefined
): ListingCategoryFilter | null {
  const categoryRaw = rawCategory?.trim() || null;
  const subRaw = rawSubcategory?.trim() || null;

  if (!categoryRaw && !subRaw) return null;

  const topLevel = categoryRaw ? categories.find((c) => c.id === categoryRaw) : undefined;
  if (topLevel) {
    const subValid =
      subRaw && topLevel.subcategories?.some((s) => s.id === subRaw) ? subRaw : null;
    return { categoryId: topLevel.id, subcategoryId: subValid };
  }

  if (categoryRaw) {
    const asSubcategory = findParentBySubcategoryId(categories, categoryRaw);
    if (asSubcategory) {
      const cat = categories.find((c) => c.id === asSubcategory.categoryId);
      const subValid =
        subRaw && cat?.subcategories?.some((s) => s.id === subRaw) ? subRaw : asSubcategory.subcategoryId;
      return { categoryId: asSubcategory.categoryId, subcategoryId: subValid };
    }
  }

  if (subRaw) {
    const fromSub = findParentBySubcategoryId(categories, subRaw);
    if (fromSub) return fromSub;
  }

  return null;
}

/** Як вибір категорії на головній: увесь розділ, без підкатегорії. */
export function toBazaarHomeCategoryFilter(resolved: ListingCategoryFilter): ListingCategoryFilter {
  return { categoryId: resolved.categoryId, subcategoryId: null };
}

export function normalizeListingCategoryFilter(
  categories: Category[],
  filter: ListingCategoryFilter
): ListingCategoryFilter | null {
  return (
    resolveListingCategoryFilter(categories, filter.categoryId, filter.subcategoryId) ?? null
  );
}

export const PENDING_LISTING_CATEGORY_KEY = 'pendingListingCategory';

export function buildCategoryCatalogUrl(
  lang: string,
  filter: ListingCategoryFilter
): string {
  const params = new URLSearchParams();
  params.set('category', filter.categoryId);
  if (filter.subcategoryId) {
    params.set('subcategory', filter.subcategoryId);
  }
  const query = params.toString();
  return `/${lang}/categories${query ? `?${query}` : ''}`;
}

export function readCategoryFilterFromSearchParams(
  categories: Category[],
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): ListingCategoryFilter | null {
  const category = searchParams.get('category');
  if (!category) return null;
  return resolveListingCategoryFilter(categories, category, searchParams.get('subcategory'));
}

export function stashPendingListingCategory(
  categoryId: string,
  subcategoryId: string | null
): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(
    PENDING_LISTING_CATEGORY_KEY,
    JSON.stringify({ category: categoryId, subcategory: subcategoryId })
  );
}

export function consumePendingListingCategory(): ListingCategoryFilter | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(PENDING_LISTING_CATEGORY_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_LISTING_CATEGORY_KEY);
  try {
    const parsed = JSON.parse(raw) as { category?: string; subcategory?: string | null };
    if (!parsed.category) return null;
    return {
      categoryId: parsed.category,
      subcategoryId: parsed.subcategory ?? null,
    };
  } catch {
    return null;
  }
}
