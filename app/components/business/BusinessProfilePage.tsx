'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  MapPin,
  MoreHorizontal,
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
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { useSwipeBack } from '@/features/ui/hooks/useSwipeBack';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { usePageTransition } from '@/contexts/PageTransitionContext';
import { useParams } from 'next/navigation';
import { ListingGridSkeleton } from '@/components/ui/SkeletonLoader';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/features/ui/hooks/useToast';
import {
  normalizeInstagramUrl,
  normalizeWebsiteUrl,
  openExternalUrl,
} from '@/utils/socialLinks';
import {
  buildSellerProfileContactMessage,
  openSellerTelegramChat,
  openSellerContactViaTelegramShare,
  resolveSellerContactLang,
} from '@/utils/sellerContact';
import { PhoneModal } from '@/components/modals/PhoneModal';
import { ShareModal } from '@/components/modals/ShareModal';
import { ImageViewModal } from '@/components/modals/ImageViewModal';
import { FixedLogoHeader, overlayHeaderActionClass } from '@/components/layout/FixedLogoHeader';
import { formatWorkingHoursForDisplay, WEEKDAY_KEYS } from '@/lib/businessProfileSettings';
import {
  getBusinessDirectionLabel,
  getBusinessSphereLabel,
  legacyFieldsToBusinessActivity,
} from '@/lib/businessSphereConstants';
import { getProfileShareLink } from '@/utils/botLinks';
import { trackAnalytics } from '@/utils/analyticsClient';
import { ANALYTICS_EVENTS, ANALYTICS_EVENT_GROUPS } from '@/constants/analyticsEvents';
import {
  BusinessContactBrandIcon,
  type BusinessContactChannel,
} from '@/components/business/BusinessContactIcons';

type TabId = 'listings' | 'about' | 'portfolio' | 'reviews';
type ListingFilter = 'all' | 'services' | 'products';

interface PublicBusinessReview {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
  authorAvatar: string | null;
}

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
  serviceArea: string | null;
  serviceRadiusKm: number | null;
  followersCount: number;
  activeListingsCount: number;
  memberSince: string;
  sellerTelegramId: string;
  sellerUsername: string | null;
  rating: number;
  reviewsCount: number;
  portfolioImages: string[];
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

function resolveBusinessProfileTelegramUsername(
  sellerUsername: string | null | undefined,
  telegram: string | null | undefined
): string | null {
  for (const raw of [sellerUsername, telegram?.replace(/^@/, '')]) {
    const clean = (raw || '').trim().replace(/^@/, '');
    if (!clean || /[\s/]/.test(clean)) continue;
    return clean;
  }
  return null;
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
  const weekdayLabels = useMemo(
    () =>
      Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, t(`businessProfile.settings.weekdays.${key}`)])) as Record<
        (typeof WEEKDAY_KEYS)[number],
        string
      >,
    [t]
  );
  const { user: currentUser } = useTelegram();
  const { hide: hidePageLoader } = usePageTransition();
  const { toast, showToast, hideToast } = useToast();

  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [reviews, setReviews] = useState<PublicBusinessReview[]>([]);
  const [vitrineListingIds, setVitrineListingIds] = useState<number[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabId>('listings');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [portfolioPreviewUrl, setPortfolioPreviewUrl] = useState<string | null>(null);
  const [viewerHasReviewed, setViewerHasReviewed] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwn, setIsOwn] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const profileViewTrackedRef = useRef<number | null>(null);
  const formattedWorkingHours = useMemo(
    () =>
      formatWorkingHoursForDisplay(
        profile?.workingHours,
        weekdayLabels,
        t('businessProfile.settings.dayOff')
      ),
    [profile?.workingHours, weekdayLabels, t]
  );

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
        setProfile({
          ...data.profile,
          portfolioImages: Array.isArray(data.profile?.portfolioImages) ? data.profile.portfolioImages : [],
        });
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setVitrineListingIds(
          Array.isArray(data.vitrineListingIds)
            ? data.vitrineListingIds.filter((id: unknown) => typeof id === 'number' && Number.isFinite(id))
            : []
        );
        setIsFollowing(Boolean(data.isFollowing));
        setViewerHasReviewed(Boolean(data.viewerHasReviewed));
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
    (channel: 'telegram' | 'phone' | 'instagram' | 'website') => {
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

  const businessActivity = useMemo(() => {
    if (!profile) return { sphere: '', directions: [] as string[] };
    return legacyFieldsToBusinessActivity(profile.category, profile.subcategory);
  }, [profile]);

  const sphereLabel = useMemo(() => {
    if (!businessActivity.sphere) return '';
    return getBusinessSphereLabel(businessActivity.sphere, language === 'ru' ? 'ru' : 'uk');
  }, [businessActivity.sphere, language]);

  const directionLabels = useMemo(
    () =>
      businessActivity.directions.map((id) =>
        getBusinessDirectionLabel(id, language === 'ru' ? 'ru' : 'uk')
      ),
    [businessActivity.directions, language]
  );

  const serviceAreaLine = useMemo(() => {
    if (!profile?.serviceArea) return '';
    const areaKey = profile.serviceArea;
    const label = t(`businessProfile.serviceArea.${areaKey}`);
    if (areaKey === 'city_radius' && profile.serviceRadiusKm != null && profile.serviceRadiusKm > 0) {
      return `${label} · ${profile.serviceRadiusKm} km`;
    }
    return label;
  }, [profile?.serviceArea, profile?.serviceRadiusKm, t]);

  const vitrineListings = useMemo(() => {
    if (vitrineListingIds.length === 0) return listings;
    const byId = new Map(listings.map((l) => [l.id, l]));
    return vitrineListingIds
      .map((id) => byId.get(id))
      .filter((l): l is Listing => Boolean(l));
  }, [listings, vitrineListingIds]);

  const filteredListings = useMemo(() => {
    if (listingFilter === 'services') {
      return vitrineListings.filter((l) => l.category === 'services_work');
    }
    if (listingFilter === 'products') {
      return vitrineListings.filter((l) => l.category !== 'services_work');
    }
    return vitrineListings;
  }, [vitrineListings, listingFilter]);

  const portfolioUrls = useMemo(
    () => (profile?.portfolioImages ?? []).map((path) => getResolvedImageUrl(path)),
    [profile?.portfolioImages]
  );

  const profileTabs = useMemo(
    () =>
      [
        {
          id: 'listings' as const,
          label: t('businessProfile.public.tabs.listings'),
          badge: profile?.activeListingsCount ?? 0,
        },
        { id: 'about' as const, label: t('businessProfile.public.tabs.about') },
        { id: 'portfolio' as const, label: t('businessProfile.public.tabs.portfolio') },
        {
          id: 'reviews' as const,
          label: t('businessProfile.public.tabs.reviews'),
          badge: profile?.reviewsCount ?? 0,
        },
      ] as const,
    [t, profile?.activeListingsCount, profile?.reviewsCount]
  );

  const coverUrl = profile?.coverImage ? getResolvedImageUrl(profile.coverImage) : null;
  const logoUrl = profile?.logo ? getResolvedImageUrl(profile.logo) : null;

  const handleMessage = () => {
    if (!profile) return;
    trackBusinessContact('telegram');
    const message = buildSellerProfileContactMessage(
      getProfileShareLink(sellerTelegramId),
      resolveSellerContactLang(language)
    );
    const profileUrl = getProfileShareLink(sellerTelegramId);
    const username = resolveBusinessProfileTelegramUsername(
      profile.sellerUsername,
      profile.telegram
    );
    if (username) {
      openSellerTelegramChat(username, message, tg ?? undefined);
      return;
    }
    openSellerContactViaTelegramShare(profileUrl, message, tg ?? undefined);
  };

  const handleInstagram = () => {
    if (!profile?.instagram) return;
    const url = normalizeInstagramUrl(profile.instagram);
    if (!url) return;
    trackBusinessContact('instagram');
    openExternalUrl(url, tg ?? undefined);
  };

  const handleWebsite = () => {
    if (!profile?.website) return;
    const url = normalizeWebsiteUrl(profile.website);
    if (!url) return;
    trackBusinessContact('website');
    openExternalUrl(url, tg ?? undefined);
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

  const handleSubmitReview = async () => {
    if (viewingOwn || viewerHasReviewed || reviewSubmitting) return;
    if (!currentUser?.id) {
      showToast(t('businessProfile.public.loginToReview'), 'info');
      return;
    }
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorTelegramId: String(currentUser.id),
          targetTelegramId: sellerTelegramId,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          showToast(t('businessProfile.public.reviewAlreadyLeft'), 'info');
          setViewerHasReviewed(true);
          return;
        }
        showToast(t('common.error'), 'error');
        return;
      }
      setViewerHasReviewed(true);
      setReviewComment('');
      if (data.review) {
        setReviews((prev) => [
          {
            id: data.review.id,
            rating: data.review.rating,
            comment: data.review.comment,
            createdAt: data.review.createdAt,
            authorName: t('common.user'),
            authorAvatar: null,
          },
          ...prev,
        ]);
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              reviewsCount: prev.reviewsCount + 1,
              rating:
                prev.reviewsCount > 0
                  ? (prev.rating * prev.reviewsCount + reviewRating) / (prev.reviewsCount + 1)
                  : reviewRating,
            }
          : prev
      );
      showToast(t('businessProfile.public.reviewSubmitted'), 'success');
      void fetchProfile();
    } catch {
      showToast(t('common.error'), 'error');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleBack = onBackToPreviousListing || onClose;
  const navBtnClass = isLight
    ? 'flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/35'
    : 'flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/60';
  const pageBackBtnClass = `flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${overlayHeaderActionClass(isLight)}`;

  if (loadError) {
    return (
      <div className={`min-h-screen pb-24 ${ac.pageBackground}`}>
        <FixedLogoHeader
          mode="window-fixed"
          zClassName="z-[50]"
          paddingX={false}
          outerClassName="px-4 lg:px-6"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = `/${lang}/bazaar`;
          }}
        />
        <div className="px-4 pt-4">
          <button type="button" onClick={handleBack} aria-label={t('common.back')} className={pageBackBtnClass}>
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
      <div className={`min-h-screen ${ac.pageBackground}`}>
        <FixedLogoHeader mode="window-fixed" zClassName="z-[50]" paddingX={false} outerClassName="px-4 lg:px-6" />
        <div className="px-4 pt-4">
          <ListingGridSkeleton count={4} />
        </div>
      </div>
    );
  }

  const canMessage = Boolean(profile);
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
          channel: 'telegram' as const,
          label: t('businessProfile.public.write'),
          onClick: handleMessage,
          primary: true,
        }
      : null,
    profile.phone
      ? {
          key: 'phone',
          channel: 'phone' as const,
          label: t('businessProfile.public.call'),
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
          channel: 'instagram' as const,
          label: 'Instagram',
          onClick: handleInstagram,
          primary: false,
        }
      : null,
    profile.website
      ? {
          key: 'website',
          channel: 'website' as const,
          label: t('businessProfile.public.website'),
          onClick: handleWebsite,
          primary: false,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    channel: BusinessContactChannel;
    label: string;
    onClick: () => void;
    primary: boolean;
  }>;

  const listingsCountBadgeClass = isLight
    ? 'bg-[#3F5331] text-white'
    : 'bg-[#C8E6A0] text-[#0f1408]';
  const reviewsCountBadgeClass = isLight
    ? 'border border-[#3F5331]/25 bg-[#E8F0E0] text-[#3F5331]'
    : 'border border-[#C8E6A0]/30 bg-[#C8E6A0]/15 text-[#C8E6A0]';

  return (
    <div className={`min-h-screen pb-24 ${ac.pageBackground}`}>
      <FixedLogoHeader
        mode="window-fixed"
        zClassName="z-[50]"
        paddingX={false}
        outerClassName="px-4 lg:px-6"
        onClick={() => {
          if (typeof window !== 'undefined') window.location.href = `/${lang}/bazaar`;
        }}
      />

      <div className="relative">
        <div
          className={`relative h-40 overflow-hidden sm:h-44 ${
            coverUrl ? '' : isLight ? 'bg-gradient-to-br from-[#3F5331]/30 to-[#2a3820]/20' : 'bg-gradient-to-br from-[#3F5331]/50 to-[#1a2414]'
          }`}
        >
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover object-center" />
          ) : null}
          <div
            className={`pointer-events-none absolute inset-0 ${
              isLight
                ? 'bg-gradient-to-b from-black/40 via-black/10 to-transparent'
                : 'bg-gradient-to-b from-black/50 via-black/25 to-transparent'
            }`}
          />
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 ${
              isLight
                ? 'bg-gradient-to-b from-transparent to-[#f5f7f2]'
                : 'bg-gradient-to-b from-transparent to-[#000000]'
            }`}
          />

          <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 py-3">
            <button type="button" onClick={handleBack} aria-label={t('common.back')} className={navBtnClass}>
              <ArrowLeft size={20} />
            </button>
            <div className="flex min-w-0 flex-1 justify-center px-1">
              <span className="truncate text-base font-semibold text-white">{profile.businessName}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              aria-label={t('common.share')}
              title={t('common.share')}
              className={navBtnClass}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        <div className="relative z-10 flex items-end gap-3 px-4 sm:pl-6">
          <div
            className={`-mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-full ring-4 ring-offset-2 sm:h-28 sm:w-28 sm:-mt-14 ${
              isLight
                ? 'bg-[#111] ring-white ring-offset-[#f5f7f2]'
                : 'bg-[#141414] ring-[#C8E6A0]/30 ring-offset-[#000000]'
            }`}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#3F5331]/50 text-2xl font-bold text-[#C8E6A0] sm:text-3xl">
                {profile.businessName.charAt(0)}
              </div>
            )}
          </div>

          <div
            className={`mb-1 flex min-h-[5.5rem] min-w-0 flex-1 flex-col justify-center gap-2 rounded-2xl px-3 py-2.5 sm:min-h-[6.25rem] sm:px-4 ${
              isLight ? 'bg-[#1a2414]/90 text-white shadow-md' : 'bg-black/75 text-white backdrop-blur-sm'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                <Users size={16} className="shrink-0 text-[#C8E6A0]" />
                <span className="font-bold tabular-nums">{profile.followersCount}</span>
                <span className="truncate text-xs text-white/75">{t('businessProfile.public.followersLabel')}</span>
              </span>
              {!viewingOwn && (
                <button
                  type="button"
                  onClick={() => void handleFollow()}
                  disabled={followBusy}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    isFollowing
                      ? 'border border-white/25 bg-white/10 text-white'
                      : 'bg-[#C8E6A0] text-[#0f1408] hover:bg-[#dff5c0]'
                  }`}
                >
                  {isFollowing ? (
                    <span className="inline-flex items-center gap-1">
                      <Check size={13} />
                      {t('businessProfile.public.subscribed')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <UserPlus size={13} />
                      {t('businessProfile.public.subscribe')}
                    </span>
                  )}
                </button>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              <Star size={15} className="shrink-0 fill-amber-400 text-amber-400" />
              {showRating ? (
                <span className="truncate font-medium">{formatRatingReviews(profile.rating, profile.reviewsCount, t)}</span>
              ) : (
                <span className="truncate text-xs text-white/75">{t('businessProfile.public.noReviewsYet')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 text-left">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h1 className={`min-w-0 text-xl font-bold ${ac.pageHeading}`}>{profile.businessName}</h1>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${
              isLight
                ? 'border border-[#3F5331]/50 text-[#3F5331]'
                : 'border border-[#C8E6A0]/50 text-[#C8E6A0]'
            }`}
          >
            BUSINESS
          </span>
        </div>

        <p className={`mb-2 text-sm ${ac.mutedText}`}>
          {sphereLabel}
          {profile.city ? ` · ${profile.city}` : ''}
        </p>

        {directionLabels.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {directionLabels.map((label) => (
              <span
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {contactActions.length > 0 && (
          <div className="mb-6 flex gap-2">
            {contactActions.map(({ key, channel, label, onClick, primary }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`${actionBtnBase} ${primary ? actionPrimary : actionSecondary}`}
              >
                <BusinessContactBrandIcon channel={channel} size={28} />
                {label}
              </button>
            ))}
          </div>
        )}

        <div
          className={`mb-4 flex gap-1 overflow-x-auto border-b scrollbar-hide ${
            isLight ? 'border-gray-200' : 'border-white/10'
          }`}
        >
          {profileTabs.map((item) => {
            const active = tab === item.id;
            const badge = 'badge' in item ? item.badge : undefined;
            const badgeClass =
              item.id === 'listings' ? listingsCountBadgeClass : reviewsCountBadgeClass;
            const showBadge =
              badge != null && (item.id === 'listings' || badge > 0);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative shrink-0 px-3 pb-3 pt-0.5 text-sm font-medium transition-colors ${
                  active ? ac.pageHeading : ac.mutedText
                }`}
              >
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {item.label}
                  {showBadge ? (
                    <span
                      className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${badgeClass}`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </span>
                {active && (
                  <span
                    className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full ${
                      isLight ? 'bg-[#3F5331]' : 'bg-[#C8E6A0]'
                    }`}
                  />
                )}
              </button>
            );
          })}
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
                        ? 'bg-[#3F5331] text-white'
                        : 'bg-[#C8E6A0] text-[#0f1408]'
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
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${ac.mutedText}`}>
                {profile.description?.trim() || t('businessProfile.public.noDescription')}
              </p>
            </div>
            {serviceAreaLine ? (
              <div className={aboutCard}>
                <h3 className={`mb-1 font-semibold ${ac.pageHeading}`}>
                  {t('businessProfile.fields.serviceArea')}
                </h3>
                <p className={`flex items-start gap-2 text-sm ${ac.mutedText}`}>
                  <MapPin size={16} className="mt-0.5 shrink-0" />
                  <span>{serviceAreaLine}</span>
                </p>
              </div>
            ) : null}
            {profile.address && (
              <div className={aboutCard}>
                <h3 className={`mb-1 font-semibold ${ac.pageHeading}`}>{t('businessProfile.fields.address')}</h3>
                <p className={`text-sm ${ac.mutedText}`}>{profile.address}</p>
              </div>
            )}
            {formattedWorkingHours && (
              <div className={aboutCard}>
                <h3 className={`mb-1 font-semibold ${ac.pageHeading}`}>{t('businessProfile.fields.workingHours')}</h3>
                <p className={`text-sm whitespace-pre-wrap ${ac.mutedText}`}>{formattedWorkingHours}</p>
              </div>
            )}
            <p className={`px-1 text-xs ${ac.mutedText}`}>
              {t('businessProfile.public.memberSince')}: {profile.memberSince}
            </p>
          </div>
        )}

        {tab === 'portfolio' && (
          <>
            {portfolioUrls.length > 0 ? (
              <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
                {portfolioUrls.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    className="relative aspect-square overflow-hidden bg-black/10"
                    onClick={() => setPortfolioPreviewUrl(url)}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className={`py-10 text-center text-sm ${ac.mutedText}`}>
                {t('businessProfile.public.noPortfolio')}
              </p>
            )}
          </>
        )}

        {tab === 'reviews' && (
          <div className="space-y-3">
            <div className={aboutCard}>
              <div className="flex flex-wrap items-center gap-2">
                <Star size={18} className="fill-amber-400 text-amber-400" />
                {showRating ? (
                  <span className={`font-semibold ${ac.pageHeading}`}>
                    {formatRatingReviews(profile.rating, profile.reviewsCount, t)}
                  </span>
                ) : (
                  <span className={`font-semibold ${ac.pageHeading}`}>{t('businessProfile.public.noReviews')}</span>
                )}
              </div>
              <p className={`mt-2 text-xs leading-relaxed ${ac.mutedText}`}>
                {t('businessProfile.public.reviewsHint')}
              </p>
            </div>
            {!viewingOwn && !viewerHasReviewed && (
              <div className={aboutCard}>
                <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
                  {t('businessProfile.public.leaveReview')}
                </p>
                <div className="mb-3 flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReviewRating(value)}
                      className="p-1"
                      aria-label={`${t('businessProfile.public.reviewRating')} ${value}`}
                    >
                      <Star
                        size={22}
                        className={
                          value <= reviewRating
                            ? 'fill-amber-400 text-amber-400'
                            : isLight
                              ? 'text-gray-300'
                              : 'text-white/25'
                        }
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={t('businessProfile.public.reviewCommentPlaceholder')}
                  className={`mb-3 w-full rounded-xl border px-3 py-2 text-sm ${
                    isLight ? 'border-gray-200 bg-white' : 'border-white/15 bg-white/5'
                  }`}
                  rows={3}
                  maxLength={2000}
                />
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={() => void handleSubmitReview()}
                  className={`w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 ${
                    isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                  }`}
                >
                  {t('businessProfile.public.reviewSubmit')}
                </button>
              </div>
            )}
            {reviews.length > 0 ? (
              <ul className="space-y-2">
                {reviews.map((review) => (
                  <li key={review.id} className={aboutCard}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${ac.pageHeading}`}>
                        {review.authorName || t('common.user')}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-500">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        {review.rating}
                      </span>
                    </div>
                    {review.comment?.trim() ? (
                      <p className={`text-sm leading-relaxed ${ac.mutedText}`}>{review.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`py-4 text-center text-sm ${ac.mutedText}`}>{t('businessProfile.public.noReviews')}</p>
            )}
          </div>
        )}
      </div>

      <ImageViewModal
        isOpen={Boolean(portfolioPreviewUrl)}
        onClose={() => setPortfolioPreviewUrl(null)}
        imageUrl={portfolioPreviewUrl || ''}
        alt={profile.businessName}
      />

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
