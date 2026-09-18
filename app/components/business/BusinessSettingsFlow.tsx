'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Image as ImageIcon,
  Info,
  Link2,
  MapPin,
  MinusCircle,
  Package,
  Phone,
  Share2,
  Star,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { useToast } from '@/features/ui/hooks/useToast';
import { Toast } from '@/components/ui/Toast';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getCurrencySymbol } from '@/utils/currency';
import { getCategories } from '@/constants/categories';
import { majorGermanCities } from '@/constants/major-german-cities';
import { type ServiceArea } from '@/lib/businessProfileConstants';
import {
  WEEKDAY_KEYS,
  parseListingDisplayConfig,
  parseWorkingHoursSettings,
  serializeWorkingHoursSettings,
  type ListingDisplayMode,
  type WeekdayKey,
  type WorkingHoursSettings,
} from '@/lib/businessProfileSettings';
import { Listing } from '@/types';
import { getResolvedImageUrl, compressImageOnClient } from '@/utils/imageUtils';
import { getProfileShareLink } from '@/utils/botLinks';
import { BusinessBrandIcon } from '@/components/business/BusinessBrandIcon';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import type { BusinessProfileData } from '@/components/business/BusinessOwnerProfileView';

type SettingsScreen =
  | 'hub'
  | 'editProfile'
  | 'location'
  | 'contacts'
  | 'workingHours'
  | 'listings'
  | 'publicLink'
  | 'deactivate';

interface BusinessSettingsFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onDeactivated?: () => void;
  tg: TelegramWebApp | null;
  telegramId: string;
  defaultTelegram?: string;
  defaultPhone?: string;
  existingProfile: BusinessProfileData;
  rating?: number;
  reviewsCount?: number;
  followersCount?: number;
}

interface FormState {
  businessName: string;
  category: string;
  subcategory: string;
  description: string;
  logoFile: File | null;
  logoPreview: string | null;
  city: string;
  address: string;
  serviceArea: ServiceArea;
  serviceRadiusKm: string;
  telegram: string;
  phone: string;
  instagram: string;
  website: string;
  coverFile: File | null;
  coverPreview: string | null;
  workingHoursSettings: WorkingHoursSettings;
  listingDisplayMode: ListingDisplayMode;
  selectedListingIds: number[];
  savedLogoPath: string | null;
  savedCoverPath: string | null;
}

const BUSINESS_NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

function prefillForm(
  profile: BusinessProfileData,
  defaults: { telegram?: string; phone?: string }
): FormState {
  const linkedConfig = parseListingDisplayConfig(profile.linkedListingIds);
  const linkedIds = linkedConfig.ids;

  return {
    businessName: profile.businessName || '',
    category: profile.category || '',
    subcategory: profile.subcategory || '',
    description: profile.description || '',
    logoFile: null,
    logoPreview: profile.logo || null,
    city: profile.city || '',
    address: profile.address || '',
    serviceArea: (profile.serviceArea as ServiceArea) || 'city_only',
    serviceRadiusKm: profile.serviceRadiusKm ? String(profile.serviceRadiusKm) : '25',
    telegram: profile.telegram || defaults.telegram || '',
    phone: profile.phone || defaults.phone || '',
    instagram: profile.instagram || '',
    website: profile.website || '',
    coverFile: null,
    coverPreview: profile.coverImage || null,
    workingHoursSettings: parseWorkingHoursSettings(profile.workingHours),
    listingDisplayMode: linkedConfig.mode,
    selectedListingIds: linkedIds,
    savedLogoPath: profile.logo || null,
    savedCoverPath: profile.coverImage || null,
  };
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; details?: string };
    const msg = [data.error, data.details].filter(Boolean).join(' — ');
    return msg || `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

function PhotoPickerRow({
  kind,
  label,
  recommended,
  preview,
  previewSrc,
  fallbackInitial,
  isLight,
  ac,
  ui,
  changeLabel,
  onPick,
}: {
  kind: 'logo' | 'cover';
  label: string;
  recommended: string;
  preview: string | null;
  previewSrc: (src: string | null) => string;
  fallbackInitial: string;
  isLight: boolean;
  ac: ReturnType<typeof getAppearanceClasses>;
  ui: ReturnType<typeof getBusinessProfileUi>;
  changeLabel: string;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLogo = kind === 'logo';

  return (
    <div className={isLogo ? 'mb-4' : ''}>
      <div className={`flex items-center gap-3 ${!isLogo ? 'mb-2' : ''}`}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`relative shrink-0 overflow-hidden ${
            isLogo ? 'h-16 w-16 rounded-full' : 'hidden'
          } ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}
        >
          {preview ? (
            <img src={previewSrc(preview)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-[#C8E6A0]">
              {fallbackInitial}
            </div>
          )}
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-black/70">
            <Camera size={12} className="text-white" />
          </span>
        </button>

        {isLogo ? (
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${ac.pageHeading}`}>{label}</p>
            <p className={`text-xs ${ac.mutedText}`}>{recommended}</p>
          </div>
        ) : null}

        {isLogo ? (
          <button type="button" onClick={() => inputRef.current?.click()} className={ui.btnOutlineSm}>
            {changeLabel}
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            onPick(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
      </div>

      {!isLogo ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`relative mb-2 aspect-[16/7] w-full overflow-hidden rounded-2xl ${
              isLight ? 'bg-gray-100' : 'bg-white/10'
            }`}
          >
            {preview ? (
              <img src={previewSrc(preview)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon size={28} className={ac.mutedText} />
              </div>
            )}
            <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/70">
              <Camera size={14} className="text-white" />
            </span>
          </button>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${ac.pageHeading}`}>{label}</p>
              <p className={`text-xs ${ac.mutedText}`}>{recommended}</p>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} className={ui.btnOutlineSm}>
              {changeLabel}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[#C8E6A0]' : 'bg-white/20'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'left-[1.375rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export default function BusinessSettingsFlow({
  isOpen,
  onClose,
  onSuccess,
  onDeactivated,
  tg,
  telegramId,
  defaultTelegram = '',
  defaultPhone = '',
  existingProfile,
  rating = 0,
  reviewsCount = 0,
  followersCount = 0,
}: BusinessSettingsFlowProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const { toast, showToast, hideToast } = useToast();
  const categories = useMemo(() => getCategories(t), [t]);

  const [screen, setScreen] = useState<SettingsScreen>('hub');
  const [form, setForm] = useState<FormState>(() =>
    prefillForm(existingProfile, { telegram: defaultTelegram, phone: defaultPhone })
  );
  const [loading, setLoading] = useState(false);
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [cityQuery, setCityQuery] = useState('');
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);

  useHideBottomNav(isOpen);
  useBodyScrollLock(isOpen);

  const isPro = existingProfile.plan === 'business_pro';
  const logoUrl = form.logoPreview ? getResolvedImageUrl(form.logoPreview) : null;
  const showRating = reviewsCount > 0 && rating > 0;

  const subcategories = useMemo(
    () => categories.find((c) => c.id === form.category)?.subcategories || [],
    [categories, form.category]
  );

  const filteredCities = useMemo(() => {
    const query = cityQuery.trim().toLowerCase();
    const list = query
      ? majorGermanCities.filter((city) => city.toLowerCase().includes(query))
      : majorGermanCities;
    return list.slice(0, 16);
  }, [cityQuery]);

  const publicBotLink = getProfileShareLink(telegramId);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(publicBotLink)}`;

  const weekdayLabels = useMemo(
    () =>
      Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, t(`businessProfile.settings.weekdays.${key}`)])) as Record<
        WeekdayKey,
        string
      >,
    [t]
  );

  const activeUserListings = useMemo(
    () => userListings.filter((listing) => listing.status === 'active'),
    [userListings]
  );

  const selectedListingsCount = useMemo(() => {
    if (form.listingDisplayMode === 'all') return activeUserListings.length;
    return form.selectedListingIds.length;
  }, [form.listingDisplayMode, form.selectedListingIds, activeUserListings.length]);

  const inputCls = isLight
    ? 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400'
    : 'w-full rounded-xl border border-white/15 bg-[#1C1C1C] px-4 py-3 text-white placeholder:text-white/40';

  const labelCls = isLight
    ? 'mb-1.5 block text-sm font-medium text-gray-700'
    : 'mb-1.5 block text-sm font-medium text-white/80';

  const sectionTitleCls = `mb-3 text-sm font-semibold ${ac.pageHeading}`;

  const patch = (partial: Partial<FormState>) => setForm((prev) => ({ ...prev, ...partial }));

  const previewSrc = (src: string | null) => {
    if (!src) return '';
    if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) return src;
    return getResolvedImageUrl(src);
  };

  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false;
      setScreen('hub');
      setCopiedLink(false);
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setForm(prefillForm(existingProfile, { telegram: defaultTelegram, phone: defaultPhone }));
    setScreen('hub');
  }, [isOpen, existingProfile, defaultTelegram, defaultPhone]);

  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 });
    setCityQuery('');
    setCityPickerOpen(screen === 'location' && !form.city);
  }, [screen, form.city]);

  useEffect(() => {
    if (!isOpen || screen !== 'listings') return;
    fetch(`/api/listings?userId=${telegramId}&viewerId=${telegramId}&limit=50&offset=0`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data) => setUserListings(data.listings || []))
      .catch(() => setUserListings([]));
  }, [isOpen, screen, telegramId]);

  useEffect(() => {
    if (!isOpen || screen !== 'listings' || activeUserListings.length === 0) return;
    if (form.listingDisplayMode === 'all') {
      const ids = activeUserListings.map((listing) => listing.id);
      const same =
        ids.length === form.selectedListingIds.length &&
        ids.every((id) => form.selectedListingIds.includes(id));
      if (!same) {
        patch({ selectedListingIds: ids });
      }
    }
  }, [isOpen, screen, activeUserListings, form.listingDisplayMode, form.selectedListingIds]);

  const validateScreen = (target: SettingsScreen): string | null => {
    if (target === 'editProfile') {
      const hasLogo = Boolean(form.logoFile || form.logoPreview || form.savedLogoPath);
      if (!form.businessName.trim()) return t('businessProfile.validation.businessName');
      if (!form.category) return t('businessProfile.validation.category');
      if (!form.subcategory) return t('businessProfile.validation.subcategory');
      if (!form.description.trim()) return t('businessProfile.validation.description');
      if (!hasLogo) return t('businessProfile.validation.logo');
    }
    if (target === 'location') {
      if (!form.city.trim()) return t('businessProfile.validation.cityRequired');
      if (form.serviceArea === 'city_radius' && !form.serviceRadiusKm.trim()) {
        return t('businessProfile.validation.radiusRequired');
      }
    }
    if (target === 'contacts') {
      const hasContact = [form.telegram, form.phone, form.instagram, form.website].some((v) => v.trim());
      if (!hasContact) return t('businessProfile.validation.contactRequired');
    }
    return null;
  };

  const saveProfile = useCallback(async () => {
    setLoading(true);
    try {
      const listingIdsToAssign =
        form.listingDisplayMode === 'all'
          ? activeUserListings.map((listing) => listing.id)
          : form.selectedListingIds;
      const workingHours = serializeWorkingHoursSettings(form.workingHoursSettings);
      const hasNewFiles = Boolean(form.logoFile || form.coverFile);
      let res: Response;

      if (hasNewFiles) {
        const fd = new FormData();
        fd.append('telegramId', telegramId);
        fd.append('businessName', form.businessName);
        fd.append('category', form.category);
        fd.append('subcategory', form.subcategory);
        fd.append('description', form.description);
        fd.append('city', form.city);
        fd.append('address', form.address);
        fd.append('serviceArea', form.serviceArea);
        if (form.serviceRadiusKm) fd.append('serviceRadiusKm', form.serviceRadiusKm);
        fd.append('telegram', form.telegram);
        fd.append('phone', form.phone);
        fd.append('instagram', form.instagram);
        fd.append('website', form.website);
        fd.append('workingHours', workingHours);
        fd.append('listingDisplayMode', form.listingDisplayMode);
        fd.append('listingIds', JSON.stringify(listingIdsToAssign));
        if (form.logoFile) fd.append('logo', form.logoFile);
        if (form.coverFile) fd.append('coverImage', form.coverFile);
        res = await fetch('/api/user/business-profile', { method: 'PUT', body: fd });
      } else {
        res = await fetch('/api/user/business-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId,
            businessName: form.businessName,
            category: form.category,
            subcategory: form.subcategory,
            description: form.description,
            city: form.city,
            address: form.address,
            serviceArea: form.serviceArea,
            serviceRadiusKm: form.serviceArea === 'city_radius' ? form.serviceRadiusKm : null,
            telegram: form.telegram,
            phone: form.phone,
            instagram: form.instagram,
            website: form.website,
            workingHours,
            listingDisplayMode: form.listingDisplayMode,
            listingIds: listingIdsToAssign,
            ...(form.savedLogoPath ? { logo: form.savedLogoPath } : {}),
            ...(form.savedCoverPath ? { coverImage: form.savedCoverPath } : {}),
          }),
        });
      }

      if (!res.ok) {
        const message = await readApiError(res, t('businessProfile.validation.photoUploadFailed'));
        showToast(message, 'error');
        return false;
      }

      const data = await res.json();
      patch({
        savedLogoPath: data.profile?.logo || form.savedLogoPath,
        savedCoverPath: data.profile?.coverImage || form.savedCoverPath,
        logoPreview: data.profile?.logo || form.logoPreview,
        coverPreview: data.profile?.coverImage || form.coverPreview,
        logoFile: null,
        coverFile: null,
      });

      showToast(t('businessProfile.updated'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      onSuccess();
      return true;
    } catch (error) {
      console.error(error);
      showToast(t('common.error'), 'error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [activeUserListings, form, onSuccess, showToast, t, telegramId, tg]);

  const handleSave = async (fromScreen: SettingsScreen) => {
    const err = validateScreen(fromScreen);
    if (err) {
      showToast(err, 'error');
      tg?.HapticFeedback.notificationOccurred('error');
      return;
    }
    const ok = await saveProfile();
    if (ok) setScreen('hub');
  };

  const handleImagePick = async (file: File | null, kind: 'logo' | 'cover') => {
    if (!file) return;
    let prepared = file;
    try {
      prepared = await compressImageOnClient(file, kind === 'logo' ? 1.2 : 2);
    } catch {
      showToast(t('businessProfile.validation.photoUploadFailed'), 'error');
      return;
    }
    const preview = URL.createObjectURL(prepared);
    patch(
      kind === 'logo'
        ? { logoFile: prepared, logoPreview: preview }
        : { coverFile: prepared, coverPreview: preview }
    );
  };

  const setListingDisplayMode = (mode: ListingDisplayMode) => {
    if (mode === 'all') {
      patch({
        listingDisplayMode: 'all',
        selectedListingIds: activeUserListings.map((listing) => listing.id),
      });
      return;
    }
    patch({
      listingDisplayMode: 'manual',
      selectedListingIds:
        form.selectedListingIds.length > 0
          ? form.selectedListingIds
          : activeUserListings.map((listing) => listing.id),
    });
  };

  const patchWorkingHoursDay = (key: WeekdayKey, partial: Partial<WorkingHoursSettings['days'][WeekdayKey]>) => {
    patch({
      workingHoursSettings: {
        ...form.workingHoursSettings,
        days: {
          ...form.workingHoursSettings.days,
          [key]: { ...form.workingHoursSettings.days[key], ...partial },
        },
      },
    });
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/business-profile/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId }),
      });
      if (!res.ok) {
        showToast(t('common.error'), 'error');
        return;
      }
      showToast(t('businessProfile.settings.deactivatedToast'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      onDeactivated?.();
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      showToast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      showToast(t('businessProfile.settings.linkCopied'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast(t('common.error'), 'error');
    }
  };

  const handleShareLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: existingProfile.businessName,
          url: publicBotLink,
        });
        tg?.HapticFeedback.notificationOccurred('success');
      } else {
        await handleCopyLink(publicBotLink);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      await handleCopyLink(publicBotLink);
    }
  };

  const screenTitle = (() => {
    switch (screen) {
      case 'hub':
        return t('businessProfile.settings.title');
      case 'editProfile':
        return t('businessProfile.settings.menu.editProfile.title');
      case 'location':
        return t('businessProfile.settings.menu.location.title');
      case 'contacts':
        return t('businessProfile.settings.menu.contacts.title');
      case 'workingHours':
        return t('businessProfile.settings.menu.workingHours.title');
      case 'listings':
        return t('businessProfile.settings.menu.listings.title');
      case 'publicLink':
        return t('businessProfile.settings.menu.publicLink.title');
      case 'deactivate':
        return t('businessProfile.settings.deactivateScreenTitle');
      default:
        return t('businessProfile.settings.title');
    }
  })();

  const menuItems: Array<{
    id: SettingsScreen;
    icon: typeof UserRound;
    title: string;
    subtitle: string;
  }> = [
    {
      id: 'editProfile',
      icon: UserRound,
      title: t('businessProfile.settings.menu.editProfile.title'),
      subtitle: t('businessProfile.settings.menu.editProfile.subtitle'),
    },
    {
      id: 'location',
      icon: MapPin,
      title: t('businessProfile.settings.menu.location.title'),
      subtitle: t('businessProfile.settings.menu.location.subtitle'),
    },
    {
      id: 'contacts',
      icon: Phone,
      title: t('businessProfile.settings.menu.contacts.title'),
      subtitle: t('businessProfile.settings.menu.contacts.subtitle'),
    },
    {
      id: 'workingHours',
      icon: Clock,
      title: t('businessProfile.settings.menu.workingHours.title'),
      subtitle: t('businessProfile.settings.menu.workingHours.subtitle'),
    },
    {
      id: 'listings',
      icon: Package,
      title: t('businessProfile.settings.menu.listings.title'),
      subtitle: t('businessProfile.settings.menu.listings.subtitle'),
    },
    {
      id: 'publicLink',
      icon: Link2,
      title: t('businessProfile.settings.menu.publicLink.title'),
      subtitle: t('businessProfile.settings.menu.publicLink.subtitle'),
    },
  ];

  const handleDownloadQr = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'business-profile-qr.png';
      anchor.click();
      URL.revokeObjectURL(url);
      tg?.HapticFeedback.notificationOccurred('success');
    } catch {
      window.open(qrCodeUrl, '_blank');
    }
  };

  const formatListingPrice = (listing: Listing) => {
    if (listing.isFree) return t('sales.free') || 'Free';
    const symbol = getCurrencySymbol(listing.currency);
    return `${listing.price} ${symbol}`;
  };

  const renderPhotoPicker = (
    kind: 'logo' | 'cover',
    label: string,
    recommended: string,
    preview: string | null
  ) => (
    <PhotoPickerRow
      kind={kind}
      label={label}
      recommended={recommended}
      preview={preview}
      previewSrc={previewSrc}
      fallbackInitial={form.businessName.charAt(0).toUpperCase() || '?'}
      isLight={isLight}
      ac={ac}
      ui={ui}
      changeLabel={t('businessProfile.fields.changePhoto')}
      onPick={(file) => void handleImagePick(file, kind)}
    />
  );

  if (!isOpen) return null;

  const shell = isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0a] text-white';
  const headerBorder = ui.divider;
  const accentIcon = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';

  return (
    <>
      <div className="fixed inset-0 z-[99990] flex flex-col justify-end">
        <button
          type="button"
          aria-label={t('common.close')}
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={onClose}
        />

        <div
          className={`relative z-10 flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-[1.75rem] shadow-2xl ${shell}`}
        >
          <div
            className={`flex shrink-0 items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${headerBorder}`}
          >
            <button
              type="button"
              onClick={screen === 'hub' ? onClose : () => setScreen('hub')}
              className={`-ml-2 rounded-full p-2 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
            >
              {screen === 'hub' ? <X size={22} /> : <ChevronLeft size={22} />}
            </button>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <BusinessBrandIcon size={20} className={accentIcon} />
              <span className="max-w-[12rem] truncate">{screenTitle}</span>
            </span>
            <div className="w-10" />
          </div>

          <div ref={bodyScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {screen === 'hub' && (
              <div className="space-y-4 pb-4">
                <div className={`${ui.cardShell} p-4`}>
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#111]">
                      {logoUrl ? (
                        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-bold text-[#C8E6A0]">
                          {existingProfile.businessName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <h2 className={`truncate text-lg font-bold ${ac.pageHeading}`}>
                          {existingProfile.businessName}
                        </h2>
                        <BadgeCheck size={16} className="shrink-0 text-emerald-400" />
                      </div>
                      <span className={`mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${ui.limeBg} text-[#1a1a1a]`}>
                        BUSINESS{isPro ? ' PRO' : ''}
                      </span>
                      {showRating ? (
                        <div className={`mb-1 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                          <Star size={14} className="fill-amber-400 text-amber-400" />
                          <span>
                            {rating.toFixed(1)} · {reviewsCount}{' '}
                            {language === 'ru' ? 'отзывов' : 'відгуків'}
                          </span>
                        </div>
                      ) : null}
                      <div className={`flex items-center gap-1 text-sm ${ac.mutedText}`}>
                        <Users size={14} />
                        <span>
                          {followersCount} {t('businessProfile.public.followersLabel')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${ui.cardShell} divide-y ${ui.divider}`}>
                  {menuItems.map(({ id, icon: Icon, title, subtitle }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setScreen(id);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                        isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ui.limeBgSoft}`}>
                        <Icon size={18} className={ui.limeText} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${ac.pageHeading}`}>{title}</p>
                        <p className={`text-xs ${ac.mutedText}`}>{subtitle}</p>
                      </div>
                      <ChevronRight size={18} className={ac.mutedText} />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setScreen('deactivate');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`${ui.btnDangerOutline} items-start gap-3 px-4 py-3.5 text-left`}
                >
                  <MinusCircle size={18} className="mt-0.5 shrink-0" />
                  <span className="text-left">
                    <span className="block font-semibold">{t('businessProfile.settings.deactivateTitle')}</span>
                    <span className={`mt-0.5 block text-xs font-normal ${ac.mutedText}`}>
                      {t('businessProfile.settings.deactivateSubtitle')}
                    </span>
                  </span>
                </button>
              </div>
            )}

            {screen === 'editProfile' && (
              <div className="space-y-5 pb-28">
                <div>
                  <p className={sectionTitleCls}>{t('businessProfile.settings.photosSection')}</p>
                  {renderPhotoPicker(
                    'logo',
                    t('businessProfile.fields.logo'),
                    t('businessProfile.settings.logoRecommended'),
                    form.logoPreview
                  )}
                  {renderPhotoPicker(
                    'cover',
                    t('businessProfile.fields.coverImage'),
                    t('businessProfile.settings.coverRecommended'),
                    form.coverPreview
                  )}
                </div>

                <div>
                  <p className={sectionTitleCls}>{t('businessProfile.settings.basicSection')}</p>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className={labelCls.replace('mb-1.5 ', '')}>
                          {t('businessProfile.fields.businessName')} *
                        </label>
                        <span className={`text-xs tabular-nums ${ac.mutedText}`}>
                          {form.businessName.length}/{BUSINESS_NAME_MAX}
                        </span>
                      </div>
                      <input
                        className={inputCls}
                        maxLength={BUSINESS_NAME_MAX}
                        value={form.businessName}
                        onChange={(e) => patch({ businessName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('businessProfile.fields.category')} *</label>
                      <select
                        className={inputCls}
                        value={form.category}
                        onChange={(e) => patch({ category: e.target.value, subcategory: '' })}
                      >
                        <option value="">{t('businessProfile.fields.selectCategory')}</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{t('businessProfile.fields.subcategory')} *</label>
                      <select
                        className={inputCls}
                        value={form.subcategory}
                        onChange={(e) => patch({ subcategory: e.target.value })}
                        disabled={!form.category}
                      >
                        <option value="">{t('businessProfile.fields.selectSubcategory')}</option>
                        {subcategories.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className={labelCls.replace('mb-1.5 ', '')}>
                          {t('businessProfile.fields.description')} *
                        </label>
                        <span className={`text-xs tabular-nums ${ac.mutedText}`}>
                          {form.description.length}/{DESCRIPTION_MAX}
                        </span>
                      </div>
                      <textarea
                        className={`${inputCls} min-h-[120px] resize-none`}
                        maxLength={DESCRIPTION_MAX}
                        value={form.description}
                        onChange={(e) => patch({ description: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {screen === 'location' && (
              <div className="space-y-4 pb-28">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.city')} *</label>
                  {form.city ? (
                    <button
                      type="button"
                      onClick={() => {
                        patch({ city: '' });
                        setCityQuery('');
                        setCityPickerOpen(true);
                      }}
                      className={`mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left ${
                        isLight ? 'border-[#3F5331]/30 bg-[#3F5331]/5' : 'border-[#C8E6A0]/30 bg-white/5'
                      }`}
                    >
                      <MapPin size={18} className={accentIcon} />
                      <span className="flex-1 font-medium">{form.city}</span>
                    </button>
                  ) : (
                    <input
                      className={inputCls}
                      value={cityQuery}
                      placeholder={t('businessProfile.fields.searchCity')}
                      onFocus={() => setCityPickerOpen(true)}
                      onChange={(e) => {
                        setCityQuery(e.target.value);
                        setCityPickerOpen(true);
                      }}
                    />
                  )}
                  {!form.city && cityPickerOpen && (
                    <div
                      className={`max-h-56 overflow-y-auto rounded-2xl border ${
                        isLight ? 'border-gray-200 bg-white' : 'border-white/15 bg-[#141414]'
                      }`}
                    >
                      {filteredCities.map((city) => (
                        <button
                          type="button"
                          key={city}
                          onClick={() => {
                            patch({ city });
                            setCityQuery('');
                            setCityPickerOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm ${
                            isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'
                          }`}
                        >
                          <MapPin size={16} className={accentIcon} />
                          {city}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>{t('businessProfile.fields.address')}</label>
                  <input
                    className={inputCls}
                    value={form.address}
                    placeholder={t('businessProfile.fields.addressPlaceholder')}
                    onChange={(e) => patch({ address: e.target.value })}
                  />
                </div>

                <div>
                  <label className={labelCls}>{t('businessProfile.fields.serviceArea')}</label>
                  <div className="space-y-2">
                    {(['city_only', 'city_radius', 'all_germany'] as ServiceArea[]).map((area) => {
                      const selected = form.serviceArea === area;
                      return (
                        <button
                          type="button"
                          key={area}
                          onClick={() => patch({ serviceArea: area })}
                          className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left ${
                            selected
                              ? isLight
                                ? 'border-[#3F5331] bg-[#3F5331]/8'
                                : 'border-[#C8E6A0]/60 bg-white/8'
                              : isLight
                                ? 'border-gray-200 bg-white'
                                : 'border-white/15 bg-white/[0.03]'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? isLight
                                  ? 'border-[#3F5331] bg-[#3F5331] text-white'
                                  : 'border-[#C8E6A0] bg-[#C8E6A0] text-[#141414]'
                                : isLight
                                  ? 'border-gray-300'
                                  : 'border-white/30'
                            }`}
                          >
                            {selected ? <Check size={12} strokeWidth={3} /> : null}
                          </span>
                          <span>
                            <span className="block text-sm font-medium">
                              {t(`businessProfile.serviceArea.${area}`)}
                            </span>
                            <span className={`mt-0.5 block text-xs ${ac.mutedText}`}>
                              {t(`businessProfile.serviceArea.${area}Hint`)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {form.serviceArea === 'city_radius' && (
                  <div>
                    <label className={labelCls}>{t('businessProfile.fields.radiusKm')}</label>
                    <div className="mb-2 flex gap-2">
                      {['10', '25', '50', '100'].map((km) => (
                        <button
                          type="button"
                          key={km}
                          onClick={() => patch({ serviceRadiusKm: km })}
                          className={`flex-1 rounded-xl border py-2 text-sm font-medium ${
                            form.serviceRadiusKm === km
                              ? isLight
                                ? 'border-[#3F5331] bg-[#3F5331] text-white'
                                : 'border-[#C8E6A0] bg-[#C8E6A0] text-[#141414]'
                              : isLight
                                ? 'border-gray-200'
                                : 'border-white/15'
                          }`}
                        >
                          {km}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputCls}
                      value={form.serviceRadiusKm}
                      onChange={(e) => patch({ serviceRadiusKm: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {screen === 'contacts' && (
              <div className="space-y-4 pb-28">
                {(['telegram', 'phone', 'instagram', 'website'] as const).map((field) => (
                  <div key={field}>
                    <label className={labelCls}>{t(`businessProfile.fields.${field}`)}</label>
                    <input
                      className={inputCls}
                      value={form[field]}
                      onChange={(e) => patch({ [field]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}

            {screen === 'workingHours' && (
              <div className="space-y-4 pb-28">
                <div className={`${ui.cardShell} flex items-center justify-between gap-3 p-4`}>
                  <div>
                    <p className={`text-sm font-semibold ${ac.pageHeading}`}>
                      {t('businessProfile.settings.showWorkingHours')}
                    </p>
                    <p className={`mt-0.5 text-xs ${ac.mutedText}`}>
                      {t('businessProfile.settings.showWorkingHoursHint')}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={form.workingHoursSettings.show}
                    onChange={(show) =>
                      patch({
                        workingHoursSettings: { ...form.workingHoursSettings, show },
                      })
                    }
                  />
                </div>

                <div className={`${ui.cardShell} divide-y ${ui.divider}`}>
                  {WEEKDAY_KEYS.map((key) => {
                    const day = form.workingHoursSettings.days[key];
                    return (
                      <div key={key} className="flex items-center gap-3 px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => patchWorkingHoursDay(key, { open: !day.open })}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            day.open
                              ? isLight
                                ? 'border-[#3F5331] bg-[#3F5331] text-white'
                                : 'border-[#C8E6A0] bg-[#C8E6A0] text-[#141414]'
                              : isLight
                                ? 'border-gray-300'
                                : 'border-white/30'
                          }`}
                        >
                          {day.open ? <Check size={12} strokeWidth={3} /> : null}
                        </button>
                        <span className={`min-w-[6.5rem] text-sm font-medium ${ac.pageHeading}`}>
                          {weekdayLabels[key]}
                        </span>
                        {day.open ? (
                          <div className="ml-auto flex items-center gap-2">
                            <input
                              type="time"
                              value={day.from}
                              onChange={(e) => patchWorkingHoursDay(key, { from: e.target.value })}
                              className={`${inputCls} !w-[5.5rem] !px-2 !py-2 text-sm`}
                            />
                            <span className={ac.mutedText}>–</span>
                            <input
                              type="time"
                              value={day.to}
                              onChange={(e) => patchWorkingHoursDay(key, { to: e.target.value })}
                              className={`${inputCls} !w-[5.5rem] !px-2 !py-2 text-sm`}
                            />
                          </div>
                        ) : (
                          <div className="ml-auto flex items-center gap-2">
                            <span className={`text-sm ${ac.mutedText}`}>
                              {t('businessProfile.settings.dayOff')}
                            </span>
                            <ToggleSwitch
                              checked={false}
                              onChange={() => patchWorkingHoursDay(key, { open: true })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {screen === 'listings' && (
              <div className="space-y-4 pb-28">
                <p className={`text-sm ${ac.mutedText}`}>{t('businessProfile.settings.listingsIntro')}</p>

                <div className="space-y-2">
                  {(['all', 'manual'] as ListingDisplayMode[]).map((mode) => {
                    const selected = form.listingDisplayMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setListingDisplayMode(mode)}
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                          selected
                            ? `${ui.limeBorder} ${ui.limeBgSoft}`
                            : isLight
                              ? 'border-gray-200 bg-white'
                              : 'border-white/15 bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? isLight
                                  ? 'border-[#3F5331] bg-[#3F5331]'
                                  : 'border-[#C8E6A0] bg-[#C8E6A0]'
                                : isLight
                                  ? 'border-gray-300'
                                  : 'border-white/30'
                            }`}
                          >
                            {selected ? (
                              <span className={`h-2 w-2 rounded-full ${isLight ? 'bg-white' : 'bg-[#141414]'}`} />
                            ) : null}
                          </span>
                          <span>
                            <span className={`block text-sm font-semibold ${ac.pageHeading}`}>
                              {t(`businessProfile.settings.listingsMode.${mode}.title`)}
                            </span>
                            <span className={`mt-0.5 block text-xs ${ac.mutedText}`}>
                              {t(`businessProfile.settings.listingsMode.${mode}.subtitle`)}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className={`text-sm font-semibold ${ac.pageHeading}`}>
                  {t('businessProfile.settings.selectedListingsCount', {
                    count: String(selectedListingsCount),
                  })}
                </p>

                {activeUserListings.length === 0 ? (
                  <div className={`rounded-2xl border p-6 text-center ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/15 bg-white/5'}`}>
                    <Package size={28} className={`mx-auto mb-2 ${ac.mutedText}`} />
                    <p className={`text-sm ${ac.mutedText}`}>{t('businessProfile.steps.step5.empty')}</p>
                  </div>
                ) : (
                  <div className={`${ui.cardShell} divide-y ${ui.divider}`}>
                    {activeUserListings.map((listing) => {
                      const enabled =
                        form.listingDisplayMode === 'all' || form.selectedListingIds.includes(listing.id);
                      const thumb = listing.images?.[0] || listing.image || '';
                      return (
                        <div key={listing.id} className="flex items-center gap-3 px-4 py-3.5">
                          <div className={`h-12 w-12 shrink-0 overflow-hidden rounded-xl ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                            {thumb ? (
                              <img src={getResolvedImageUrl(thumb)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon size={18} className={`m-auto mt-3 opacity-40`} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{listing.title}</p>
                            <p className={`text-xs ${ui.limeText}`}>{formatListingPrice(listing)}</p>
                          </div>
                          <ToggleSwitch
                            checked={enabled}
                            disabled={form.listingDisplayMode === 'all'}
                            onChange={(checked) => {
                              if (form.listingDisplayMode !== 'manual') return;
                              patch({
                                selectedListingIds: checked
                                  ? [...form.selectedListingIds, listing.id]
                                  : form.selectedListingIds.filter((id) => id !== listing.id),
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {screen === 'publicLink' && (
              <div className="space-y-4 pb-8">
                <p className={`text-sm leading-relaxed ${ac.mutedText}`}>
                  {t('businessProfile.settings.publicLinkIntro')}
                </p>

                <div className={`${ui.cardShell} flex items-center gap-3 p-4`}>
                  <Link2 size={18} className={`shrink-0 ${ui.limeText}`} />
                  <p className={`min-w-0 flex-1 truncate text-sm ${ac.pageHeading}`}>{publicBotLink}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyLink(publicBotLink)}
                    className={`shrink-0 rounded-full p-2 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
                    aria-label={t('common.copy')}
                  >
                    <Copy size={18} className={ui.limeText} />
                  </button>
                </div>

                <button type="button" onClick={() => void handleCopyLink(publicBotLink)} className={`${ui.btnOutline} w-full`}>
                  {t('businessProfile.settings.copyLink')}
                </button>

                <button
                  type="button"
                  onClick={() => void handleShareLink()}
                  className={`flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold ${ui.limeText}`}
                >
                  <Share2 size={18} />
                  {t('common.share')}
                </button>

                <div className={`${ui.cardShell} flex items-center gap-4 p-4`}>
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
                    <img src={qrCodeUrl} alt="" className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`mb-3 text-sm font-semibold leading-snug ${ac.pageHeading}`}>
                      {t('businessProfile.settings.qrTitle')}
                    </p>
                    <button type="button" onClick={() => void handleDownloadQr()} className={ui.btnOutlineSm}>
                      <Download size={16} />
                      {t('businessProfile.settings.downloadQr')}
                    </button>
                  </div>
                </div>

                <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${ui.limeBgSoft} ${ui.limeText}`}>
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>{t('businessProfile.settings.publicLinkFooter')}</span>
                </div>
              </div>
            )}

            {screen === 'deactivate' && (
              <div className="space-y-4 pb-8">
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-red-200 bg-red-50' : 'border-red-500/40 bg-red-500/10'}`}>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                    <AlertTriangle size={24} className="text-red-400" />
                  </div>
                  <h3 className={`mb-2 text-lg font-bold ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                    {t('businessProfile.settings.deactivateSureTitle')}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isLight ? 'text-red-800/80' : 'text-red-100/80'}`}>
                    {t('businessProfile.settings.deactivateSureMessage')}
                  </p>
                </div>

                <div className={`flex items-start gap-2 rounded-xl px-3 py-3 text-xs ${ui.limeBgSoft} ${ui.limeText}`}>
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>{t('businessProfile.settings.deactivateSubscriptionNote')}</span>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleDeactivate()}
                  className={`flex w-full items-center justify-center rounded-2xl bg-red-500 px-4 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
                >
                  {loading ? t('common.loading') : t('businessProfile.settings.deactivateTitle')}
                </button>

                <button
                  type="button"
                  onClick={() => setScreen('hub')}
                  className={`w-full py-2 text-sm font-semibold ${ac.pageHeading}`}
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>

          {screen !== 'hub' && screen !== 'publicLink' && screen !== 'deactivate' && (
            <div
              className={`shrink-0 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${headerBorder} ${
                isLight ? 'bg-white' : 'bg-[#0a0a0a]'
              }`}
            >
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSave(screen)}
                className={`${ui.btnSolid} w-full disabled:opacity-50`}
              >
                {loading
                  ? t('common.loading')
                  : screen === 'editProfile'
                    ? t('businessProfile.settings.saveChanges')
                    : t('common.save')}
              </button>
            </div>
          )}
        </div>
      </div>

      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
    </>
  );
}
