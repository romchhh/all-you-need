'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Globe,
  Instagram,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Star,
  UserPlus,
  Users,
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
import {
  buildSellerProfileContactMessage,
  openSellerTelegramChat,
  resolveSellerContactLang,
} from '@/utils/sellerContact';
import { PhoneModal } from '@/components/modals/PhoneModal';
import { ShareModal } from '@/components/modals/ShareModal';
import { getProfileShareLink } from '@/utils/botLinks';
import { trackAnalytics } from '@/utils/analyticsClient';
import { ANALYTICS_EVENTS, ANALYTICS_EVENT_GROUPS } from '@/constants/analyticsEvents';

type TabId = 'listings' | 'about';
type ListingFilter = 'all' | 'services' | 'products';

interface PublicBusinessProfile {
  id: number;
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
  rating: number;
  reviewsCount: number;
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

function formatRatingReviews(
  rating: number,
  count: number,
  t: (key: string, params?: Record<string, string>) => string
): string {
  const ratingStr = rating.toFixed(1);
  const mod10 = count % 10;
  const mod100 = count % 100;
  let key = 'businessProfile.public.ratingReviews';
  if (mod10 === 1 && mod100 !== 11) key = 'businessProfile.public.ratingReviews_one';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    key = 'businessProfile.public.ratingReviews_few';
  }
  return t(key, { rating: ratingStr, count: String(count) });
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
  const profileViewTrackedRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!profile?.id || loading || loadError) return;
    if (profileViewTrackedRef.current === profile.id) return;
    profileViewTrackedRef.current = profile.id;
    trackAnalytics({
      eventName: ANALYTICS_EVENTS.profileView,
      eventGroup: ANALYTICS_EVENT_GROUPS.navigation,
      telegramId: currentUser?.id,
      entityType: 'business_profile',
      entityId: String(profile.id),
    });
  }, [profile?.id, loading, loadError, currentUser?.id]);

  const trackBusinessContact = useCallback(
    (channel: 'telegram' | 'phone') => {
      if (!profile?.id) return;
      trackAnalytics({
        eventName: ANALYTICS_EVENTS.contactSeller,
        eventGroup: ANALYTICS_EVENT_GROUPS.engagement,
        telegramId: currentUser?.id,
        entityType: 'business_profile',
        entityId: String(profile.id),
        metadata: { channel },
      });
    },
    [profile?.id, currentUser?.id]
  );

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
    trackBusinessContact('telegram');
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

  const handleBack = onBackToPreviousListing || onClose;
  const navBtnClass = isLight
    ? 'flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/35'
    : 'flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/60';

  if (loadError) {
    return (
      <div className={`min-h-screen pb-24 ${ac.overlayShell}`}>
        <div className="px-4 pt-[max(env(safe-area-inset-top,0px),12px)]">
          <button type="button" onClick={handleBack} aria-label={t('common.back')} className={navBtnClass}>
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="px-4 pt-16 text-center">
          <p className={`mb-4 ${ac.mutedText}`}>{t('common.error')}</p>
          <button
            type="button"
            onClick={handleBack}
            className={`rounded-xl px-4 py-2 font-medium ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}
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
        <div className="px-4 pt-20">
          <ListingGridSkeleton count={4} />
        </div>
      </div>
    );
  }

  const canMessage = Boolean(
    (profile.sellerUsername || profile.telegram?.replace(/^@/, '') || '').trim()
  );
  const showRating = profile.reviewsCount > 0 && profile.rating > 0;
  const aboutCard = isLight
    ? 'rounded-2xl border border-[#3F5331]/10 bg-white/80 p-4'
    : 'rounded-2xl border border-white/10 bg-white/[0.05] p-4';

  const actionBtnBase =
    'flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium transition-colors';
  const actionPrimary = isLight
    ? 'bg-[#3F5331] text-white hover:bg-[#344728]'
    : 'bg-[#C8E6A0] text-[#0f1408] hover:bg-[#dff5c0]';
  const actionSecondary = isLight
    ? 'bg-gray-100 text-gray-900 hover:bg-gray-200/80'
    : 'bg-[#1C1C1C] text-white hover:bg-white/10 border border-white/10';

  const contactActions = [
    canMessage
      ? {
          key: 'message',
          label: t('businessProfile.public.write'),
          icon: MessageCircle,
          onClick: handleMessage,
          primary: true,
        }
      : null,
    profile.phone
      ? {
          key: 'phone',
          label: t('businessProfile.public.call'),
          icon: Phone,
          onClick: () => {
            trackBusinessContact('phone');
            setShowPhoneModal(true);
          },
          primary: false,
        }
      : null,
    profile.instagram
      ? {
          key: 'instagram',
          label: 'Instagram',
          icon: Instagram,
          onClick: handleInstagram,
          primary: false,
        }
      : null,
    profile.website
      ? {
          key: 'website',
          label: t('businessProfile.public.website'),
          icon: Globe,
          onClick: handleWebsite,
          primary: false,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: typeof MessageCircle;
    onClick: () => void;
    primary: boolean;
  }>;

  return (
    <div className={`min-h-screen pb-24 ${ac.overlayShell}`}>
      <div className="relative">
        <div
          className={`relative h-52 overflow-hidden sm:h-56 ${
            coverUrl ? '' : isLight ? 'bg-[#3F5331]/20' : 'bg-[#3F5331]/35'
          }`}
        >
          {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/45" />

          <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top,0px),10px)]">
            <button type="button" onClick={handleBack} aria-label={t('common.back')} className={navBtnClass}>
              <ArrowLeft size={20} />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
              <span className="truncate text-base font-semibold text-white">{profile.businessName}</span>
              <BadgeCheck size={18} className="shrink-0 text-emerald-400" />
            </div>
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              aria-label={t('common.share')}
              className={navBtnClass}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          <div className="absolute -bottom-12 left-4 z-10">
            <div
              className={`h-24 w-24 overflow-hidden rounded-full border-4 shadow-lg ${
                isLight ? 'border-black bg-[#111]' : 'border-black bg-[#1C1C1C]'
              }`}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#3F5331]/40 text-2xl font-bold text-[#C8E6A0]">
                  {profile.businessName.charAt(0)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-14">
        <div className="mb-1 flex items-center gap-1.5">
          <h1 className={`min-w-0 truncate text-xl font-bold ${ac.pageHeading}`}>{profile.businessName}</h1>
          <BadgeCheck size={18} className="shrink-0 text-emerald-400" />
        </div>

        <p className={`mb-3 text-sm ${ac.mutedText}`}>
          {categoryLabel}
          {profile.city ? ` · ${profile.city}` : ''}
        </p>

        <div className="mb-2 flex items-center justify-between gap-3">
          {showRating ? (
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              <Star size={16} className="shrink-0 fill-amber-400 text-amber-400" />
              <span className={`truncate ${ac.pageHeading}`}>
                {formatRatingReviews(profile.rating, profile.reviewsCount, t)}
              </span>
            </div>
          ) : (
            <span className={`text-sm ${ac.mutedText}`}>{profile.memberSince}</span>
          )}
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${
              isLight
                ? 'border border-[#3F5331]/50 text-[#3F5331]'
                : 'border border-[#C8E6A0]/50 text-[#C8E6A0]'
            }`}
          >
            BUSINESS{isPro ? ' PRO' : ''}
          </span>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className={`flex items-center gap-1.5 text-sm ${ac.mutedText}`}>
            <Users size={16} className="shrink-0" />
            <span>
              {profile.followersCount} {t('businessProfile.public.followersLabel')}
            </span>
          </div>
          {!viewingOwn && (
            <button
              type="button"
              onClick={() => void handleFollow()}
              disabled={followBusy}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                isFollowing
                  ? isLight
                    ? 'border border-[#3F5331]/30 bg-[#E8F0E0] text-[#3F5331]'
                    : 'border border-[#C8E6A0]/30 bg-[#C8E6A0]/10 text-[#C8E6A0]'
                  : isLight
                    ? 'bg-[#3F5331] text-white'
                    : 'bg-[#C8E6A0] text-[#0f1408]'
              }`}
            >
              {isFollowing ? (
                <span className="inline-flex items-center gap-1">
                  <Check size={14} />
                  {t('businessProfile.public.subscribed')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <UserPlus size={14} />
                  {t('businessProfile.public.subscribe')}
                </span>
              )}
            </button>
          )}
        </div>

        {contactActions.length > 0 && (
          <div className="mb-6 flex gap-2">
            {contactActions.map(({ key, label, icon: Icon, onClick, primary }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`${actionBtnBase} ${primary ? actionPrimary : actionSecondary}`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
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
