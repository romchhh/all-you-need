'use client';

import dynamic from 'next/dynamic';
import { Bell, Building2, MapPin, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useToast } from '@/features/ui/hooks/useToast';
import { Toast } from '@/components/ui/Toast';
import {
  BusinessSearchResultCard,
  type BusinessSearchCardData,
} from '@/components/search/BusinessSearchResultCard';
import {
  loadBazaarTabStateFromStorage,
  persistBazaarTabState,
} from '@/lib/bazaar/bazaarTabStateStorage';
import { formatCityFilterLabel, normalizeCityInput } from '@/lib/city/cityNormalization';

const CityModal = dynamic(
  () => import('@/components/modals/CityModal').then((m) => ({ default: m.CityModal })),
  { ssr: false }
);

type SubscriptionsTab = 'businesses' | 'cities' | 'searches';

type SearchSubItem = {
  queryKey: string;
  queryText: string;
  mode: 'listings' | 'businesses';
};

type MySubscriptionsViewProps = {
  telegramId: string | null;
  tg: TelegramWebApp | null;
  onOpenBusiness: (payload: {
    telegramId: string;
    name: string;
    avatar: string;
  }) => void;
};

export function MySubscriptionsView({ telegramId, tg, onOpenBusiness }: MySubscriptionsViewProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) || language || 'uk';
  const { toast, showToast, hideToast } = useToast();

  const [tab, setTab] = useState<SubscriptionsTab>('businesses');
  const [businesses, setBusinesses] = useState<BusinessSearchCardData[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [searches, setSearches] = useState<SearchSubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [selectedCities, setSelectedCities] = useState<string[]>(() =>
    loadBazaarTabStateFromStorage().selectedCities ?? []
  );

  const loadBusinesses = useCallback(async () => {
    if (!telegramId) {
      setBusinesses([]);
      return;
    }
    const res = await fetch(
      `/api/subscriptions/businesses?telegramId=${encodeURIComponent(telegramId)}&lang=${lang}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      setBusinesses([]);
      return;
    }
    const data = await res.json();
    setBusinesses((data.businesses || []) as BusinessSearchCardData[]);
  }, [telegramId, lang]);

  const loadCities = useCallback(async () => {
    if (!telegramId) {
      setCities([]);
      return;
    }
    const res = await fetch(
      `/api/city-subscriptions?telegramId=${encodeURIComponent(telegramId)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      setCities([]);
      return;
    }
    const data = await res.json();
    setCities((data.cities || []) as string[]);
  }, [telegramId]);

  const loadSearches = useCallback(async () => {
    if (!telegramId) {
      setSearches([]);
      return;
    }
    const res = await fetch(
      `/api/search-subscriptions?telegramId=${encodeURIComponent(telegramId)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      setSearches([]);
      return;
    }
    const data = await res.json();
    const list = (data.subscriptions || []) as Array<{
      queryKey: string;
      queryText: string;
      mode?: string;
    }>;
    setSearches(
      list.map((s) => ({
        queryKey: s.queryKey,
        queryText: s.queryText,
        mode: s.mode === 'businesses' ? 'businesses' : 'listings',
      }))
    );
  }, [telegramId]);

  const reloadTab = useCallback(
    async (nextTab: SubscriptionsTab) => {
      setLoading(true);
      try {
        if (nextTab === 'businesses') await loadBusinesses();
        else if (nextTab === 'cities') await loadCities();
        else await loadSearches();
      } finally {
        setLoading(false);
      }
    },
    [loadBusinesses, loadCities, loadSearches]
  );

  useEffect(() => {
    void reloadTab(tab);
  }, [tab, reloadTab]);

  const handleUnfollowBusiness = useCallback(
    async (business: BusinessSearchCardData) => {
      if (!telegramId || busyKey) return;
      setBusyKey(`biz-${business.id}`);
      try {
        const res = await fetch('/api/business-profile/public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId: business.sellerTelegramId,
            followerTelegramId: telegramId,
            action: 'unfollow',
          }),
        });
        if (!res.ok) {
          showToast(t('common.error'), 'error');
          return;
        }
        setBusinesses((prev) => prev.filter((b) => b.id !== business.id));
        showToast(t('businessProfile.public.unsubscribedToast'), 'success');
        tg?.HapticFeedback?.impactOccurred?.('light');
      } catch {
        showToast(t('common.error'), 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, showToast, t, telegramId, tg]
  );

  const handleUnsubscribeCity = useCallback(
    async (cityKey: string) => {
      if (!telegramId || busyKey) return;
      setBusyKey(`city-${cityKey}`);
      try {
        const res = await fetch(
          `/api/city-subscriptions?telegramId=${encodeURIComponent(telegramId)}&city=${encodeURIComponent(cityKey)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          showToast(t('common.error'), 'error');
          return;
        }
        setCities((prev) => prev.filter((c) => c !== cityKey));
        const nextSelected = selectedCities.filter(
          (c) => normalizeCityInput(c) !== normalizeCityInput(cityKey)
        );
        setSelectedCities(nextSelected);
        const current = loadBazaarTabStateFromStorage();
        persistBazaarTabState({ ...current, selectedCities: nextSelected });
        showToast(t('bazaar.citySubscribeRemoved'), 'success');
        tg?.HapticFeedback?.impactOccurred?.('light');
      } catch {
        showToast(t('common.error'), 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, selectedCities, showToast, t, telegramId, tg]
  );

  const handleUnsubscribeSearch = useCallback(
    async (item: SearchSubItem) => {
      if (!telegramId || busyKey) return;
      setBusyKey(`search-${item.queryKey}-${item.mode}`);
      try {
        const params = new URLSearchParams({
          telegramId,
          query: item.queryText,
          mode: item.mode,
        });
        const res = await fetch(`/api/search-subscriptions?${params.toString()}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          showToast(t('common.error'), 'error');
          return;
        }
        setSearches((prev) =>
          prev.filter((s) => !(s.queryKey === item.queryKey && s.mode === item.mode))
        );
        showToast(t('bazaar.searchSubscribeRemoved'), 'success');
        tg?.HapticFeedback?.impactOccurred?.('light');
      } catch {
        showToast(t('common.error'), 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, showToast, t, telegramId, tg]
  );

  const goFindBusiness = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    router.push(`/${lang}/search?mode=businesses`);
  };

  const goAddCity = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    setCityModalOpen(true);
  };

  const goCreateSearch = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    router.push(`/${lang}/search`);
  };

  const openSearchQuery = (item: SearchSubItem) => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    const q = encodeURIComponent(item.queryText);
    const mode = item.mode === 'businesses' ? '&mode=businesses' : '';
    router.push(`/${lang}/search?q=${q}${mode}`);
  };

  const emptyCard = (title: string, hint: string, icon: ReactNode) => (
    <div className="flex flex-1 items-start justify-center pt-6 pb-4">
      <div className="mx-auto w-full max-w-sm px-1">
        <div
          className={`rounded-3xl border-2 p-8 text-center ${
            isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-gray-600'
          }`}
        >
          <div className="mb-6 flex items-center justify-center">{icon}</div>
          <h3 className={`mb-3 text-xl font-bold ${ac.pageHeading}`}>{title}</h3>
          <p className="text-sm text-gray-400">{hint}</p>
        </div>
      </div>
    </div>
  );

  const ctaButtonClass = isLight
    ? 'w-full rounded-xl border border-[#3F5331]/25 bg-[#3F5331] px-4 py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#344528]'
    : 'w-full rounded-xl border border-[#C8E6A0]/40 bg-[#C8E6A0] px-4 py-3.5 text-center text-sm font-semibold text-[#0f1408] transition-colors hover:bg-[#dff5c0]';

  const tabs: { id: SubscriptionsTab; label: string }[] = [
    { id: 'businesses', label: t('subscriptions.tabBusinesses') },
    { id: 'cities', label: t('subscriptions.tabCities') },
    { id: 'searches', label: t('subscriptions.tabSearches') },
  ];

  return (
    <div className="pb-8">
      <div
        className={`mb-5 flex rounded-2xl p-1 ${
          isLight ? 'bg-[#E8F0E0]/80' : 'bg-white/10'
        }`}
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (active) return;
                setTab(item.id);
                tg?.HapticFeedback?.impactOccurred?.('light');
              }}
              className={`flex-1 rounded-xl px-2 py-2.5 text-center text-sm font-semibold transition-colors ${
                active
                  ? isLight
                    ? 'bg-white text-[#3F5331] shadow-sm'
                    : 'bg-[#1C1C1C] text-[#C8E6A0]'
                  : isLight
                    ? 'text-[#5A6B52]'
                    : 'text-white/55'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className={`py-16 text-center text-sm ${ac.mutedText}`}>{t('common.loading')}</div>
      ) : tab === 'businesses' ? (
        <div className="space-y-4">
          {businesses.length === 0 ? (
            emptyCard(
              t('subscriptions.businessesEmptyTitle'),
              t('subscriptions.businessesEmptyHint'),
              <Building2 size={64} className={isLight ? 'text-gray-400' : 'text-white'} strokeWidth={2} />
            )
          ) : (
            <div className="space-y-3">
              {businesses.map((business) => (
                <BusinessSearchResultCard
                  key={business.id}
                  business={business}
                  onOpen={(b) =>
                    onOpenBusiness({
                      telegramId: b.sellerTelegramId,
                      name: b.businessName,
                      avatar: b.logo || '',
                    })
                  }
                  onToggleFollow={handleUnfollowBusiness}
                  followBusy={busyKey === `biz-${business.id}`}
                  tg={tg}
                />
              ))}
            </div>
          )}
          <button type="button" onClick={goFindBusiness} className={ctaButtonClass}>
            {t('subscriptions.findBusiness')}
          </button>
        </div>
      ) : tab === 'cities' ? (
        <div className="space-y-4">
          {cities.length === 0 ? (
            emptyCard(
              t('subscriptions.citiesEmptyTitle'),
              t('subscriptions.citiesEmptyHint'),
              <MapPin size={64} className={isLight ? 'text-gray-400' : 'text-white'} strokeWidth={2} />
            )
          ) : (
            <div className="space-y-2">
              {cities.map((cityKey) => (
                <div
                  key={cityKey}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${
                    isLight ? 'border-[#3F5331]/12 bg-white' : 'border-white/10 bg-[#111]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isLight ? 'bg-[#E8F0E0] text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
                      }`}
                    >
                      <Bell size={18} fill="currentColor" />
                    </span>
                    <span className={`truncate font-medium ${ac.pageHeading}`}>
                      {formatCityFilterLabel(cityKey)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === `city-${cityKey}`}
                    onClick={() => void handleUnsubscribeCity(cityKey)}
                    aria-label={t('bazaar.citySubscribeRemoved')}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${
                      isLight
                        ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        : 'border-white/15 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={goAddCity} className={ctaButtonClass}>
            {t('subscriptions.addCity')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {searches.length === 0 ? (
            emptyCard(
              t('subscriptions.searchesEmptyTitle'),
              t('subscriptions.searchesEmptyHint'),
              <Search size={64} className={isLight ? 'text-gray-400' : 'text-white'} strokeWidth={2} />
            )
          ) : (
            <div className="space-y-2">
              {searches.map((item) => (
                <div
                  key={`${item.mode}-${item.queryKey}`}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${
                    isLight ? 'border-[#3F5331]/12 bg-white' : 'border-white/10 bg-[#111]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openSearchQuery(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isLight ? 'bg-[#E8F0E0] text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
                      }`}
                    >
                      <Search size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className={`truncate font-medium ${ac.pageHeading}`}>{item.queryText}</p>
                      <p className={`text-xs ${ac.mutedText}`}>
                        {item.mode === 'businesses'
                          ? t('bazaar.search.modeBusinesses')
                          : t('bazaar.search.modeListings')}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={busyKey === `search-${item.queryKey}-${item.mode}`}
                    onClick={() => void handleUnsubscribeSearch(item)}
                    aria-label={t('bazaar.searchSubscribeRemoved')}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${
                      isLight
                        ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        : 'border-white/15 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={goCreateSearch} className={ctaButtonClass}>
            {t('subscriptions.createSearch')}
          </button>
        </div>
      )}

      <CityModal
        isOpen={cityModalOpen}
        selectedCities={selectedCities}
        openSubscriptionsSection
        onClose={() => {
          setCityModalOpen(false);
          void loadCities();
        }}
        onSelect={(next) => {
          setSelectedCities(next);
          const current = loadBazaarTabStateFromStorage();
          persistBazaarTabState({ ...current, selectedCities: next });
          void loadCities();
        }}
        tg={tg}
        profileTelegramId={telegramId}
        onToast={(message, type) => showToast(message, type || 'info')}
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
