'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Listing } from '@/types';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { useUser } from '@/features/user/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { SearchView } from '@/components/search/SearchView';
import { ListingDetail } from '@/components/listing/ListingDetail';
import { SellerProfileRouter } from '@/components/profile/SellerProfileRouter';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/features/ui/hooks/useToast';
import {
  getFavoritesFromStorage,
  addFavoriteToStorage,
  removeFavoriteFromStorage,
} from '@/utils/favorites';
import { getCategories } from '@/constants/categories';
import { navigateToListingCategory } from '@/lib/listings/navigation';
import { AppHeader } from '@/components/layout/AppHeader';

const SEARCH_SCROLL_KEY = 'searchScrollPosition';
const SEARCH_RETURN_LISTING_KEY = 'searchReturnListingId';

export default function SearchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { tg } = useTelegram();
  const { profile, isBlocked } = useUser();
  const { toast, showToast, hideToast } = useToast();

  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{
    telegramId: string;
    name: string;
    avatar: string;
    username?: string;
    phone?: string;
  } | null>(null);
  const previousListingRef = useRef<Listing | null>(null);
  const overlayOpenRef = useRef(false);
  const savedScrollRef = useRef(0);
  const returnListingIdRef = useRef<number | null>(null);
  const shouldRestoreScrollRef = useRef(false);
  const prevSelectedListing = useRef<Listing | null>(null);
  const prevSelectedSeller = useRef<{
    telegramId: string;
    name: string;
    avatar: string;
    username?: string;
    phone?: string;
  } | null>(null);

  const initialQuery = searchParams.get('q') ?? '';
  const initialCategory = searchParams.get('category');
  const initialEntityMode =
    searchParams.get('mode') === 'businesses' ? ('businesses' as const) : ('listings' as const);
  const initialCitiesFromUrl =
    searchParams
      .get('cities')
      ?.split(',')
      .map((c) => c.trim())
      .filter(Boolean) ?? [];

  const categories = useMemo(() => getCategories(t), [t]);

  useEffect(() => {
    if (lang === 'uk' || lang === 'ru') {
      setLanguage(lang);
    }
  }, [lang, setLanguage]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const telegramId = urlParams.get('telegramId');
      if (telegramId) {
        sessionStorage.setItem('telegramId', telegramId);
      }
    }
  }, []);

  useEffect(() => {
    setFavorites(getFavoritesFromStorage());
  }, []);

  // Deep-link: ?listing= при завантаженні
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listingParam = searchParams.get('listing');
    if (!listingParam || selectedListing) return;

    const id = Number(listingParam);
    if (Number.isNaN(id)) return;

    let cancelled = false;
    const viewerParam = profile?.telegramId ? `?viewerId=${profile.telegramId}` : '';

    fetch(`/api/listings/${id}${viewerParam}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((listing) => {
        if (!cancelled && listing) {
          setSelectedListing(listing as Listing);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [searchParams, profile?.telegramId, selectedListing]);

  // URL overlay для listing / seller
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const hasOverlay = Boolean(selectedListing || selectedSeller);

    if (hasOverlay && !overlayOpenRef.current) {
      overlayOpenRef.current = true;
      if (selectedListing) {
        url.searchParams.set('listing', selectedListing.id.toString());
        url.searchParams.delete('user');
      } else if (selectedSeller) {
        url.searchParams.set('user', selectedSeller.telegramId);
        url.searchParams.delete('listing');
      }
      window.history.pushState({ searchOverlay: true }, '', url.toString());
      return;
    }

    if (!hasOverlay && overlayOpenRef.current) {
      overlayOpenRef.current = false;
      url.searchParams.delete('listing');
      url.searchParams.delete('user');
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedListing, selectedSeller]);

  useEffect(() => {
    const handlePopState = () => {
      if (selectedListing || selectedSeller) {
        overlayOpenRef.current = false;
        setSelectedListing(null);
        setSelectedSeller(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedListing, selectedSeller]);

  const handleQueryChange = useCallback((query: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('bazaarSearchQuery');
    const url = new URL(window.location.href);
    url.searchParams.delete('listing');
    url.searchParams.delete('user');
    if (query.trim()) {
      url.searchParams.set('q', query.trim());
    } else {
      url.searchParams.delete('q');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleCategoryChange = useCallback((category: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (category) {
      url.searchParams.set('category', category);
    } else {
      url.searchParams.delete('category');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleSearchUrlState = useCallback(
    (state: { q: string; cities: string; mode: 'listings' | 'businesses' }) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      const q = state.q.trim();
      if (q) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      if (state.cities) url.searchParams.set('cities', state.cities);
      else url.searchParams.delete('cities');
      if (state.mode === 'businesses') url.searchParams.set('mode', 'businesses');
      else url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  const handleBack = useCallback(() => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bazaarSearchQuery');
    }
    router.replace(`/${lang}/bazaar`);
  }, [router, lang, tg]);

  const toggleFavorite = async (id: number) => {
    const isFavorite = favorites.has(id);

    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(id);
      else next.add(id);
      return next;
    });

    const delta = isFavorite ? -1 : 1;
    setSelectedListing((prev) =>
      prev && prev.id === id
        ? { ...prev, favoritesCount: Math.max(0, (prev.favoritesCount ?? 0) + delta) }
        : prev
    );

    tg?.HapticFeedback.notificationOccurred('success');

    if (isFavorite) {
      await removeFavoriteFromStorage(id, profile?.telegramId);
      showToast(t('listing.removeFromFavorites'), 'success');
    } else {
      await addFavoriteToStorage(id, profile?.telegramId);
      showToast(t('listing.addToFavorites'), 'success');
    }
  };

  const saveSearchScroll = useCallback((listingId?: number) => {
    if (typeof window === 'undefined') return;
    const y = window.scrollY || document.documentElement.scrollTop;
    savedScrollRef.current = y;
    localStorage.setItem(SEARCH_SCROLL_KEY, String(y));
    if (listingId != null) {
      returnListingIdRef.current = listingId;
      localStorage.setItem(SEARCH_RETURN_LISTING_KEY, String(listingId));
    }
  }, []);

  const restoreSearchScroll = useCallback(() => {
    if (typeof window === 'undefined') return;

    const listingId =
      returnListingIdRef.current ??
      Number.parseInt(localStorage.getItem(SEARCH_RETURN_LISTING_KEY) || '', 10);

    const tryScrollToListing = (attempt = 0) => {
      if (Number.isFinite(listingId) && listingId > 0) {
        const el = document.querySelector(
          `[data-listing-id="${listingId}"]`
        ) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
          return;
        }
        if (attempt < 16) {
          setTimeout(() => tryScrollToListing(attempt + 1), 120);
          return;
        }
      }

      const saved =
        savedScrollRef.current > 0
          ? savedScrollRef.current
          : Number.parseInt(localStorage.getItem(SEARCH_SCROLL_KEY) || '0', 10);
      if (saved > 0) {
        window.scrollTo({ top: saved, behavior: 'auto' });
        document.documentElement.scrollTop = saved;
        document.body.scrollTop = saved;
      }
    };

    setTimeout(() => tryScrollToListing(), 80);
  }, []);

  const handleSelectListing = useCallback(
    (listing: Listing) => {
      saveSearchScroll(listing.id);
      setSelectedListing(listing);
    },
    [saveSearchScroll]
  );

  const closeOverlay = useCallback(() => {
    shouldRestoreScrollRef.current = true;
    if (overlayOpenRef.current) {
      window.history.back();
      return;
    }
    setSelectedListing(null);
    setSelectedSeller(null);
  }, []);

  // Після закриття картки — повернутись у стрічку результатів на те саме місце
  useEffect(() => {
    const wasOpen =
      prevSelectedListing.current !== null || prevSelectedSeller.current !== null;
    const isNowClosed = selectedListing === null && selectedSeller === null;

    if (wasOpen && isNowClosed) {
      shouldRestoreScrollRef.current = true;
    }

    prevSelectedListing.current = selectedListing;
    prevSelectedSeller.current = selectedSeller;
  }, [selectedListing, selectedSeller]);

  useEffect(() => {
    if (selectedListing || selectedSeller) return;
    if (!shouldRestoreScrollRef.current) return;
    shouldRestoreScrollRef.current = false;
    restoreSearchScroll();
  }, [selectedListing, selectedSeller, restoreSearchScroll]);

  if (isBlocked && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 text-center">
        <p className="mb-2 text-lg font-medium text-white">⛔ {t('common.blocked')}</p>
        <p className="text-sm text-white/70">{t('menu.support') || 'Підтримка'}</p>
      </div>
    );
  }

  const searchPlaceholder = t('bazaar.whatInterestsYou');

  if (selectedSeller) {
    return (
      <div className="min-h-screen overflow-x-hidden">
        <SellerProfileRouter
          sellerTelegramId={selectedSeller.telegramId}
          sellerName={selectedSeller.name}
          sellerAvatar={selectedSeller.avatar}
          sellerUsername={selectedSeller.username}
          sellerPhone={selectedSeller.phone}
          onClose={closeOverlay}
          onBackToPreviousListing={() => {
            if (previousListingRef.current) {
              setSelectedListing(previousListingRef.current);
              previousListingRef.current = null;
              setSelectedSeller(null);
              return;
            }
            closeOverlay();
          }}
          onSelectListing={handleSelectListing}
          onToggleFavorite={toggleFavorite}
          favorites={favorites}
          tg={tg}
        />
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />
      </div>
    );
  }

  if (selectedListing) {
    return (
      <div className="min-h-screen overflow-x-hidden">
        <ListingDetail
          key={selectedListing.id}
          listing={selectedListing}
          isFavorite={favorites.has(selectedListing.id)}
          onClose={closeOverlay}
          onBack={closeOverlay}
          onToggleFavorite={toggleFavorite}
          onSelectListing={handleSelectListing}
          onViewSellerProfile={(telegramId, name, avatar, username, phone) => {
            previousListingRef.current = selectedListing;
            setSelectedSeller({
              telegramId,
              name,
              avatar,
              username: username || undefined,
              phone: phone || undefined,
            });
            setSelectedListing(null);
          }}
          favorites={favorites}
          tg={tg}
          onAutoRenewPersist={(id, autoRenew) =>
            setSelectedListing((prev) => (prev && prev.id === id ? { ...prev, autoRenew } : prev))
          }
          onNavigateToCategory={(categoryId, subcategoryId) => {
            navigateToListingCategory(router, lang, categories, categoryId, subcategoryId);
          }}
        />
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-6">
      <AppHeader />
      <SearchView
          initialQuery={initialQuery}
          initialCategory={initialCategory}
          initialEntityMode={initialEntityMode}
          initialCitiesFromUrl={initialCitiesFromUrl}
          onUrlStateChange={handleSearchUrlState}
          categories={categories}
          searchPlaceholder={searchPlaceholder}
          favorites={favorites}
          profileTelegramId={profile?.telegramId != null ? String(profile.telegramId) : null}
          onBack={handleBack}
          onQueryChange={handleQueryChange}
          onCategoryChange={handleCategoryChange}
          onSelectListing={handleSelectListing}
          onSelectBusiness={(payload) => {
            saveSearchScroll();
            setSelectedSeller({
              telegramId: payload.telegramId,
              name: payload.name,
              avatar: payload.avatar,
            });
          }}
          onToggleFavorite={toggleFavorite}
          tg={tg}
        />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
}
