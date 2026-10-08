'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Listing } from '@/types';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { useUser } from '@/features/user/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  OVERLAY_BACK_BUTTON_TOP_CLASS,
  overlayHeaderActionClass,
} from '@/components/layout/FixedLogoHeader';
import { MySubscriptionsView } from '@/components/subscriptions/MySubscriptionsView';
import { SellerProfileRouter } from '@/components/profile/SellerProfileRouter';
import { ListingDetail } from '@/components/listing/ListingDetail';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/features/ui/hooks/useToast';
import {
  getFavoritesFromStorage,
  addFavoriteToStorage,
  removeFavoriteFromStorage,
} from '@/utils/favorites';
import { useScrollToTopOnMount } from '@/features/ui/hooks/useScrollToTopOnMount';

export default function SubscriptionsPage() {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const { tg } = useTelegram();
  const { profile, isBlocked } = useUser();
  const { toast, showToast, hideToast } = useToast();
  useScrollToTopOnMount();

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

  useEffect(() => {
    if (lang === 'uk' || lang === 'ru') setLanguage(lang);
  }, [lang, setLanguage]);

  useEffect(() => {
    setFavorites(getFavoritesFromStorage());
  }, []);

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
      window.history.pushState({ subscriptionsOverlay: true }, '', url.toString());
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

  const closeOverlay = useCallback(() => {
    if (overlayOpenRef.current) {
      window.history.back();
      return;
    }
    setSelectedListing(null);
    setSelectedSeller(null);
  }, []);

  const handleSelectListing = useCallback((listing: Listing) => {
    setSelectedListing(listing);
  }, []);

  const toggleFavorite = async (id: number) => {
    const isFavorite = favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(id);
      else next.add(id);
      return next;
    });
    tg?.HapticFeedback?.notificationOccurred?.('success');
    if (isFavorite) {
      await removeFavoriteFromStorage(id, profile?.telegramId);
      showToast(t('listing.removeFromFavorites'), 'success');
    } else {
      await addFavoriteToStorage(id, profile?.telegramId);
      showToast(t('listing.addToFavorites'), 'success');
    }
  };

  if (isBlocked && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 text-center">
        <p className="mb-2 text-lg font-medium text-white">⛔ {t('common.blocked')}</p>
        <p className="text-sm text-white/70">{t('menu.support') || 'Підтримка'}</p>
      </div>
    );
  }

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
    <div className="min-h-screen overflow-x-hidden pb-20">
      <AppHeader />

      <button
        type="button"
        onClick={() => {
          router.push(`/${lang}/profile`);
          tg?.HapticFeedback?.impactOccurred?.('light');
        }}
        aria-label={t('common.back') || 'Назад'}
        className={`fixed left-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${OVERLAY_BACK_BUTTON_TOP_CLASS} ${overlayHeaderActionClass(isLight)}`}
      >
        <ArrowLeft size={20} />
      </button>

      <div className="mx-auto w-full max-w-2xl overflow-x-hidden">
        <div className="px-4 pb-5 pt-14">
          <h1 className={`mb-2 text-2xl font-bold leading-tight ${ac.pageHeading}`}>
            {t('subscriptions.title')}
          </h1>
          <p className={`mb-6 text-sm ${ac.mutedText}`}>{t('subscriptions.subtitle')}</p>

          <MySubscriptionsView
            telegramId={profile?.telegramId != null ? String(profile.telegramId) : null}
            tg={tg}
            onOpenBusiness={(payload) => {
              setSelectedSeller({
                telegramId: payload.telegramId,
                name: payload.name,
                avatar: payload.avatar,
              });
            }}
          />
        </div>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
}
