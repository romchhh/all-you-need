'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Globe,
  Instagram,
  MessageCircle,
  Phone,
  Share2,
  UserPlus,
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
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/features/ui/hooks/useToast';
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
  const { toast, showToast, hideToast } = useToast();

  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabId>('listings');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwn, setIsOwn] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useSwipeBack({
    onSwipeBack: onBackToPreviousListing || onClose,
    enabled: true,
    tg,
  });

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const viewerId = currentUser?.id?.toString() || '';
      const viewerQuery = viewerId ? `&viewerTelegramId=${encodeURIComponent(viewerId)}` : '';
      const [profileRes, listingsRes] = await Promise.all([
        fetch(
          `/api/business-profile/public?telegramId=${encodeURIComponent(sellerTelegramId)}&lang=${lang}${viewerQuery}`
        ),
        fetch(
          `/api/listings?userId=${sellerTelegramId}&viewerId=${viewerId}&profileType=business&status=active&limit=50&offset=0`
        ),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
        setIsFollowing(Boolean(data.isFollowing));
        setIsOwn(Boolean(data.isOwn) || (viewerId !== '' && viewerId === String(sellerTelegramId)));
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
    const username = profile.sellerUsername || profile.telegram?.replace(/^@/, '') || '';
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

  const viewingOwn =
    isOwn || Boolean(currentUser?.id && String(currentUser.id) === String(sellerTelegramId));

  const handleFollow = async () => {
    if (viewingOwn || followBusy) return;
    if (!currentUser?.id) {
      showToast(t('businessProfile.public.loginToSubscribe'), 'info');
      return;
    }

    const nextFollowing = !isFollowing;
    setFollowBusy(true);
    tg?.HapticFeedback?.impactOccurred?.('light');

    try {
      const res = await fetch('/api/business-profile/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: sellerTelegramId,
          followerTelegramId: String(currentUser.id),
          action: nextFollowing ? 'follow' : 'unfollow',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(t('businessProfile.public.subscribeError'), 'error');
        return;
      }

      setIsFollowing(Boolean(data.isFollowing));
      if (typeof data.followersCount === 'number') {
        setProfile((prev) => (prev ? { ...prev, followersCount: data.followersCount } : prev));
      }
      showToast(
        data.isFollowing
          ? t('businessProfile.public.subscribedToast')
          : t('businessProfile.public.unsubscribedToast'),
        'success'
      );
    } catch {
      showToast(t('businessProfile.public.subscribeError'), 'error');
    } finally {
      setFollowBusy(false);
    }
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

  const canMessage = Boolean(
    (profile.sellerUsername || profile.telegram?.replace(/^@/, '') || '').trim()
  );
  const statCard = isLight
    ? 'rounded-2xl bg-white/80 border border-[#3F5331]/10 px-2 py-3 text-center'
    : 'rounded-2xl bg-white/[0.06] border border-white/10 px-2 py-3 text-center';
  const secondaryBtn = isLight
    ? 'bg-white border border-[#3F5331]/15 text-[#3F5331] hover:bg-[#E8F0E0]/70'
    : 'bg-white/[0.08] border border-white/15 text-white hover:bg-white/15';
  const chipBtn = isLight
    ? 'bg-white border border-[#3F5331]/15 text-[#3F5331] hover:bg-[#E8F0E0]/70'
    : 'bg-white/[0.08] border border-white/10 text-white/90 hover:bg-white/15';
  const aboutCard = isLight
    ? 'rounded-2xl border border-[#3F5331]/10 bg-white/80 p-4'
    : 'rounded-2xl border border-white/10 bg-white/[0.05] p-4';

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
      <button
        type="button"
        onClick={() => setShowShareModal(true)}
        aria-label={t('common.share')}
        className={`fixed right-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${OVERLAY_BACK_BUTTON_TOP_CLASS} ${headerActionClass}`}
      >
        <Share2 size={18} />
      </button>

      <div className="relative">
        <div
          className={`relative h-40 overflow-hidden sm:h-48 ${
            coverUrl ? '' : isLight ? 'bg-gradient-to-br from-[#3F5331]/25 to-[#C8E6A0]/20' : 'bg-gradient-to-br from-[#3F5331]/50 to-[#1a2414]'
          }`}
        >
          {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover" />}
          <div
            className={`pointer-events-none absolute inset-0 ${
              isLight
                ? 'bg-gradient-to-t from-white/70 via-transparent to-transparent'
                : 'bg-gradient-to-t from-black/55 via-transparent to-black/20'
            }`}
          />
        </div>
        <div className="absolute -bottom-11 left-4">
          <div
            className={`h-[88px] w-[88px] overflow-hidden rounded-2xl border-[3px] shadow-lg ${
              isLight ? 'border-white bg-white' : 'border-[#0f1408] bg-[#1C1C1C]'
            }`}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#3F5331]/30 text-2xl font-bold text-[#C8E6A0]">
                {profile.businessName.charAt(0)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-14 pb-4">
        <div className="mb-1 flex items-start gap-2">
          <h1 className={`min-w-0 flex-1 text-[1.35rem] font-semibold leading-tight ${ac.pageHeading}`}>
            {profile.businessName}
          </h1>
          <BadgeCheck size={20} className="mt-0.5 shrink-0 text-emerald-400" />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`text-[10px] font-bold tracking-wide rounded-full px-2.5 py-1 ${
              isLight
                ? 'border border-[#3F5331]/40 text-[#3F5331] bg-[#E8F0E0]/70'
                : 'border border-[#C8E6A0]/40 text-[#C8E6A0] bg-[#C8E6A0]/10'
            }`}
          >
            BUSINESS{isPro ? ' PRO' : ''}
          </span>
          <p className={`text-sm ${ac.mutedText}`}>
            {categoryLabel}
            {profile.city ? ` · ${profile.city}` : ''}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className={statCard}>
            <div className={`text-lg font-semibold tabular-nums ${ac.pageHeading}`}>{profile.activeListingsCount}</div>
            <div className={`mt-0.5 text-[11px] leading-tight ${ac.mutedText}`}>
              {t('businessProfile.public.listingsShort')}
            </div>
          </div>
          <div className={statCard}>
            <div className={`text-lg font-semibold tabular-nums ${ac.pageHeading}`}>{profile.followersCount}</div>
            <div className={`mt-0.5 text-[11px] leading-tight ${ac.mutedText}`}>
              {t('businessProfile.public.followersShort')}
            </div>
          </div>
          <div className={statCard}>
            <div className={`text-sm font-semibold leading-tight ${ac.pageHeading}`}>{profile.memberSince}</div>
            <div className={`mt-0.5 text-[11px] leading-tight ${ac.mutedText}`}>
              {t('businessProfile.public.onPlatform')}
            </div>
          </div>
        </div>

        {!viewingOwn && (
          <button
            type="button"
            onClick={() => void handleFollow()}
            disabled={followBusy}
            className={`mb-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              isFollowing ? secondaryBtn : listingPrimaryCta(isLight)
            }`}
          >
            {isFollowing ? <Check size={18} /> : <UserPlus size={18} />}
            {isFollowing ? t('businessProfile.public.subscribed') : t('businessProfile.public.subscribe')}
          </button>
        )}
        {viewingOwn && (
          <div className={`mb-2 rounded-2xl px-4 py-3 text-center text-sm ${isLight ? 'bg-[#E8F0E0]/80 text-[#3F5331]' : 'bg-white/[0.08] text-white/80'}`}>
            {t('businessProfile.public.ownProfile')}
          </div>
        )}

        {(canMessage || profile.phone) && (
          <div className="mb-3 flex gap-2">
            {canMessage && (
              <button
                type="button"
                onClick={handleMessage}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium transition-colors ${secondaryBtn}`}
              >
                <MessageCircle size={18} />
                {t('businessProfile.public.write')}
              </button>
            )}
            {profile.phone && (
              <button
                type="button"
                onClick={() => setShowPhoneModal(true)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium transition-colors ${secondaryBtn}`}
              >
                <Phone size={18} />
                {t('businessProfile.public.call')}
              </button>
            )}
          </div>
        )}

        {(profile.instagram || profile.website) && (
          <div className="mb-5 flex gap-2">
            {profile.instagram && (
              <button
                type="button"
                onClick={handleInstagram}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-colors ${chipBtn}`}
              >
                <Instagram size={16} />
                Instagram
              </button>
            )}
            {profile.website && (
              <button
                type="button"
                onClick={handleWebsite}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-colors ${chipBtn}`}
              >
                <Globe size={16} />
                {t('businessProfile.public.website')}
              </button>
            )}
          </div>
        )}

        <div className={`mb-4 flex border-b ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
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
              className={`relative flex-1 pb-3 text-sm font-medium transition-colors ${
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
            <div className="mb-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
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
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
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
              <p className={`py-8 text-center text-sm ${ac.mutedText}`}>{t('businessProfile.public.noListings')}</p>
            )}
          </>
        )}

        {tab === 'about' && (
          <div className="space-y-3">
            <div className={aboutCard}>
              <h3 className={`mb-2 font-semibold ${ac.pageHeading}`}>{t('businessProfile.public.aboutTitle')}</h3>
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${ac.mutedText}`}>{profile.description}</p>
            </div>
            {profile.address && (
              <div className={aboutCard}>
                <h3 className={`mb-1 font-semibold ${ac.pageHeading}`}>{t('businessProfile.fields.address')}</h3>
                <p className={`text-sm ${ac.mutedText}`}>{profile.address}</p>
              </div>
            )}
            {profile.workingHours && (
              <div className={aboutCard}>
                <h3 className={`mb-1 font-semibold ${ac.pageHeading}`}>{t('businessProfile.fields.workingHours')}</h3>
                <p className={`text-sm whitespace-pre-wrap ${ac.mutedText}`}>{profile.workingHours}</p>
              </div>
            )}
            <p className={`px-1 text-xs ${ac.mutedText}`}>
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

      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
    </div>
  );
}

function listingPrimaryCta(isLight: boolean) {
  return isLight
    ? 'bg-[#3F5331] text-white hover:bg-[#344728]'
    : 'bg-[#C8E6A0] text-[#0f1408] hover:bg-[#dff5c0] shadow-[0_0_18px_rgba(200,230,160,0.35)]';
}
