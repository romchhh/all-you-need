'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Listing } from '@/types';
import { useTelegram } from '@/hooks/useTelegram';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppHeader } from '@/components/AppHeader';
import { SearchView } from '@/components/SearchView';
import { ListingDetail } from '@/components/ListingDetail';
import { UserProfilePage } from '@/components/UserProfilePage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Toast } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import {
  getFavoritesFromStorage,
  addFavoriteToStorage,
  removeFavoriteFromStorage,
} from '@/utils/favorites';
import { loadBazaarTabStateFromStorage } from '@/utils/bazaarTabStateStorage';
import { getCategories } from '@/constants/categories';
import { navigateToListingCategory } from '@/utils/navigateToListingCategory';

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

  const initialQuery = searchParams.get('q') ?? '';
  const initialCategory = searchParams.get('category');

  const categories = useMemo(() => getCategories(t), [t]);

  const selectedCities = useMemo(
    () => loadBazaarTabStateFromStorage().selectedCities ?? [],
    []
  );

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
    localStorage.setItem('bazaarSearchQuery', query);
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

  const handleBack = useCallback(() => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    router.push(`/${lang}/bazaar`);
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

  const handleSelectListing = useCallback((listing: Listing) => {
    document.body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setSelectedListing(listing);
  }, []);

  const closeOverlay = useCallback(() => {
    if (overlayOpenRef.current) {
      window.history.back();
      return;
    }
    setSelectedListing(null);
    setSelectedSeller(null);
  }, []);

  if (isBlocked && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 text-center">
        <p className="mb-2 text-lg font-medium text-white">⛔ {t('common.blocked')}</p>
        <p className="text-sm text-white/70">{t('menu.support') || 'Підтримка'}</p>
      </div>
    );
  }

  const searchPlaceholder =
    selectedCities.length > 0
      ? t('bazaar.searchInCity', { city: selectedCities[0] })
      : t('bazaar.whatInterestsYou');

  if (selectedSeller) {
    return (
      <div className="min-h-screen overflow-x-hidden">
        <UserProfilePage
          sellerTelegramId={selectedSeller.telegramId}
          sellerName={selectedSeller.name}
          sellerAvatar={selectedSeller.avatar}
          sellerUsername={selectedSeller.username}
          sellerPhone={selectedSeller.phone}
          onClose={closeOverlay}
          onBackToPreviousListing={
            previousListingRef.current
              ? () => {
                  setSelectedListing(previousListingRef.current);
                  previousListingRef.current = null;
                  setSelectedSeller(null);
                }
              : null
          }
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
    <div className="min-h-screen pb-20 animate-content-crossfade">
      <AppHeader />
      <SearchView
          initialQuery={initialQuery}
          initialCategory={initialCategory}
          categories={categories}
          searchPlaceholder={searchPlaceholder}
          selectedCities={selectedCities}
          favorites={favorites}
          profileTelegramId={profile?.telegramId != null ? String(profile.telegramId) : null}
          onBack={handleBack}
          onQueryChange={handleQueryChange}
          onCategoryChange={handleCategoryChange}
          onSelectListing={handleSelectListing}
          onToggleFavorite={toggleFavorite}
          tg={tg}
        />

      <BottomNavigation
        activeTab="bazaar"
        onTabChange={(tab) => {
          let telegramId = new URLSearchParams(window.location.search).get('telegramId');
          if (!telegramId) {
            telegramId = sessionStorage.getItem('telegramId');
          }

          const queryString = telegramId ? `?telegramId=${telegramId}` : '';
          const targetPath =
            tab === 'bazaar'
              ? 'bazaar'
              : tab === 'favorites'
                ? 'favorites'
                : tab === 'profile'
                  ? 'profile'
                  : 'categories';

          router.push(`/${lang}/${targetPath}${queryString}`);
        }}
        onCloseDetail={() => {}}
        onCreateListing={() => router.push(`/${lang}/bazaar?create=1`)}
        favoritesCount={favorites.size}
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
