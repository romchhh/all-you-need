'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Globe,
  Instagram,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from '@/components/listing/ListingCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getCategories } from '@/constants/categories';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { useSwipeBack } from '@/features/ui/hooks/useSwipeBack';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { usePageTransition } from '@/contexts/PageTransitionContext';
import { useParams } from 'next/navigation';
import { ListingGridSkeleton } from '@/components/ui/SkeletonLoader';
import { FixedLogoHeader, OVERLAY_BACK_BUTTON_TOP_CLASS, overlayHeaderActionClass } from '@/components/layout/FixedLogoHeader';
import {
  buildSellerProfileContactMessage,
  openSellerTelegramChat,
  resolveSellerContactLang,
} from '@/utils/sellerContact';
import { PhoneModal } from '@/components/modals/PhoneModal';
import { ShareModal } from '@/components/modals/ShareModal';
import { getProfileShareLink } from '@/utils/botLinks';

type TabId = 'listings' | 'about';
type ListingFilter = 'all' | 'services' | 'products';

interface PublicBusinessProfile {
  businessName: string;
  logo: string | null;
  coverImage: string | null;
  category: string;
  subcategory: string | null;
  description: string;
  city: string;
  address: string | null;
  telegram: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  workingHours: string | null;
  plan: string | null;
  followersCount: number;
  activeListingsCount: number;
  memberSince: string;
  sellerTelegramId: string;
  sellerUsername: string | null;
}

interface BusinessProfilePageProps {
  sellerTelegramId: string;
  sellerName: string;
  sellerAvatar: string;
  sellerUsername?: string | null;
  sellerPhone?: string | null;
  onClose: () => void;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  favorites: Set<number>;
  tg: TelegramWebApp | null;
  onBackToPreviousListing?: (() => void) | null;
}

export function BusinessProfilePage({
  sellerTelegramId,
  onClose,
  onSelectListing,
  onToggleFavorite,
  favorites,
  tg,
  onBackToPreviousListing,
}: BusinessProfilePageProps) {
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const categories = useMemo(() => getCategories(t), [t]);
  const { user: currentUser } = useTelegram();
  const { hide: hidePageLoader } = usePageTransition();

  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabId>('listings');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useSwipeBack({
    onSwipeBack: onBackToPreviousListing || onClose,
    enabled: true,
    tg,
  });

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const viewerId = currentUser?.id?.toString() || '';
      const [profileRes, listingsRes] = await Promise.all([
        fetch(`/api/business-profile/public?telegramId=${sellerTelegramId}&lang=${lang}`),
        fetch(
          `/api/listings?userId=${sellerTelegramId}&viewerId=${viewerId}&profileType=business&status=active&limit=50&offset=0`
        ),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
        setLoadError(false);
      } else {
        setLoadError(true);
      }

      if (listingsRes.ok) {
        const data = await listingsRes.json();
        setListings(data.listings || []);
      }
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
      hidePageLoader({ minMs: 200 });
    }
  }, [sellerTelegramId, lang, currentUser?.id, hidePageLoader]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const categoryLabel = useMemo(() => {
    if (!profile) return '';
    return categories.find((c) => c.id === profile.category)?.name || profile.category;
  }, [categories, profile]);

  const filteredListings = useMemo(() => {
    if (listingFilter === 'services') {
      return listings.filter((l) => l.category === 'services_work');
    }
    if (listingFilter === 'products') {
      return listings.filter((l) => l.category !== 'services_work');
    }
    return listings;
  }, [listings, listingFilter]);

  const coverUrl = profile?.coverImage ? getResolvedImageUrl(profile.coverImage) : null;
  const logoUrl = profile?.logo ? getResolvedImageUrl(profile.logo) : null;
  const isPro = profile?.plan === 'business_pro';

  const handleMessage = () => {
    if (!profile) return;
    const username =
      profile.sellerUsername ||
      profile.telegram?.replace(/^@/, '') ||
      '';
    if (!username.trim()) return;
    const message = buildSellerProfileContactMessage(
      getProfileShareLink(sellerTelegramId),
      resolveSellerContactLang(language)
    );
    openSellerTelegramChat(username, message, tg ?? undefined);
  };

  const handleInstagram = () => {
    if (!profile?.instagram) return;
    const handle = profile.instagram.replace(/^@/, '').trim();
    window.open(`https://instagram.com/${handle}`, '_blank');
  };

  const handleWebsite = () => {
    if (!profile?.website) return;
    const url = profile.website.startsWith('http') ? profile.website : `https://${profile.website}`;
    window.open(url, '_blank');
  };

  const headerActionClass = overlayHeaderActionClass(isLight);
  const handleBack = onBackToPreviousListing || onClose;

  if (loadError) {
    return (
      <div className={`min-h-screen pb-24 ${ac.overlayShell}`}>
        <FixedLogoHeader mode="window-fixed" zClassName="z-[50]" paddingX={false} outerClassName="px-4 lg:px-6" />
        <button
          type="button"
          onClick={handleBack}
          aria-label={t('common.back')}
          className={`fixed left-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${OVERLAY_BACK_BUTTON_TOP_CLASS} ${headerActionClass}`}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="px-4 pt-24 text-center">
          <p className={`mb-4 ${ac.mutedText}`}>{t('common.error')}</p>
          <button
            type="button"
            onClick={handleBack}
            className={`px-4 py-2 rounded-xl font-medium ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className={`min-h-screen ${ac.overlayShell}`}>
        <FixedLogoHeader mode="window-fixed" zClassName="z-[50]" paddingX={false} outerClassName="px-4 lg:px-6" />
        <div className={`${OVERLAY_BACK_BUTTON_TOP_CLASS} px-4`}>
          <ListingGridSkeleton count={4} />
        </div>
      </div>
    );
  }

  const actionBtnBase = `flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 px-2 text-xs font-medium transition-colors min-w-0 flex-1`;
  const actionBtnSecondary = isLight
    ? 'bg-gray-100 text-gray-900 hover:bg-gray-200/80'
    : 'bg-[#1C1C1C] text-white hover:bg-white/10 border border-white/10';

  return (
    <div className={`min-h-screen pb-24 ${ac.overlayShell}`}>
      <FixedLogoHeader
        mode="window-fixed"
        zClassName="z-[50]"
        paddingX={false}
        outerClassName="px-4 lg:px-6"
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.location.href = `/${lang}/bazaar`;
          }
        }}
      />

      <button
        type="button"
        onClick={handleBack}
        aria-label={t('common.back')}
        className={`fixed left-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${OVERLAY_BACK_BUTTON_TOP_CLASS} ${headerActionClass}`}
      >
        <ArrowLeft size={20} />
      </button>

      <div className="relative mt-2">
        <div className={`h-44 sm:h-52 ${coverUrl ? '' : isLight ? 'bg-[#3F5331]/20' : 'bg-[#3F5331]/30'}`}>
          {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="absolute -bottom-10 left-4">
          <div
            className={`w-20 h-20 rounded-2xl overflow-hidden border-4 ${
              isLight ? 'border-white shadow-lg' : 'border-black bg-[#1C1C1C]'
            }`}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-[#3F5331]/30 text-[#C8E6A0]">
                {profile.businessName.charAt(0)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-12 pb-4">
        <div className="mb-4 grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
          <span aria-hidden />
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <h1 className={`text-lg font-semibold truncate text-center ${ac.pageHeading}`}>{profile.businessName}</h1>
            <BadgeCheck size={18} className="text-emerald-400 shrink-0" />
          </div>
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
              isLight ? 'border-gray-300 text-gray-900 hover:bg-gray-100' : 'border-white text-white hover:bg-white/10'
            }`}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className={`text-sm mt-1 ${ac.mutedText}`}>
              {categoryLabel} · {profile.city}
            </p>
          </div>
          <span
            className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide ${
              isLight
                ? 'border border-[#3F5331] text-[#3F5331]'
                : 'border border-[#C8E6A0]/50 text-[#C8E6A0]'
            }`}
          >
            BUSINESS{isPro ? ' PRO' : ''}
          </span>
        </div>

        <div className={`flex items-center gap-3 text-sm mb-3 ${ac.mutedText}`}>
          <span className="flex items-center gap-1">
            <Users size={14} />
            {profile.followersCount} {t('businessProfile.public.followersLabel')}
          </span>
        </div>

        <div className="flex gap-2 mb-6">
          <button type="button" onClick={handleMessage} className={`${actionBtnBase} ${listingPrimaryCta(isLight)}`}>
            <MessageCircle size={20} />
            {t('businessProfile.public.write')}
          </button>
          {profile.phone && (
            <button
              type="button"
              onClick={() => setShowPhoneModal(true)}
              className={`${actionBtnBase} ${actionBtnSecondary}`}
            >
              <Phone size={20} />
              {t('businessProfile.public.call')}
            </button>
          )}
          {profile.instagram && (
            <button type="button" onClick={handleInstagram} className={`${actionBtnBase} ${actionBtnSecondary}`}>
              <Instagram size={20} />
              Instagram
            </button>
          )}
          {profile.website && (
            <button type="button" onClick={handleWebsite} className={`${actionBtnBase} ${actionBtnSecondary}`}>
              <Globe size={20} />
              {t('businessProfile.public.website')}
            </button>
          )}
        </div>

        <div className={`flex border-b mb-4 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
          {(
            [
              ['listings', t('businessProfile.public.tabs.listings'), profile.activeListingsCount],
              ['about', t('businessProfile.public.tabs.about'), null],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as TabId)}
              className={`flex-1 pb-3 text-sm font-medium transition-colors relative ${
                tab === id ? ac.pageHeading : ac.mutedText
              }`}
            >
              {label}
              {count != null ? ` ${count}` : ''}
              {tab === id && (
                <span
                  className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${
                    isLight ? 'bg-[#3F5331]' : 'bg-[#C8E6A0]'
                  }`}
                />
              )}
            </button>
          ))}
        </div>

        {tab === 'listings' && (
          <>
            <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide">
              {(
                [
                  ['all', t('businessProfile.public.filters.all')],
                  ['services', t('businessProfile.public.filters.services')],
                  ['products', t('businessProfile.public.filters.products')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setListingFilter(id)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    listingFilter === id
                      ? isLight
                        ? 'bg-gray-900 text-white'
                        : 'bg-white/15 text-white'
                      : isLight
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-[#1C1C1C] text-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button type="button" className={`ml-auto p-2 rounded-full ${actionBtnSecondary}`} aria-label="Filter">
                <SlidersHorizontal size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {filteredListings.map((listing) => (
                <div key={listing.id} className="relative">
                  <ListingCard
                    listing={listing}
                    layout="stacked"
                    isFavorite={favorites.has(listing.id)}
                    onSelect={onSelectListing}
                    onToggleFavorite={onToggleFavorite}
                    showBusinessBadge
                    tg={tg}
                  />
                </div>
              ))}
            </div>
            {filteredListings.length === 0 && (
              <p className={`text-center py-8 text-sm ${ac.mutedText}`}>{t('businessProfile.public.noListings')}</p>
            )}
          </>
        )}

        {tab === 'about' && (
          <div className="space-y-4">
            <div>
              <h3 className={`font-semibold mb-2 ${ac.pageHeading}`}>{t('businessProfile.public.aboutTitle')}</h3>
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${ac.mutedText}`}>{profile.description}</p>
            </div>
            {profile.address && (
              <div>
                <h3 className={`font-semibold mb-1 ${ac.pageHeading}`}>{t('businessProfile.fields.address')}</h3>
                <p className={`text-sm ${ac.mutedText}`}>{profile.address}</p>
              </div>
            )}
            {profile.workingHours && (
              <div>
                <h3 className={`font-semibold mb-1 ${ac.pageHeading}`}>{t('businessProfile.fields.workingHours')}</h3>
                <p className={`text-sm whitespace-pre-wrap ${ac.mutedText}`}>{profile.workingHours}</p>
              </div>
            )}
            <p className={`text-xs ${ac.mutedText}`}>
              {t('businessProfile.public.memberSince')}: {profile.memberSince}
            </p>
          </div>
        )}

      </div>

      <PhoneModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        phoneNumber={profile.phone || ''}
        tg={tg}
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareLink={getProfileShareLink(sellerTelegramId)}
        shareText={profile.businessName}
        tg={tg}
      />
    </div>
  );
}

function listingPrimaryCta(isLight: boolean) {
  return isLight
    ? 'bg-[#3F5331] text-white hover:bg-[#344728]'
    : 'bg-[#C8E6A0] text-[#0f1408] hover:bg-[#dff5c0] shadow-[0_0_18px_rgba(200,230,160,0.35)]';
}
